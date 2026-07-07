import { apiRequest } from '../../shared/api/http';
import type { Order, OrderStatus, Paginated } from '../../shared/api/types';

export const ordersService = {
  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: OrderStatus | '';
    category?: string;
    sort?: 'asc' | 'desc';
  }) {
    return apiRequest<Paginated<Order>>('/orders', { query: params });
  },

  get(id: string) {
    return apiRequest<Order>(`/orders/${id}`);
  },
};
