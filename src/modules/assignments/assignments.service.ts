import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { sendPushMulti } from '../../lib/fcm';
import { AssignmentStatus } from '../../types/prisma';
import { createNotification } from '../../lib/notifications';

export async function assignWorkers(orderId: string, workerIds: string[]) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw Errors.notFound('Order not found.', 'ORDER_NOT_FOUND');
  if (order.status !== 'active') throw Errors.badRequest('Order is not active.', 'ORDER_NOT_ACTIVE');

  const approvedWorkers = await prisma.worker.findMany({
    where: { id: { in: workerIds }, status: 'approved', deleted_at: null },
    select: { id: true, user_id: true },
  });
  const approvedWorkerIds = approvedWorkers.map((worker: { id: string }) => worker.id);

  if (!approvedWorkerIds.length) {
    throw Errors.badRequest('No approved workers were selected.', 'NO_APPROVED_WORKERS');
  }

  const assignments = await prisma.$transaction(
    approvedWorkerIds.map((workerId: string) =>
      prisma.assignment.upsert({
        where: { order_id_worker_id: { order_id: orderId, worker_id: workerId } },
        update: {},
        create: { order_id: orderId, worker_id: workerId },
      })
    )
  );

  const workers = await prisma.worker.findMany({
    where: { id: { in: approvedWorkerIds } },
    include: { user: { select: { fcm_token: true, name: true } } },
  });

  await Promise.all(approvedWorkers.map((worker: { user_id: string; id: string }) =>
    createNotification({
      recipient_id: worker.user_id,
      type: 'job_assigned',
      title: 'New job assignment',
      body: 'A new job assignment was sent to you.',
      metadata: { order_id: orderId, worker_id: worker.id },
    })
  ));

  const tokens = workers.flatMap((worker: { user: { fcm_token?: string | null } }) =>
    worker.user.fcm_token ? [worker.user.fcm_token] : []
  );
  if (tokens.length) {
    await sendPushMulti(tokens, {
      title: 'New job assignment',
      body: 'A new job assignment was sent to you.',
      data: { order_id: orderId },
    });
  }

  return { assigned_count: assignments.length, assignments };
}

export async function getMyAssignments(userId: string, status?: string) {
  const worker = await prisma.worker.findUnique({ where: { user_id: userId } });
  if (!worker) throw Errors.notFound('Worker not found.', 'WORKER_NOT_FOUND');
  if (worker.status !== 'approved') {
    throw Errors.forbidden('Worker must be approved before using assignment APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: worker.status,
    });
  }

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
  if (!worker) throw Errors.notFound('Worker not found.', 'WORKER_NOT_FOUND');
  if (worker.status !== 'approved') {
    throw Errors.forbidden('Worker must be approved before using assignment APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: worker.status,
    });
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      order: { include: { company: { include: { user: true } } } },
    },
  });
  if (!assignment) throw Errors.notFound('Assignment not found.', 'ASSIGNMENT_NOT_FOUND');
  if (assignment.worker_id !== worker.id) {
    throw Errors.forbidden('You can only update your own assignment.', 'ASSIGNMENT_FORBIDDEN');
  }

  const updated = await prisma.assignment.update({
    where: { id: assignmentId },
    data: { status: newStatus },
  });

  const pushTargets: string[] = [];
  if (assignment.order.company.user.fcm_token) pushTargets.push(assignment.order.company.user.fcm_token);

  const admins = await prisma.user.findMany({ where: { role: 'super_admin', fcm_token: { not: null } } });
  admins.forEach((admin: { fcm_token?: string | null }) => {
    if (admin.fcm_token) pushTargets.push(admin.fcm_token);
  });

  if (pushTargets.length) {
    await sendPushMulti(pushTargets, {
      title: 'Assignment status changed',
      body: `Worker ${newStatus} the assignment.`,
      data: { assignment_id: assignmentId },
    });
  }

  return updated;
}
