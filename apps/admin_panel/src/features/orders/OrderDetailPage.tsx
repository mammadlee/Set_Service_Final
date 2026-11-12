import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import { hasPermission } from '../../shared/auth/permissions';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings } from '../../shared/i18n/appStrings';
import { formatDateTime, formatMoney, shortId } from '../../shared/utils/format';
import { orderDisplayStatus } from '../../shared/utils/orders';
import { ordersService } from './orders.service';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const canViewAssignments = hasPermission(user, 'view_assignments');
  const order = useAsync(() => ordersService.get(id), [id]);

  return (
    <>
      <PageHeader
        title={appStrings.orders.detailTitle}
        description={appStrings.orders.detailDescription}
        actions={<Link className="btn secondary compact" to="/orders"><ArrowLeft size={16} />{appStrings.back}</Link>}
      />

      {order.loading ? <LoadingState /> : null}
      {order.error ? <ErrorState message={order.error} onRetry={order.reload} /> : null}
      {order.data ? (
        <section className="detail-grid">
          <div className="panel">
            <div className="detail-title">
              <h2>{order.data.title}</h2>
              <StatusBadge status={orderDisplayStatus(order.data)} />
            </div>
            <p className="muted">{order.data.description}</p>
            <dl className="detail-list">
              <dt>{appStrings.orders.company}</dt><dd>{order.data.company?.name || appStrings.notAvailable}</dd>
              <dt>{appStrings.orders.category}</dt><dd>{order.data.category}</dd>
              <dt>{appStrings.orders.location}</dt><dd>{order.data.location}</dd>
              <dt>{appStrings.orders.requiredWorkers}</dt><dd>{order.data.required_count}</dd>
              <dt>{appStrings.orders.assigned}</dt><dd>{order.data.assignment_count}</dd>
              <dt>{appStrings.orders.start}</dt><dd>{formatDateTime(order.data.start_datetime)}</dd>
              <dt>{appStrings.orders.end}</dt><dd>{formatDateTime(order.data.end_datetime)}</dd>
              <dt>{appStrings.orders.payRate}</dt><dd>{formatMoney(order.data.pay_rate)}</dd>
            </dl>
            <h3>{appStrings.orders.categoryRequirements}</h3>
            <div className="table-wrap">
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>{appStrings.orders.category}</th>
                    <th>{appStrings.orders.requiredWorkers}</th>
                    <th>{appStrings.orders.assigned}</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.data.category_items?.length
                    ? order.data.category_items
                    : [{
                        id: null,
                        category: order.data.category,
                        required_count: order.data.required_count,
                        assigned_count: order.data.assignment_count,
                      }]
                  ).map((item) => (
                    <tr key={item.id ?? item.category}>
                      <td data-label={appStrings.orders.category}>{item.category}</td>
                      <td data-label={appStrings.orders.requiredWorkers}>{item.required_count}</td>
                      <td data-label={appStrings.orders.assigned}>{item.assigned_count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h2>{appStrings.orders.assignments}</h2>
            {order.data.assignments && order.data.assignments.length > 0 ? (
              <div className="table-wrap">
                <table className="responsive-table">
                  <thead><tr><th>ID</th><th>{appStrings.orders.worker}</th><th>{appStrings.orders.category}</th><th>{appStrings.orders.status}</th>{canViewAssignments ? <th /> : null}</tr></thead>
                  <tbody>
                    {order.data.assignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <td data-label="ID">{shortId(assignment.id)}</td>
                        <td data-label={appStrings.orders.worker}>{shortId(assignment.worker_id)}</td>
                        <td data-label={appStrings.orders.category}>{assignment.assigned_category ?? assignment.category ?? appStrings.notAvailable}</td>
                        <td data-label={appStrings.orders.status}><StatusBadge status={assignment.status} /></td>
                        {canViewAssignments ? (
                          <td className="mobile-card-action">
                            <Link className="link-btn" to={`/assignments/${assignment.id}`}>{appStrings.view}</Link>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">{appStrings.orders.noAssignments}</p>}
          </div>
        </section>
      ) : null}
    </>
  );
}
