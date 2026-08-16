import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import {
  credentialReferenceIssue,
  corsOriginIssue,
  corsOriginListIssue,
  productionMalwareScannerIssues,
  secretStrengthIssue,
} from '../src/lib/check-env';
import {
  getOutboxProcessorHealth,
  isOutboxDeliveryStateHealthy,
  isOutboxHeartbeatFresh,
  renderOutboxMetrics,
} from '../src/lib/outbox';
import { createUploadService } from '../src/lib/uploads';

type WorkflowStep = {
  uses?: string;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  steps?: WorkflowStep[];
};

type Workflow = {
  permissions?: Record<string, unknown>;
  jobs?: Record<string, WorkflowJob>;
};

function read(relativePath: string): string {
  return readFileSync(resolve(relativePath), 'utf8');
}

function testSecretStrengthPolicy(): void {
  const strong = 'Ax7mQ2vL9pR4tW8yK3nD6sF1hJ5cB0uZ';
  assert.equal(secretStrengthIssue(strong), null);

  for (const weak of [
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'Ab12Ab12Ab12Ab12Ab12Ab12Ab12Ab12',
    '12345678901234567890123456789012',
    'qwerty-password-qwerty-password',
  ]) {
    assert.notEqual(secretStrengthIssue(weak), null, `expected weak secret rejection: ${weak}`);
  }
}

function testCorsOriginPolicy(): void {
  assert.equal(corsOriginIssue('https://admin.example.com', true), null);
  assert.equal(corsOriginIssue('http://localhost:5173', false), null);
  assert.equal(corsOriginListIssue('https://admin.example.com', true), null);

  for (const emptyList of [undefined, '', '   ', ',', ' , , ']) {
    assert.notEqual(
      corsOriginListIssue(emptyList, true),
      null,
      `expected effectively empty production CORS list rejection: ${JSON.stringify(emptyList)}`,
    );
    assert.equal(
      corsOriginListIssue(emptyList, false),
      null,
      `development behavior must remain unchanged: ${JSON.stringify(emptyList)}`,
    );
  }

  for (const origin of [
    'null',
    '*',
    'http://admin.example.com',
    'https://user:pass@admin.example.com',
    'https://admin.example.com/',
    'https://admin.example.com/path',
    'https://admin.example.com?source=test',
    'file:///tmp/admin.html',
  ]) {
    assert.notEqual(
      corsOriginIssue(origin, true),
      null,
      `expected unsafe production CORS origin rejection: ${origin}`,
    );
  }
}

function testProductionMalwareScannerPolicy(): void {
  const scannerCredential = [
    'scanner-regression',
    'Ax7mQ2vL9pR4tW8yK3nD6sF1hJ5cB0uZ',
  ].join('-');
  const valid: NodeJS.ProcessEnv = {
    MALWARE_SCANNER_PROVIDER: 'http',
    MALWARE_SCAN_REQUIRED: 'true',
    MALWARE_SCANNER_URL: 'http://malware-scanner:8080/scan',
    MALWARE_SCANNER_API_KEY: scannerCredential,
  };
  assert.deepEqual(productionMalwareScannerIssues(valid), []);

  for (const environment of [
    { ...valid, MALWARE_SCANNER_PROVIDER: 'disabled' },
    { ...valid, MALWARE_SCAN_REQUIRED: 'false' },
    { ...valid, MALWARE_SCANNER_URL: '' },
    { ...valid, MALWARE_SCANNER_URL: 'https://scanner.example.test/scan' },
    { ...valid, MALWARE_SCANNER_URL: 'http://malware-scanner:8080/health' },
    { ...valid, MALWARE_SCANNER_API_KEY: '' },
    { ...valid, MALWARE_SCANNER_API_KEY: '<secret-reference>' },
    { ...valid, MALWARE_SCANNER_API_KEY: 'short' },
  ]) {
    assert.notDeepEqual(
      productionMalwareScannerIssues(environment),
      [],
      `expected unsafe malware scanner environment rejection: ${JSON.stringify(environment)}`,
    );
  }
}

