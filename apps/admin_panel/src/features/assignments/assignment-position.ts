import type { WorkerProfile } from '../../shared/api/types';

// A recommendation only. Assignment eligibility is enforced by the API.
export function hasAssignmentPositionMismatch(
  worker: WorkerProfile,
  requiredPositionId?: string | null,
  requiredPositionLabel?: string | null,
) {
  if (requiredPositionId) {
    return !worker.position_ids?.includes(requiredPositionId)
      && !worker.positions?.some((position) => position.id === requiredPositionId);
  }
  // Older orders can carry only the category label. This fallback never grants
  // eligibility; it only helps the admin recognise a different listed role.
  const requiredLabel = requiredPositionLabel?.trim().toLocaleLowerCase('az');
  if (!requiredLabel) return false;
  const workerLabels = [
    ...(worker.positions?.map((position) => position.name_az) ?? []),
    ...(worker.position?.split(',') ?? []),
  ];
  return !workerLabels.some((label) => label.trim().toLocaleLowerCase('az') === requiredLabel);
}
