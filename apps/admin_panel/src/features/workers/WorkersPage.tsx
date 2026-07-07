import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../app/auth/AuthProvider';
import { getErrorMessage } from '../../shared/api/http';
import { hasPermission } from '../../shared/auth/permissions';
import { ConfirmModal } from '../../shared/components/ConfirmModal';
import { PageHeader } from '../../shared/components/PageHeader';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings, statusLabel } from '../../shared/i18n/appStrings';
import type { WorkerClass, WorkerStatus } from '../../shared/api/types';
import { workersService, type FocTrainingFilter } from './workers.service';

const statuses: Array<WorkerStatus | ''> = ['', 'pending_approval', 'approved', 'rejected', 'suspended', 'inactive'];
const workerClasses: Array<WorkerClass | ''> = ['', 'A', 'B', 'C'];

export function WorkersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<WorkerStatus | ''>('pending_approval');
  const [workerClass, setWorkerClass] = useState<WorkerClass | ''>('');
  const [focTraining, setFocTraining] = useState<FocTrainingFilter>('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focAction, setFocAction] = useState<'add' | 'remove' | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const { user } = useAuth();
  const canManageWorkers = hasPermission(user, 'manage_workers');

  const workers = useAsync(
    () => workersService.list({ page, limit: 20, status, search, worker_class: workerClass, foc_training: focTraining, sort: 'desc' }),
    [page, status, workerClass, focTraining, search],
  );
  const visibleWorkerIds = workers.data?.data.map((worker) => worker.id) ?? [];
  const allVisibleSelected = visibleWorkerIds.length > 0 && visibleWorkerIds.every((id) => selectedIds.includes(id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleWorkerIds.includes(id));
      return [...new Set([...current, ...visibleWorkerIds])];
    });
  }

  async function confirmFocAction() {
    if (!focAction || selectedIds.length === 0) return;
    setBulkWorking(true);
    setBulkError(null);
    try {
      await workersService.updateFocTraining(selectedIds, focAction === 'add');
      setSelectedIds([]);
      setFocAction(null);
      await workers.reload();
    } catch (error) {
      setBulkError(getErrorMessage(error));
    } finally {
      setBulkWorking(false);
    }
  }

  return (
    <>
      <PageHeader title={appStrings.workers.title} description={appStrings.workers.description} />

      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={appStrings.workers.search} />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value as WorkerStatus | '')}>
          {statuses.map((item) => (
            <option key={item || 'all'} value={item}>
              {item ? statusLabel(item) : appStrings.allStatuses}
            </option>
          ))}
        </select>
        <select value={workerClass} onChange={(event) => setWorkerClass(event.target.value as WorkerClass | '')}>
          {workerClasses.map((item) => (
            <option key={item || 'all'} value={item}>
              {item ? `${appStrings.workers.workerClass} ${item}` : appStrings.workers.allClasses}
            </option>
          ))}
        </select>
        <select value={focTraining} onChange={(event) => setFocTraining(event.target.value as FocTrainingFilter)}>
          <option value="">Hamısı</option>
          <option value="foc">F.O.C. təlimdə olanlar</option>
          <option value="non_foc">F.O.C. olmayanlar</option>
        </select>
      </div>

      {canManageWorkers ? (
        <section className="panel bulk-action-panel">
          <div>
            <strong>{selectedIds.length} işçi seçilib</strong>
            <p className="muted">Seçilmiş işçiləri F.O.C. təlim siyahısına əlavə edin və ya siyahıdan çıxarın.</p>
          </div>
          <div className="table-actions">
            <button className="btn primary compact" type="button" disabled={selectedIds.length === 0} onClick={() => setFocAction('add')}>
              F.O.C. təlimə əlavə et
            </button>
            <button className="btn secondary compact" type="button" disabled={selectedIds.length === 0} onClick={() => setFocAction('remove')}>
              F.O.C.-dan çıxar
            </button>
          </div>
        </section>
      ) : null}
      {bulkError ? <div className="form-error">{bulkError}</div> : null}

      {workers.loading ? <LoadingState /> : null}
      {workers.error ? <ErrorState message={workers.error} onRetry={workers.reload} /> : null}

      {workers.data ? (
        <section className="panel">
          {workers.data.data.length === 0 ? (
            <EmptyState message={appStrings.workers.empty} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {canManageWorkers ? (
                      <th>
                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} aria-label="Bütün görünən işçiləri seç" />
                      </th>
                    ) : null}
                    <th>{appStrings.workers.name}</th>
                    <th>{appStrings.workers.phone}</th>
                    <th>{appStrings.workers.position}</th>
                    <th>{appStrings.workers.workerClass}</th>
                    <th>{appStrings.workers.status}</th>
                    <th>{appStrings.workers.availability}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {workers.data.data.map((worker) => (
                    <tr key={worker.id}>
                      {canManageWorkers ? (
                        <td>
                          <input type="checkbox" checked={selectedIds.includes(worker.id)} onChange={() => toggleSelected(worker.id)} aria-label={`${worker.name} seç`} />
                        </td>
                      ) : null}
                      <td>
                        <strong>{worker.name}</strong>
                        {worker.is_foc_training ? <span className="foc-badge">F.O.C. Təlim</span> : null}
                      </td>
                      <td>{worker.phone}</td>
                      <td>{worker.position || appStrings.notAvailable}</td>
                      <td>{worker.worker_class || appStrings.workers.noWorkerClass}</td>
                      <td><StatusBadge status={worker.status} /></td>
                      <td>{worker.availability ? appStrings.yes : appStrings.no}</td>
                      <td><Link className="link-btn" to={`/workers/${worker.id}`}>{appStrings.view}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={workers.data.meta.total_pages} onPage={setPage} />
        </section>
      ) : null}

      <ConfirmModal
        open={focAction !== null}
        title={focAction === 'add' ? 'F.O.C. təlimə əlavə et' : 'F.O.C.-dan çıxar'}
        message={
          focAction === 'add'
            ? 'Seçilmiş işçilər F.O.C. təlim siyahısına əlavə edilsin?'
            : 'Seçilmiş işçilər F.O.C. təlim siyahısından çıxarılsın?'
        }
        confirmLabel={focAction === 'add' ? 'Əlavə et' : 'Çıxar'}
        loading={bulkWorking}
        onCancel={() => setFocAction(null)}
        onConfirm={() => void confirmFocAction()}
      />
    </>
  );
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  return (
    <div className="pagination">
      <button className="btn secondary compact" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {appStrings.previous}
      </button>
      <span>{appStrings.pageOf(page, totalPages)}</span>
      <button className="btn secondary compact" type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        {appStrings.next}
      </button>
    </div>
  );
}
