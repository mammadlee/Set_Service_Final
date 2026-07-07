import { apiRequest } from '../../shared/api/http';
import type { NotificationItem, Paginated } from '../../shared/api/types';

export const notificationsService = {
  list(params: { page?: number; limit?: number; unread_only?: boolean }) {
    return apiRequest<Paginated<NotificationItem>>('/notifications', { query: params });
  },

  markRead(id: string) {
    return apiRequest<NotificationItem>(`/notifications/${id}/read`, { method: 'PATCH', body: {} });
  },

  markAllRead() {
    return apiRequest<{ updated: number }>('/notifications/read-all', { method: 'PATCH', body: {} });
  },
};
