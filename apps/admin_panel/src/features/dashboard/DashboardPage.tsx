import { Activity, BriefcaseBusiness, Building2, ClipboardList, UserCheck, UserX, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings } from '../../shared/i18n/appStrings';
import { reportsService } from '../reports/reports.service';

export function DashboardPage() {
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
        <div className="stat-grid">
          <StatCard label={appStrings.dashboard.todayActiveOrders} value={stats.data.dashboard.today_active_orders} icon={<BriefcaseBusiness size={22} />} />
          <StatCard label={appStrings.dashboard.pendingOrders} value={stats.data.dashboard.pending_orders} icon={<ClipboardList size={22} />} />
          <StatCard label={appStrings.dashboard.activeAssignments} value={stats.data.dashboard.active_assignments} icon={<Activity size={22} />} />
          <StatCard label={appStrings.dashboard.checkedInToday} value={stats.data.dashboard.checked_in_workers_today} icon={<UserCheck size={22} />} />
          <StatCard label={appStrings.dashboard.rejectedAssignments} value={stats.data.dashboard.rejected_assignments} icon={<UserX size={22} />} />
          <StatCard label={appStrings.dashboard.pendingWorkers} value={stats.data.dashboard.pending_worker_approvals} icon={<Users size={22} />} />
          <StatCard label={appStrings.dashboard.pendingCompanies} value={stats.data.dashboard.pending_company_approvals} icon={<Building2 size={22} />} />
        </div>
      ) : null}

      <section className="panel">
        <h2>{appStrings.dashboard.verifiedTitle}</h2>
        <p className="muted">
          {appStrings.dashboard.verifiedBody}
        </p>
      </section>
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
