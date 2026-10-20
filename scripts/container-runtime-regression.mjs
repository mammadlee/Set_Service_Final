import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const [apiImage, outboxImage, malwareScannerImage, migrationImage] = process.argv.slice(2);
if (!apiImage || !outboxImage || !malwareScannerImage || !migrationImage) {
  throw new Error(
    'usage: node scripts/container-runtime-regression.mjs <api-image> <outbox-image> <malware-scanner-image> <migration-image>',
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
  [apiImage, ['dist/index.js']],
  [outboxImage, ['dist/outbox-worker.js']],
  [malwareScannerImage, ['dist/malware-scanner/index.js']],
  [migrationImage, ['scripts/run-prisma-migrate-deploy.mjs']],
]);

for (const [image, expectedCommand] of expectedCommands) {
  const config = inspect(image);
  assert.equal(config.User, '65532:65532', `${image} must run as uid/gid 65532`);
  assert.deepEqual(config.Entrypoint, ['/nodejs/bin/node']);
  assert.deepEqual(config.Cmd, expectedCommand);
  if (image === migrationImage) {
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
  migrationImage,
  '-e',
  `
    require.resolve('prisma');
    for (const dependency of ['typescript', 'ts-node', 'nodemon']) {
      try {
        require.resolve(dependency);
        throw new Error(dependency + ' must not be present in the migration image');
      } catch (error) {
        if (error?.code !== 'MODULE_NOT_FOUND') throw error;
      }
    }
  `,
]);

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
