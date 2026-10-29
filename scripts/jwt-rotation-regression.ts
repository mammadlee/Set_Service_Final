import assert from 'node:assert/strict';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  AUTH_SESSION_INVALIDATOR_USAGE,
  invalidateAllAuthSessions,
  parseAuthSessionInvalidatorMode,
  rotationSecretIssue,
  runAuthSessionInvalidator,
} from './invalidate-auth-sessions';

const validAccessSecret = 'Ax7mQ2vL9pR4tW8yK3nD6sF1hJ5cB0uZ8eT4qPcN7vL2x';
const validRefreshSecret = 'H6qN1zV8cM3rT7wP2kD9sL4yF0bJ5xGa9uE7iRsQ4mW8c';

async function testGlobalInvalidation(): Promise<void> {
  const revokedAt = new Date('2026-07-21T12:00:00.000Z');
  const calls: Array<{ model: string; args: unknown }> = [];
  const tx = {
    user: {
      updateMany: async (args: unknown) => {
        calls.push({ model: 'user', args });
        return { count: 14 };
      },
    },
    refreshToken: {
      updateMany: async (args: unknown) => {
        calls.push({ model: 'refreshToken', args });
        return { count: 9 };
      },
    },
  } as unknown as Prisma.TransactionClient;

  const result = await invalidateAllAuthSessions(tx, revokedAt);
  assert.deepEqual(result, {
    usersIncremented: 14,
    refreshTokensRevoked: 9,
    revokedAt,
  });
  assert.deepEqual(calls, [
    {
      model: 'user',
      args: { data: { session_version: { increment: 1 } } },
    },
    {
      model: 'refreshToken',
      args: {
        where: { revoked_at: null },
        data: { revoked_at: revokedAt, revoked_reason: 'security_rotation' },
      },
    },
  ]);
}

function testSecretPolicy(): void {
  assert.equal(rotationSecretIssue(validAccessSecret, validRefreshSecret), null);
  assert.match(rotationSecretIssue(validAccessSecret, validAccessSecret) ?? '', /must be different/);
  assert.match(rotationSecretIssue('short', validRefreshSecret) ?? '', /256 bits/);
  assert.match(rotationSecretIssue(`${validAccessSecret}+`, validRefreshSecret) ?? '', /base64url/);
}

function testStrictCommandMode(): void {
  assert.equal(parseAuthSessionInvalidatorMode([]), 'dry-run');
  assert.equal(parseAuthSessionInvalidatorMode(['--help']), 'help');
  assert.equal(parseAuthSessionInvalidatorMode(['--dry-run']), 'dry-run');
  assert.equal(parseAuthSessionInvalidatorMode(['--apply']), 'apply');
  assert.throws(
    () => parseAuthSessionInvalidatorMode(['--apply', '--dry-run']),
    /accepts exactly one/,
  );
  assert.throws(() => parseAuthSessionInvalidatorMode(['--force']), /accepts exactly one/);
}

function forbiddenDatabaseClient(): PrismaClient {
  return {
    user: { count: async () => { throw new Error('DATABASE_MUST_NOT_BE_ACCESSED'); } },
    refreshToken: { count: async () => { throw new Error('DATABASE_MUST_NOT_BE_ACCESSED'); } },
    $transaction: async () => { throw new Error('DATABASE_MUST_NOT_BE_ACCESSED'); },
  } as unknown as PrismaClient;
}

async function testHelpDoesNotAccessDatabase(): Promise<void> {
  const logs: string[] = [];
  const result = await runAuthSessionInvalidator({
    args: ['--help'],
    client: forbiddenDatabaseClient(),
    log: (message) => logs.push(message),
  });
  assert.deepEqual(result, { mode: 'help' });
  assert.deepEqual(logs, [AUTH_SESSION_INVALIDATOR_USAGE]);
}

