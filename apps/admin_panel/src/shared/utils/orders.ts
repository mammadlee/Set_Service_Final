import type { Order, OrderDisplayStatus, OrderStatus } from '../api/types';

const EXPIRABLE_ORDER_STATUSES = new Set<OrderStatus>([
  'draft',
  'active',
  'published',
  'partially_assigned',
  'assigned',
]);

/**
 * Keep the persisted lifecycle status intact, but do not present a past shift
 * as if it were still schedulable. In-progress shifts remain in-progress so
 * overdue attendance can still be noticed and resolved.
 */
export function orderDisplayStatus(
  order: Pick<Order, 'status' | 'end_datetime'>,
  now = new Date(),
): OrderDisplayStatus {
  const shiftEnd = new Date(order.end_datetime);
  if (
    EXPIRABLE_ORDER_STATUSES.has(order.status)
    && !Number.isNaN(shiftEnd.getTime())
    && shiftEnd.getTime() <= now.getTime()
  ) {
    return 'expired';
  }
  return order.status;
}
