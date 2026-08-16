import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8');
}

const composeText = read('docker-compose.prod.yml');
const compose = yaml.load(composeText);
const caddy = read('Caddyfile');
const envTemplate = read('.env.production.example');
const dockerfile = read('Dockerfile');
const dockerignore = read('.dockerignore');
const deploy = read('scripts/deploy-production.sh');
const deploymentGuide = read('PRODUCTION_DEPLOYMENT.md');

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
assert.match(dockerfile, /FROM runtime-common AS api/);
assert.match(dockerfile, /FROM runtime-common AS outbox-worker/);
assert.match(dockerfile, /FROM runtime-base AS migration/);
assert.match(dockerfile, /FROM runtime-base AS malware-scanner/);
assert.match(dockerfile, /dist\/malware-scanner\/index\.js/);
assert.match(dockerfile, /USER node/);
assert.doesNotMatch(dockerfile, /COPY\s+\.\s+\./);
assert.match(dockerignore, /!prisma\/\*\*/);
assert.doesNotMatch(dockerignore, /!apps/);

assert.match(deploy, /set -Eeuo pipefail/);
assert.match(deploy, /config -q/);
assert.match(deploy, /preflight-attendance-deploy\.sql/);
assert.match(deploy, /db:migrate:deploy/);
assert.match(deploy, /\/ready/);
assert.match(deploy, /pull redis caddy clamav/);
assert.match(deploy, /build --pull api malware-scanner outbox-worker migrate/);
assert.match(deploy, /redis clamav malware-scanner outbox-worker api caddy/);
assert.doesNotMatch(deploy, /docker compose down|down -v|migrate reset|db push|db:seed|git pull/i);

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
]) {
  assert.match(deploymentGuide, new RegExp(phrase, 'i'));
}

console.log('production-deployment-regression: OK');
