import { ArrowLeft, Download, FileText } from 'lucide-react';
import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CompanyReportOrder, OrderStatus } from '../../shared/api/types';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings, statusLabel } from '../../shared/i18n/appStrings';
import { formatDateTime } from '../../shared/utils/format';
import { taxonomyService } from '../taxonomy/taxonomy.service';
import { workersService } from '../workers/workers.service';
import { companiesService } from './companies.service';

const statuses: Array<OrderStatus | ''> = [
  '', 'draft', 'published', 'partially_assigned', 'assigned', 'in_progress', 'active', 'completed', 'cancelled',
];

const emptyFilters = {
  start_date: '',
  end_date: '',
  order_status: '' as OrderStatus | '',
  worker_id: '',
  position_id: '',
};

const MAX_PRINT_ORDERS = 10_000;

export function CompanyReportPage() {
  const { id = '' } = useParams();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printOrders, setPrintOrders] = useState<CompanyReportOrder[] | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const [workerSearch, setWorkerSearch] = useState('');
  const workers = useAsync(() => workersService.list({ limit: 100, search: workerSearch.trim() || undefined, sort: 'asc' }), [workerSearch]);
  const taxonomy = useAsync(() => taxonomyService.positions(), []);
  const report = useAsync(() => companiesService.report(id, {
    page,
    limit: 20,
    start_date: applied.start_date || undefined,
    end_date: applied.end_date || undefined,
    order_status: applied.order_status,
    worker_id: applied.worker_id || undefined,
    position_id: applied.position_id || undefined,
    sort: 'desc',
  }), [id, page, applied]);

  useEffect(() => {
    const clearPrintData = () => setPrintOrders(null);
    window.addEventListener('afterprint', clearPrintData);
    return () => window.removeEventListener('afterprint', clearPrintData);
  }, []);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setApplied(filters);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setApplied(emptyFilters);
    setPage(1);
  }

  async function exportCsv() {
    if (!report.data || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const result = await companiesService.exportReport(id, {
        start_date: applied.start_date || undefined,
        end_date: applied.end_date || undefined,
        order_status: applied.order_status,
        worker_id: applied.worker_id || undefined,
        position_id: applied.position_id || undefined,
        sort: 'desc',
      });
      const safeName = report.data.company.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'company';
      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = result.filename || `${safeName}-report.csv`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : appStrings.unknownError);
    } finally {
      setExporting(false);
    }
  }

  async function printReport() {
    if (!report.data || printing) return;
    setPrinting(true);
    setExportError(null);
    try {
      if (report.data.orders.meta.total > MAX_PRINT_ORDERS) {
        throw new Error(`PDF / çap üçün maksimum ${MAX_PRINT_ORDERS} sifariş dəstəklənir. Tam məlumat üçün CSV endirin.`);
      }
      const params = {
        limit: 100,
        start_date: applied.start_date || undefined,
        end_date: applied.end_date || undefined,
        order_status: applied.order_status,
        worker_id: applied.worker_id || undefined,
        position_id: applied.position_id || undefined,
        sort: 'desc' as const,
      };
      const first = await companiesService.report(id, { ...params, page: 1 });
      const orders = [...first.orders.data];
      for (let nextPage = 2; nextPage <= first.orders.meta.total_pages; nextPage += 4) {
        const pages = await Promise.all(
          Array.from(
            { length: Math.min(4, first.orders.meta.total_pages - nextPage + 1) },
            (_, index) => companiesService.report(id, { ...params, page: nextPage + index }),
          ),
        );
        for (const result of pages) orders.push(...result.orders.data);
      }
      setPrintOrders(orders);
      setExpandedOrders(orders.map((order) => order.id));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      window.print();
    } catch (error) {
      setPrintOrders(null);
      setExportError(error instanceof Error ? error.message : appStrings.unknownError);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="print-report-page">
      <PageHeader
        title={report.data ? `${report.data.company.name} — hesabat` : 'Müəssisə hesabatı'}
        description="Sifariş, təyinat və giriş-çıxış məlumatları real sistem qeydlərindən hesablanır."
        actions={(
          <>
            <Link className="btn secondary compact no-print" to={`/companies/${id}`}><ArrowLeft size={16} />{appStrings.back}</Link>
            <button className="btn secondary compact no-print" type="button" disabled={!report.data || exporting} onClick={() => void exportCsv()}>
              <Download size={16} />{exporting ? 'CSV hazırlanır...' : 'CSV endir'}
            </button>
            <button className="btn primary compact no-print" type="button" disabled={!report.data || printing} onClick={() => void printReport()}>
              <FileText size={16} />{printing ? 'Hesabat hazırlanır...' : 'PDF / çap'}
            </button>
          </>
        )}
      />

      <section className="panel no-print">
        <h2>Filtrlər</h2>
        <form className="form-grid" onSubmit={applyFilters}>
          <label className="field"><span>Başlama tarixi</span><input type="date" value={filters.start_date} onChange={(event) => setFilters({ ...filters, start_date: event.target.value })} /></label>
          <label className="field"><span>Bitmə tarixi</span><input type="date" value={filters.end_date} onChange={(event) => setFilters({ ...filters, end_date: event.target.value })} /></label>
          <label className="field">
            <span>Sifariş statusu</span>
            <select value={filters.order_status} onChange={(event) => setFilters({ ...filters, order_status: event.target.value as OrderStatus | '' })}>
              {statuses.map((status) => <option key={status || 'all'} value={status}>{status ? statusLabel(status) : 'Bütün statuslar'}</option>)}
            </select>
          </label>
          <label className="field">
            <span>İşçi axtarışı</span>
            <input type="search" value={workerSearch} onChange={(event) => setWorkerSearch(event.target.value)} placeholder="Adı yazın" />
          </label>
          <label className="field">
            <span>İşçi</span>
            <select value={filters.worker_id} onChange={(event) => setFilters({ ...filters, worker_id: event.target.value })}>
              <option value="">Bütün işçilər</option>
              {(workers.data?.data ?? []).map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Vəzifə</span>
            <select value={filters.position_id} onChange={(event) => setFilters({ ...filters, position_id: event.target.value })}>
              <option value="">Bütün vəzifələr</option>
              {(taxonomy.data?.data ?? []).map((position) => <option key={position.id} value={position.id}>{position.name_az}</option>)}
            </select>
          </label>
          <div className="action-row full-field">
            <button className="btn primary" type="submit">Tətbiq et</button>
            <button className="btn secondary" type="button" onClick={clearFilters}>Təmizlə</button>
          </div>
        </form>
      </section>

      {exportError ? <div className="form-error no-print" role="alert">{exportError}</div> : null}
      {report.loading ? <LoadingState /> : null}
      {report.error ? <ErrorState message={report.error} onRetry={report.reload} /> : null}
      {report.data ? (
        <>
          <section className="report-company-summary panel">
            <div className="detail-title"><h2>{report.data.company.name}</h2><StatusBadge status={report.data.company.status} /></div>
            <dl className="detail-list compact-detail-list">
              <dt>Əlaqədar şəxs</dt><dd>{report.data.company.contact_name || appStrings.notAvailable}</dd>
              <dt>Telefon</dt><dd>{report.data.company.phone}</dd>
              <dt>E-poçt</dt><dd>{report.data.company.email || appStrings.notAvailable}</dd>
            </dl>
          </section>
          <div className="stat-grid company-report-stats">
            <ReportStat label="Bütün sifarişlər" value={report.data.summary.total_orders} />
            <ReportStat label="Aktiv sifarişlər" value={report.data.summary.active_orders} />
            <ReportStat label="Gözləyən sifarişlər" value={report.data.summary.pending_orders} />
            <ReportStat label="Tamamlanmış sifarişlər" value={report.data.summary.completed_orders} />
            <ReportStat label="Ləğv edilmiş sifarişlər" value={report.data.summary.cancelled_orders} />
            <ReportStat label="Tələb olunan işçi" value={report.data.summary.workers_requested} />
            <ReportStat label="Təyin olunan işçi" value={report.data.summary.workers_assigned} />
            <ReportStat label="Tamamlanan təyinat" value={report.data.summary.completed_assignments} />
            <ReportStat label="Giriş-çıxış qeydi" value={report.data.summary.attendance_records} />
            <ReportStat label="Qeydə alınmış iş saatı" value={formatMinutes(report.data.summary.total_recorded_minutes)} />
          </div>
          <section className="panel report-orders-panel">
            <h2>Sifariş tarixçəsi</h2>
            {report.data.orders.data.length === 0 ? <EmptyState message="Filtrlərə uyğun sifariş tapılmadı." /> : (
              <div className="table-wrap">
                <table className="responsive-table">
                  <thead><tr><th>Sifariş</th><th>Status</th><th>Yaradılıb</th><th>Növbə</th><th>İşçi sayı</th><th>İş saatı</th><th /></tr></thead>
                <tbody>{(printOrders ?? report.data.orders.data).map((order) => {
                    const expanded = expandedOrders.includes(order.id);
                    return (
                      <Fragment key={order.id}>
                        <tr>
                          <td data-label="Sifariş"><strong>{order.title}</strong><span className="table-subtext">{formatPositions(order)}</span></td>
                          <td data-label="Status"><StatusBadge status={order.status} /></td>
                          <td data-label="Yaradılıb">{formatDateTime(order.created_at)}</td>
                          <td data-label="Növbə">{formatDateTime(order.start_datetime)}<span className="table-subtext">{formatDateTime(order.end_datetime)}</span></td>
                          <td data-label="İşçi sayı">{order.workers_assigned}/{order.workers_requested}<span className="table-subtext">{order.completed_assignments} tamamlanıb</span></td>
                          <td data-label="İş saatı">{formatMinutes(order.total_recorded_minutes)}</td>
                          <td className="mobile-card-action"><div className="table-actions">
                            <button className="btn secondary compact no-print" type="button" aria-expanded={expanded} onClick={() => setExpandedOrders((current) => current.includes(order.id) ? current.filter((item) => item !== order.id) : [...current, order.id])}>
                              {expanded ? 'Detalları bağla' : 'İşçi detalları'}
                            </button>
                            <Link className="link-btn" to={`/orders/${order.id}`}>Sifarişi aç</Link>
                          </div></td>
                        </tr>
                        {expanded ? <tr className="report-assignment-detail-row"><td colSpan={7} data-label="İşçi təyinatları"><ReportAssignments order={order} /></td></tr> : null}
                      </Fragment>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
            <div className="pagination no-print">
              <button className="btn secondary compact" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{appStrings.previous}</button>
              <span>{appStrings.pageOf(page, report.data.orders.meta.total_pages)}</span>
              <button className="btn secondary compact" disabled={page >= report.data.orders.meta.total_pages} onClick={() => setPage((value) => value + 1)}>{appStrings.next}</button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: number | string }) {
  return <article className="stat-card"><div className="stat-content"><span>{label}</span><strong>{value}</strong></div></article>;
}

function ReportAssignments({ order }: { order: CompanyReportOrder }) {
  if (order.assignments.length === 0) return <p className="muted">Bu sifariş üzrə təyinat yoxdur.</p>;
  return (
    <div className="report-assignment-grid">
      {order.assignments.map((assignment) => {
        const latestAttendance = assignment.attendance[0];
        return (
          <article className="report-assignment-card" key={assignment.id}>
            <div className="report-assignment-card-title"><strong>{assignment.worker.name}</strong><StatusBadge status={assignment.status} /></div>
            <dl>
              <dt>Vəzifə</dt><dd>{assignment.position || assignment.category || assignment.worker.registered_position || appStrings.notAvailable}</dd>
              <dt>Təyin edilib</dt><dd>{formatDateTime(assignment.assigned_at)}</dd>
              <dt>Təyin edən</dt><dd>{assignment.assigned_by?.name || 'Sistem / qeyd yoxdur'}</dd>
              <dt>Giriş</dt><dd>{formatDateTime(latestAttendance?.checkin_time)}</dd>
              <dt>Çıxış</dt><dd>{latestAttendance?.checkout_time ? formatDateTime(latestAttendance.checkout_time) : 'Çıxış edilməyib'}</dd>
              <dt>Müddət</dt><dd>{latestAttendance?.duration_minutes === null || latestAttendance?.duration_minutes === undefined ? 'Hesablanmayıb' : formatMinutes(latestAttendance.duration_minutes)}</dd>
            </dl>
          </article>
        );
      })}
    </div>
  );
}

function formatMinutes(minutes: number): string {
  const safe = Math.max(0, minutes || 0);
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${hours} saat ${remainder} dəq`;
}

function formatPositions(order: CompanyReportOrder): string {
  return order.category_items.length
    ? order.category_items.map((item) => `${item.position?.name_az ?? item.category} (${item.required_count})`).join(', ')
    : order.category || appStrings.notAvailable;
}