function testOutboxHealthContract(): void {
  const now = Date.parse('2026-07-17T10:00:00.000Z');
  const health = getOutboxProcessorHealth(now);
  assert.equal(health.running, false);
  assert.equal(health.healthy, false);

  const fresh = JSON.stringify({
    healthy: true,
    timestamp: new Date(now - 5_000).toISOString(),
  });
  const stale = JSON.stringify({
    healthy: true,
    timestamp: new Date(now - 60_000).toISOString(),
  });
  assert.equal(isOutboxHeartbeatFresh(fresh, now), true);
  assert.equal(isOutboxHeartbeatFresh(stale, now), false);
  assert.equal(isOutboxHeartbeatFresh('{"healthy":false}', now), false);
  assert.equal(isOutboxHeartbeatFresh('not-json', now), false);
  assert.equal(
    isOutboxDeliveryStateHealthy({ lastBatchDeliveryFailures: 0, deadEvents: 0 }),
    true,
  );
  assert.equal(
    isOutboxDeliveryStateHealthy({ lastBatchDeliveryFailures: 1, deadEvents: 0 }),
    false,
  );
  assert.equal(
    isOutboxDeliveryStateHealthy({ lastBatchDeliveryFailures: 0, deadEvents: 1 }),
    false,
  );

  const metrics = renderOutboxMetrics(now);
  assert.match(metrics, /setservice_outbox_processor_healthy 0/);
  assert.match(metrics, /setservice_outbox_queue_events\{state="pending"\}/);
  assert.match(metrics, /setservice_outbox_queue_events\{state="dead"\}/);
  assert.match(metrics, /setservice_outbox_consecutive_failures/);
  assert.match(metrics, /setservice_outbox_last_batch_delivery_failures 0/);

  const outboxSource = read('src/lib/outbox.ts');
  const apiSource = read('src/index.ts');
  const workerSource = read('src/outbox-worker.ts');
  assert.match(outboxSource, /export async function stopOutboxProcessor\(\): Promise<void>/);
  assert.match(outboxSource, /const batch = activeBatch;[\s\S]*if \(batch\) await batch;/);
  assert.match(outboxSource, /isOutboxDeliveryStateHealthy\(processorState\)/);
  assert.match(
    outboxSource,
    /await publishWorkerHeartbeat\(getOutboxProcessorHealth\(\)\.healthy\)/,
  );
  assert.match(outboxSource, /async function publishWorkerHeartbeat\(healthy: boolean\)/);
  assert.match(outboxSource, /JSON\.stringify\(\{ healthy, timestamp \}\)/);
  assert.doesNotMatch(outboxSource, /JSON\.stringify\(\{ healthy: true, timestamp \}\)/);
  assert.match(
    apiSource,
    /const outboxShutdown = stopOutboxProcessor\(\);[\s\S]*await closeServer\(\);[\s\S]*await outboxShutdown;/,
  );
  assert.match(workerSource, /await stopOutboxProcessor\(\);[\s\S]*disconnectRedis\(\)/);
}

