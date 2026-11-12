import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const [provisionerImage, migrationImage, postgresImage] = process.argv.slice(2);
if (!provisionerImage || !migrationImage || !postgresImage) {
  throw new Error(
    'usage: node scripts/reviewer-provisioner-container-regression.mjs <reviewer-provisioner-image> <migration-image> <postgres-image>',
  );
}

const suffix = `${process.pid}-${Date.now()}`;
const network = `setservice-reviewer-provisioner-${suffix}`;
const databaseContainer = `setservice-reviewer-pg-${suffix}`;
const databaseName = 'setservice_review_provisioner';
const databasePassword = crypto.randomBytes(24).toString('base64url');
const databaseUrl = `postgresql://postgres:${databasePassword}@${databaseContainer}:5432/${databaseName}?schema=public`;
const reviewer = {
  workerPhone: '+994501119101',
  companyPhone: '+994501119102',
  companyEmail: 'company-91@store-review.invalid',
  adminPhone: '+994501119103',
  adminEmail: 'admin-91@store-review.invalid',
  workerPassword: `Worker-${crypto.randomBytes(24).toString('base64url')}Aa1!`,
  companyPassword: `Company-${crypto.randomBytes(24).toString('base64url')}Aa1!`,
  adminPassword: `Admin-${crypto.randomBytes(24).toString('base64url')}Aa1!`,
  outboxSecret: crypto.randomBytes(32).toString('base64url'),
};

function runDocker(args, { expectedStatus = 0, timeout = 180_000 } = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout,
  });
  assert.equal(result.error?.code, undefined, 'docker command exceeded its timeout');
  assert.equal(
    result.status,
    expectedStatus,
    `docker command failed with status ${result.status}; output: ${result.stderr || result.stdout}`,
  );
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
}

function waitForPostgres() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const result = spawnSync(
      'docker',
      ['exec', databaseContainer, 'pg_isready', '-U', 'postgres', '-d', databaseName],
      { encoding: 'utf8' },
    );
    if (result.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
  throw new Error('PostgreSQL did not become ready');
}

function provisionerEnv({ apply = false } = {}) {
  const values = {
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    STORE_REVIEW_WORKER_PHONE: reviewer.workerPhone,
    STORE_REVIEW_COMPANY_PHONE: reviewer.companyPhone,
    STORE_REVIEW_COMPANY_EMAIL: reviewer.companyEmail,
    STORE_REVIEW_ADMIN_PHONE: reviewer.adminPhone,
    STORE_REVIEW_ADMIN_EMAIL: reviewer.adminEmail,
    STORE_REVIEW_WORKER_PASSWORD: reviewer.workerPassword,
    STORE_REVIEW_COMPANY_PASSWORD: reviewer.companyPassword,
    STORE_REVIEW_ADMIN_PASSWORD: reviewer.adminPassword,
    PROVIDER_OUTBOX_ENCRYPTION_SECRET: reviewer.outboxSecret,
    ...(apply ? {
      ALLOW_PRODUCTION_REVIEW_PROVISION: 'true',
      STORE_REVIEW_OUTBOX_QUIESCED: 'true',
    } : {}),
  };
  return Object.entries(values).flatMap(([name, value]) => ['-e', `${name}=${value}`]);
}

function runProvisioner(command, { apply = false, expectedStatus = 0, extraArgs = [] } = {}) {
  return runDocker([
    'run',
    '--rm',
    '--read-only',
    '--tmpfs',
    '/tmp:size=64m,mode=1777',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--network',
    network,
    ...provisionerEnv({ apply }),
    provisionerImage,
    command,
    ...extraArgs,
  ], { expectedStatus });
}

function assertRedacted(output) {
  for (const sensitive of [
    databaseUrl,
    databasePassword,
    reviewer.workerPhone,
    reviewer.companyPhone,
    reviewer.companyEmail,
    reviewer.adminPhone,
    reviewer.adminEmail,
    reviewer.workerPassword,
    reviewer.companyPassword,
    reviewer.adminPassword,
    reviewer.outboxSecret,
  ]) {
    assert.equal(output.includes(sensitive), false, 'provisioner output disclosed protected input');
  }
}

