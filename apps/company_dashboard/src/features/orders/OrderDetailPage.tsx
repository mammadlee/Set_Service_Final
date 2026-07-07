import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../shared/api/http';
import { ConfirmModal } from '../../shared/components/ConfirmModal';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings } from '../../shared/i18n/appStrings';
import { formatDateTime, formatMoney, shortId } from '../../shared/utils/format';
import { ordersService } from './orders.service';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const order = useAsync(() => ordersService.get(id), [id]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function cancel(reason?: string) {
    setWorking(true);
    setActionError(null);
    try {
      await ordersService.cancel(id, reason);
      setConfirmCancel(false);
      await order.reload();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

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
              <StatusBadge status={order.data.status} />
            </div>
            <p className="muted">{order.data.description}</p>
            <dl className="detail-list">
              <dt>{appStrings.orders.category}</dt><dd>{order.data.category}</dd>
              <dt>{appStrings.orders.location}</dt><dd>{order.data.location}</dd>
              <dt>{appStrings.orders.requiredWorkers}</dt><dd>{order.data.required_count}</dd>
              <dt>{appStrings.orders.assigned}</dt><dd>{order.data.assignment_count}</dd>
              <dt>{appStrings.orders.start}</dt><dd>{formatDateTime(order.data.start_datetime)}</dd>
              <dt>{appStrings.orders.end}</dt><dd>{formatDateTime(order.data.end_datetime)}</dd>
              <dt>{appStrings.orders.payRate}</dt><dd>{formatMoney(order.data.pay_rate)}</dd>
              <dt>{appStrings.orders.skills}</dt><dd>{order.data.required_skills.length ? order.data.required_skills.join(', ') : appStrings.notAvailable}</dd>
              <dt>{appStrings.orders.notes}</dt><dd>{order.data.notes || appStrings.notAvailable}</dd>
            </dl>
            <h3>{appStrings.orders.categoryRequirements}</h3>
            <div className="table-wrap">
              <table>
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
                      <td>{item.category}</td>
                      <td>{item.required_count}</td>
                      <td>{item.assigned_count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="action-row">
              <button
                className="btn danger"
                type="button"
                disabled={order.data.status === 'cancelled' || order.data.status === 'completed'}
                onClick={() => setConfirmCancel(true)}
              >
                {appStrings.orders.cancelConfirm}
              </button>
            </div>
            {actionError ? <div className="form-error">{actionError}</div> : null}
          </div>

          <div className="panel">
            <h2>{appStrings.orders.assignments}</h2>
            {order.data.assignments && order.data.assignments.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>{appStrings.orders.worker}</th>
                      <th>{appStrings.orders.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.data.assignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <td>{shortId(assignment.id)}</td>
                        <td>{shortId(assignment.worker_id)}</td>
                        <td><StatusBadge status={assignment.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">{appStrings.orders.noAssignments}</p>}
          </div>
        </section>
      ) : null}

      <ConfirmModal
        open={confirmCancel}
        title={appStrings.orders.cancelTitle}
        message={appStrings.orders.cancelMessage}
        confirmLabel={appStrings.orders.cancelConfirm}
        tone="danger"
        loading={working}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={(reason) => void cancel(reason)}
      />
    </>
  );
}
