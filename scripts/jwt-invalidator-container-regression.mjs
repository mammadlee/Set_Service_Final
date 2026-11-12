import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const [apiImage, migrationImage, postgresImage] = process.argv.slice(2);
if (!apiImage || !migrationImage || !postgresImage) {
  throw new Error(
    'usage: node scripts/jwt-invalidator-container-regression.mjs <api-image> <migration-image> <postgres-image>',
  );
}

const suffix = `${process.pid}-${Date.now()}`;
const network = `setservice-jwt-invalidator-${suffix}`;
const databaseContainer = `setservice-jwt-invalidator-pg-${suffix}`;
const databaseName = 'setservice_jwt_invalidator';
const databasePassword = crypto.randomBytes(24).toString('base64url');
const databaseUrl = `postgresql://postgres:${databasePassword}@${databaseContainer}:5432/${databaseName}?schema=public`;
const accessSecret = crypto.randomBytes(32).toString('base64url');
const refreshSecret = crypto.randomBytes(32).toString('base64url');
const invalidatorPath = 'dist/tools/invalidate-auth-sessions.js';

function runDocker(args, { expectedStatus = 0, timeout = 180_000, label = 'docker command' } = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout,
  });
  assert.equal(result.error?.code, undefined, `${label} exceeded its timeout`);
  assert.equal(
    result.status,
    expectedStatus,
    `${label} exited with status ${result.status}; output: ${result.stderr || result.stdout}`,
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

function commonApiArguments() {
  return [
    'run',
    '--rm',
    '--network',
    network,
    '--read-only',
    '--tmpfs',
    '/tmp:size=64m,mode=1777',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '-e',
    'NODE_ENV=production',
    '-e',
    `DATABASE_URL=${databaseUrl}`,
    '-e',
    `DIRECT_URL=${databaseUrl}`,
    '-e',
    `JWT_ACCESS_SECRET=${accessSecret}`,
    '-e',
    `JWT_REFRESH_SECRET=${refreshSecret}`,
    '--entrypoint',
    '/nodejs/bin/node',
  ];
}

function runApiNode(source, { expectedStatus = 0, label = 'API image Node command' } = {}) {
  return runDocker([...commonApiArguments(), apiImage, '-e', source], { expectedStatus, label });
}

function runInvalidator({ apply = false, confirm = false, changeId = false, expectedStatus = 0 } = {}) {
  const args = commonApiArguments();
  if (confirm) args.push('-e', 'JWT_ROTATION_CONFIRM=INVALIDATE_ALL_SESSIONS');
  if (changeId) args.push('-e', `JWT_ROTATION_CHANGE_ID=ci-jwt-rotation-${suffix}`);
  args.push(apiImage, invalidatorPath, apply ? '--apply' : '--dry-run');
  return runDocker(args, {
    expectedStatus,
    label: apply ? 'JWT invalidator apply' : 'JWT invalidator preview',
  });
}

const readStateSource = `
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  (async () => {
    const users = await prisma.user.findMany({
      orderBy: { phone: 'asc' },
      select: { phone: true, session_version: true },
    });
    const tokens = await prisma.refreshToken.findMany({
      orderBy: { jti: 'asc' },
      select: { jti: true, revoked_at: true, revoked_reason: true },
    });
    process.stdout.write('JWT_INVALIDATOR_STATE=' + JSON.stringify({ users, tokens }) + '\\n');
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  }).finally(() => prisma.$disconnect());
`;

function readState() {
  const output = runApiNode(readStateSource, { label: 'read JWT invalidator fixture state' });
  const match = output.match(/^JWT_INVALIDATOR_STATE=(.+)$/m);
  assert.ok(match, 'state output marker is missing');
  return JSON.parse(match[1]);
}

function normalizedState(state) {
  return {
    users: state.users,
    tokens: state.tokens.map((token) => ({
      ...token,
      revoked_at: token.revoked_at ? new Date(token.revoked_at).toISOString() : null,
    })),
  };
}

try {
  runDocker(['network', 'create', network], {
    label: 'create JWT invalidator test network',
  });
  runDocker(
    [
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
    ],
    { label: 'start JWT invalidator PostgreSQL fixture' },
  );
  waitForPostgres();
  runDocker(
    [
      'run',
      '--rm',
      '--network',
      network,
      '--read-only',
      '--tmpfs',
      '/tmp:size=64m,mode=1777',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '-e',
      'NODE_ENV=production',
      '-e',
      `DATABASE_URL=${databaseUrl}`,
      '-e',
      `DIRECT_URL=${databaseUrl}`,
      migrationImage,
    ],
    { timeout: 300_000, label: 'apply migrations for JWT invalidator fixture' },
  );

  runApiNode(
    `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      (async () => {
        const first = await prisma.user.create({
          data: {
            phone: '+994501117701',
            role: 'worker',
            name: 'JWT Fixture One',
            session_version: 4,
          },
        });
        const second = await prisma.user.create({
          data: {
            phone: '+994501117702',
            role: 'worker',
            name: 'JWT Fixture Two',
            session_version: 9,
          },
        });
        await prisma.refreshToken.createMany({
          data: [
            {
              user_id: first.id,
              token_hash: 'jwt-fixture-hash-active-1',
              jti: 'jwt-active-1',
              family_id: 'jwt-family-1',
              expires_at: new Date('2030-01-01T00:00:00.000Z'),
            },
            {
              user_id: second.id,
              token_hash: 'jwt-fixture-hash-active-2',
              jti: 'jwt-active-2',
              family_id: 'jwt-family-2',
              expires_at: new Date('2030-01-01T00:00:00.000Z'),
            },
            {
              user_id: first.id,
              token_hash: 'jwt-fixture-hash-revoked',
              jti: 'jwt-revoked-before',
              family_id: 'jwt-family-1',
              expires_at: new Date('2030-01-01T00:00:00.000Z'),
              revoked_at: new Date('2026-10-01T00:00:00.000Z'),
              revoked_reason: 'fixture_pre_revoked',
            },
          ],
        });
      })().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      }).finally(() => prisma.$disconnect());
    `,
    { label: 'seed JWT invalidator fixture' },
  );

  const initial = normalizedState(readState());
  const preview = runInvalidator();
  assert.match(preview, /Preview:/);
  assert.match(preview, /Preview only/);
  assert.deepEqual(normalizedState(readState()), initial, 'preview must not mutate sessions or tokens');

  const missingConfirmation = runInvalidator({ apply: true, changeId: true, expectedStatus: 1 });
  assert.match(missingConfirmation, /JWT_ROTATION_CONFIRM/);
  assert.deepEqual(normalizedState(readState()), initial, 'missing confirmation must not mutate state');

  const missingChangeId = runInvalidator({ apply: true, confirm: true, expectedStatus: 1 });
  assert.match(missingChangeId, /JWT_ROTATION_CHANGE_ID/);
  assert.deepEqual(normalizedState(readState()), initial, 'missing change ID must not mutate state');

  const applied = runInvalidator({ apply: true, confirm: true, changeId: true });
  assert.match(applied, /Complete:/);
  assert.match(applied, /incremented 2 session versions/);
  assert.match(applied, /revoked 2 refresh tokens/);

  const finalState = normalizedState(readState());
  assert.deepEqual(finalState.users, [
    { phone: '+994501117701', session_version: 5 },
    { phone: '+994501117702', session_version: 10 },
  ]);
  const activeTokens = finalState.tokens.filter((token) => token.jti.startsWith('jwt-active-'));
  assert.equal(activeTokens.length, 2);
  for (const token of activeTokens) {
    assert.notEqual(token.revoked_at, null);
    assert.equal(token.revoked_reason, 'security_rotation');
  }
  assert.deepEqual(finalState.tokens.find((token) => token.jti === 'jwt-revoked-before'), {
    jti: 'jwt-revoked-before',
    revoked_at: '2026-10-01T00:00:00.000Z',
    revoked_reason: 'fixture_pre_revoked',
  });

  console.log('jwt-invalidator-container-regression: OK');
} finally {
  spawnSync('docker', ['rm', '--force', databaseContainer], { encoding: 'utf8' });
  spawnSync('docker', ['network', 'rm', network], { encoding: 'utf8' });
}
