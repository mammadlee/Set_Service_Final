import { apiRequest } from '../../shared/api/http';
import type { AttendanceLog, Paginated, QrTokenResponse } from '../../shared/api/types';

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
};
