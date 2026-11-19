import { Prisma } from '@prisma/client';
import { secretStrengthIssue } from '../lib/check-env';
import { prisma } from '../lib/prisma';

const ROTATION_CONFIRMATION = 'INVALIDATE_ALL_SESSIONS';
const ROTATION_REASON = 'security_rotation';
export const AUTH_SESSION_INVALIDATOR_USAGE =
  'JWT_SESSION_INVALIDATOR_USAGE: node dist/tools/invalidate-auth-sessions.js [--dry-run|--apply]';

export interface AuthSessionInvalidationResult {
  usersIncremented: number;
  refreshTokensRevoked: number;
  revokedAt: Date;
}

export type AuthSessionInvalidatorRunResult =
  | { mode: 'help' }
  | {
      mode: 'dry-run' | 'apply';
      usersInScope: number;
      activeRefreshTokensInScope: number;
      applied?: AuthSessionInvalidationResult;
    };

export interface AuthSessionInvalidatorOptions {
  args?: readonly string[];
  env?: NodeJS.ProcessEnv;
  client?: typeof prisma;
  now?: () => Date;
  log?: (message: string) => void;
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

export function parseAuthSessionInvalidatorMode(
  args: readonly string[],
): 'help' | 'dry-run' | 'apply' {
  if (args.length === 1 && args[0] === '--help') return 'help';
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) {
    return 'dry-run';
  }
  if (args.length === 1 && args[0] === '--apply') return 'apply';
  throw new Error('JWT session invalidator accepts exactly one of --help, --dry-run, or --apply.');
}

export async function runAuthSessionInvalidator(
  options: AuthSessionInvalidatorOptions = {},
): Promise<AuthSessionInvalidatorRunResult> {
  const args = options.args ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const client = options.client ?? prisma;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? console.log;
  const mode = parseAuthSessionInvalidatorMode(args);

  if (mode === 'help') {
    log(AUTH_SESSION_INVALIDATOR_USAGE);
    return { mode };
  }

  if (mode === 'apply') {
    if (env.NODE_ENV !== 'production') {
      throw new Error('JWT session invalidation --apply is allowed only with NODE_ENV=production.');
    }
    if (env.JWT_ROTATION_CONFIRM !== ROTATION_CONFIRMATION) {
      throw new Error(`Set JWT_ROTATION_CONFIRM=${ROTATION_CONFIRMATION} to acknowledge global logout.`);
    }
    if (!env.JWT_ROTATION_CHANGE_ID?.trim()) {
      throw new Error('JWT_ROTATION_CHANGE_ID is required for the production change record.');
    }
    const issue = rotationSecretIssue(env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET);
    if (issue) throw new Error(issue);
  }

  const [usersInScope, activeRefreshTokensInScope] = await Promise.all([
    client.user.count(),
    client.refreshToken.count({ where: { revoked_at: null } }),
  ]);
  log(
    `[JWT rotation] Preview: ${usersInScope} user session versions and ${activeRefreshTokensInScope} active refresh tokens are in scope.`,
  );

  if (mode === 'dry-run') {
    log('[JWT rotation] Preview only. Re-run with --apply after the new secrets are active on every API/worker instance.');
    return { mode, usersInScope, activeRefreshTokensInScope };
  }

  const applied = await client.$transaction(
    (tx) => invalidateAllAuthSessions(tx, now()),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  log(
    `[JWT rotation] Complete: incremented ${applied.usersIncremented} session versions and revoked ${applied.refreshTokensRevoked} refresh tokens at ${applied.revokedAt.toISOString()}.`,
  );
  return { mode, usersInScope, activeRefreshTokensInScope, applied };
}

if (require.main === module) {
  runAuthSessionInvalidator()
    .catch((error: unknown) => {
      console.error('[JWT rotation] Failed:', error instanceof Error ? error.message : 'unknown error');
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
