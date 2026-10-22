import { Clock3, QrCode, RefreshCw, Search, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import type { AttendanceDisplayStatus } from '../../shared/api/types';
import { hasPermission } from '../../shared/auth/permissions';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { usePolling } from '../../shared/hooks/usePolling';
import { appStrings } from '../../shared/i18n/appStrings';
import { formatDateTime } from '../../shared/utils/format';
import { companiesService } from '../companies/companies.service';
import { taxonomyService } from '../taxonomy/taxonomy.service';
import { attendancePosition, attendanceStatus, attendanceStatusLabel, formatAttendanceDuration } from './attendance.display';
import { attendanceService } from './attendance.service';

const attendanceStatuses: Array<AttendanceDisplayStatus | ''> = [
  '', 'not_checked_in', 'currently_working', 'checked_out', 'completed', 'missing_incomplete',
];

export function AttendancePage() {
  const { user } = useAuth();
  const canManageKiosks = hasPermission(user, 'manage_kiosks');
  const canViewCompanies = hasPermission(user, 'view_companies');
  const [page, setPage] = useState(1);
  const [workerSearch, setWorkerSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [status, setStatus] = useState<AttendanceDisplayStatus | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('desc');

  const attendance = usePolling(
    () => attendanceService.list({
      page,
      limit: 20,
      worker_search: workerSearch.trim() || undefined,
      company_id: companyId || undefined,
      position_id: positionId || undefined,
      status,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      sort_by: 'updated_at',
      sort,
    }),
    [page, workerSearch, companyId, positionId, status, startDate, endDate, sort],
    15_000,
  );
  const companies = useAsync(
    () => canViewCompanies
      ? companiesService.list({ page: 1, limit: 100, sort: 'asc' })
      : Promise.resolve({ data: [], meta: { page: 1, limit: 100, total: 0, total_pages: 0 } }),
    [canViewCompanies],
  );
  const taxonomy = useAsync(() => taxonomyService.positions(), []);

  return (
    <>
      <PageHeader
        title={appStrings.attendance.title}
        description="İşçilərin giriş və çıxışlarını canlı izləyin. Vaxtlar server qeydlərindən göstərilir."
        actions={canManageKiosks ? <Link className="btn secondary" to="/attendance/qr-display"><QrCode size={17} />{appStrings.nav.qrDisplay}</Link> : null}
      />

      <section className="attendance-live-strip" aria-live="polite">
        <span className={`connection-indicator ${attendance.connection} ${attendance.error ? 'stale' : ''}`}>
          {attendance.connection === 'offline' ? <WifiOff size={16} /> : <Wifi size={16} />}
          {attendance.connection === 'offline'
            ? 'İnternet bağlantısı yoxdur'
            : attendance.refreshing
              ? 'Yenilənir…'
              : attendance.error
                ? 'Son məlumat göstərilir'
                : 'Canlı izləmə aktivdir'}
        </span>
        <span className="last-updated"><Clock3 size={15} />Son yenilənmə: {attendance.lastUpdatedAt ? formatDateTime(attendance.lastUpdatedAt.toISOString()) : '—'}</span>
        <button className="btn secondary compact" type="button" disabled={attendance.refreshing || attendance.connection === 'offline'} onClick={() => void attendance.reload()}>
          <RefreshCw className={attendance.refreshing ? 'spin' : ''} size={15} />Yenilə
        </button>
      </section>

      <div className="toolbar attendance-filters">
        <label className="search-box"><Search size={17} /><input value={workerSearch} onChange={(event) => { setWorkerSearch(event.target.value); setPage(1); }} placeholder="İşçi adına görə axtar" /></label>
        {canViewCompanies ? (
          <select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setPage(1); }} aria-label="Müəssisə">
            <option value="">Bütün müəssisələr</option>{(companies.data?.data ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        ) : null}
        <select value={positionId} onChange={(event) => { setPositionId(event.target.value); setPage(1); }} aria-label="Vəzifə">
          <option value="">Bütün vəzifələr</option>{(taxonomy.data?.data ?? []).map((position) => <option key={position.id} value={position.id}>{position.name_az}</option>)}
        </select>
        <select value={status} onChange={(event) => { setStatus(event.target.value as AttendanceDisplayStatus | ''); setPage(1); }} aria-label="Davamiyyət statusu">
          {attendanceStatuses.map((item) => <option key={item || 'all'} value={item}>{item ? attendanceStatusLabel(item) : 'Bütün davamiyyət statusları'}</option>)}
        </select>
        <label className="field compact-field"><span>Başlanğıc</span><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></label>
        <label className="field compact-field"><span>Son</span><input type="date" min={startDate || undefined} value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></label>
        <select value={sort} onChange={(event) => { setSort(event.target.value as 'asc' | 'desc'); setPage(1); }} aria-label="Sıralama"><option value="desc">Ən yeni əvvəl</option><option value="asc">Ən köhnə əvvəl</option></select>
      </div>

      {attendance.loading && !attendance.data ? <LoadingState /> : null}
      {attendance.error && !attendance.data ? <ErrorState message={attendance.error} onRetry={attendance.reload} /> : null}
      {attendance.error && attendance.data ? <div className="form-warning stale-data-warning" role="status">Canlı yeniləmə müvəqqəti alınmadı. Ekranda son uğurlu məlumat saxlanılır.</div> : null}
      {attendance.data ? (
        <section className="panel">
          {attendance.data.data.length === 0 ? <EmptyState message={appStrings.attendance.empty} /> : (
            <div className="table-wrap">
              <table className="responsive-table attendance-table">
                <thead><tr><th>İşçi</th><th>Müəssisə / sifariş</th><th>Vəzifə</th><th>Status</th><th>Giriş</th><th>Çıxış</th><th>Müddət</th><th /></tr></thead>
                <tbody>{attendance.data.data.map((record) => {
                  const displayStatus = attendanceStatus(record);
                  return (
                    <tr key={record.id ?? record.assignment_id}>
                      <td data-label="İşçi"><strong>{record.assignment.worker.name}</strong>{record.assignment.worker.phone ? <span className="table-subtext">{record.assignment.worker.phone}</span> : null}</td>
                      <td data-label="Müəssisə / sifariş"><strong>{record.assignment.order.company.name}</strong><span className="table-subtext">{record.assignment.order.title}</span></td>
                      <td data-label="Vəzifə">{attendancePosition(record)}</td>
                      <td data-label="Status"><StatusBadge status={displayStatus} /></td>
                      <td data-label="Giriş">{formatDateTime(record.checkin_time)}</td>
                      <td data-label="Çıxış">{record.checkout_time ? formatDateTime(record.checkout_time) : 'Çıxış edilməyib'}</td>
                      <td data-label="Müddət">{formatAttendanceDuration(record.duration_minutes)}</td>
                      <td className="mobile-card-action">{record.id ? <Link className="link-btn" to={`/attendance/${record.id}`}>{appStrings.view}</Link> : <span className="muted">Davamiyyət qeydi yoxdur</span>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <button className="btn secondary compact" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{appStrings.previous}</button>
            <span>{appStrings.pageOf(page, attendance.data.meta.total_pages)}</span>
            <button className="btn secondary compact" disabled={page >= attendance.data.meta.total_pages} onClick={() => setPage((value) => value + 1)}>{appStrings.next}</button>
          </div>
        </section>
      ) : null}
    </>
  );
}
