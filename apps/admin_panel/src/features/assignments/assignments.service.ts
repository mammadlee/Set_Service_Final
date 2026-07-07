import { apiRequest } from '../../shared/api/http';
import type { Assignment, AssignmentStatus, Paginated } from '../../shared/api/types';

export const assignmentsService = {
  list(params: {
    page?: number;
    limit?: number;
    status?: AssignmentStatus | '';
    order_id?: string;
    worker_id?: string;
    sort?: 'asc' | 'desc';
  }) {
    return apiRequest<Paginated<Assignment>>('/assignments', { query: params });
  },

  get(id: string) {
    return apiRequest<Assignment>(`/assignments/${id}`);
  },

  create(
    orderId: string,
    workerIds: string[],
    options?: { category?: string; orderCategoryItemId?: string | null; positionId?: string | null },
  ) {
    return apiRequest<{ assigned_count: number; assignments: Assignment[] }>('/assignments', {
      method: 'POST',
      body: {
        order_id: orderId,
        worker_ids: workerIds,
        ...(options?.category ? { category: options.category } : {}),
        ...(options?.orderCategoryItemId ? { order_category_item_id: options.orderCategoryItemId } : {}),
        ...(options?.positionId ? { position_id: options.positionId } : {}),
      },
    });
  },

  cancel(id: string, reason?: string) {
    return apiRequest<Assignment>(`/assignments/${id}/cancel`, {
      method: 'PATCH',
      body: reason ? { reason } : {},
    });
  },
};
