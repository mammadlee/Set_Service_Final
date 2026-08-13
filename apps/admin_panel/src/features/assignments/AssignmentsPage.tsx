import { Ban, ClipboardPlus, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../shared/api/http';
import type { Assignment, AssignmentStatus, WorkerClass, WorkerProfile } from '../../shared/api/types';
import { useAuth } from '../../app/auth/AuthProvider';
import { hasPermission } from '../../shared/auth/permissions';
import { ConfirmModal } from '../../shared/components/ConfirmModal';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings, statusLabel } from '../../shared/i18n/appStrings';
import { formatDateTime } from '../../shared/utils/format';
import { ordersService } from '../orders/orders.service';
import { workersService } from '../workers/workers.service';
import { assignmentsService } from './assignments.service';

const statuses: Array<AssignmentStatus | ''> = ['', 'assigned', 'accepted', 'rejected', 'completed', 'cancelled'];
const workerClasses: Array<WorkerClass | ''> = ['', 'A', 'B', 'C'];
type WorkerFocFilter = '' | 'foc' | 'non_foc';
type WorkerRatingSort = '' | 'rating_desc';

export function AssignmentsPage() {
  const { user } = useAuth();
  const canManageAssignments = hasPermission(user, 'manage_assignments');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AssignmentStatus | ''>('');
  const [orderId, setOrderId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [createOrderId, setCreateOrderId] = useState('');
  const [createCategoryItemId, setCreateCategoryItemId] = useState('');
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerPositionFilter, setWorkerPositionFilter] = useState('');
  const [workerClassFilter, setWorkerClassFilter] = useState<WorkerClass | ''>('');
  const [workerFocFilter, setWorkerFocFilter] = useState<WorkerFocFilter>('');
  const [workerRatingSort, setWorkerRatingSort] = useState<WorkerRatingSort>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Assignment | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const assignments = useAsync(
    () => assignmentsService.list({
      page,
      limit: 20,
      status,
      order_id: orderId.trim() || undefined,
      worker_id: workerId.trim() || undefined,
    }),
    [page, status, orderId, workerId],
  );
  const activeOrders = useAsync(
    () => canManageAssignments
      ? ordersService.list({ page: 1, limit: 100, status: 'active' })
      : Promise.resolve({ data: [], meta: { page: 1, limit: 100, total: 0, total_pages: 0 } }),
    [canManageAssignments],
  );
  const approvedWorkers = useAsync(
    () => canManageAssignments
      ? workersService.list({ page: 1, limit: 100, status: 'approved', available: true })
      : Promise.resolve({ data: [], meta: { page: 1, limit: 100, total: 0, total_pages: 0 } }),
    [canManageAssignments],
  );

  const selectedOrder = useMemo(
    () => activeOrders.data?.data.find((order) => order.id === createOrderId),
    [activeOrders.data, createOrderId],
  );
  const selectedCategoryItem = useMemo(
    () => selectedOrder?.category_items?.find((item) => item.id === createCategoryItemId),
    [selectedOrder, createCategoryItemId],
  );
  const workerPositionOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const worker of approvedWorkers.data?.data ?? []) {
      for (const position of worker.positions ?? []) {
        options.set(position.id, position.name_az);
      }
      if (!worker.positions?.length && worker.position?.trim()) {
        options.set(`legacy:${worker.position.trim()}`, worker.position.trim());
      }
    }
    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'az'));
  }, [approvedWorkers.data]);
  const visibleApprovedWorkers = useMemo(() => {
    const workers = approvedWorkers.data?.data ?? [];
    const search = workerSearch.trim().toLowerCase();
    const filtered = workers.filter((worker) => {
      if (search && !worker.name.toLowerCase().includes(search)) return false;
      if (workerClassFilter && worker.worker_class !== workerClassFilter) return false;
      if (workerFocFilter === 'foc' && !worker.is_foc_training) return false;
      if (workerFocFilter === 'non_foc' && worker.is_foc_training) return false;
      if (workerPositionFilter) {
        const hasStructuredPosition = worker.position_ids?.includes(workerPositionFilter) === true;
        const hasLegacyPosition = workerPositionFilter.startsWith('legacy:')
          && worker.position?.trim() === workerPositionFilter.replace(/^legacy:/, '');
        if (!hasStructuredPosition && !hasLegacyPosition) return false;
      }
      return true;
    });
    if (workerRatingSort === 'rating_desc') {
      return [...filtered].sort((left, right) => (
        (right.rating_avg ?? 0) - (left.rating_avg ?? 0)
        || (right.rating_count ?? 0) - (left.rating_count ?? 0)
        || left.name.localeCompare(right.name, 'az')
      ));
    }
    return filtered;
  }, [approvedWorkers.data, workerSearch, workerClassFilter, workerFocFilter, workerPositionFilter, workerRatingSort]);

  function toggleWorker(id: string) {
    setSelectedWorkerIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  async function createAssignment(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setFormError(null);

    try {
      await assignmentsService.create(createOrderId, selectedWorkerIds, {
        category: selectedCategoryItem?.category,
        orderCategoryItemId: selectedCategoryItem?.id ?? undefined,
        positionId: selectedCategoryItem?.position_id ?? undefined,
      });
      setCreateOrderId('');
      setCreateCategoryItemId('');
      setSelectedWorkerIds([]);
      await assignments.reload();
    } catch (error) {
      setFormError(getErrorMessage(error));
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
      await assignments.reload();
    } catch (error) {
      setCancelError(getErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <PageHeader title={appStrings.assignments.title} description={appStrings.assignments.description} />

      <section className={canManageAssignments ? 'split-layout assignments-layout' : 'single-panel-layout assignments-layout'}>
        {canManageAssignments ? <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>{appStrings.assignments.createTitle}</h2>
              <p>{appStrings.assignments.createDescription}</p>
            </div>
            <ClipboardPlus size={20} />
          </div>

          <form className="form-stack" onSubmit={(event) => void createAssignment(event)}>
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
                }}
                required
              >
                <option value="">{appStrings.assignments.selectOrder}</option>
                {activeOrders.data?.data.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.title} ({order.assignment_count}/{order.required_count})
                  </option>
                ))}
              </select>
            </label>

            {selectedOrder ? (
              <>
                <label className="field">
                  <span>{appStrings.assignments.category}</span>
                  <select
                    value={createCategoryItemId}
                    onChange={(event) => {
                      setCreateCategoryItemId(event.target.value);
                      setSelectedWorkerIds([]);
                    }}
                    required={(selectedOrder.category_items?.length ?? 0) > 1}
                  >
                    {(selectedOrder.category_items?.length
                      ? selectedOrder.category_items
                      : [{
                          id: '',
                          category: selectedOrder.category,
                          required_count: selectedOrder.required_count,
                          assigned_count: selectedOrder.assignment_count,
                          remaining_count: Math.max(0, selectedOrder.required_count - selectedOrder.assignment_count),
                        }]
                    ).map((item) => (
                      <option key={item.id ?? item.category} value={item.id ?? ''}>
                        {item.category} - {appStrings.assignments.remaining(item.remaining_count ?? 0, item.required_count)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="inline-note">
                  {appStrings.assignments.capacity(
                    selectedCategoryItem?.assigned_count ?? selectedOrder.assignment_count,
                    selectedCategoryItem?.required_count ?? selectedOrder.required_count,
                  )}
                </div>
              </>
            ) : null}

            <div className="field">
              <span>{appStrings.assignments.approvedWorkers}</span>
              <div className="assignment-worker-tools">
                <label className="search-box">
                  <Search size={17} />
                  <input value={workerSearch} onChange={(event) => setWorkerSearch(event.target.value)} placeholder="İşçi adına görə axtar" />
                </label>
                <select value={workerPositionFilter} onChange={(event) => setWorkerPositionFilter(event.target.value)}>
                  <option value="">Bütün vəzifələr</option>
                  {workerPositionOptions.map((position) => (
                    <option key={position.value} value={position.value}>{position.label}</option>
                  ))}
                </select>
                <select value={workerClassFilter} onChange={(event) => setWorkerClassFilter(event.target.value as WorkerClass | '')}>
                  {workerClasses.map((item) => (
                    <option key={item || 'all'} value={item}>
                      {item ? `Sinif: ${item}` : 'Bütün siniflər'}
                    </option>
                  ))}
                </select>
                <select value={workerFocFilter} onChange={(event) => setWorkerFocFilter(event.target.value as WorkerFocFilter)}>
                  <option value="">F.O.C.: Hamısı</option>
                  <option value="foc">F.O.C. təlim</option>
                  <option value="non_foc">F.O.C. olmayanlar</option>
                </select>
                <select value={workerRatingSort} onChange={(event) => setWorkerRatingSort(event.target.value as WorkerRatingSort)}>
                  <option value="">Standart sıra</option>
                  <option value="rating_desc">Reytinqə görə sırala</option>
                </select>
              </div>
              <div className="choice-list">
                {approvedWorkers.loading ? <LoadingState compact /> : null}
                {approvedWorkers.data && visibleApprovedWorkers.length === 0 ? (
                  <p className="muted">{appStrings.assignments.noAvailableWorkers}</p>
                ) : null}
                {visibleApprovedWorkers.map((worker) => (
                  <label key={worker.id} className={`choice-row assignment-worker-card ${selectedWorkerIds.includes(worker.id) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedWorkerIds.includes(worker.id)}
                      onChange={() => toggleWorker(worker.id)}
                    />
                    <span className="assignment-worker-card-content">
                      <span className="assignment-worker-title">
                        <strong>{worker.name}</strong>
                        {worker.is_foc_training ? <span className="foc-badge compact">F.O.C. təlim</span> : null}
                      </span>
                      <span className="assignment-worker-meta">
                        <small>Vəzifə: {workerPositionLabel(worker)}</small>
                        <small>Reytinq: {workerRatingLabel(worker)}</small>
                        <small>Sinif: {worker.worker_class || 'Təyin edilməyib'}</small>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {formError ? <div className="form-error">{formError}</div> : null}
            <button
              className="btn primary full"
              type="submit"
              disabled={creating || !createOrderId || selectedWorkerIds.length === 0}
            >
              {creating ? appStrings.assignments.assigning : appStrings.assignments.assign(selectedWorkerIds.length)}
            </button>
          </form>
        </div> : null}

        <div className="panel list-panel">
          <div className="toolbar compact-toolbar">
            <label className="search-box">
              <Search size={17} />
              <input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder={appStrings.assignments.filterByOrderId} />
            </label>
            <label className="search-box">
              <Search size={17} />
              <input value={workerId} onChange={(event) => setWorkerId(event.target.value)} placeholder={appStrings.assignments.filterByWorkerId} />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value as AssignmentStatus | '')}>
              {statuses.map((item) => <option key={item || 'all'} value={item}>{item ? statusLabel(item) : appStrings.allStatuses}</option>)}
            </select>
          </div>

          {assignments.loading ? <LoadingState /> : null}
          {assignments.error ? <ErrorState message={assignments.error} onRetry={assignments.reload} /> : null}
          {assignments.data ? (
            <>
              {assignments.data.data.length === 0 ? <EmptyState message={appStrings.assignments.empty} /> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{appStrings.assignments.worker}</th>
                        <th>{appStrings.assignments.order}</th>
                        <th>{appStrings.assignments.company}</th>
                        <th>{appStrings.assignments.status}</th>
                        <th>{appStrings.assignments.assignedAt}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.data.data.map((assignment) => (
                        <tr key={assignment.id}>
                          <td>
                            <strong>{assignment.worker.name}</strong>
                            <span className="table-subtext">{assignment.worker.phone}</span>
                          </td>
                          <td>{assignment.order.title}</td>
                          <td>{assignment.order.company.name}</td>
                          <td><StatusBadge status={assignment.status} /></td>
                          <td>{formatDateTime(assignment.assigned_at)}</td>
                          <td>
                            <div className="table-actions">
                              <Link className="link-btn" to={`/assignments/${assignment.id}`}>{appStrings.view}</Link>
                              {canManageAssignments ? (
                                <button
                                  className="btn danger compact"
                                  type="button"
                                  disabled={assignment.status === 'cancelled' || assignment.status === 'completed'}
                                  onClick={() => setCancelTarget(assignment)}
                                >
                                  <Ban size={15} />
                                  {appStrings.assignments.cancel}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="pagination">
                <button className="btn secondary compact" disabled={page <= 1} onClick={() => setPage(page - 1)}>{appStrings.previous}</button>
                <span>{appStrings.pageOf(page, assignments.data.meta.total_pages)}</span>
                <button className="btn secondary compact" disabled={page >= assignments.data.meta.total_pages} onClick={() => setPage(page + 1)}>{appStrings.next}</button>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {cancelError ? <div className="toast-error">{cancelError}</div> : null}
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

function workerPositionLabel(worker: WorkerProfile) {
  const structured = worker.positions
    ?.map((position) => position.name_az)
    .filter(Boolean)
    .join(', ');
  return structured || worker.position?.trim() || 'Qeyd edilməyib';
}

function workerRatingLabel(worker: WorkerProfile) {
  if (!worker.rating_count || !worker.rating_avg) return 'Yoxdur';
  return `${worker.rating_avg.toFixed(1)} ★`;
}
