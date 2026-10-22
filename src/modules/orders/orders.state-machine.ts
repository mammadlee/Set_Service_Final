import { Errors } from '../../lib/errors';
import { OrderStatus } from '../../types/prisma';

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['active', 'published', 'cancelled'],
  // `active` is retained only as a compatibility state for rows created before
  // the explicit lifecycle was introduced. New orders start at `published`.
  active: ['published', 'partially_assigned', 'assigned', 'in_progress', 'completed', 'cancelled'],
  published: ['partially_assigned', 'assigned', 'cancelled'],
  // Staffing can legitimately move backwards before work starts when an
  // assignment is rejected or cancelled.
  partially_assigned: ['published', 'assigned', 'in_progress', 'cancelled'],
  assigned: ['published', 'partially_assigned', 'in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (canTransitionOrder(from, to)) return;
  throw Errors.conflict(
    `Order cannot transition from ${from} to ${to}.`,
    'ORDER_STATUS_TRANSITION_INVALID',
    { from_status: from, to_status: to },
  );
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}