function testCiWorkflow(): void {
  const workflowText = read('.github/workflows/ci.yml');
  const workflow = yaml.load(workflowText) as Workflow;
  assert.equal(workflow.permissions?.contents, 'read');

  const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
  const checkoutSteps = steps.filter((step) => step.uses?.startsWith('actions/checkout@'));
  assert.ok(checkoutSteps.length >= 5);
  assert.ok(checkoutSteps.every((step) => step.with?.['persist-credentials'] === false));

  const taggedActions = steps
    .map((step) => step.uses)
    .filter((uses): uses is string => Boolean(uses))
    .filter((uses) => !/@[a-f0-9]{40}(?:\s|$)/i.test(uses));
  assert.deepEqual(taggedActions, []);

  assert.match(workflowText, /npm audit --audit-level=high/);
  assert.ok(
    (workflowText.match(/npm audit --audit-level=high/g) ?? []).length >= 4,
    'backend and every web app must audit development/build dependencies',
  );
  assert.match(workflowText, /prisma migrate diff[\s\S]*--exit-code/);
  assert.match(workflowText, /node dist\/outbox-worker\.js/);
  assert.match(workflowText, /localhost:3001\/health/);
  assert.match(workflowText, /POSTGRES_DB: setservice_test/);
  assert.match(workflowText, /LIFECYCLE_CONCURRENCY_TEST_CONFIRM: "1"/);
  assert.match(workflowText, /npm run test:lifecycle-concurrency/);
  assert.match(workflowText, /npm run test:release-security/);
  assert.match(workflowText, /npm run test:malware-scanner/);
  assert.match(workflowText, /npm run test:production-env/);
  assert.match(workflowText, /name: Secret scan[\s\S]*fetch-depth: 0|fetch-depth: 0[\s\S]*name: Secret scan/);
  assert.match(workflowText, /vars\.PRODUCTION_API_BASE_URL/);
  assert.match(workflowText, /vars\.PRODUCTION_KIOSK_BASE_URL/);
  assert.match(workflowText, /Verify Android release signing fails closed without credentials/);
  assert.match(workflowText, /grep -q "Release signing is not configured"/);
  assert.match(workflowText, /Build required signed staging Android AAB/);
  assert.match(workflowText, /Missing required Android release configuration/);
  assert.doesNotMatch(workflowText, /built=false|Signed AAB skipped/);
  assert.match(workflowText, /flutter build web --release/);
  assert.match(workflowText, /flutter build appbundle --release/);
  assert.match(workflowText, /flutter build ios --release --no-codesign/);
  assert.equal((workflowText.match(/flutter-version: 3\.32\.6/g) ?? []).length, 2);
  assert.doesNotMatch(workflowText, /channel:\s+stable/);
  assert.match(workflowText, /ANDROID_KEYSTORE_BASE64: \$\{\{ secrets\.ANDROID_KEYSTORE_BASE64 \}\}/);
  assert.match(
    workflowText,
    /ANDROID_GOOGLE_SERVICES_JSON_BASE64: \$\{\{ secrets\.ANDROID_GOOGLE_SERVICES_JSON_BASE64 \}\}/,
  );
  assert.match(workflowText, /node \.\.\/\.\.\/scripts\/validate-web-env\.mjs worker/);
  assert.match(workflowText, /NODE_BASE_IMAGE: \$\{\{ vars\.NODE_BASE_IMAGE \}\}/);
  assert.match(workflowText, /POSTGRES_CI_IMAGE: \$\{\{ vars\.POSTGRES_CI_IMAGE \}\}/);
  assert.match(workflowText, /REDIS_CI_IMAGE: \$\{\{ vars\.REDIS_CI_IMAGE \}\}/);
  assert.match(workflowText, /NODE_BASE_IMAGE.*sha256:\[a-f0-9\]\{64\}/);
  assert.match(workflowText, /POSTGRES_CI_IMAGE.*sha256:\[a-f0-9\]\{64\}/);
  assert.match(workflowText, /REDIS_CI_IMAGE.*sha256:\[a-f0-9\]\{64\}/);
  assert.match(
    workflowText,
    /image: \$\{\{ needs\.release-inputs\.outputs\.postgres-ci-image \}\}/,
  );
  assert.match(
    workflowText,
    /image: \$\{\{ needs\.release-inputs\.outputs\.redis-ci-image \}\}/,
  );
  assert.match(workflowText, /needs: \[release-inputs, backend\]/);
  assert.doesNotMatch(workflowText, /image:\s+postgres:16(?:\s|$)/);
  assert.doesNotMatch(workflowText, /image:\s+redis:7-alpine(?:\s|$)/);
  assert.equal((workflowText.match(/node-version: 24\.17\.0/g) ?? []).length, 6);
  assert.doesNotMatch(workflowText, /node-version:\s+(?:20|22|24)\s*$/m);
  assert.equal(
    (workflowText.match(/--build-arg NODE_BASE_IMAGE="\$NODE_BASE_IMAGE"/g) ?? []).length,
    4,
  );
  assert.equal((workflowText.match(/uses: anchore\/sbom-action@/g) ?? []).length, 4);
  assert.equal((workflowText.match(/uses: aquasecurity\/trivy-action@/g) ?? []).length, 4);
}

