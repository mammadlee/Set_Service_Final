import {
  Ban,
  CheckCircle2,
  ClipboardPlus,
  Search,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import { getErrorMessage } from '../../shared/api/http';
import type {
  Assignment,
  AssignmentStatus,
  AttendanceDisplayStatus,
  BulkAssignmentResponse,
  WorkerClass,
  WorkerProfile,
  WorkerStatus,
} from '../../shared/api/types';
import { hasPermission } from '../../shared/auth/permissions';
import { ConfirmModal } from '../../shared/components/ConfirmModal';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings, statusLabel } from '../../shared/i18n/appStrings';
import { resolveAssetUrl } from '../../shared/utils/documents';
import { formatDateTime } from '../../shared/utils/format';
import { companiesService } from '../companies/companies.service';
import { ordersService } from '../orders/orders.service';
import { taxonomyService } from '../taxonomy/taxonomy.service';
import { workersService, type FocTrainingFilter } from '../workers/workers.service';
import { hasAssignmentPositionMismatch } from './assignment-position';
import { assignmentsService } from './assignments.service';

const activeStatuses: Array<AssignmentStatus | ''> = ['', 'assigned', 'accepted'];
const historyStatuses: Array<AssignmentStatus | ''> = ['', 'rejected', 'completed', 'cancelled'];
const workerStatuses: Array<WorkerStatus | ''> = ['', 'approved', 'pending_approval', 'rejected', 'suspended', 'inactive'];
const workerClasses: Array<WorkerClass | ''> = ['', 'A', 'B', 'C'];
const maxAssignmentWorkers = 100;
type AvailabilityFilter = '' | 'available' | 'unavailable';
type WorkerRatingSort = '' | 'rating_desc';
type AssignmentScope = 'active' | 'history';

