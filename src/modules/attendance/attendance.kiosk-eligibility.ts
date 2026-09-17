import type { Prisma } from '@prisma/client';
import type { OrderStatus } from '../../types/prisma';
import { ORDER_ATTENDANCE_STATUSES } from '../orders/orders.lifecycle';

export type KioskEligibleOrderCandidate = {
  status: OrderStatus;
  shift_end: Date;
  deleted_at: Date | null;
};

export function kioskEligibleOrderWhere(input: {
  now: Date;
  companyId?: string;
  orderId?: string;
}): Prisma.OrderWhereInput {
  return {
    deleted_at: null,
    status: { in: ORDER_ATTENDANCE_STATUSES },
    shift_end: { gt: input.now },
    company: {
      status: 'approved',
      deleted_at: null,
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