function testContainerPolicy(): void {
  const dockerfile = read('Dockerfile');
  assert.match(dockerfile, /^ARG NODE_BASE_IMAGE\r?$/m);
  assert.doesNotMatch(dockerfile, /^ARG NODE_BASE_IMAGE=/m);
  assert.doesNotMatch(dockerfile, /^#\s*syntax=/m);
  assert.equal((dockerfile.match(/FROM \$\{NODE_BASE_IMAGE\}/g) ?? []).length, 2);
  const migrationStage = dockerfile.match(
    /FROM runtime-base AS migration([\s\S]*?)FROM runtime-common AS outbox-worker/,
  )?.[1];
  assert.ok(migrationStage, 'migration stage was not found');
  assert.doesNotMatch(
    migrationStage,
    /--from=build\s+\/app\/node_modules\s+\.\/node_modules/,
  );
  assert.match(migrationStage, /--from=production-dependencies .*node_modules/);
  assert.match(migrationStage, /--from=build \/app\/node_modules\/prisma/);
  assert.match(dockerfile, /FROM runtime-common AS outbox-worker[\s\S]*HEALTHCHECK[\s\S]*\/health/);
  assert.match(dockerfile, /CMD \["npm", "run", "start:outbox"\]/);
  assert.match(dockerfile, /FROM runtime-base AS malware-scanner[\s\S]*USER node[\s\S]*HEALTHCHECK[\s\S]*\/health/);
  assert.match(dockerfile, /CMD \["node", "dist\/malware-scanner\/index\.js"\]/);
  assert.match(dockerfile, /postgresql-client/);
  assert.match(dockerfile, /preflight-attendance-deploy\.sql/);
}

function testRunbooks(): void {
  for (const path of [
    'README.md',
    'STAGING_DEPLOYMENT.md',
    'PRODUCTION_READINESS.md',
    'ENV_SETUP.md',
    'CONTAINER_DEPLOYMENT.md',
    'DEPLOYMENT_CHECKLIST.md',
  ]) {
    assert.match(read(path), /start:outbox/, `${path} must document the outbox service`);
  }
  assert.match(read('.env.example'), /OUTBOX_WORKER_ENABLED="false"/);
  assert.match(read('swagger.yaml'), /outbox worker heartbeat/);
  const containerRunbook = read('CONTAINER_DEPLOYMENT.md');
  assert.equal(
    (containerRunbook.match(/--build-arg NODE_BASE_IMAGE="\$NODE_BASE_IMAGE"/g) ?? []).length,
    3,
  );
  assert.match(containerRunbook, /POSTGRES_CI_IMAGE/);
  assert.match(containerRunbook, /REDIS_CI_IMAGE/);
}

function testP0RotationControls(): void {
  assert.notEqual(credentialReferenceIssue('<secret-reference>'), null);
  assert.notEqual(credentialReferenceIssue('${SECRET_MANAGER_VALUE}'), null);
  assert.equal(credentialReferenceIssue('0123456789abcdef'), null);

  const exampleEnv = read('.env.example');
  for (const assignment of [
    'JWT_ACCESS_SECRET="<secret-reference>"',
    'JWT_REFRESH_SECRET="<secret-reference>"',
    'PG365_PUBLIC_KEY="<secret-reference>"',
    'PG365_PRIVATE_KEY="<secret-reference>"',
    'S3_ACCESS_KEY_ID="<r2-access-key-id>"',
    'S3_SECRET_ACCESS_KEY="<r2-secret-access-key>"',
  ]) {
    assert.ok(exampleEnv.includes(assignment), `${assignment.split('=')[0]} must be a reference`);
  }

  const authMiddleware = read('src/middleware/auth.ts');
  const authService = read('src/modules/auth/auth.service.ts');
  const rotationScript = read('scripts/invalidate-auth-sessions.ts');
  const smsSource = read('src/lib/sms.ts');
  const uploadSource = read('src/lib/uploads.ts');
  const scannerSource = read('scripts/check-secrets.mjs');
  const runbook = read('docs/P0_SECRET_ROTATION_RUNBOOK.md');

  assert.match(authMiddleware, /payload\.session_version !== user\.session_version/);
  assert.match(authService, /REFRESH_TOKEN_REUSE/);
  assert.match(authService, /revokeTokenFamily/);
  assert.match(authService, /session_version: \{ increment: 1 \}/);
  assert.match(rotationScript, /JWT_ROTATION_CONFIRM/);
  assert.match(rotationScript, /NODE_ENV !== 'production'/);
  assert.match(rotationScript, /revoked_reason: ROTATION_REASON/);
  assert.match(smsSource, /const PG365_PURPOSE = 'INF' as const/);
  assert.match(smsSource, /requiredCredentialEnv\(env, 'PG365_PRIVATE_KEY'\)/);
  assert.match(uploadSource, /requireRuntimeCredential\('S3_SECRET_ACCESS_KEY'\)/);
  assert.match(scannerSource, /rev-list', '--all/);
  assert.match(scannerSource, /ANDROID\|APP_STORE\|APPLE\|AWS\|CLOUDFLARE/);
  assert.match(scannerSource, /PG365/);
  assert.match(runbook, /Global session invalidation/);
  assert.match(runbook, /bucket private/i);
  assert.match(runbook, /Rollback plan/);
}

function testObjectStorageCredentialGuards(): void {
  const keys = [
    'STORAGE_PROVIDER',
    'S3_BUCKET',
    'S3_REGION',
    'S3_ENDPOINT',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ] as const;
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const runtimeSecretFixture = ['regression', 'credential-Ax7mQ2vL9pR4tW8y'].join('-');
  Object.assign(process.env, {
    STORAGE_PROVIDER: 'r2',
    S3_BUCKET: 'regression-private-bucket',
    S3_REGION: 'auto',
    S3_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    S3_ACCESS_KEY_ID: '<r2-access-key-id>',
    S3_SECRET_ACCESS_KEY: runtimeSecretFixture,
  });

  try {
    assert.throws(() => createUploadService(), /S3_ACCESS_KEY_ID must be an injected runtime credential/);
    process.env.S3_ACCESS_KEY_ID = '0123456789abcdef0123456789abcdef';
    process.env.S3_SECRET_ACCESS_KEY = '<r2-secret-access-key>';
    assert.throws(() => createUploadService(), /S3_SECRET_ACCESS_KEY must be an injected runtime credential/);
  } finally {
    for (const key of keys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function main(): void {
  execFileSync(process.execPath, ['scripts/check-secrets.mjs', '--self-test'], {
    stdio: 'inherit',
  });
  testSecretStrengthPolicy();
  testCorsOriginPolicy();
  testProductionMalwareScannerPolicy();
  testOutboxHealthContract();
  testCiWorkflow();
  testContainerPolicy();
  testRunbooks();
  testP0RotationControls();
  testObjectStorageCredentialGuards();
  console.log('release-security-regression: OK');
}

main();
