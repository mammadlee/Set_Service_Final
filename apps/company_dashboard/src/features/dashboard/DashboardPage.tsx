import { Activity, BriefcaseBusiness, ClipboardList, Clock, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings } from '../../shared/i18n/appStrings';
import { formatDateTime } from '../../shared/utils/format';
import { assignmentsService } from '../assignments/assignments.service';
import { attendanceService } from '../attendance/attendance.service';
import { ordersService } from '../orders/orders.service';

export function DashboardPage() {
  const stats = useAsync(async () => {
    const [activeOrders, allOrders, assignedAssignments, acceptedAssignments, openAttendance, completedAttendance, recentAssignments] =
      await Promise.all([
        ordersService.list({ page: 1, limit: 1, status: 'active' }),
        ordersService.list({ page: 1, limit: 1 }),
        assignmentsService.list({ page: 1, limit: 1, status: 'assigned' }),
        assignmentsService.list({ page: 1, limit: 1, status: 'accepted' }),
        attendanceService.list({ page: 1, limit: 1, open_only: true }),
        attendanceService.list({ page: 1, limit: 1, open_only: false }),
        assignmentsService.list({ page: 1, limit: 5 }),
      ]);

    return {
      activeOrders: activeOrders.meta.total,
      allOrders: allOrders.meta.total,
      assignedAssignments: assignedAssignments.meta.total,
      acceptedAssignments: acceptedAssignments.meta.total,
      openAttendance: openAttendance.meta.total,
      completedAttendance: completedAttendance.meta.total,
      recentAssignments: recentAssignments.data,
    };
  }, []);

  return (
    <>
      <PageHeader
        title={appStrings.dashboard.title}
        description={appStrings.dashboard.description}
        actions={<Link className="btn primary compact" to="/orders">{appStrings.dashboard.createOrder}</Link>}
      />

      {stats.loading ? <LoadingState /> : null}
      {stats.error ? <ErrorState message={stats.error} onRetry={stats.reload} /> : null}
      {stats.data ? (
        <>
          <div className="stat-grid">
            <StatCard label={appStrings.dashboard.activeOrders} value={stats.data.activeOrders} icon={<BriefcaseBusiness size={22} />} />
            <StatCard label={appStrings.dashboard.allOrders} value={stats.data.allOrders} icon={<Clock size={22} />} />
            <StatCard label={appStrings.dashboard.assignedWorkers} value={stats.data.assignedAssignments} icon={<Users size={22} />} />
            <StatCard label={appStrings.dashboard.acceptedAssignments} value={stats.data.acceptedAssignments} icon={<ClipboardList size={22} />} />
            <StatCard label={appStrings.dashboard.openAttendance} value={stats.data.openAttendance} icon={<Activity size={22} />} />
          </div>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{appStrings.dashboard.recentActivity}</h2>
                <p>{appStrings.dashboard.recentActivityDescription}</p>
              </div>
              <span className="muted">{appStrings.dashboard.completedSessions(stats.data.completedAttendance)}</span>
            </div>
            {stats.data.recentAssignments.length === 0 ? (
              <p className="muted">{appStrings.dashboard.noRecentActivity}</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{appStrings.assignments.worker}</th>
                      <th>{appStrings.assignments.order}</th>
                      <th>{appStrings.assignments.status}</th>
                      <th>{appStrings.assignments.shift}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.data.recentAssignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <td>{assignment.worker.name}</td>
                        <td>{assignment.order.title}</td>
                        <td><StatusBadge status={assignment.status} /></td>
                        <td>{formatDateTime(assignment.assigned_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}
