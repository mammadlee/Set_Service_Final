import type { AssignmentStatus } from '../../types/prisma';

export const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ['assigned', 'accepted'];
export const HISTORICAL_ASSIGNMENT_STATUSES: AssignmentStatus[] = ['rejected', 'completed', 'cancelled'];
export const SCHEDULE_CONFLICT_STATUSES: AssignmentStatus[] = ['assigned', 'accepted'];

export type AssignmentWarning = {
  code: 'WORKER_POSITION_MISMATCH';
  message: string;
  worker_id: string;
  position_id: string;
};

export function assignmentStatusesForScope(
  scope: 'active' | 'history' | undefined,
): AssignmentStatus[] | undefined {
  if (scope === 'active') return ACTIVE_ASSIGNMENT_STATUSES;
  if (scope === 'history') return HISTORICAL_ASSIGNMENT_STATUSES;
  return undefined;
}

export function buildPositionMismatchWarnings(
  assignments: Array<{ workerId: string; positionId?: string }>,
  workers: Array<{ id: string; positions: Array<{ position_id: string }> }>,
): AssignmentWarning[] {
  const workersById = new Map(workers.map((worker) => [worker.id, worker]));
  return assignments.flatMap((assignment) => {
    if (!assignment.positionId) return [];
    const worker = workersById.get(assignment.workerId);
    if (worker?.positions.some((position) => position.position_id === assignment.positionId)) return [];
    return [{
      code: 'WORKER_POSITION_MISMATCH' as const,
      message: 'Worker profile position differs from the assigned order position.',
      worker_id: assignment.workerId,
      position_id: assignment.positionId,
    }];
  });
}

export function assignmentDurationMinutes(checkinTime: Date | null, checkoutTime: Date | null): number | null {
  if (!checkinTime || !checkoutTime) return null;
  return Math.max(0, Math.round((checkoutTime.getTime() - checkinTime.getTime()) / 60_000));
}
