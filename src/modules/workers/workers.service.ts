import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';

export async function getMyWorker(userId: string) {
  const worker = await prisma.worker.findUnique({
    where: { user_id: userId },
    include: { user: { select: { name: true, phone: true } } },
  });
  if (!worker) throw Errors.notFound('İşçi profili tapılmadı');
  return worker;
}

export async function updateMyWorker(userId: string, data: { skills?: object; availability?: boolean }) {
  const worker = await prisma.worker.findUnique({ where: { user_id: userId } });
  if (!worker) throw Errors.notFound('İşçi profili tapılmadı');
  return prisma.worker.update({ where: { user_id: userId }, data });
}

export async function listWorkers(filters: { skills?: string; available?: boolean }) {
  const where: Record<string, unknown> = {};

  if (filters.available !== undefined) {
    where.availability = filters.available;
  }

  // skills filtr: JSONB içindəki name field-ini yoxlayır
  // Prisma raw query — JSONB array filter üçün
  if (filters.skills) {
    const skillList = filters.skills.split(',').map((s) => s.trim());
    // Sadə contains yanaşması: hər skill üçün ayrı yoxlama
    // Production-da GIN indeksi əlavə et: CREATE INDEX ON workers USING GIN (skills)
    return prisma.$queryRaw`
      SELECT w.*, u.name, u.phone, u.fcm_token
      FROM workers w
      JOIN users u ON u.id = w.user_id
      WHERE w.availability = true
        AND (
          SELECT COUNT(*)
          FROM jsonb_array_elements(w.skills) AS s
          WHERE s->>'name' = ANY(${skillList})
        ) > 0
    `;
  }

  return prisma.worker.findMany({
    where,
    include: { user: { select: { name: true, phone: true } } },
    orderBy: { rating_avg: 'desc' },
  });
}
