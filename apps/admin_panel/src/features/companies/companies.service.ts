import { apiDownload, apiRequest } from '../../shared/api/http';
import type { CompanyProfile, CompanyReport, CompanyStatus, OrderStatus, Paginated } from '../../shared/api/types';

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

  report(id: string, params: {
    page?: number;
    limit?: number;
    start_date?: string;
    end_date?: string;
    order_status?: OrderStatus | '';
    worker_id?: string;
    position_id?: string;
    sort?: 'asc' | 'desc';
  }) {
    return apiRequest<CompanyReport>(`/admin/reports/companies/${encodeURIComponent(id)}`, { query: params });
  },

  exportReport(id: string, params: {
    start_date?: string;
    end_date?: string;
    order_status?: OrderStatus | '';
    worker_id?: string;
    position_id?: string;
    sort?: 'asc' | 'desc';
  }) {
    return apiDownload(`/admin/reports/companies/${encodeURIComponent(id)}/export`, {
      accept: 'text/csv',
      query: { ...params, format: 'csv' },
    });
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

  authorizeDocument(id: string, type: string) {
    return apiRequest<{ url: string; expires_in_seconds: number }>(
      `/admin/companies/${id}/documents/${encodeURIComponent(type)}/download`,
    );
  },
};
