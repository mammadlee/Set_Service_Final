import type { Prisma } from '@prisma/client';
import type { OrderStatus } from '../../types/prisma';
import { ORDER_ATTENDANCE_STATUSES, orderLifecycleWhere } from '../orders/orders.lifecycle';

export type KioskEligibleOrderCandidate = {
  status: OrderStatus;
  shift_start?: Date;
  shift_end: Date;
  deleted_at: Date | null;
};

const DEFAULT_CHECKOUT_GRACE_MINUTES = 4 * 60;

export function kioskEligibleOrderWhere(input: {
  now: Date;
  companyId?: string;
  orderId?: string;
}): Prisma.OrderWhereInput {
  return {
    ...orderLifecycleWhere('active', input.now),
    ...(input.companyId ? { company_id: input.companyId } : {}),
    ...(input.orderId ? { id: input.orderId } : {}),
  };
}

/** Orders a self-service venue kiosk may select automatically right now. */
export function kioskCurrentOrderWhere(input: {
  now: Date;
  companyId?: string;
  orderId?: string;
}): Prisma.OrderWhereInput {
  return {
    ...kioskEligibleOrderWhere(input),
    shift_start: { lte: input.now },
  };
}

/**
 * Checkout remains possible for an already-open attendance log after the
 * scheduled end. Check-in continues to use the stricter active-order filter.
 */
export function checkoutEligibleOrderWhere(input: {
  now: Date;
  companyId?: string;
  orderId?: string;
}): Prisma.OrderWhereInput {
  return {
    deleted_at: null,
    status: { in: [...ORDER_ATTENDANCE_STATUSES] },
    shift_end: { gt: new Date(input.now.getTime() - getAttendanceCheckoutGraceMs()) },
    company: {
      deleted_at: null,
      status: 'approved',
      user: { is_active: true, deleted_at: null },
    },
    ...(input.companyId ? { company_id: input.companyId } : {}),
    ...(input.orderId ? { id: input.orderId } : {}),
  };
}

export function isKioskEligibleOrder(
  order: KioskEligibleOrderCandidate,
  now: Date = new Date(),
): boolean {
  return order.deleted_at === null
    && ORDER_ATTENDANCE_STATUSES.includes(order.status)
    && order.shift_end.getTime() > now.getTime();
}

export function isKioskCurrentOrder(
  order: KioskEligibleOrderCandidate,
  now: Date = new Date(),
): boolean {
  return isKioskEligibleOrder(order, now)
    && order.shift_start !== undefined
    && order.shift_start.getTime() <= now.getTime();
}

export function isWithinAttendanceCheckoutGrace(
  order: KioskEligibleOrderCandidate,
  now: Date = new Date(),
): boolean {
  return order.deleted_at === null
    && ORDER_ATTENDANCE_STATUSES.includes(order.status)
    && order.shift_end.getTime() > now.getTime() - getAttendanceCheckoutGraceMs();
}

export function getAttendanceCheckoutGraceMs(): number {
  const configured = Number(process.env.ATTENDANCE_CHECKOUT_GRACE_MINUTES);
  const minutes = Number.isFinite(configured) && configured >= 0
    ? Math.min(configured, 7 * 24 * 60)
    : DEFAULT_CHECKOUT_GRACE_MINUTES;
  return minutes * 60 * 1000;
}
