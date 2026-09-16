import { ClipboardList, Search } from 'lucide-react';
import { useAuth } from '../../app/auth/AuthProvider';
import { hasPermission } from '../../shared/auth/permissions';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order, OrderStatus } from '../../shared/api/types';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings, statusLabel } from '../../shared/i18n/appStrings';
import { formatDateTime } from '../../shared/utils/format';
import { ordersService } from './orders.service';

const statuses: Array<OrderStatus | ''> = ['', 'active', 'draft', 'completed', 'cancelled'];

export function OrdersPage() {
  const { user } = useAuth();
  const canViewAssignments = hasPermission(user, 'view_assignments');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const orders = useAsync(() => ordersService.list({ page, limit: 20, status, search }), [page, status, search]);

  return (
    <>
      <PageHeader
        title={appStrings.orders.title}
        description={appStrings.orders.description}
        actions={canViewAssignments ? (
          <Link className="btn secondary" to="/assignments">
            <ClipboardList size={17} />
            Təyinatlara bax
          </Link>
        ) : null}
      />
      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={appStrings.orders.search} />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus | '')}>
          {statuses.map((item) => <option key={item || 'all'} value={item}>{item ? statusLabel(item) : appStrings.allStatuses}</option>)}
        </select>
      </div>

      {orders.loading ? <LoadingState /> : null}
      {orders.error ? <ErrorState message={orders.error} onRetry={orders.reload} /> : null}
      {orders.data ? (
        <section className="panel">
          {orders.data.data.length === 0 ? <EmptyState message={appStrings.orders.empty} /> : (
            <div className="table-wrap">
              <table className="responsive-table">
                <thead><tr><th>{appStrings.orders.orderTitle}</th><th>{appStrings.orders.company}</th><th>{appStrings.orders.category}</th><th>{appStrings.orders.status}</th><th>{appStrings.orders.workers}</th><th>{appStrings.orders.start}</th><th /></tr></thead>
                <tbody>
                  {orders.data.data.map((order) => (
                    <tr key={order.id}>
                      <td data-label={appStrings.orders.orderTitle}><strong>{order.title}</strong></td>
                      <td data-label={appStrings.orders.company}>{order.company?.name || appStrings.notAvailable}</td>
                      <td data-label={appStrings.orders.category}>{formatCategoryItems(order)}</td>
                      <td data-label={appStrings.orders.status}><StatusBadge status={order.status} /></td>
                      <td data-label={appStrings.orders.workers}>{order.assignment_count}/{order.required_count}</td>
                      <td data-label={appStrings.orders.start}>{formatDateTime(order.start_datetime)}</td>
                      <td className="mobile-card-action"><Link className="link-btn" to={`/orders/${order.id}`}>{appStrings.view}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <button className="btn secondary compact" disabled={page <= 1} onClick={() => setPage(page - 1)}>{appStrings.previous}</button>
            <span>{appStrings.pageOf(page, orders.data.meta.total_pages)}</span>
            <button className="btn secondary compact" disabled={page >= orders.data.meta.total_pages} onClick={() => setPage(page + 1)}>{appStrings.next}</button>
          </div>
        </section>
      ) : null}
    </>
  );
}

function formatCategoryItems(order: Order): string {
  const items = order.category_items?.length
    ? order.category_items
    : [{ category: order.category, required_count: order.required_count }];
  return items.map((item) => `${item.category} (${item.required_count})`).join(', ');
}
