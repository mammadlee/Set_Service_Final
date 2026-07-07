import { apiRequest } from '../../shared/api/http';
import type { Assignment, AssignmentStatus, Paginated, Rating } from '../../shared/api/types';

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

  rate(input: { assignment_id: string; score: number; feedback?: string }) {
    return apiRequest<Rating>('/ratings', {
      method: 'POST',
      body: input,
    });
  },
};