async function testDryRunDoesNotMutate(): Promise<void> {
  let transactionCalled = false;
  const client = {
    user: { count: async () => 14 },
    refreshToken: { count: async () => 9 },
    $transaction: async () => {
      transactionCalled = true;
      throw new Error('DRY_RUN_TRANSACTION_FORBIDDEN');
    },
  } as unknown as PrismaClient;
  const logs: string[] = [];

  const result = await runAuthSessionInvalidator({
    args: ['--dry-run'],
    env: {},
    client,
    log: (message) => logs.push(message),
  });

  assert.deepEqual(result, {
    mode: 'dry-run',
    usersInScope: 14,
    activeRefreshTokensInScope: 9,
  });
  assert.equal(transactionCalled, false);
  assert.equal(logs.length, 2);
  assert.match(logs[0], /14 user session versions and 9 active refresh tokens/);
  assert.match(logs[1], /Preview only/);
}

async function testApplyGatesRunBeforeDatabaseAccess(): Promise<void> {
  const client = forbiddenDatabaseClient();
  await assert.rejects(
    runAuthSessionInvalidator({ args: ['--apply'], env: {}, client }),
    /only with NODE_ENV=production/,
  );
  await assert.rejects(
    runAuthSessionInvalidator({
      args: ['--apply'],
      env: { NODE_ENV: 'production' },
      client,
    }),
    /JWT_ROTATION_CONFIRM/,
  );
  await assert.rejects(
    runAuthSessionInvalidator({
      args: ['--apply'],
      env: {
        NODE_ENV: 'production',
        JWT_ROTATION_CONFIRM: 'INVALIDATE_ALL_SESSIONS',
      },
      client,
    }),
    /JWT_ROTATION_CHANGE_ID is required/,
  );
  await assert.rejects(
    runAuthSessionInvalidator({
      args: ['--apply'],
      env: {
        NODE_ENV: 'production',
        JWT_ROTATION_CONFIRM: 'INVALIDATE_ALL_SESSIONS',
        JWT_ROTATION_CHANGE_ID: 'SEC-2026-10-29',
      },
      client,
    }),
    /must both be injected/,
  );
}

async function testApplyUsesSerializableTransaction(): Promise<void> {
  const revokedAt = new Date('2026-10-29T12:30:00.000Z');
  const calls: Array<{ model: string; args: unknown }> = [];
  let isolationLevel: unknown;
  const tx = {
    user: {
      updateMany: async (args: unknown) => {
        calls.push({ model: 'user', args });
        return { count: 14 };
      },
    },
    refreshToken: {
      updateMany: async (args: unknown) => {
        calls.push({ model: 'refreshToken', args });
        return { count: 9 };
      },
    },
  } as unknown as Prisma.TransactionClient;
  const client = {
    user: { count: async () => 14 },
    refreshToken: { count: async () => 9 },
    $transaction: async (
      callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
      options: { isolationLevel?: unknown },
    ) => {
      isolationLevel = options.isolationLevel;
      return callback(tx);
    },
  } as unknown as PrismaClient;

  const result = await runAuthSessionInvalidator({
    args: ['--apply'],
    env: {
      NODE_ENV: 'production',
      JWT_ROTATION_CONFIRM: 'INVALIDATE_ALL_SESSIONS',
      JWT_ROTATION_CHANGE_ID: 'SEC-2026-10-29',
      JWT_ACCESS_SECRET: validAccessSecret,
      JWT_REFRESH_SECRET: validRefreshSecret,
    },
    client,
    now: () => revokedAt,
    log: () => undefined,
  });

  assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  assert.deepEqual(result, {
    mode: 'apply',
    usersInScope: 14,
    activeRefreshTokensInScope: 9,
    applied: { usersIncremented: 14, refreshTokensRevoked: 9, revokedAt },
  });
  assert.deepEqual(calls, [
    { model: 'user', args: { data: { session_version: { increment: 1 } } } },
    {
      model: 'refreshToken',
      args: {
        where: { revoked_at: null },
        data: { revoked_at: revokedAt, revoked_reason: 'security_rotation' },
      },
    },
  ]);
}

async function main(): Promise<void> {
  await testGlobalInvalidation();
  testSecretPolicy();
  testStrictCommandMode();
  await testHelpDoesNotAccessDatabase();
  await testDryRunDoesNotMutate();
  await testApplyGatesRunBeforeDatabaseAccess();
  await testApplyUsesSerializableTransaction();
  console.log('jwt-rotation-regression: OK');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
