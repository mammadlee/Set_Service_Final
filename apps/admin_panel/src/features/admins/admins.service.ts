import { apiRequest } from '../../shared/api/http';
import type { AdminPermission, ManagedAdmin } from '../../shared/api/types';

export const adminsService = {
  list() {
    return apiRequest<{ data: ManagedAdmin[] }>('/admin/admins');
  },

  create(input: {
    name: string;
    email: string;
    password: string;
    is_active: boolean;
    permissions: AdminPermission[];
  }) {
    return apiRequest<ManagedAdmin>('/admin/admins', { method: 'POST', body: input });
  },

  update(id: string, input: {
    name?: string;
    email?: string;
    password?: string;
    is_active?: boolean;
    permissions?: AdminPermission[];
  }) {
    return apiRequest<ManagedAdmin>(`/admin/admins/${id}`, { method: 'PATCH', body: input });
  },
};
