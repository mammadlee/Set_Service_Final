import { prisma } from './prisma';

const DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionPolicy = {
  outboxProcessedDays: number;
  outboxDeadDays: number;
  otpDays: number;
  refreshTokenDays: number;
  auditLogDays: number;
};

type RetentionDelegate = {
  findMany(args: {
    where: unknown;
    orderBy: Record<string, 'asc'>;
    take: number;
    select: { id: true };
  }): Promise<Array<{ id: string }>>;
  deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
};

export type RetentionClient = {
  outboxEvent: RetentionDelegate;
  otpCode: RetentionDelegate;
  refreshToken: RetentionDelegate;
  auditLog: RetentionDelegate;
};

export type RetentionCleanupResult = {
  outboxProcessed: number;
  outboxDead: number;
  otpCodes: number;
  refreshTokens: number;
  auditLogs: number;
  hasMore: boolean;
};

export function loadRetentionPolicy(env: NodeJS.ProcessEnv = process.env): RetentionPolicy {
  return {
    outboxProcessedDays: retentionDays(env, 'OUTBOX_PROCESSED_RETENTION_DAYS', 30),
    outboxDeadDays: retentionDays(env, 'OUTBOX_DEAD_RETENTION_DAYS', 90),
    otpDays: retentionDays(env, 'OTP_RETENTION_DAYS', 30),
    refreshTokenDays: retentionDays(env, 'REFRESH_TOKEN_RETENTION_DAYS', 90),
    auditLogDays: retentionDays(env, 'AUDIT_LOG_RETENTION_DAYS', 365),
  };
}

export async function cleanupRetentionBatch(
  now = new Date(),
  limit = 500,
  client: RetentionClient = prisma as unknown as RetentionClient,
  policy = loadRetentionPolicy(),
): Promise<RetentionCleanupResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5_000) {
    throw new Error('Retention cleanup limit must be an integer between 1 and 5000.');
  }

  const [processedIds, deadIds, otpIds, refreshIds, auditIds] = await Promise.all([
    selectIds(client.outboxEvent, { status: 'processed', updated_at: { lt: cutoff(now, policy.outboxProcessedDays) } }, 'updated_at', limit),
    selectIds(client.outboxEvent, { status: 'dead', updated_at: { lt: cutoff(now, policy.outboxDeadDays) } }, 'updated_at', limit),
    selectIds(client.otpCode, { expires_at: { lt: cutoff(now, policy.otpDays) } }, 'expires_at', limit),
    selectIds(client.refreshToken, {
      OR: [
        { revoked_at: { lt: cutoff(now, policy.refreshTokenDays) } },
        { revoked_at: null, expires_at: { lt: cutoff(now, policy.refreshTokenDays) } },
      ],
    }, 'expires_at', limit),
    selectIds(client.auditLog, { created_at: { lt: cutoff(now, policy.auditLogDays) } }, 'created_at', limit),
  ]);

  const [outboxProcessed, outboxDead, otpCodes, refreshTokens, auditLogs] = await Promise.all([
    deleteIds(client.outboxEvent, processedIds),
    deleteIds(client.outboxEvent, deadIds),
    deleteIds(client.otpCode, otpIds),
    deleteIds(client.refreshToken, refreshIds),
    deleteIds(client.auditLog, auditIds),
  ]);

  return {
    outboxProcessed,
    outboxDead,
    otpCodes,
    refreshTokens,
    auditLogs,
    hasMore: [processedIds, deadIds, otpIds, refreshIds, auditIds].some((ids) => ids.length === limit),
  };
}

function retentionDays(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = Number(env[key] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 3_650) {
    throw new Error(`${key} must be an integer between 1 and 3650`);
  }
  return value;
}

function cutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

async function selectIds(
  delegate: RetentionDelegate,
  where: unknown,
  orderField: string,
  limit: number,
): Promise<string[]> {
  const rows = await delegate.findMany({
    where,
    orderBy: { [orderField]: 'asc' },
    take: limit,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function deleteIds(delegate: RetentionDelegate, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return (await delegate.deleteMany({ where: { id: { in: ids } } })).count;
}
