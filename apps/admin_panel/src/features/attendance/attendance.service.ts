import { apiRequest } from '../../shared/api/http';
import type {
  AttendanceLog,
  KioskSessionResponse,
  Paginated,
  QrTokenResponse,
  VenueKioskResponse,
} from '../../shared/api/types';

export const attendanceService = {
  list(params: {
    page?: number;
    limit?: number;
    assignment_id?: string;
    order_id?: string;
    worker_id?: string;
    open_only?: boolean | '';
    sort?: 'asc' | 'desc';
  }) {
    return apiRequest<Paginated<AttendanceLog>>('/attendance', { query: params });
  },

  get(id: string) {
    return apiRequest<AttendanceLog>(`/attendance/${id}`);
  },

  generateQrToken(assignmentId: string, ttlSeconds?: number) {
    return apiRequest<QrTokenResponse>('/attendance/qr-token', {
      method: 'POST',
      body: {
        assignment_id: assignmentId,
        ...(ttlSeconds ? { ttl_seconds: ttlSeconds } : {}),
      },
    });
  },

  createKioskSession(assignmentId: string) {
    return apiRequest<KioskSessionResponse>('/attendance/kiosk-sessions', {
      method: 'POST',
      body: { assignment_id: assignmentId },
    });
  },

  revokeKioskSession(id: string) {
    return apiRequest<void>(`/attendance/kiosk-sessions/${id}`, {
      method: 'DELETE',
    });
  },

  listVenueKiosks(companyId?: string) {
    return apiRequest<{ data: VenueKioskResponse[] }>('/attendance/venue-kiosks', {
      query: companyId ? { company_id: companyId } : {},
    });
  },

  createVenueKiosk(input: { company_id: string; name: string; location_label?: string }) {
    return apiRequest<VenueKioskResponse>('/attendance/venue-kiosks', {
      method: 'POST',
      body: input,
    });
  },

  activateVenueKiosk(kioskId: string, input: { order_id: string; expires_at?: string }) {
    return apiRequest<VenueKioskResponse>(`/attendance/venue-kiosks/${kioskId}/activate`, {
      method: 'POST',
      body: input,
    });
  },

  deactivateVenueKiosk(kioskId: string) {
    return apiRequest<VenueKioskResponse>(`/attendance/venue-kiosks/${kioskId}/active-session`, {
      method: 'DELETE',
    });
  },

  disableVenueKiosk(kioskId: string) {
    return apiRequest<VenueKioskResponse>(`/attendance/venue-kiosks/${kioskId}`, {
      method: 'DELETE',
    });
  },
};