try {
  runDocker(['network', 'create', network]);
  runDocker([
    'run',
    '--detach',
    '--name',
    databaseContainer,
    '--network',
    network,
    '-e',
    `POSTGRES_PASSWORD=${databasePassword}`,
    '-e',
    `POSTGRES_DB=${databaseName}`,
    postgresImage,
  ]);
  waitForPostgres();

  runDocker([
    'run',
    '--rm',
    '--network',
    network,
    '-e',
    `DATABASE_URL=${databaseUrl}`,
    '-e',
    `DIRECT_URL=${databaseUrl}`,
    migrationImage,
  ]);

  runDocker([
    'exec',
    databaseContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    databaseName,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `
      INSERT INTO departments (id, slug, name_az, status, created_at, updated_at)
      VALUES ('00000000-0000-4000-8000-000000000091', 'reviewer-container-department', 'Synthetic department', 'active', NOW(), NOW());
      INSERT INTO subdepartments (id, department_id, slug, name_az, status, created_at, updated_at)
      VALUES ('00000000-0000-4000-8000-000000000092', '00000000-0000-4000-8000-000000000091', 'reviewer-container-subdepartment', 'Synthetic subdepartment', 'active', NOW(), NOW());
      INSERT INTO positions (id, subdepartment_id, slug, name_az, status, created_at, updated_at)
      VALUES ('00000000-0000-4000-8000-000000000093', '00000000-0000-4000-8000-000000000092', 'waiter-waitress', 'Synthetic service worker', 'active', NOW(), NOW());
    `,
  ]);

  const initialPlan = runProvisioner('plan');
  assert.match(initialPlan, /command:\s*'plan'/);
  assert.match(initialPlan, /create_count:\s*3/);
  assertRedacted(initialPlan);

  const ungatedApply = runProvisioner('apply', { expectedStatus: 1 });
  assert.match(ungatedApply, /PRODUCTION_REVIEW_PROVISION_DISABLED/);
  assertRedacted(ungatedApply);

  const invalidCommand = runProvisioner('unknown', { expectedStatus: 1 });
  assert.match(invalidCommand, /STORE_REVIEW_PROVISIONER_COMMAND_INVALID/);
  assertRedacted(invalidCommand);

  const extraArgument = runProvisioner('plan', {
    expectedStatus: 1,
    extraArgs: ['--adopt-existing'],
  });
  assert.match(extraArgument, /STORE_REVIEW_PROVISIONER_COMMAND_INVALID/);
  assertRedacted(extraArgument);

  const firstApply = runProvisioner('apply', { apply: true });
  assert.match(firstApply, /command:\s*'apply'/);
  assert.match(firstApply, /create_count:\s*3/);
  assertRedacted(firstApply);

  const idempotentPlan = runProvisioner('plan');
  assert.match(idempotentPlan, /create_count:\s*0/);
  assert.match(idempotentPlan, /existing_review_count:\s*3/);
  assertRedacted(idempotentPlan);

  const idempotentApply = runProvisioner('apply', { apply: true });
  assert.match(idempotentApply, /create_count:\s*0/);
  assert.match(idempotentApply, /existing_review_count:\s*3/);
  assertRedacted(idempotentApply);

  runDocker([
    'exec',
    databaseContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    databaseName,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `
      UPDATE workers AS w
      SET profile_photo_url = 'workers/' || w.id || '/profile/synthetic.webp',
          documents = jsonb_build_array(
            jsonb_build_object(
              'type', 'health_certificate',
              'key', 'workers/' || w.id || '/documents/health_certificate/synthetic.pdf',
              'status', 'ready',
              'scan_status', 'clean'
            ),
            jsonb_build_object(
              'type', 'criminal_record',
              'key', 'workers/' || w.id || '/documents/criminal_record/synthetic.pdf',
              'status', 'ready',
              'scan_status', 'clean'
            )
          ),
          updated_at = NOW()
      FROM users AS u
      WHERE w.user_id = u.id AND u.phone = '${reviewer.workerPhone}';
    `,
  ]);

  const readiness = runProvisioner('check');
  assert.match(readiness, /Store review account readiness passed/);
  assert.match(readiness, /account_count:\s*3/);
  assert.match(readiness, /fixture_order_count:\s*2/);
  assert.match(readiness, /fixture_assignment_count:\s*2/);
  assert.match(readiness, /closed_attendance_count:\s*1/);
  assert.match(readiness, /ready_private_document_count:\s*2/);
  assertRedacted(readiness);

  console.log('reviewer-provisioner-container-regression: OK');
} finally {
  spawnSync('docker', ['rm', '--force', databaseContainer], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' });
}
