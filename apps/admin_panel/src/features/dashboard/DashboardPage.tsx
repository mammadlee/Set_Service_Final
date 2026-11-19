import { Activity, ArrowUpRight, BriefcaseBusiness, Building2, ClipboardList, UserCheck, UserX, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import { hasPermission } from '../../shared/auth/permissions';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings } from '../../shared/i18n/appStrings';
import { reportsService } from '../reports/reports.service';

export function DashboardPage() {
  const { user } = useAuth();
  const stats = useAsync(() => reportsService.summary(), []);

  return (
    <>
      <PageHeader
        title={appStrings.dashboard.title}
        description={appStrings.dashboard.description}
      />

      {stats.loading ? <LoadingState /> : null}
      {stats.error ? <ErrorState message={stats.error} onRetry={stats.reload} /> : null}

      {stats.data ? (
        <div className="dashboard-sections">
          <section className="dashboard-section" aria-labelledby="dashboard-priority-title">
            <div className="section-heading">
              <div>
                <h2 id="dashboard-priority-title">Diqqət tələb edənlər</h2>
                <p>Ən vacib təsdiq və bugünkü əməliyyat göstəriciləri.</p>
              </div>
            </div>
            <div className="stat-grid primary-stat-grid">
              <StatCard to={hasPermission(user, 'view_workers') ? '/workers' : undefined} label={appStrings.dashboard.pendingWorkers} value={stats.data.dashboard.pending_worker_approvals} icon={<Users size={22} />} />
              <StatCard to={hasPermission(user, 'view_companies') ? '/companies' : undefined} label={appStrings.dashboard.pendingCompanies} value={stats.data.dashboard.pending_company_approvals} icon={<Building2 size={22} />} />
              <StatCard to={hasPermission(user, 'view_orders') ? '/orders' : undefined} label={appStrings.dashboard.todayActiveOrders} value={stats.data.dashboard.today_active_orders} icon={<BriefcaseBusiness size={22} />} />
              <StatCard to={hasPermission(user, 'view_assignments') ? '/assignments' : undefined} label={appStrings.dashboard.activeAssignments} value={stats.data.dashboard.active_assignments} icon={<Activity size={22} />} />
              <StatCard to={hasPermission(user, 'view_attendance') ? '/attendance' : undefined} label={appStrings.dashboard.checkedInToday} value={stats.data.dashboard.checked_in_workers_today} icon={<UserCheck size={22} />} />
            </div>
          </section>

          <section className="dashboard-section secondary-dashboard-section" aria-labelledby="dashboard-secondary-title">
            <div className="section-heading compact-section-heading">
              <div>
                <h2 id="dashboard-secondary-title">Əlavə göstəricilər</h2>
                <p>Ümumi əməliyyat konteksti.</p>
              </div>
            </div>
            <div className="stat-grid secondary-stat-grid">
              <StatCard to={hasPermission(user, 'view_orders') ? '/orders' : undefined} label={appStrings.dashboard.pendingOrders} value={stats.data.dashboard.pending_orders} icon={<ClipboardList size={20} />} secondary />
              <StatCard to={hasPermission(user, 'view_assignments') ? '/assignments' : undefined} label={appStrings.dashboard.rejectedAssignments} value={stats.data.dashboard.rejected_assignments} icon={<UserX size={20} />} secondary />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function StatCard({
  label,
  value,
  icon,
  to,
  secondary = false,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  to?: string;
  secondary?: boolean;
}) {
  const content = (
    <>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {to ? <ArrowUpRight className="stat-link-icon" size={17} aria-hidden="true" /> : null}
    </>
  );

  return to
    ? <Link className={`stat-card ${secondary ? 'secondary-stat-card' : ''}`} to={to}>{content}</Link>
    : <article className={`stat-card ${secondary ? 'secondary-stat-card' : ''}`}>{content}</article>;
}
