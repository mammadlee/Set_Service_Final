import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { secretStrengthIssue } from '../src/lib/check-env';
import { prisma } from '../src/lib/prisma';

const ROTATION_CONFIRMATION = 'INVALIDATE_ALL_SESSIONS';
const ROTATION_REASON = 'security_rotation';

export interface AuthSessionInvalidationResult {
  usersIncremented: number;
  refreshTokensRevoked: number;
  revokedAt: Date;
}

export async function invalidateAllAuthSessions(
  tx: Prisma.TransactionClient,
  revokedAt: Date,
): Promise<AuthSessionInvalidationResult> {
  const users = await tx.user.updateMany({
    data: { session_version: { increment: 1 } },
  });
  const refreshTokens = await tx.refreshToken.updateMany({
    where: { revoked_at: null },
    data: {
      revoked_at: revokedAt,
      revoked_reason: ROTATION_REASON,
    },
  });

  return {
    usersIncremented: users.count,
    refreshTokensRevoked: refreshTokens.count,
    revokedAt,
  };
}

export function rotationSecretIssue(
  accessSecret: string | undefined,
  refreshSecret: string | undefined,
): string | null {
  if (!accessSecret || !refreshSecret) {
    return 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must both be injected';
  }
  if (accessSecret === refreshSecret) {
    return 'JWT access and refresh secrets must be different';
  }
  for (const [key, value] of [
    ['JWT_ACCESS_SECRET', accessSecret],
    ['JWT_REFRESH_SECRET', refreshSecret],
  ] as const) {
    if (value.length < 43) {
      return `${key} must contain at least 256 bits encoded as 43+ base64url characters`;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      return `${key} must use unpadded base64url characters only`;
    }
    const strengthIssue = secretStrengthIssue(value);
    if (strengthIssue) return `${key} is weak: ${strengthIssue}`;
  }
  return null;
}

async function main(): Promise<void> {
  const shouldApply = process.argv.includes('--apply');
  if (shouldApply) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error('JWT session invalidation --apply is allowed only with NODE_ENV=production.');
    }
    if (process.env.JWT_ROTATION_CONFIRM !== ROTATION_CONFIRMATION) {
      throw new Error(`Set JWT_ROTATION_CONFIRM=${ROTATION_CONFIRMATION} to acknowledge global logout.`);
    }
    if (!process.env.JWT_ROTATION_CHANGE_ID?.trim()) {
      throw new Error('JWT_ROTATION_CHANGE_ID is required for the production change record.');
    }

    const issue = rotationSecretIssue(
      process.env.JWT_ACCESS_SECRET,
      process.env.JWT_REFRESH_SECRET,
    );
    if (issue) throw new Error(issue);
  }

  const [userCount, activeRefreshTokenCount] = await Promise.all([
    prisma.user.count(),
    prisma.refreshToken.count({ where: { revoked_at: null } }),
  ]);
  console.log(
    `[JWT rotation] Preview: ${userCount} user session versions and ${activeRefreshTokenCount} active refresh tokens are in scope.`,
  );

  if (!shouldApply) {
    console.log('[JWT rotation] Preview only. Re-run with --apply after the new secrets are active on every API/worker instance.');
    return;
  }

  const result = await prisma.$transaction(
    (tx) => invalidateAllAuthSessions(tx, new Date()),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  console.log(
    `[JWT rotation] Complete: incremented ${result.usersIncremented} session versions and revoked ${result.refreshTokensRevoked} refresh tokens at ${result.revokedAt.toISOString()}.`,
  );
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error('[JWT rotation] Failed:', error instanceof Error ? error.message : 'unknown error');
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
