import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const composeText = read('docker-compose.prod.yml');
const compose = yaml.load(composeText);
const caddy = read('Caddyfile');
const envTemplate = read('.env.production.example');
const dockerfile = read('Dockerfile');
const dockerignore = read('.dockerignore');
const deploy = read('scripts/deploy-production.sh');
const deploymentGuide = read('PRODUCTION_DEPLOYMENT.md');
const readonlyAudit = read('scripts/production-readonly-audit.sh');
const attendancePreflight = read('scripts/preflight-attendance-deploy.mjs');
const attendancePreflightSql = read('scripts/preflight-attendance-deploy.sql');
const migrationRunner = read('scripts/run-prisma-migrate-deploy.mjs');
const migrationContainerRegression = read('scripts/migration-container-regression.mjs');
const neonRehearsal = read('docs/neon-reviewer-release-rehearsal.md');
const immutableRelease = read('docs/immutable-reviewer-release.md');

assert.deepEqual(
  Object.keys(compose.services).sort(),
  ['api', 'caddy', 'clamav', 'malware-scanner', 'migrate', 'outbox-worker', 'redis'],
);
assert.equal(compose.services.api.ports, undefined);
assert.equal(compose.services.redis.ports, undefined);
assert.equal(compose.services['outbox-worker'].ports, undefined);
assert.equal(compose.services.clamav.ports, undefined);
assert.equal(compose.services['malware-scanner'].ports, undefined);
assert.deepEqual(compose.services.caddy.ports, ['80:80', '443:443', '443:443/udp']);
assert.equal(compose.networks.backend.internal, true);
assert.equal(compose.networks.scanner.internal, true);
assert.equal(compose.networks['scanner-updates'].internal, undefined);
assert.ok(Object.hasOwn(compose.volumes, "redis_data"));
assert.ok(Object.hasOwn(compose.volumes, "clamav_data"));
assert.ok(Object.hasOwn(compose.volumes, "caddy_data"));
assert.ok(Object.hasOwn(compose.volumes, "caddy_config"));
assert.match(composeText, /restart: unless-stopped/g);
assert.match(composeText, /max-size: 10m/);
assert.match(composeText, /maxmemory-policy\n\s+- noeviction/);
assert.doesNotMatch(composeText, /(?:3000|6379|5432):(?:3000|6379|5432)/);
assert.doesNotMatch(composeText, /(?:3310:3310|8080:8080)/);
assert.doesNotMatch(composeText, /docker\.sock|privileged:\s*true/i);
for (const serviceName of ['redis', 'clamav', 'malware-scanner', 'api', 'outbox-worker', 'migrate', 'caddy']) {
  const service = compose.services[serviceName];
  assert.ok(service.cpus > 0, `${serviceName} must have a CPU limit`);
  assert.match(String(service.mem_limit), /^\d+(?:m|g)$/,
    `${serviceName} must have a memory limit`);
  assert.ok(service.pids_limit > 0, `${serviceName} must have a PID limit`);
  assert.ok(service.security_opt.includes('no-new-privileges:true'));
}
assert.equal(compose.services.clamav.mem_limit, '3g');
assert.deepEqual(compose.services.clamav.networks, ['scanner', 'scanner-updates']);
assert.deepEqual(compose.services['malware-scanner'].networks, ['scanner']);
assert.ok(compose.services.api.networks.includes('scanner'));
assert.deepEqual(compose.services.clamav.volumes, ['clamav_data:/var/lib/clamav']);
assert.deepEqual(compose.services.clamav.healthcheck.test, ['CMD', 'clamdcheck.sh']);
assert.match(
  String(compose.services.clamav.image),
  /^\$\{CLAMAV_IMAGE:\?.+pinned official ClamAV image.+\}$/,
);
assert.equal(
  compose.services.api.depends_on['malware-scanner'].condition,
  'service_healthy',
);
assert.equal(
  compose.services['malware-scanner'].depends_on.clamav.condition,
  'service_healthy',
);

