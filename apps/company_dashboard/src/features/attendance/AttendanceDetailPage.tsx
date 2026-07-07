import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings } from '../../shared/i18n/appStrings';
import { attendanceStatus, formatDateTime, formatUnknown } from '../../shared/utils/format';
import { attendanceService } from './attendance.service';

export function AttendanceDetailPage() {
  const { id = '' } = useParams();
  const attendance = useAsync(() => attendanceService.get(id), [id]);

  return (
    <>
      <PageHeader
        title={appStrings.attendance.detailTitle}
        description={appStrings.attendance.detailDescription}
        actions={<Link className="btn secondary compact" to="/attendance"><ArrowLeft size={16} />{appStrings.back}</Link>}
      />

      {attendance.loading ? <LoadingState /> : null}
      {attendance.error ? <ErrorState message={attendance.error} onRetry={attendance.reload} /> : null}
      {attendance.data ? (
        <section className="detail-grid">
          <div className="panel">
            <div className="detail-title">
              <h2>{attendance.data.assignment.worker.name}</h2>
              <StatusBadge status={attendanceStatus(attendance.data)} />
            </div>
            <dl className="detail-list">
              <dt>{appStrings.attendance.order}</dt><dd>{attendance.data.assignment.order.title}</dd>
              <dt>{appStrings.attendance.assignment}</dt><dd>{attendance.data.assignment_id}</dd>
              <dt>{appStrings.attendance.checkIn}</dt><dd>{formatDateTime(attendance.data.checkin_time)}</dd>
              <dt>{appStrings.attendance.checkOut}</dt><dd>{formatDateTime(attendance.data.checkout_time)}</dd>
              <dt>{appStrings.attendance.duration}</dt><dd>{formatDuration(attendance.data.duration_minutes)}</dd>
            </dl>
          </div>

          <div className="panel">
            <h2>{appStrings.attendance.metadata}</h2>
            <dl className="detail-list">
              <dt>{appStrings.attendance.checkinLocation}</dt><dd>{formatUnknown(attendance.data.checkin_location)}</dd>
              <dt>{appStrings.attendance.checkoutLocation}</dt><dd>{formatUnknown(attendance.data.checkout_location)}</dd>
              <dt>{appStrings.attendance.checkinNotes}</dt><dd>{attendance.data.checkin_notes || appStrings.notAvailable}</dd>
              <dt>{appStrings.attendance.checkoutNotes}</dt><dd>{attendance.data.checkout_notes || appStrings.notAvailable}</dd>
              <dt>{appStrings.attendance.created}</dt><dd>{formatDateTime(attendance.data.created_at)}</dd>
              <dt>{appStrings.attendance.updated}</dt><dd>{formatDateTime(attendance.data.updated_at)}</dd>
            </dl>
          </div>
        </section>
      ) : null}
    </>
  );
}

function formatDuration(minutes?: number | null) {
  return minutes === null || minutes === undefined
    ? appStrings.notAvailable
    : `${minutes} ${appStrings.attendance.minutes}`;
}
