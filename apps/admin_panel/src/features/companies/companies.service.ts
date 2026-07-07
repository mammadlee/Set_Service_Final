import { apiRequest } from '../../shared/api/http';
import type { CompanyProfile, CompanyStatus, Paginated } from '../../shared/api/types';

export const companiesService = {
  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: CompanyStatus | '';
    sort?: 'asc' | 'desc';
  }) {
    return apiRequest<Paginated<CompanyProfile>>('/admin/companies', { query: params });
  },

  get(id: string) {
    return apiRequest<CompanyProfile>(`/admin/companies/${id}`);
  },

  approve(id: string) {
    return apiRequest<CompanyProfile>(`/admin/companies/${id}/approve`, { method: 'PATCH', body: {} });
  },

  reject(id: string, reason: string) {
    return apiRequest<CompanyProfile>(`/admin/companies/${id}/reject`, {
      method: 'PATCH',
      body: { reason },
    });
  },
};
