import { apiRequest } from '../../shared/api/http';
import type { Paginated, RatingSummary, WorkerClass, WorkerProfile, WorkerStatus } from '../../shared/api/types';
import { isWorkerDocumentType, resolveSignedDocumentUrl, type DisplayDocument } from '../../shared/utils/documents';

export type FocTrainingFilter = '' | 'foc' | 'non_foc';

export const workersService = {
  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: WorkerStatus | '';
    worker_class?: WorkerClass | '';
    foc_training?: FocTrainingFilter;
    available?: boolean;
    sort?: 'asc' | 'desc';
  }) {
    return apiRequest<Paginated<WorkerProfile>>('/admin/workers', { query: params });
  },

  get(id: string) {
    return apiRequest<WorkerProfile>(`/admin/workers/${id}`);
  },

  async documentUrl(id: string, type: DisplayDocument['type']) {
    if (!isWorkerDocumentType(type)) throw new Error('Sənəd növü dəstəklənmir.');
    const response = await apiRequest<{ url: string }>(
      `/workers/${encodeURIComponent(id)}/documents/${type}/download`,
    );
    return resolveSignedDocumentUrl(response.url);
  },

  approve(id: string) {
    return apiRequest<WorkerProfile>(`/admin/workers/${id}/approve`, { method: 'PATCH', body: {} });
  },

  reject(id: string, reason: string) {
    return apiRequest<WorkerProfile>(`/admin/workers/${id}/reject`, {
      method: 'PATCH',
      body: { reason },
    });
  },

  updateClass(id: string, workerClass: WorkerClass | null) {
    return apiRequest<WorkerProfile>(`/admin/workers/${id}/class`, {
      method: 'PATCH',
      body: { worker_class: workerClass },
    });
  },

  updateFocTraining(workerIds: string[], isFocTraining: boolean, note?: string | null) {
    const body: { worker_ids: string[]; is_foc_training: boolean; note?: string | null } = {
      worker_ids: workerIds,
      is_foc_training: isFocTraining,
    };
    if (note !== undefined) body.note = note;
    return apiRequest<{ data: WorkerProfile[] }>('/admin/workers/foc-training', {
      method: 'PATCH',
      body,
    });
  },

  ratings(id: string) {
    return apiRequest<RatingSummary>(`/workers/${id}/ratings`);
  },
};
