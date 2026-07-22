import { Prisma } from '@prisma/client';
import { Errors } from '../../lib/errors';
import { OrderStatus, Role } from '../../types/prisma';
import { assertOrderTransition, isTerminalOrderStatus } from './orders.state-machine';

export const ORDER_STAFFING_STATUSES: OrderStatus[] = [
  'active',
  'published',
  'partially_assigned',
  'assigned',
];

export const ORDER_ATTENDANCE_STATUSES: OrderStatus[] = [
  ...ORDER_STAFFING_STATUSES,
  'in_progress',
];

type TransitionActor = {
  actorId: string;
  actorRole: Role;
  reason: string;
};

/**
 * Transition an already locked order with an optimistic status/version CAS.
 * The history and audit rows are part of the caller's transaction.
 */
export async function transitionOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  nextStatus: OrderStatus,
  actor: TransitionActor,
): Promise<{ status: OrderStatus; version: number; changed: boolean }> {
  const current = await tx.order.findFirst({
    where: { id: orderId, deleted_at: null },
    select: { status: true, version: true },
  });
  if (!current) {
    throw Errors.notFound('Order not found.', 'ORDER_NOT_FOUND');
  }
  if (current.status === nextStatus) {
    return { status: current.status, version: current.version, changed: false };
  }

  assertOrderTransition(current.status, nextStatus);
  const result = await tx.order.updateMany({
    where: {
      id: orderId,
      deleted_at: null,
      status: current.status,
      version: current.version,
    },
    data: { status: nextStatus, version: { increment: 1 } },
  });
  if (result.count !== 1) {
    throw Errors.conflict(
      'Order changed during lifecycle transition. Retry the operation.',
      'ORDER_VERSION_CONFLICT',
      { expected_version: current.version },
    );
  }

  const version = current.version + 1;
  await tx.orderStatusHistory.create({
    data: {
      order_id: orderId,
      from_status: current.status,
      to_status: nextStatus,
      actor_id: actor.actorId,
      actor_role: actor.actorRole,
      reason: actor.reason,
      version,
    },
  });
  await tx.auditLog.create({
    data: {
      actor_id: actor.actorId,
      actor_role: actor.actorRole,
      action: 'status_changed',
      entity_type: 'order',
      entity_id: orderId,
      metadata: {
        previous_status: current.status,
        new_status: nextStatus,
        previous_version: current.version,
        new_version: version,
        reason: actor.reason,
      },
    },
  });

  return { status: nextStatus, version, changed: true };
}

/** Reconcile pre-start order state from currently reserved staffing capacity. */
export async function reconcileOrderStaffingStatus(
  tx: Prisma.TransactionClient,
  orderId: string,
  actor: TransitionActor,
): Promise<void> {
  const order = await tx.order.findFirst({
    where: { id: orderId, deleted_at: null },
    select: { status: true, required_count: true },
  });
  if (!order || isTerminalOrderStatus(order.status) || order.status === 'in_progress' || order.status === 'draft') {
    return;
  }

  const reservedCount = await tx.assignment.count({
    where: {
      order_id: orderId,
      deleted_at: null,
      status: { in: ['assigned', 'accepted', 'completed'] },
    },
  });
  const nextStatus: OrderStatus =
    reservedCount === 0
      ? 'published'
      : reservedCount >= order.required_count
        ? 'assigned'
        : 'partially_assigned';

  await transitionOrder(tx, orderId, nextStatus, actor);
}

export async function markOrderInProgress(
  tx: Prisma.TransactionClient,
  orderId: string,
  actor: TransitionActor,
): Promise<void> {
  await transitionOrder(tx, orderId, 'in_progress', actor);
}

/** Complete the order after the final live assignment checks out. */
export async function completeOrderWhenFinished(
  tx: Prisma.TransactionClient,
  orderId: string,
  actor: TransitionActor,
): Promise<void> {
  const order = await tx.order.findFirst({
    where: { id: orderId, deleted_at: null },
    select: { status: true },
  });
  if (!order || order.status !== 'in_progress') return;

  const [completedCount, unfinishedCount, openAttendanceCount] = await Promise.all([
    tx.assignment.count({
      where: { order_id: orderId, deleted_at: null, status: 'completed' },
    }),
    tx.assignment.count({
      where: {
        order_id: orderId,
        deleted_at: null,
        status: { in: ['assigned', 'accepted'] },
      },
    }),
    tx.attendanceLog.count({
      where: {
        deleted_at: null,
        checkin_time: { not: null },
        checkout_time: null,
        assignment: { order_id: orderId, deleted_at: null },
      },
    }),
  ]);

  if (completedCount > 0 && unfinishedCount === 0 && openAttendanceCount === 0) {
    await transitionOrder(tx, orderId, 'completed', actor);
  }
}
