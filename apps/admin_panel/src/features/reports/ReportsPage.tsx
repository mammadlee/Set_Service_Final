import { useState, type FormEvent, type ReactNode } from 'react';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings, statusLabel } from '../../shared/i18n/appStrings';
import { companiesService } from '../companies/companies.service';
import { workersService } from '../workers/workers.service';
import { taxonomyService } from '../taxonomy/taxonomy.service';
import { reportsService } from './reports.service';

const emptyFilters = {
  start_date: '',
  end_date: '',
  company_id: '',
  worker_id: '',
  category: '',
  department_id: '',
  subdepartment_id: '',
  position_id: '',
  foc_training: '',
};

/*
const categoryOptions = [
  'Ofisiant',
  'Aşpaz köməkçisi',
  'Barmen',
  'Hostes',
  'Otaq təmizləyicisi',
  'Qabyuyan',
  'Servis köməkçisi',
  'Barmen köməkçisi',
];
*/

export function ReportsPage() {
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const companies = useAsync(() => companiesService.list({ limit: 200, sort: 'asc' }), []);
  const workers = useAsync(() => workersService.list({ limit: 200, sort: 'asc' }), []);
  const taxonomy = useAsync(() => taxonomyService.list(), []);
  const report = useAsync(
    () =>
      reportsService.summary({
        start_date: appliedFilters.start_date || undefined,
        end_date: appliedFilters.end_date || undefined,
        company_id: appliedFilters.company_id || undefined,
        worker_id: appliedFilters.worker_id || undefined,
        category: appliedFilters.category || undefined,
        department_id: appliedFilters.department_id || undefined,
        subdepartment_id: appliedFilters.subdepartment_id || undefined,
        position_id: appliedFilters.position_id || undefined,
        foc_training: appliedFilters.foc_training === 'foc' || appliedFilters.foc_training === 'non_foc' ? appliedFilters.foc_training : undefined,
      }),
    [appliedFilters],
  );

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  }

  return (
    <>
      <PageHeader title={appStrings.reports.title} description={appStrings.reports.description} />

      <section className="panel">
        <h2>{appStrings.reports.filters}</h2>
        {companies.loading || workers.loading || taxonomy.loading ? <p className="muted">Seçimlər yüklənir...</p> : null}
        <form className="form-grid" onSubmit={applyFilters}>
          <label className="field">
            <span>{appStrings.reports.startDate}</span>
            <input type="date" value={filters.start_date} onChange={(event) => setFilters({ ...filters, start_date: event.target.value })} />
          </label>
          <label className="field">
            <span>{appStrings.reports.endDate}</span>
            <input type="date" value={filters.end_date} onChange={(event) => setFilters({ ...filters, end_date: event.target.value })} />
          </label>
          <label className="field">
            <span>{appStrings.companies.name}</span>
            <select value={filters.company_id} onChange={(event) => setFilters({ ...filters, company_id: event.target.value })}>
              <option value="">Bütün müəssisələr</option>
              {(companies.data?.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{appStrings.workers.name}</span>
            <select value={filters.worker_id} onChange={(event) => setFilters({ ...filters, worker_id: event.target.value })}>
              <option value="">Bütün işçilər</option>
              {(workers.data?.data ?? []).map((worker) => (
                <option key={worker.id} value={worker.id}>{worker.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>F.O.C. təlim</span>
            <select value={filters.foc_training} onChange={(event) => setFilters({ ...filters, foc_training: event.target.value })}>
              <option value="">Bütün işçilər</option>
              <option value="foc">F.O.C. təlimdə olan işçilər</option>
              <option value="non_foc">F.O.C. olmayan işçilər</option>
            </select>
          </label>
          <label className="field">
            <span>Şöbə</span>
            <select value={filters.department_id} onChange={(event) => setFilters({ ...filters, department_id: event.target.value, subdepartment_id: '', position_id: '', category: '' })}>
              <option value="">Bütün şöbələr</option>
              {(taxonomy.data?.data ?? []).map((department) => (
                <option key={department.id} value={department.id}>{department.name_az}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Departament</span>
            <select value={filters.subdepartment_id} onChange={(event) => setFilters({ ...filters, subdepartment_id: event.target.value, position_id: '', category: '' })} disabled={!filters.department_id}>
              <option value="">Bütün departamentlər</option>
              {((taxonomy.data?.data ?? []).find((department) => department.id === filters.department_id)?.subdepartments ?? []).map((subdepartment) => (
                <option key={subdepartment.id} value={subdepartment.id}>{subdepartment.name_az}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Vəzifə</span>
            <select value={filters.position_id} onChange={(event) => setFilters({ ...filters, position_id: event.target.value, category: '' })} disabled={!filters.subdepartment_id}>
              <option value="">Bütün vəzifələr</option>
              {(((taxonomy.data?.data ?? [])
                .find((department) => department.id === filters.department_id)?.subdepartments ?? [])
                .find((subdepartment) => subdepartment.id === filters.subdepartment_id)?.positions ?? []).map((position) => (
                <option key={position.id} value={position.id}>{position.name_az}</option>
              ))}
            </select>
          </label>
          <div className="action-row full-field">
            <button className="btn primary" type="submit">{appStrings.reports.apply}</button>
            <button className="btn secondary" type="button" onClick={clearFilters}>Təmizlə</button>
          </div>
        </form>
      </section>

      {report.loading ? <LoadingState /> : null}
      {report.error ? <ErrorState message={report.error} onRetry={report.reload} /> : null}
      {report.data ? (
        <>
          <div className="stat-grid">
            <Stat label={appStrings.dashboard.todayActiveOrders} value={report.data.dashboard.today_active_orders} />
            <Stat label={appStrings.dashboard.pendingOrders} value={report.data.dashboard.pending_orders} />
            <Stat label={appStrings.dashboard.activeAssignments} value={report.data.dashboard.active_assignments} />
            <Stat label={appStrings.dashboard.checkedInToday} value={report.data.dashboard.checked_in_workers_today} />
            <Stat label={appStrings.dashboard.rejectedAssignments} value={report.data.dashboard.rejected_assignments} />
            <Stat label={appStrings.dashboard.pendingWorkers} value={report.data.dashboard.pending_worker_approvals} />
            <Stat label={appStrings.dashboard.pendingCompanies} value={report.data.dashboard.pending_company_approvals} />
          </div>

          <section className="detail-grid">
            <ReportPanel title={appStrings.reports.workerWorkCounts}>
              {report.data.reports.worker_work_counts.length === 0 ? (
                <p className="muted">{appStrings.reports.empty}</p>
              ) : (
                <table>
                  <tbody>
                    {report.data.reports.worker_work_counts.map((item) => (
                      <tr key={item.worker_id}><td>{item.worker_name}</td><td>{item.completed_count}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ReportPanel>
            <ReportPanel title={appStrings.reports.companyUsage}>
              {report.data.reports.company_usage.length === 0 ? (
                <p className="muted">{appStrings.reports.empty}</p>
              ) : (
                <table>
                  <tbody>
                    {report.data.reports.company_usage.map((item) => (
                      <tr key={item.company_id}><td>{item.company_name}</td><td>{item.order_count}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ReportPanel>
            <ReportPanel title={appStrings.reports.attendanceStats}>
              <dl className="detail-list">
                <dt>{appStrings.reports.total}</dt><dd>{report.data.reports.attendance.total_count}</dd>
                <dt>{appStrings.reports.completed}</dt><dd>{report.data.reports.attendance.completed_count}</dd>
                <dt>{appStrings.reports.open}</dt><dd>{report.data.reports.attendance.open_count}</dd>
              </dl>
            </ReportPanel>
            <ReportPanel title={appStrings.reports.ratingStats}>
              <dl className="detail-list">
                <dt>{appStrings.reports.average}</dt><dd>{report.data.reports.rating_stats.average.toFixed(2)}</dd>
                <dt>{appStrings.reports.count}</dt><dd>{report.data.reports.rating_stats.count}</dd>
              </dl>
            </ReportPanel>
            <ReportPanel title={appStrings.reports.assignmentStats}>
              <table>
                <tbody>
                  {report.data.reports.assignment_stats.map((item) => (
                    <tr key={item.status}><td>{statusLabel(item.status)}</td><td>{item.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </ReportPanel>
          </section>
        </>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="stat-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function ReportPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
