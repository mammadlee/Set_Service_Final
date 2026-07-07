import { apiRequest } from '../../shared/api/http';
import type { AdminReportSummary } from '../../shared/api/types';

export const reportsService = {
  summary(params: {
    start_date?: string;
    end_date?: string;
    company_id?: string;
    worker_id?: string;
    category?: string;
    department_id?: string;
    subdepartment_id?: string;
    position_id?: string;
    foc_training?: 'foc' | 'non_foc';
  } = {}) {
    return apiRequest<AdminReportSummary>('/admin/reports/summary', { query: params });
  },
};
