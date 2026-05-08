import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { sendPush, sendPushMulti } from '../../lib/fcm';
import { AssignmentStatus } from '../../types/prisma';

export async function assignWorkers(orderId: string, workerIds: string[]) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw Errors.notFound('Sifariş tapılmadı');
  if (order.status !== 'active') throw Errors.badRequest('Sifariş aktiv deyil');

  // Artıq təyin olunmuş işçiləri skip et (@@unique constraint)
  const assignments = await prisma.$transaction(
    workerIds.map((wid) =>
      prisma.assignment.upsert({
        where: { order_id_worker_id: { order_id: orderId, worker_id: wid } },
        update: {},
        create: { order_id: orderId, worker_id: wid },
      })
    )
  );

  // Hər işçiyə push göndər
  const workers = await prisma.worker.findMany({
    where: { id: { in: workerIds } },
    include: { user: { select: { fcm_token: true, name: true } } },
  });

  const tokens = workers.flatMap((w: any) => (w.user.fcm_token ? [w.user.fcm_token] : []));
  if (tokens.length) {
    await sendPushMulti(tokens, {
      title: 'Yeni sifariş təklifi',
      body: 'Sizə yeni iş sifarişi göndərildi. Qəbul edirsiniz?',
      data: { order_id: orderId },
    });
  }

  return { assigned_count: assignments.length, assignments };
}

export async function getMyAssignments(userId: string, status?: string) {
  const worker = await prisma.worker.findUnique({ where: { user_id: userId } });
  if (!worker) throw Errors.notFound('İşçi tapılmadı');

  return prisma.assignment.findMany({
    where: {
      worker_id: worker.id,
      ...(status ? { status: status as AssignmentStatus } : {}),
    },
    include: {
      order: {
        include: { company: { select: { name: true } } },
      },
    },
    orderBy: { assigned_at: 'desc' },
  });
}

export async function updateAssignmentStatus(
  assignmentId: string,
  userId: string,
  newStatus: 'accepted' | 'rejected'
) {
  const worker = await prisma.worker.findUnique({ where: { user_id: userId } });
  if (!worker) throw Errors.notFound('İşçi tapılmadı');

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      order: { include: { company: { include: { user: true } } } },
    },
  });
  if (!assignment) throw Errors.notFound('Tapılmadı');
  if (assignment.worker_id !== worker.id) throw Errors.forbidden('Yalnız öz assignment-ini dəyişə bilər');

  const updated = await prisma.assignment.update({
    where: { id: assignmentId },
    data: { status: newStatus },
  });

  // Müəssisəyə + admina bildiriş
  const pushTargets: string[] = [];
  if (assignment.order.company.user.fcm_token) {
    pushTargets.push(assignment.order.company.user.fcm_token);
  }
  const admins = await prisma.user.findMany({ where: { role: 'super_admin', fcm_token: { not: null } } });
  admins.forEach((a: any) => { if (a.fcm_token) pushTargets.push(a.fcm_token); });

  const workerUser = await prisma.user.findUnique({ where: { id: userId } });
  const body = newStatus === 'accepted'
    ? `${workerUser?.name} sifarişi qəbul etdi`
    : `${workerUser?.name} sifarişi rədd etdi`;

  await sendPushMulti(pushTargets, { title: 'Sifariş statusu dəyişdi', body, data: { assignment_id: assignmentId } });

  return updated;
}
