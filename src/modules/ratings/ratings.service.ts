import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';

export async function createRating(
  raterId: string,
  role: string,
  input: { worker_id: string; order_id: string; score: number; comment?: string }
) {
  const order = await prisma.order.findUnique({
    where: { id: input.order_id },
    include: { company: true },
  });
  if (!order) throw Errors.notFound('Sifariş tapılmadı');
  if (order.status !== 'completed') throw Errors.badRequest('Sifariş hələ tamamlanmayıb');

  // company yalnız öz sifarişini qiymətləndirə bilər
  if (role === 'company') {
    const company = await prisma.company.findUnique({ where: { user_id: raterId } });
    if (order.company_id !== company?.id) throw Errors.forbidden('Yalnız öz sifarişini qiymətləndirə bilər');
  }

  // Artıq qiymətləndirilib?
  const existing = await prisma.rating.findUnique({
    where: { order_id_worker_id: { order_id: input.order_id, worker_id: input.worker_id } },
  });
  if (existing) throw Errors.badRequest('Bu sifariş üçün artıq qiymətləndirilib');

  const rating = await prisma.rating.create({
    data: {
      order_id: input.order_id,
      worker_id: input.worker_id,
      rater_id: raterId,
      score: input.score,
      comment: input.comment,
    },
  });

  // Worker rating_avg yenilə
  const agg = await prisma.rating.aggregate({
    where: { worker_id: input.worker_id },
    _avg: { score: true },
    _count: true,
  });
  await prisma.worker.update({
    where: { id: input.worker_id },
    data: {
      rating_avg: agg._avg.score ?? 0,
      rating_count: agg._count,
    },
  });

  return rating;
}

export async function getWorkerRatings(workerId: string) {
  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!worker) throw Errors.notFound('İşçi tapılmadı');

  const ratings = await prisma.rating.findMany({
    where: { worker_id: workerId },
    orderBy: { created_at: 'desc' },
  });

  return { avg: worker.rating_avg, total: worker.rating_count, ratings };
}
