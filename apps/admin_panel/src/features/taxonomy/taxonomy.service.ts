import { apiRequest } from '../../shared/api/http';
import type {
  TaxonomyDepartment,
  TaxonomyPosition,
  TaxonomyPositionSummary,
  TaxonomyStatus,
  TaxonomySubdepartment,
} from '../../shared/api/types';

export const taxonomyService = {
  list(includeInactive = false) {
    return apiRequest<{ data: TaxonomyDepartment[] }>(includeInactive ? '/taxonomy/admin' : '/taxonomy');
  },

  positions(includeInactive = false) {
    return apiRequest<{ data: TaxonomyPositionSummary[] }>(
      includeInactive ? '/taxonomy/admin/positions' : '/taxonomy/positions',
    );
  },

  createDepartment(input: { name_az: string; name_en?: string; status?: TaxonomyStatus }) {
    return apiRequest<TaxonomyDepartment>('/taxonomy/admin/departments', { method: 'POST', body: input });
  },

  updateDepartment(id: string, input: { name_az?: string; name_en?: string; status?: TaxonomyStatus }) {
    return apiRequest<TaxonomyDepartment>(`/taxonomy/admin/departments/${id}`, { method: 'PATCH', body: input });
  },

  createSubdepartment(input: {
    department_id: string;
    name_az: string;
    name_en?: string;
    status?: TaxonomyStatus;
  }) {
    return apiRequest<TaxonomySubdepartment>('/taxonomy/admin/subdepartments', { method: 'POST', body: input });
  },

  updateSubdepartment(
    id: string,
    input: { department_id?: string; name_az?: string; name_en?: string; status?: TaxonomyStatus },
  ) {
    return apiRequest<TaxonomySubdepartment>(`/taxonomy/admin/subdepartments/${id}`, { method: 'PATCH', body: input });
  },

  createPosition(input: {
    subdepartment_id: string;
    name_az: string;
    name_en?: string;
    status?: TaxonomyStatus;
  }) {
    return apiRequest<TaxonomyPosition>('/taxonomy/admin/positions', { method: 'POST', body: input });
  },

  updatePosition(
    id: string,
    input: { subdepartment_id?: string; name_az?: string; name_en?: string; status?: TaxonomyStatus },
  ) {
    return apiRequest<TaxonomyPosition>(`/taxonomy/admin/positions/${id}`, { method: 'PATCH', body: input });
  },
};
