import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings } from '../../shared/i18n/appStrings';
import { formatDateTime, shortId } from '../../shared/utils/format';
import { attendanceService } from './attendance.service';
import type { AttendanceLog } from '../../shared/api/types';

export function AttendancePage() {
  const [page, setPage] = useState(1);
  const [assignmentId, setAssignmentId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [openOnly, setOpenOnly] = useState<boolean | ''>('');
  const attendance = useAsync(
    () => attendanceService.list({
      page,
      limit: 20,
      assignment_id: assignmentId.trim() || undefined,
      order_id: orderId.trim() || undefined,
      worker_id: workerId.trim() || undefined,
      open_only: openOnly,
    }),
    [page, assignmentId, orderId, workerId, openOnly],
  );

  return (
    <>
      <PageHeader
        title={appStrings.attendance.title}
        description={appStrings.attendance.description}
      />

      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} placeholder={appStrings.attendance.assignmentId} />
        </label>
        <label className="search-box">
          <Search size={17} />
          <input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder={appStrings.attendance.orderId} />
        </label>
        <label className="search-box">
          <Search size={17} />
          <input value={workerId} onChange={(event) => setWorkerId(event.target.value)} placeholder={appStrings.attendance.workerId} />
        </label>
        <select value={String(openOnly)} onChange={(event) => setOpenOnly(event.target.value === '' ? '' : event.target.value === 'true')}>
          <option value="">{appStrings.attendance.allSessions}</option>
          <option value="true">{appStrings.attendance.openCheckIns}</option>
          <option value="false">{appStrings.attendance.completedSessions}</option>
        </select>
      </div>

      {attendance.loading ? <LoadingState /> : null}
      {attendance.error ? <ErrorState message={attendance.error} onRetry={attendance.reload} /> : null}
      {attendance.data ? (
        <section className="panel">
          {attendance.data.data.length === 0 ? <EmptyState message={appStrings.attendance.empty} /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{appStrings.attendance.worker}</th>
                    <th>{appStrings.attendance.order}</th>
                    <th>{appStrings.attendance.assignment}</th>
                    <th>{appStrings.attendance.status}</th>
                    <th>{appStrings.attendance.checkIn}</th>
                    <th>{appStrings.attendance.checkOut}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {attendance.data.data.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.assignment.worker.name}</strong>
                        <span className="table-subtext">{record.assignment.worker.phone}</span>
                      </td>
                      <td>
                        {record.assignment.order.title}
                        <span className="table-subtext">{record.assignment.order.company.name}</span>
                      </td>
                      <td>{shortId(record.assignment_id)}</td>
                      <td><StatusBadge status={attendanceStatus(record)} /></td>
                      <td>{formatDateTime(record.checkin_time)}</td>
                      <td>{formatDateTime(record.checkout_time)}</td>
                      <td><Link className="link-btn" to={`/attendance/${record.id}`}>{appStrings.view}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <button className="btn secondary compact" disabled={page <= 1} onClick={() => setPage(page - 1)}>{appStrings.previous}</button>
            <span>{appStrings.pageOf(page, attendance.data.meta.total_pages)}</span>
            <button className="btn secondary compact" disabled={page >= attendance.data.meta.total_pages} onClick={() => setPage(page + 1)}>{appStrings.next}</button>
          </div>
        </section>
      ) : null}
    </>
  );
}

function attendanceStatus(record: AttendanceLog): 'waiting' | 'checked_in' | 'completed' {
  if (record.checkout_time) return 'completed';
  if (record.checkin_time) return 'checked_in';
  return 'waiting';
}
