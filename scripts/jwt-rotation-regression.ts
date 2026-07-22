import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import {
  invalidateAllAuthSessions,
  rotationSecretIssue,
} from './invalidate-auth-sessions';

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
  const access = 'Ax7mQ2vL9pR4tW8yK3nD6sF1hJ5cB0uZ8eT4qPcN7vL2x';
  const refresh = 'H6qN1zV8cM3rT7wP2kD9sL4yF0bJ5xGa9uE7iRsQ4mW8c';
  assert.equal(rotationSecretIssue(access, refresh), null);
  assert.match(rotationSecretIssue(access, access) ?? '', /must be different/);
  assert.match(rotationSecretIssue('short', refresh) ?? '', /256 bits/);
  assert.match(rotationSecretIssue(`${access}+`, refresh) ?? '', /base64url/);
}

async function main(): Promise<void> {
  await testGlobalInvalidation();
  testSecretPolicy();
  console.log('jwt-rotation-regression: OK');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
