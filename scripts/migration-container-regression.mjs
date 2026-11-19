import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [migrationImage, postgresImage] = process.argv.slice(2);
if (!migrationImage || !postgresImage) {
  throw new Error(
    'usage: node scripts/migration-container-regression.mjs <migration-image> <postgres-image>',
  );
}

const suffix = `${process.pid}-${Date.now()}`;
const network = `setservice-migration-regression-${suffix}`;
const databaseContainer = `setservice-migration-pg-${suffix}`;
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'setservice-migration-fixture-'));
const fixturePrisma = path.join(fixtureRoot, 'prisma');
const password = 'local-migration-regression-only';

function docker(args, { expectedStatus = 0, timeout = 120_000 } = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout,
  });
  assert.equal(
    result.status,
    expectedStatus,
    `docker command failed with status ${result.status}: ${result.stderr || result.stdout}`,
  );
  return result.stdout.trim();
}

function waitForPostgres() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync(
      'docker',
      ['exec', databaseContainer, 'pg_isready', '-U', 'postgres', '-d', 'setservice_apply'],
      { encoding: 'utf8' },
    );
    if (result.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
  throw new Error('PostgreSQL did not become ready');
}

function databaseUrl(databaseName) {
  return `postgresql://postgres:${password}@${databaseContainer}:5432/${databaseName}?schema=public`;
}

function migrationRun(databaseName, extraArgs = [], options = {}) {
  const url = databaseUrl(databaseName);
  return docker([
    'run',
    '--rm',
    '--network',
    network,
    '-e',
    `DATABASE_URL=${url}`,
    '-e',
    `DIRECT_URL=${url}`,
    ...extraArgs,
    migrationImage,
  ], options);
}

function removeMigrationAndLater(firstRemovedMigration) {
  fs.cpSync(path.resolve('prisma'), fixturePrisma, { recursive: true });
  for (const entry of fs.readdirSync(path.join(fixturePrisma, 'migrations'), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name >= firstRemovedMigration) {
      fs.rmSync(path.join(fixturePrisma, 'migrations', entry.name), { recursive: true, force: true });
    }
  }
}

