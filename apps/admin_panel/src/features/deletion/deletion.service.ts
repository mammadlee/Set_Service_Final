import { apiRequest } from '../../shared/api/http';
import type { Paginated } from '../../shared/api/types';

export type DeletionStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type OwnershipVerification = 'authenticated_account' | 'verified_phone_support' | 'verified_email_support';

export interface DeletionRequest {
  id: string;
  role: 'worker' | 'company';
  identifier_kind: 'phone' | 'email';
  account_user_id: string | null;
  note: string | null;
  status: DeletionStatus;
  resolution_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface DeletionRequestDetail extends DeletionRequest {
  linked_account: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    deleted_at: string | null;
    worker: { id: string } | null;
    company: { id: string } | null;
  } | null;
}

export const deletionService = {
  list(status?: DeletionStatus, page = 1) {
    return apiRequest<Paginated<DeletionRequest>>('/admin/account-deletion-requests', {
      query: { page, limit: 20, status },
    });
  },
  get(id: string) {
    return apiRequest<DeletionRequestDetail>(`/admin/account-deletion-requests/${encodeURIComponent(id)}`);
  },
  update(id: string, status: Exclude<DeletionStatus, 'open'>, resolutionNote?: string, ownershipVerification?: OwnershipVerification) {
    return apiRequest<DeletionRequestDetail>(`/admin/account-deletion-requests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: {
        status,
        ...(resolutionNote ? { resolution_note: resolutionNote } : {}),
        ...(ownershipVerification ? { ownership_verification: ownershipVerification } : {}),
      },
    });
  },
};
