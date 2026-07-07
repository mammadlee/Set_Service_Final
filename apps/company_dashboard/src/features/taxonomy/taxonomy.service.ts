import { apiRequest } from '../../shared/api/http';
import type { TaxonomyDepartment, TaxonomyPositionSummary } from '../../shared/api/types';

export const taxonomyService = {
  list() {
    return apiRequest<{ data: TaxonomyDepartment[] }>('/taxonomy');
  },

  positions() {
    return apiRequest<{ data: TaxonomyPositionSummary[] }>('/taxonomy/positions');
  },
};