let lockHolder;
try {
  docker(['network', 'create', network]);
  docker([
    'run',
    '--detach',
    '--name',
    databaseContainer,
    '--network',
    network,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_DB=setservice_apply',
    postgresImage,
  ]);
  waitForPostgres();

  migrationRun('setservice_apply');
  migrationRun('setservice_apply');
  docker([
    'run',
    '--rm',
    '--network',
    network,
    '--entrypoint',
    '/nodejs/bin/node',
    '-e',
    `DATABASE_URL=${databaseUrl('setservice_apply')}`,
    '-e',
    `DIRECT_URL=${databaseUrl('setservice_apply')}`,
    migrationImage,
    'node_modules/prisma/build/index.js',
    'migrate',
    'status',
  ]);

  docker(['exec', databaseContainer, 'createdb', '-U', 'postgres', 'setservice_lock']);
  removeMigrationAndLater('20261014120000_assignment_attendance_activity');
  docker([
    'run',
    '--rm',
    '--network',
    network,
    '--entrypoint',
    '/nodejs/bin/node',
    '-e',
    `DATABASE_URL=${databaseUrl('setservice_lock')}`,
    '-e',
    `DIRECT_URL=${databaseUrl('setservice_lock')}`,
    '-v',
    `${fixturePrisma}:/fixture/prisma:ro`,
    migrationImage,
    'node_modules/prisma/build/index.js',
    'migrate',
    'deploy',
    '--schema',
    '/fixture/prisma/schema.prisma',
  ]);

  lockHolder = spawn('docker', [
    'exec',
    databaseContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    'setservice_lock',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'BEGIN; LOCK TABLE "assignments" IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(20); COMMIT;',
  ], { stdio: 'ignore' });

  let lockAcquired = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const count = docker([
      'exec',
      databaseContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'setservice_lock',
      '-Atc',
      "SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE c.relname='assignments' AND l.mode='AccessExclusiveLock' AND l.granted",
    ]);
    if (count === '1') {
      lockAcquired = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  assert.equal(lockAcquired, true, 'failed to acquire the conflicting table lock');

  const lockUrl = databaseUrl('setservice_lock');
  const startedAt = Date.now();
  const blockedMigration = spawnSync('docker', [
    'run',
    '--rm',
    '--network',
    network,
    '-e',
    `DATABASE_URL=${lockUrl}`,
    '-e',
    `DIRECT_URL=${lockUrl}`,
    migrationImage,
  ], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 15_000,
  });
  const elapsedMs = Date.now() - startedAt;
  assert.notEqual(blockedMigration.status, 0, 'conflicting migration must fail');
  assert.equal(blockedMigration.error?.code, undefined, 'migration exceeded the test timeout');
  assert.ok(elapsedMs >= 4_000 && elapsedMs < 15_000, `unexpected lock failure time: ${elapsedMs}ms`);

  const blockedOutput = `${blockedMigration.stdout ?? ''}\n${blockedMigration.stderr ?? ''}`;
  assert.match(
    blockedOutput,
    /20261014120000_assignment_attendance_activity/,
    'failure must identify the blocked migration',
  );
  assert.match(blockedOutput, /P3018/, 'failure must retain the Prisma migration error code');
  assert.match(
    blockedOutput,
    /(?:55P03|canceling statement due to lock timeout)/i,
    'failure must retain the PostgreSQL lock-timeout evidence',
  );

  const failedMigrationState = docker([
    'exec',
    databaseContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    'setservice_lock',
    '-Atc',
    "SELECT migration_name || '|' || CASE WHEN finished_at IS NULL THEN 'unfinished' ELSE 'finished' END || '|' || CASE WHEN rolled_back_at IS NULL THEN 'not_rolled_back' ELSE 'rolled_back' END FROM \"_prisma_migrations\" WHERE migration_name='20261014120000_assignment_attendance_activity' ORDER BY started_at DESC LIMIT 1",
  ]);
  assert.equal(
    failedMigrationState,
    '20261014120000_assignment_attendance_activity|unfinished|not_rolled_back',
    'Prisma must record the lock-timeout migration as unfinished until an approved recovery',
  );

  const blockedRetry = spawnSync('docker', [
    'run',
    '--rm',
    '--network',
    network,
    '-e',
    `DATABASE_URL=${lockUrl}`,
    '-e',
    `DIRECT_URL=${lockUrl}`,
    migrationImage,
  ], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 15_000,
  });
  assert.notEqual(blockedRetry.status, 0, 'an unresolved failed migration must block a retry');
  assert.equal(blockedRetry.error?.code, undefined, 'blocked retry exceeded the test timeout');
  const retryOutput = `${blockedRetry.stdout ?? ''}\n${blockedRetry.stderr ?? ''}`;
  assert.match(retryOutput, /P3009/, 'retry must stop on Prisma failed-migration protection');
  assert.match(
    retryOutput,
    /20261014120000_assignment_attendance_activity/,
    'P3009 must identify the unresolved migration',
  );

  const addedColumnCount = docker([
    'exec',
    databaseContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    'setservice_lock',
    '-Atc',
    "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name IN ('attendance_activity_at','last_checkin_at','last_checkout_at')",
  ]);
  assert.equal(addedColumnCount, '0', 'failed migration must roll back every new assignment column');

  const addedIndexCount = docker([
    'exec',
    databaseContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    'setservice_lock',
    '-Atc',
    "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('assignments_attendance_activity_at_idx','assignments_last_checkin_at_idx','assignments_last_checkout_at_idx')",
  ]);
  assert.equal(addedIndexCount, '0', 'failed migration must roll back every new assignment index');

  console.log(`migration-container-regression: OK (lock failure ${elapsedMs}ms)`);
} finally {
  lockHolder?.kill('SIGTERM');
  spawnSync('docker', ['rm', '--force', databaseContainer], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' });
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
