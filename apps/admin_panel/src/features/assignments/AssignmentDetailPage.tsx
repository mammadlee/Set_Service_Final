import { ArrowLeft, Ban, QrCode } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../shared/api/http';
import { useAuth } from '../../app/auth/AuthProvider';
import { hasPermission } from '../../shared/auth/permissions';
import { ConfirmModal } from '../../shared/components/ConfirmModal';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings } from '../../shared/i18n/appStrings';
import { formatDateTime } from '../../shared/utils/format';
import { assignmentsService } from './assignments.service';

export function AssignmentDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const canManageAssignments = hasPermission(user, 'manage_assignments');
  const canManageKiosks = hasPermission(user, 'manage_kiosks');
  const assignment = useAsync(() => assignmentsService.get(id), [id]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function cancelAssignment(reason?: string) {
    setCancelling(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await assignmentsService.cancel(id, reason);
      setConfirmCancel(false);
      await assignment.reload();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <PageHeader
        title={appStrings.assignments.detailTitle}
        description={appStrings.assignments.detailDescription}
        actions={<Link className="btn secondary compact" to="/assignments"><ArrowLeft size={16} />{appStrings.back}</Link>}
      />

      {assignment.loading ? <LoadingState /> : null}
      {assignment.error ? <ErrorState message={assignment.error} onRetry={assignment.reload} /> : null}

      {assignment.data ? (
        <section className="detail-grid">
          <div className="panel">
            <div className="detail-title">
              <h2>{assignment.data.worker.name}</h2>
              <StatusBadge status={assignment.data.status} />
            </div>
            <dl className="detail-list">
              <dt>{appStrings.assignments.id}</dt><dd>{assignment.data.id}</dd>
              <dt>{appStrings.assignments.worker}</dt><dd>{assignment.data.worker.name}</dd>
              <dt>{appStrings.workers.phone}</dt><dd>{assignment.data.worker.phone}</dd>
              <dt>{appStrings.workers.position}</dt><dd>{assignment.data.worker.position || appStrings.notAvailable}</dd>
              <dt>{appStrings.assignments.status}</dt><dd><StatusBadge status={assignment.data.status} /></dd>
              <dt>{appStrings.assignments.assignedAt}</dt><dd>{formatDateTime(assignment.data.assigned_at)}</dd>
            </dl>
            {canManageAssignments ? (
              <div className="action-row">
                <button
                  className="btn danger"
                  type="button"
                  disabled={assignment.data.status === 'cancelled' || assignment.data.status === 'completed'}
                  onClick={() => setConfirmCancel(true)}
                >
                  <Ban size={16} />
                  {appStrings.assignments.cancelConfirm}
                </button>
              </div>
            ) : null}
            {actionError ? <div className="form-error">{actionError}</div> : null}
            {actionMessage ? <div className="form-success">{actionMessage}</div> : null}
          </div>

          <div className="panel">
            <h2>{appStrings.assignments.order}</h2>
            <dl className="detail-list">
              <dt>{appStrings.orders.orderTitle}</dt><dd>{assignment.data.order.title}</dd>
              <dt>{appStrings.orders.company}</dt><dd>{assignment.data.order.company.name}</dd>
              <dt>{appStrings.orders.category}</dt><dd>{assignment.data.order.category}</dd>
              <dt>{appStrings.orders.status}</dt><dd><StatusBadge status={assignment.data.order.status} /></dd>
              <dt>{appStrings.orders.location}</dt><dd>{assignment.data.order.location}</dd>
              <dt>{appStrings.orders.start}</dt><dd>{formatDateTime(assignment.data.order.start_datetime)}</dd>
              <dt>{appStrings.orders.end}</dt><dd>{formatDateTime(assignment.data.order.end_datetime)}</dd>
            </dl>
          </div>

          {canManageKiosks ? <div className="panel kiosk-result-panel">
            <div className="panel-heading">
              <div>
                <h2>QR kiosk idarəetməsi</h2>
                <p>
                  QR ekranı artıq sifariş/növbə əsasında aktiv edilir. İşçi seçmək tələb olunmur.
                </p>
              </div>
              <QrCode size={22} />
            </div>

            {assignment.data.status !== 'accepted' || assignment.data.order.status !== 'active' ? (
              <div className="inline-note">
                QR ekranını aktiv etmək üçün sifariş aktiv, təyinat isə qəbul edilmiş olmalıdır.
              </div>
            ) : (
              <Link className="btn primary full" to="/attendance/qr-display">
                <QrCode size={16} />
                Venue QR kiosklarına keç
              </Link>
            )}
          </div> : null}
        </section>
      ) : null}

      <ConfirmModal
        open={confirmCancel}
        title={appStrings.assignments.cancelTitle}
        message={appStrings.assignments.cancelMessage}
        confirmLabel={appStrings.assignments.cancelConfirm}
        tone="danger"
        loading={cancelling}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={(reason) => void cancelAssignment(reason)}
      />
    </>
  );
}
