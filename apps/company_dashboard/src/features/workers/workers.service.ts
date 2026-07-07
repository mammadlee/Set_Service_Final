import { apiRequest } from '../../shared/api/http';
import type { CompanyWorkerProfile } from '../../shared/api/types';

export const workersService = {
  getCompanyProfile(workerId: string) {
    return apiRequest<CompanyWorkerProfile>(`/workers/${workerId}/company-profile`);
  },
};
