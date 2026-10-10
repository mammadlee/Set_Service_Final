import { apiRequest } from '../../shared/api/http';
import type { CompanyWorkerProfile } from '../../shared/api/types';
import { resolveSignedDocumentUrl } from '../../shared/utils/documents';

export const workersService = {
  getCompanyProfile(workerId: string) {
    return apiRequest<CompanyWorkerProfile>(`/workers/${workerId}/company-profile`);
  },
  async documentUrl(workerId: string, type: string): Promise<string> {
    if (type !== 'health_certificate') throw new Error('Bu sənədi açmaq üçün icazəniz yoxdur.');
    const result = await apiRequest<{ url: string }>(
      `/workers/${encodeURIComponent(workerId)}/documents/${type}/download`,
    );
    return resolveSignedDocumentUrl(result.url);
  },
};