assert.match(caddy, /\{\$API_DOMAIN\}/);
assert.match(caddy, /reverse_proxy api:3000/);
assert.match(caddy, /encode zstd gzip/);
assert.match(caddy, /Strict-Transport-Security/);
assert.match(caddy, /X-Content-Type-Options/);
assert.doesNotMatch(caddy, /^\s*log\s*\{/m);

assert.match(envTemplate, /NODE_ENV="production"/);
assert.match(envTemplate, /REDIS_URL="redis:\/\/redis:6379"/);
assert.match(envTemplate, /OTP_TEST_MODE="false"/);
assert.match(envTemplate, /OTP_LOG_CODES="false"/);
assert.match(envTemplate, /SWAGGER_DOCS_ENABLED="false"/);
assert.match(envTemplate, /S3_ACCESS_KEY_ID="<new-r2-access-key-id>"/);
assert.match(envTemplate, /S3_SECRET_ACCESS_KEY="<new-r2-secret-access-key>"/);
assert.match(
  envTemplate,
  /CLAMAV_IMAGE="clamav\/clamav:stable@sha256:[a-f0-9]{64}"/,
);
assert.match(envTemplate, /MALWARE_SCANNER_PROVIDER="http"/);
assert.match(envTemplate, /MALWARE_SCAN_REQUIRED="true"/);
assert.match(envTemplate, /MALWARE_SCANNER_URL="http:\/\/malware-scanner:8080\/scan"/);
assert.match(envTemplate, /MALWARE_SCANNER_API_KEY="<secret-reference>"/);
assert.doesNotMatch(envTemplate, /https:\/\/[a-f0-9]{24,}\.r2\.cloudflarestorage\.com/i);

assert.match(dockerfile, /^ARG NODE_BASE_IMAGE$/m);
assert.match(dockerfile, /^ARG RUNTIME_BASE_IMAGE$/m);
assert.match(dockerfile, /FROM runtime-common AS api/);
assert.match(dockerfile, /FROM runtime-common AS outbox-worker/);
assert.match(dockerfile, /FROM app-runtime-base AS migration/);
assert.match(dockerfile, /FROM app-runtime-base AS malware-scanner/);
assert.match(dockerfile, /dist\/malware-scanner\/index\.js/);
assert.match(dockerfile, /USER 65532:65532/);
assert.match(dockerfile, /ENTRYPOINT \["\/nodejs\/bin\/node"\]/);
assert.equal(compose.services.api.init, true);
assert.equal(compose.services['outbox-worker'].init, true);
assert.equal(compose.services['malware-scanner'].init, true);
assert.equal(compose.services.migrate.init, true);
assert.equal(compose.services.migrate.read_only, true);
assert.ok(compose.services.migrate.tmpfs.some((mount) => mount.startsWith('/tmp:')));
assert.equal(
  compose.services['malware-scanner'].healthcheck.test[1],
  '/nodejs/bin/node',
);
assert.doesNotMatch(dockerfile, /COPY\s+\.\s+\./);
assert.match(dockerignore, /!prisma\/\*\*/);
assert.doesNotMatch(dockerignore, /!apps/);

assert.match(deploy, /set -Eeuo pipefail/);
assert.match(deploy, /config -q/);
assert.match(deploy, /preflight-attendance-deploy\.mjs/);
assert.match(deploy, /\/ready/);
assert.match(deploy, /pull redis caddy clamav/);
assert.match(deploy, /build --pull api malware-scanner outbox-worker migrate/);
assert.match(deploy, /redis clamav malware-scanner outbox-worker api caddy/);
assert.match(deploy, /--entrypoint \/nodejs\/bin\/node api/);
assert.match(deploy, /exec -T api \/nodejs\/bin\/node -e/);
assert.doesNotMatch(deploy, /--entrypoint node api|exec -T api node(?:\s|$)/);
assert.match(deploy, /node_modules\/prisma\/build\/index\.js validate/);
assert.match(deploy, /scripts\/preflight-attendance-deploy\.mjs/);
assert.doesNotMatch(deploy, /(?:npx prisma|npm run db:migrate:deploy|--entrypoint sh migrate|\bpsql\b)/);
assert.doesNotMatch(deploy, /docker compose down|down -v|migrate reset|db push|db:seed|git pull/i);

assert.match(readonlyAudit, /^#!\/usr\/bin\/env bash/);
assert.match(readonlyAudit, /SET TRANSACTION READ ONLY/);
assert.match(readonlyAudit, /statement_timeout = '12s'/);
assert.match(readonlyAudit, /lock_timeout = '3s'/);
assert.match(readonlyAudit, /backup_pitr_status=NOT_VERIFIED/);
assert.match(readonlyAudit, /database_error_details=redacted/);
assert.match(readonlyAudit, /for candidate in \/nodejs\/bin\/node \/usr\/local\/bin\/node node/);
assert.match(readonlyAudit, /exec -T api "\$candidate" -e ''/);
assert.match(readonlyAudit, /exec -T api "\$api_node" -/);
assert.match(readonlyAudit, /NODE_RUNTIME_UNAVAILABLE/);
assert.doesNotMatch(readonlyAudit, /\.Config\.Env|docker\s+(?:compose\s+)?logs|curl\s+[^\n]*\s-v(?:\s|$)/);
assert.doesNotMatch(readonlyAudit, /pg_stat_activity[\s\S]{0,300}\bquery\b/i);
assert.doesNotMatch(readonlyAudit, /SELECT[\s\S]{0,120}\b(?:phone|email|password_hash|token|document)\b/i);

assert.match(attendancePreflight, /SET TRANSACTION READ ONLY/);
assert.match(attendancePreflight, /SET LOCAL lock_timeout = '5s'/);
assert.match(attendancePreflight, /SET LOCAL statement_timeout = '15min'/);
assert.match(attendancePreflight, /SET LOCAL idle_in_transaction_session_timeout = '60s'/);
assert.match(attendancePreflight, /timeout: 900_000/);
assert.match(attendancePreflight, /to_regclass\('public\.attendance_logs'\)/);
assert.match(attendancePreflight, /preflight-attendance-deploy\.sql/);
assert.match(attendancePreflight, /database error details redacted/);
assert.doesNotMatch(attendancePreflight, /console\.(?:log|error)\((?:directUrl|error|error\.stack)\)/);
assert.match(attendancePreflightSql, /HAVING COUNT\(\*\) > 1/);
assert.match(attendancePreflightSql, /RAISE EXCEPTION/);
assert.match(migrationRunner, /lock_timeout=5s/);
assert.match(migrationRunner, /statement_timeout=15min/);
assert.match(migrationRunner, /idle_in_transaction_session_timeout=60s/);
assert.match(migrationRunner, /searchParams\.set\(/);
assert.match(migrationRunner, /node_modules\/prisma\/build\/index\.js', 'migrate', 'deploy/);
assert.doesNotMatch(migrationRunner, /console\.(?:log|error)\((?:databaseUrl|directUrl|process\.env)/);
assert.match(migrationContainerRegression, /AccessExclusiveLock/);
assert.match(migrationContainerRegression, /elapsedMs >= 4_000/);
assert.match(migrationContainerRegression, /migrate',\s*'status/);
assert.match(migrationContainerRegression, /P3018/);
assert.match(migrationContainerRegression, /55P03/);
assert.match(migrationContainerRegression, /P3009/);
assert.match(migrationContainerRegression, /unfinished\|not_rolled_back/);
assert.match(migrationContainerRegression, /information_schema\.columns/);
assert.match(migrationContainerRegression, /pg_indexes/);
assert.match(read('.github/workflows/ci.yml'), /Exercise migration image against PostgreSQL 16/);

for (const phrase of [
  'protected point-in-time child branch',
  'Production can never be a restore target',
  'zero external provider calls',
  '20261017121000_store_review_account_index',
  'migrate resolve --rolled-back',
  'P3009',
  'Production remains NO-GO',
]) {
  assert.match(neonRehearsal, new RegExp(phrase, 'i'));
}

for (const phrase of [
  'repository@sha256',
  'API and outbox from the same release SHA',
  'dead-letter alerts',
  'never roll back to code lacking reviewer',
  'prisma migrate reset',
]) {
  assert.match(immutableRelease, new RegExp(phrase, 'i'));
}

for (const phrase of [
  'Cloudflare R2',
  'prisma migrate deploy',
  'chmod 600 .env',
  'api.setservice.az',
  'rollback',
  'Neon',
  'Caddy',
  'Redis',
  'ClamAV',
  'EICAR',
  'P3018',
  '55P03',
]) {
  assert.match(deploymentGuide, new RegExp(phrase, 'i'));
}
assert.match(deploymentGuide, /migrate resolve\s+\\?\s*--rolled-back/i);
assert.equal(
  (deploymentGuide.match(/exec -T api(?:\s+\\\n\s+|\s+)\/nodejs\/bin\/node/g) ?? []).length,
  4,
);
assert.equal((deploymentGuide.match(/exec -T malware-scanner\s+\\\n\s+\/nodejs\/bin\/node/g) ?? []).length, 1);
assert.doesNotMatch(deploymentGuide, /exec -T (?:api|malware-scanner)(?:\s+\\\n\s+|\s+)node(?:\s|$)/);

console.log('production-deployment-regression: OK');
