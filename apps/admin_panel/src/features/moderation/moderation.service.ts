import { apiRequest } from '../../shared/api/http';
import type { Paginated } from '../../shared/api/types';

export type ModerationStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface ModerationReport {
  id: string;
  reporter_role: 'worker' | 'company';
  target_type: 'order' | 'company_profile' | 'worker_profile' | 'rating';
  target_id: string;
  reason: string;
  details: string | null;
  status: ModerationStatus;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface ModerationReportDetail extends ModerationReport {
  reporter: { id: string; name: string; role: string };
  target: { id: string; type: string; label: string; comment?: string | null };
}

export const moderationService = {
  list(status?: ModerationStatus, page = 1) {
    return apiRequest<Paginated<ModerationReport>>('/moderation/admin/reports', {
      query: { page, limit: 20, status },
    });
  },
  get(id: string) {
    return apiRequest<ModerationReportDetail>(`/moderation/admin/reports/${encodeURIComponent(id)}`);
  },
  update(id: string, status: Exclude<ModerationStatus, 'open'>, resolutionNote?: string) {
    return apiRequest<ModerationReportDetail>(`/moderation/admin/reports/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: { status, ...(resolutionNote ? { resolution_note: resolutionNote } : {}) },
    });
  },
};
