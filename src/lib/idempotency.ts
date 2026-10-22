import { prisma } from './prisma';

export const ORDER_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export async function deleteExpiredIdempotencyKey(input: {
  actorId: string;
  scope: string;
  key: string;
  now?: Date;
}): Promise<number> {
  const result = await prisma.idempotencyKey.deleteMany({
    where: {
      actor_id: input.actorId,
      scope: input.scope,
      key: input.key,
      expires_at: { lte: input.now ?? new Date() },
    },
  });
  return result.count;
}

export async function cleanupExpiredIdempotencyKeys(
  before = new Date(),
  limit = 500,
): Promise<number> {
  const expired = await prisma.idempotencyKey.findMany({
    where: { expires_at: { lte: before } },
    select: { id: true },
    orderBy: { expires_at: 'asc' },
    take: Math.max(1, Math.min(limit, 5_000)),
  });
  if (expired.length === 0) return 0;

  const result = await prisma.idempotencyKey.deleteMany({
    where: {
      id: { in: expired.map((item: { id: string }) => item.id) },
      expires_at: { lte: before },
    },
  });
  return result.count;
}