export function AssignmentsPage() {
  const { user } = useAuth();
  const canManageAssignments = hasPermission(user, 'manage_assignments');
  const canViewCompanies = hasPermission(user, 'view_companies');

  const [scope, setScope] = useState<AssignmentScope>('active');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AssignmentStatus | ''>('');
  const [companyId, setCompanyId] = useState('');
  const [historyWorkerSearch, setHistoryWorkerSearch] = useState('');
  const [historyPositionId, setHistoryPositionId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('desc');

  const [createOrderId, setCreateOrderId] = useState('');
  const [createCategoryItemId, setCreateCategoryItemId] = useState('');
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerPositionFilter, setWorkerPositionFilter] = useState('');
  const [workerStatusFilter, setWorkerStatusFilter] = useState<WorkerStatus | ''>('approved');
  const [workerAvailabilityFilter, setWorkerAvailabilityFilter] = useState<AvailabilityFilter>('available');
  const [workerClassFilter, setWorkerClassFilter] = useState<WorkerClass | ''>('');
  const [workerFocFilter, setWorkerFocFilter] = useState<FocTrainingFilter>('');
  const [workerRatingSort, setWorkerRatingSort] = useState<WorkerRatingSort>('');
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkAssignmentResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Assignment | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const assignments = useAsync(
    () => assignmentsService.list({
      page,
      limit: 20,
      scope,
      status,
      company_id: companyId || undefined,
      worker_search: historyWorkerSearch.trim() || undefined,
      position_id: historyPositionId || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      sort,
    }),
    [page, scope, status, companyId, historyWorkerSearch, historyPositionId, startDate, endDate, sort],
  );
  const activeOrders = useAsync(
    () => canManageAssignments
      ? ordersService.list({ page: 1, limit: 100, scope: 'staffing', sort: 'desc' })
      : Promise.resolve({ data: [], meta: { page: 1, limit: 100, total: 0, total_pages: 0 } }),
    [canManageAssignments],
  );
  const workers = useAsync(
    () => canManageAssignments
      ? workersService.listForAssignments({
          status: workerStatusFilter || undefined,
          available: workerAvailabilityFilter === '' ? undefined : workerAvailabilityFilter === 'available',
        })
      : Promise.resolve<WorkerProfile[]>([]),
    [canManageAssignments, workerStatusFilter, workerAvailabilityFilter],
  );
  const companies = useAsync(
    () => canViewCompanies
      ? companiesService.list({ page: 1, limit: 100, sort: 'asc' })
      : Promise.resolve({ data: [], meta: { page: 1, limit: 100, total: 0, total_pages: 0 } }),
    [canViewCompanies],
  );
  const taxonomy = useAsync(() => taxonomyService.positions(), []);

  const selectedOrder = useMemo(
    () => activeOrders.data?.data.find((order) => order.id === createOrderId),
    [activeOrders.data, createOrderId],
  );
  const selectedCategoryItem = useMemo(
    () => selectedOrder?.category_items?.find((item) => item.id === createCategoryItemId),
    [selectedOrder, createCategoryItemId],
  );
  const visibleWorkers = useMemo(() => {
    const search = workerSearch.trim().toLocaleLowerCase('az');
    const filtered = (workers.data ?? []).filter((worker) => {
      if (search && !worker.name.toLocaleLowerCase('az').includes(search)) return false;
      if (workerPositionFilter
        && !worker.position_ids?.includes(workerPositionFilter)
        && !worker.positions?.some((position) => position.id === workerPositionFilter)) return false;
      if (workerClassFilter && worker.worker_class !== workerClassFilter) return false;
      if (workerFocFilter === 'foc' && !worker.is_foc_training) return false;
      if (workerFocFilter === 'non_foc' && worker.is_foc_training) return false;
      return true;
    });
    if (workerRatingSort !== 'rating_desc') return filtered;
    return [...filtered].sort((left, right) => (
      (right.rating_avg ?? 0) - (left.rating_avg ?? 0)
      || (right.rating_count ?? 0) - (left.rating_count ?? 0)
      || left.name.localeCompare(right.name, 'az')
    ));
  }, [workers.data, workerSearch, workerPositionFilter, workerClassFilter, workerFocFilter, workerRatingSort]);
  const workersById = useMemo(
    () => new Map((workers.data ?? []).map((worker) => [worker.id, worker])),
    [workers.data],
  );
  const positionMismatches = useMemo(
    () => (workers.data ?? []).filter((worker) => (
      selectedWorkerIds.includes(worker.id)
      && hasAssignmentPositionMismatch(
        worker,
        selectedCategoryItem?.position_id,
        selectedCategoryItem?.category ?? selectedOrder?.category,
      )
    )),
    [workers.data, selectedWorkerIds, selectedCategoryItem, selectedOrder],
  );
  const remainingCapacity = selectedCategoryItem?.remaining_count
    ?? (selectedOrder ? Math.max(0, selectedOrder.required_count - selectedOrder.assignment_count) : 0);

  function changeScope(next: AssignmentScope) {
    setScope(next);
    setStatus('');
    setPage(1);
  }

  function toggleWorker(id: string) {
    setSelectedWorkerIds((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < maxAssignmentWorkers ? [...current, id] : current
    ));
  }

  function requestBulkAssignment(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setBulkResult(null);
    setConfirmBulk(true);
  }

  async function createBulkAssignments() {
    setCreating(true);
    setFormError(null);
    try {
      const result = await assignmentsService.bulkCreate(createOrderId, selectedWorkerIds, {
        category: selectedCategoryItem?.category,
        orderCategoryItemId: selectedCategoryItem?.id ?? undefined,
        positionId: selectedCategoryItem?.position_id ?? undefined,
      });
      setBulkResult(result);
      setConfirmBulk(false);
      const successfulIds = new Set(result.results.filter((item) => item.status === 'assigned').map((item) => item.worker_id));
      setSelectedWorkerIds((current) => current.filter((id) => !successfulIds.has(id)));
      await Promise.all([assignments.reload(), activeOrders.reload(), workers.reload()]);
    } catch (error) {
      setFormError(getErrorMessage(error));
      setConfirmBulk(false);
    } finally {
      setCreating(false);
    }
  }

  async function confirmCancel(reason?: string) {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await assignmentsService.cancel(cancelTarget.id, reason);
      setCancelTarget(null);
      await Promise.all([assignments.reload(), activeOrders.reload()]);
    } catch (error) {
      setCancelError(getErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <PageHeader title={appStrings.assignments.title} description={appStrings.assignments.description} />

      {canManageAssignments ? (
        <section className="panel assignment-create-panel">
          <div className="panel-heading">
            <div><h2>Toplu işçi təyinatı</h2><p>İşçiləri filtrləyin, birlikdə seçin və nəticəni hər işçi üzrə izləyin.</p></div>
            <ClipboardPlus size={20} />
          </div>
          <form className="form-stack" onSubmit={requestBulkAssignment}>
            <div className="assignment-order-grid">
              <label className="field">
                <span>{appStrings.assignments.activeOrder}</span>
                <select
                  value={createOrderId}
                  onChange={(event) => {
                    const nextOrderId = event.target.value;
                    const nextOrder = activeOrders.data?.data.find((order) => order.id === nextOrderId);
                    setCreateOrderId(nextOrderId);
                    setCreateCategoryItemId(nextOrder?.category_items?.[0]?.id ?? '');
                    setSelectedWorkerIds([]);
                    setBulkResult(null);
                  }}
                  required
                >
                  <option value="">{appStrings.assignments.selectOrder}</option>
                  {activeOrders.data?.data.map((order) => <option key={order.id} value={order.id}>{order.title} ({order.assignment_count}/{order.required_count})</option>)}
                </select>
              </label>
              {selectedOrder ? (
                <label className="field">
                  <span>{appStrings.assignments.category}</span>
                  <select
                    value={createCategoryItemId}
                    onChange={(event) => { setCreateCategoryItemId(event.target.value); setSelectedWorkerIds([]); setBulkResult(null); }}
                    required={(selectedOrder.category_items?.length ?? 0) > 1}
                  >
                    {(selectedOrder.category_items?.length
                      ? selectedOrder.category_items
                      : [{ id: '', category: selectedOrder.category, required_count: selectedOrder.required_count, assigned_count: selectedOrder.assignment_count, remaining_count: Math.max(0, selectedOrder.required_count - selectedOrder.assignment_count) }]
                    ).map((item) => (
                      <option key={item.id ?? item.category} value={item.id ?? ''}>{item.category} — {appStrings.assignments.remaining(item.remaining_count ?? 0, item.required_count)}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            {selectedOrder ? (
              <div className={selectedWorkerIds.length > remainingCapacity ? 'inline-note error-note' : 'inline-note'}>
                {appStrings.assignments.capacity(selectedCategoryItem?.assigned_count ?? selectedOrder.assignment_count, selectedCategoryItem?.required_count ?? selectedOrder.required_count)} Seçilib: {selectedWorkerIds.length}.
                {selectedWorkerIds.length > remainingCapacity ? ' Tutumdan artıq seçimlər backend tərəfindən ayrıca rədd ediləcək.' : ''}
              </div>
            ) : null}

            <div className="assignment-worker-tools assignment-worker-filter-grid">
              <label className="search-box"><Search size={17} /><input value={workerSearch} onChange={(event) => setWorkerSearch(event.target.value)} placeholder="İşçi adına görə axtar" /></label>
              <select value={workerPositionFilter} onChange={(event) => setWorkerPositionFilter(event.target.value)} aria-label="Vəzifə filtri">
                <option value="">Bütün vəzifələr</option>
                {(taxonomy.data?.data ?? []).map((position) => <option key={position.id} value={position.id}>{position.name_az}</option>)}
              </select>
              <select value={workerAvailabilityFilter} onChange={(event) => setWorkerAvailabilityFilter(event.target.value as AvailabilityFilter)} aria-label="Mövcudluğa görə filtr">
                <option value="">Mövcudluq: hamısı</option><option value="available">Mövcud işçilər</option><option value="unavailable">Mövcud olmayanlar</option>
              </select>
              <select value={workerStatusFilter} onChange={(event) => setWorkerStatusFilter(event.target.value as WorkerStatus | '')} aria-label="Təsdiq statusuna görə filtr">
                {workerStatuses.map((item) => <option key={item || 'all'} value={item}>{item ? statusLabel(item) : 'Təsdiq statusu: hamısı'}</option>)}
              </select>
              <select value={workerClassFilter} onChange={(event) => setWorkerClassFilter(event.target.value as WorkerClass | '')} aria-label="Sinif filtri">
                {workerClasses.map((item) => <option key={item || 'all'} value={item}>{item ? `Sinif: ${item}` : 'Bütün siniflər'}</option>)}
              </select>
              <select value={workerFocFilter} onChange={(event) => setWorkerFocFilter(event.target.value as FocTrainingFilter)} aria-label="FOC filtr">
                <option value="">F.O.C.: hamısı</option><option value="foc">F.O.C. təlim</option><option value="non_foc">F.O.C. olmayanlar</option>
              </select>
              <select value={workerRatingSort} onChange={(event) => setWorkerRatingSort(event.target.value as WorkerRatingSort)} aria-label="İşçi sıralaması">
                <option value="">Standart sıra</option><option value="rating_desc">Reytinqə görə sırala</option>
              </select>
            </div>

            <div className="selection-summary">
              <strong>{selectedWorkerIds.length} işçi seçilib</strong>
              <button className="btn ghost compact" type="button" disabled={selectedWorkerIds.length === 0} onClick={() => setSelectedWorkerIds([])}>Seçimi təmizlə</button>
            </div>
            <div className="choice-list assignment-worker-list">
              {workers.loading ? <LoadingState compact /> : null}
              {workers.error ? <ErrorState message={workers.error} onRetry={workers.reload} /> : null}
              {workers.data && visibleWorkers.length === 0 ? <p className="muted">Filtrlərə uyğun işçi tapılmadı.</p> : null}
              {visibleWorkers.map((worker) => {
                const mismatch = hasAssignmentPositionMismatch(
                  worker,
                  selectedCategoryItem?.position_id,
                  selectedCategoryItem?.category ?? selectedOrder?.category,
                );
                return (
                  <label key={worker.id} className={`choice-row assignment-worker-card ${selectedWorkerIds.includes(worker.id) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedWorkerIds.includes(worker.id)}
                      disabled={selectedWorkerIds.length >= maxAssignmentWorkers && !selectedWorkerIds.includes(worker.id)}
                      onChange={() => toggleWorker(worker.id)}
                    />
                    <span className="assignment-worker-card-content">
                      <span className="assignment-worker-title">
                        <strong>{worker.name}</strong>
                        <span className="worker-inline-badges">{worker.is_foc_training ? <span className="foc-badge compact">F.O.C.</span> : null}<StatusBadge status={worker.status} /></span>
                      </span>
                      <span className="assignment-worker-meta"><small>Vəzifə: {workerPositionLabel(worker)}</small><small>Reytinq: {workerRatingLabel(worker)}</small><small>{worker.availability ? 'Mövcuddur' : 'Mövcud deyil'}</small></span>
                      {mismatch ? <span className="worker-warning">Profil vəzifəsi fərqlidir; admin təyinatı davam etdirə bilər.</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
            {selectedWorkerIds.length >= maxAssignmentWorkers ? (
              <div className="inline-note" role="status">Bir dəfəyə ən çox 100 işçi təyin edə bilərsiniz. Digər işçiləri növbəti təyinatda seçin.</div>
            ) : null}
            {positionMismatches.length > 0 ? (
              <div className="form-warning break-word" role="status">
                <strong>İşçinin əsas vəzifəsi sifarişin tələb etdiyi vəzifədən fərqlidir. Admin olaraq təyinata davam edə bilərsiniz.</strong>
                <span>{positionMismatches.map((worker) => worker.name).join(', ')}</span>
              </div>
            ) : null}
            {formError ? <div className="form-error" role="alert">{formError}</div> : null}
            <button className="btn primary full" type="submit" disabled={creating || !createOrderId || selectedWorkerIds.length === 0}>
              {creating ? appStrings.assignments.assigning : `Seçilmiş ${selectedWorkerIds.length} işçini təyin et`}
            </button>
          </form>
          {bulkResult ? <BulkResultPanel result={bulkResult} workersById={workersById} /> : null}
        </section>
      ) : null}

      <section className="panel assignment-history-panel">
        <div className="section-tabs" role="tablist" aria-label="Təyinat tarixçəsi">
          <button className={scope === 'active' ? 'active' : ''} type="button" role="tab" aria-selected={scope === 'active'} onClick={() => changeScope('active')}>Aktiv təyinatlar</button>
          <button className={scope === 'history' ? 'active' : ''} type="button" role="tab" aria-selected={scope === 'history'} onClick={() => changeScope('history')}>Tamamlanmış / tarixçə</button>
        </div>
        <div className="toolbar assignment-history-filters">
          <label className="search-box"><Search size={17} /><input value={historyWorkerSearch} onChange={(event) => { setHistoryWorkerSearch(event.target.value); setPage(1); }} placeholder="İşçi adı" /></label>
          {canViewCompanies ? (
            <select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setPage(1); }} aria-label="Müəssisə">
              <option value="">Bütün müəssisələr</option>{(companies.data?.data ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          ) : null}
          <select value={status} onChange={(event) => { setStatus(event.target.value as AssignmentStatus | ''); setPage(1); }} aria-label="Təyinat statusu">
            {(scope === 'active' ? activeStatuses : historyStatuses).map((item) => <option key={item || 'all'} value={item}>{item ? statusLabel(item) : appStrings.allStatuses}</option>)}
          </select>
          <select value={historyPositionId} onChange={(event) => { setHistoryPositionId(event.target.value); setPage(1); }} aria-label="Vəzifə">
            <option value="">Bütün vəzifələr</option>{(taxonomy.data?.data ?? []).map((position) => <option key={position.id} value={position.id}>{position.name_az}</option>)}
          </select>
          <label className="field compact-field"><span>Başlanğıc</span><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></label>
          <label className="field compact-field"><span>Son</span><input type="date" min={startDate || undefined} value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></label>
          <select value={sort} onChange={(event) => { setSort(event.target.value as 'asc' | 'desc'); setPage(1); }} aria-label="Sıralama"><option value="desc">Ən yeni əvvəl</option><option value="asc">Ən köhnə əvvəl</option></select>
        </div>

        {assignments.loading ? <LoadingState /> : null}
        {assignments.error ? <ErrorState message={assignments.error} onRetry={assignments.reload} /> : null}
        {assignments.data ? (
          <>
            {assignments.data.data.length === 0 ? <EmptyState message={appStrings.assignments.empty} /> : (
              <div className="table-wrap">
                <table className="responsive-table assignment-history-table">
                  <thead><tr><th>İşçi</th><th>Müəssisə / sifariş</th><th>Təyin olunan vəzifə</th><th>Tarixlər</th><th>Giriş / çıxış</th><th>Status</th><th>Təyin edən</th><th /></tr></thead>
                  <tbody>{assignments.data.data.map((assignment) => (
                    <tr key={assignment.id}>
                      <td data-label="İşçi"><WorkerIdentity assignment={assignment} /></td>
                      <td data-label="Müəssisə / sifariş"><strong>{assignment.order.company.name}</strong><span className="table-subtext">{assignment.order.title}</span></td>
                      <td data-label="Təyin olunan vəzifə">{assignmentPositionLabel(assignment)}</td>
                      <td data-label="Tarixlər"><span>Təyin: {formatDateTime(assignment.assigned_at)}</span><span className="table-subtext">Növbə: {formatDateTime(assignment.order.start_datetime)} — {formatDateTime(assignment.order.end_datetime)}</span></td>
                      <td data-label="Giriş / çıxış"><span>{formatDateTime(assignment.attendance?.checkin_time)}</span><span className="table-subtext">{formatDateTime(assignment.attendance?.checkout_time)} · {formatDuration(assignment.attendance?.duration_minutes)}</span></td>
                      <td data-label="Status"><StatusBadge status={assignment.status} /><span className="table-subtext">{attendanceStatusLabel(assignment.attendance?.status)}</span></td>
                      <td data-label="Təyin edən">{assignment.assigned_by?.name || 'Sistem / qeyd yoxdur'}</td>
                      <td className="mobile-card-action"><div className="table-actions">
                        <Link className="link-btn" to={`/assignments/${assignment.id}`}>{appStrings.view}</Link>
                        {canManageAssignments ? <button className="btn danger compact" type="button" disabled={assignment.status === 'cancelled' || assignment.status === 'completed'} onClick={() => setCancelTarget(assignment)}><Ban size={15} />{appStrings.assignments.cancel}</button> : null}
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <div className="pagination">
              <button className="btn secondary compact" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{appStrings.previous}</button>
              <span>{appStrings.pageOf(page, assignments.data.meta.total_pages)}</span>
              <button className="btn secondary compact" disabled={page >= assignments.data.meta.total_pages} onClick={() => setPage((value) => value + 1)}>{appStrings.next}</button>
            </div>
          </>
        ) : null}
      </section>

      {cancelError ? <div className="toast-error">{cancelError}</div> : null}
      <ConfirmModal
        open={confirmBulk}
        title="Toplu təyinatı təsdiqlə"
        message={`${selectedWorkerIds.length} işçi “${selectedOrder?.title ?? ''}” sifarişinə təyin edilsin? Hər işçi ayrıca yoxlanılacaq.`}
        confirmLabel="Təyinatı başlat"
        loading={creating}
        onCancel={() => setConfirmBulk(false)}
        onConfirm={() => void createBulkAssignments()}
      />
      <ConfirmModal
        open={Boolean(cancelTarget)}
        title={appStrings.assignments.cancelTitle}
        message={appStrings.assignments.cancelMessage}
        confirmLabel={appStrings.assignments.cancelConfirm}
        tone="danger"
        loading={cancelling}
        onCancel={() => setCancelTarget(null)}
        onConfirm={(reason) => void confirmCancel(reason)}
      />
    </>
  );
}

function BulkResultPanel({ result, workersById }: { result: BulkAssignmentResponse; workersById: Map<string, WorkerProfile> }) {
  return (
    <section className="bulk-result-panel" aria-live="polite">
      <div className="bulk-result-summary"><strong>Əməliyyat nəticəsi</strong><span>{result.assigned_count} uğurlu · {result.failed_count} uğursuz · {result.requested_count} cəmi</span></div>
      <ul className="bulk-result-list">
        {result.results.map((item, index) => {
          const name = item.assignment?.worker.name || workersById.get(item.worker_id)?.name || `İşçi ${index + 1}`;
          return (
            <li key={`${item.worker_id}-${index}`} className={item.status === 'assigned' ? 'success' : 'failure'}>
              {item.status === 'assigned' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <div><strong>{name}</strong><span>{item.status === 'assigned' ? 'Təyin edildi' : item.error?.message || 'Təyinat baş tutmadı'}</span>{item.warnings.map((warning) => <small key={`${warning.code}-${warning.position_id ?? ''}`}>{warning.message}</small>)}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WorkerIdentity({ assignment }: { assignment: Assignment }) {
  const photo = resolveAssetUrl(assignment.worker.profile_photo_url);
  return (
    <span className="worker-identity">
      {photo ? <img src={photo} alt="" loading="lazy" /> : <span className="worker-avatar-placeholder"><UserRound size={18} /></span>}
      <span><strong>{assignment.worker.name}</strong>{assignment.worker.phone ? <small>{assignment.worker.phone}</small> : null}</span>
    </span>
  );
}

function assignmentPositionLabel(assignment: Assignment): string {
  return assignment.assigned_position?.name_az || assignment.position?.name_az || assignment.category_item?.position?.name_az || assignment.category || appStrings.notAvailable;
}

function workerPositionLabel(worker: WorkerProfile) {
  const structured = worker.positions?.map((position) => position.name_az).filter(Boolean).join(', ');
  return structured || worker.position?.trim() || 'Qeyd edilməyib';
}

function workerRatingLabel(worker: WorkerProfile) {
  if (!worker.rating_count || !worker.rating_avg) return 'Yoxdur';
  return `${worker.rating_avg.toFixed(1)} ★`;
}

function formatDuration(minutes?: number | null): string {
  if (minutes === null || minutes === undefined) return 'Müddət yoxdur';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} saat ${rest} dəq` : `${rest} dəq`;
}

function attendanceStatusLabel(status?: AttendanceDisplayStatus): string {
  switch (status) {
    case 'not_checked_in': return 'Giriş edilməyib';
    case 'currently_working': return 'Hazırda işləyir';
    case 'checked_out': return 'Çıxış edib';
    case 'completed': return 'Tamamlanıb';
    case 'missing_incomplete': return 'Natamam davamiyyət';
    default: return 'Davamiyyət qeydi yoxdur';
  }
}
