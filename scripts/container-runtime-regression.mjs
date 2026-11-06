import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const [apiImage, outboxImage, malwareScannerImage, migrationImage, provisionerImage] = process.argv.slice(2);
if (!apiImage || !outboxImage || !malwareScannerImage || !migrationImage || !provisionerImage) {
  throw new Error(
    'usage: node scripts/container-runtime-regression.mjs <api-image> <outbox-image> <malware-scanner-image> <migration-image> <reviewer-provisioner-image>',
  );
}

function docker(args) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `docker ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function inspect(image) {
  return JSON.parse(docker(['image', 'inspect', image, '--format', '{{json .Config}}']));
}

const expectedCommands = new Map([
  [apiImage, { entrypoint: ['/nodejs/bin/node'], command: ['dist/index.js'], healthcheck: true }],
  [outboxImage, { entrypoint: ['/nodejs/bin/node'], command: ['dist/outbox-worker.js'], healthcheck: true }],
  [malwareScannerImage, { entrypoint: ['/nodejs/bin/node'], command: ['dist/malware-scanner/index.js'], healthcheck: true }],
  [migrationImage, { entrypoint: ['/nodejs/bin/node'], command: ['scripts/run-prisma-migrate-deploy.mjs'], healthcheck: false }],
  [provisionerImage, {
    entrypoint: ['/nodejs/bin/node', 'provisioner-dist/scripts/run-store-review-provisioner.js'],
    command: ['plan'],
    healthcheck: false,
  }],
]);

for (const [image, expected] of expectedCommands) {
  const config = inspect(image);
  assert.equal(config.User, '65532:65532', `${image} must run as uid/gid 65532`);
  assert.deepEqual(config.Entrypoint, expected.entrypoint);
  assert.deepEqual(config.Cmd, expected.command);
  if (!expected.healthcheck) {
    assert.equal(config.Healthcheck, undefined);
  } else {
    assert.equal(config.Healthcheck?.Test?.[0], 'CMD');
    assert.equal(config.Healthcheck?.Test?.[1], '/nodejs/bin/node');
  }

  docker([
    'run',
    '--rm',
    '--entrypoint',
    '/nodejs/bin/node',
    image,
    '-e',
    `
      const fs = require('node:fs');
      if (process.version !== 'v24.22.0') throw new Error('unexpected Node version: ' + process.version);
      if (!process.versions.openssl.startsWith('3.')) throw new Error('OpenSSL 3 is required');
      if (process.getuid() !== 65532 || process.getgid() !== 65532) throw new Error('unexpected uid/gid');
      for (const path of ['/bin/sh', '/usr/local/bin/npm', '/usr/local/bin/npx', '/usr/bin/psql']) {
        if (fs.existsSync(path)) throw new Error(path + ' must not be present');
      }
    `,
  ]);
}

docker([
  'run',
  '--rm',
  '--entrypoint',
  '/nodejs/bin/node',
  apiImage,
  '-e',
  `
    const fs = require('node:fs');
    const tool = 'dist/tools/invalidate-auth-sessions.js';
    if (!fs.existsSync(tool) || !fs.statSync(tool).isFile()) {
      throw new Error(tool + ' must be present in the API image');
    }
    for (const dependency of ['typescript', 'ts-node', 'nodemon']) {
      try {
        require.resolve(dependency);
        throw new Error(dependency + ' must not be present in the API runtime image');
      } catch (error) {
        if (error?.code !== 'MODULE_NOT_FOUND') throw error;
      }
    }
  `,
]);

const invalidatorHelp = spawnSync('docker', [
  'run',
  '--rm',
  '--entrypoint',
  '/nodejs/bin/node',
  apiImage,
  'dist/tools/invalidate-auth-sessions.js',
  '--help',
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.equal(
  invalidatorHelp.status,
  0,
  `JWT invalidator --help failed: ${invalidatorHelp.stderr || invalidatorHelp.stdout}`,
);
assert.match(
  `${invalidatorHelp.stdout}\n${invalidatorHelp.stderr}`,
  /JWT_SESSION_INVALIDATOR_USAGE: node dist\/tools\/invalidate-auth-sessions\.js \[--dry-run\|--apply\]/,
);

const invalidatorWithoutApplyGate = spawnSync('docker', [
  'run',
  '--rm',
  '-e',
  'NODE_ENV=production',
  '-e',
  'JWT_ROTATION_CHANGE_ID=container-runtime-regression',
  '--entrypoint',
  '/nodejs/bin/node',
  apiImage,
  'dist/tools/invalidate-auth-sessions.js',
  '--apply',
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.notEqual(
  invalidatorWithoutApplyGate.status,
  0,
  'JWT invalidator --apply must reject a missing explicit confirmation gate',
);
assert.match(
  `${invalidatorWithoutApplyGate.stdout}\n${invalidatorWithoutApplyGate.stderr}`,
  /JWT_ROTATION_CONFIRM/,
);

for (const image of [migrationImage, provisionerImage]) {
  docker([
    'run',
    '--rm',
    '--entrypoint',
    '/nodejs/bin/node',
    image,
    '-e',
    `
      require.resolve('@prisma/client');
      for (const dependency of ['typescript', 'ts-node', 'nodemon']) {
        try {
          require.resolve(dependency);
          throw new Error(dependency + ' must not be present in the one-shot runtime image');
        } catch (error) {
          if (error?.code !== 'MODULE_NOT_FOUND') throw error;
        }
      }
    `,
  ]);
}

docker([
  'run',
  '--rm',
  '--entrypoint',
  '/nodejs/bin/node',
  provisionerImage,
  '-e',
  `
    const fs = require('node:fs');
    for (const path of [
      'provisioner-dist/src/index.js',
      'provisioner-dist/src/app.js',
      'provisioner-dist/src/outbox-worker.js',
      'provisioner-dist/src/malware-scanner',
      'provisioner-dist/src/modules',
    ]) {
      if (fs.existsSync(path)) throw new Error(path + ' must not be present in the dedicated provisioner image');
    }
  `,
]);

const invalidProvisioner = spawnSync('docker', [
  'run', '--rm', provisionerImage, 'invalid-command',
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.notEqual(invalidProvisioner.status, 0, 'provisioner must reject unknown commands');
assert.match(
  `${invalidProvisioner.stdout}\n${invalidProvisioner.stderr}`,
  /STORE_REVIEW_PROVISIONER_COMMAND_INVALID/,
);

const extraProvisionerArgument = spawnSync('docker', [
  'run', '--rm', provisionerImage, 'plan', '--adopt-existing',
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.notEqual(extraProvisionerArgument.status, 0, 'provisioner must reject extra arguments');
assert.match(
  `${extraProvisionerArgument.stdout}\n${extraProvisionerArgument.stderr}`,
  /STORE_REVIEW_PROVISIONER_COMMAND_INVALID/,
);

docker([
  'run',
  '--rm',
  '--entrypoint',
  '/nodejs/bin/node',
  '-e',
  'DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci?schema=public',
  '-e',
  'DIRECT_URL=postgresql://ci:ci@127.0.0.1:5432/ci?schema=public',
  migrationImage,
  'node_modules/prisma/build/index.js',
  'validate',
]);

docker([
  'run',
  '--rm',
  '--entrypoint',
  '/nodejs/bin/node',
  apiImage,
  '-e',
  `
    (async () => {
      const sharp = require('sharp');
      const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>')).png().toBuffer();
      if (png.length < 8 || png.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error('sharp PNG smoke failed');

      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({
        datasources: { db: { url: 'postgresql://smoke:smoke@127.0.0.1:1/smoke?connect_timeout=1' } },
      });
      try {
        await prisma.$connect();
        throw new Error('Prisma unexpectedly connected to the closed smoke-test port');
      } catch (error) {
        if (error?.code !== 'P1001' && error?.errorCode !== 'P1001') throw error;
      } finally {
        await prisma.$disconnect();
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `,
]);

console.log('container-runtime-regression: OK');
