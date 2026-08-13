import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmModal } from '../../shared/components/ConfirmModal';
import { PageHeader } from '../../shared/components/PageHeader';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { getErrorMessage } from '../../shared/api/http';
import { hasPermission } from '../../shared/auth/permissions';
import { appStrings } from '../../shared/i18n/appStrings';
import { useAuth } from '../../app/auth/AuthProvider';
import { useAsync } from '../../shared/hooks/useAsync';
import { normalizeDocuments, resolveAssetUrl } from '../../shared/utils/documents';
import { formatDateTime } from '../../shared/utils/format';
import type { WorkerClass } from '../../shared/api/types';
import { workersService } from './workers.service';

export function WorkerDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const canManageWorkers = hasPermission(user, 'manage_workers');
  const worker = useAsync(() => workersService.get(id), [id]);
  const ratings = useAsync(() => workersService.ratings(id), [id]);
  const documents = normalizeDocuments(worker.data?.documents);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [classSaving, setClassSaving] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);
  const [focAction, setFocAction] = useState<'add' | 'remove' | null>(null);
  const [focSaving, setFocSaving] = useState(false);
  const [focError, setFocError] = useState<string | null>(null);

  async function confirm(reason?: string) {
    setWorking(true);
    setActionError(null);
    try {
      if (action === 'approve') await workersService.approve(id);
      if (action === 'reject') await workersService.reject(id, reason || '');
      setAction(null);
      await worker.reload();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function updateClass(value: string) {
    setClassSaving(true);
    setClassError(null);
    try {
      await workersService.updateClass(id, value ? value as WorkerClass : null);
      await worker.reload();
    } catch (error) {
      setClassError(getErrorMessage(error));
    } finally {
      setClassSaving(false);
    }
  }

  async function confirmFocTraining() {
    if (!focAction) return;
    setFocSaving(true);
    setFocError(null);
    try {
      await workersService.updateFocTraining([id], focAction === 'add');
      setFocAction(null);
      await worker.reload();
    } catch (error) {
      setFocError(getErrorMessage(error));
    } finally {
      setFocSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={appStrings.workers.detailTitle}
        description={appStrings.workers.detailDescription}
        actions={<Link className="btn secondary compact" to="/workers"><ArrowLeft size={16} />{appStrings.back}</Link>}
      />

      {worker.loading ? <LoadingState /> : null}
      {worker.error ? <ErrorState message={worker.error} onRetry={worker.reload} /> : null}

      {worker.data ? (
        <section className="detail-grid">
          <div className="panel">
            <div className="detail-title">
              <div>
                <h2>{worker.data.name}</h2>
                {worker.data.is_foc_training ? <span className="foc-badge">F.O.C. təlim</span> : null}
              </div>
              <StatusBadge status={worker.data.status} />
            </div>
            <dl className="detail-list">
              <dt>{appStrings.workers.phone}</dt><dd>{worker.data.phone}</dd>
              <dt>{appStrings.workers.email}</dt><dd>{worker.data.email || appStrings.notAvailable}</dd>
              <dt>{appStrings.workers.position}</dt><dd>{worker.data.position || appStrings.notAvailable}</dd>
              <dt>{appStrings.workers.workerClass}</dt>
              <dd>
                {canManageWorkers ? (
                  <select
                    value={worker.data.worker_class || ''}
                    disabled={classSaving}
                    onChange={(event) => void updateClass(event.target.value)}
                  >
                    <option value="">{appStrings.workers.clearClass}</option>
                    <option value="A">{appStrings.workers.workerClass} A</option>
                    <option value="B">{appStrings.workers.workerClass} B</option>
                    <option value="C">{appStrings.workers.workerClass} C</option>
                  </select>
                ) : (
                  worker.data.worker_class || appStrings.workers.noWorkerClass
                )}
                {classError ? <div className="form-error">{classError}</div> : null}
              </dd>
              <dt>F.O.C. təlim</dt>
              <dd>
                {worker.data.is_foc_training ? 'Bəli' : 'Xeyr'}
                {worker.data.foc_training_note ? <span className="table-subtext">{worker.data.foc_training_note}</span> : null}
                {worker.data.foc_training_updated_at ? <span className="table-subtext">Yenilənib: {formatDateTime(worker.data.foc_training_updated_at)}</span> : null}
              </dd>
              <dt>{appStrings.workers.profilePhoto}</dt><dd>{worker.data.profile_photo_url ? <a href={resolveAssetUrl(worker.data.profile_photo_url)} target="_blank" rel="noreferrer">{appStrings.workers.openDocument}</a> : appStrings.notAvailable}</dd>
              <dt>{appStrings.workers.skills}</dt><dd>{formatList(worker.data.skills)}</dd>
              <dt>{appStrings.workers.languages}</dt><dd>{formatList(worker.data.languages)}</dd>
              <dt>{appStrings.workers.workHistory}</dt><dd>{worker.data.work_history_summary || appStrings.workers.noData}</dd>
              <dt>{appStrings.workers.availability}</dt><dd>{worker.data.availability ? appStrings.workers.available : appStrings.workers.unavailable}</dd>
              <dt>{appStrings.workers.rating}</dt><dd>{worker.data.rating_avg} ({worker.data.rating_count})</dd>
              <dt>{appStrings.workers.rejectReason}</dt><dd>{worker.data.reject_reason || appStrings.notAvailable}</dd>
            </dl>
            {canManageWorkers ? (
              <div className="action-row">
                <button className="btn primary" type="button" onClick={() => setAction('approve')} disabled={worker.data.status === 'approved'}>
                  {appStrings.workers.approve}
                </button>
                <button className="btn danger" type="button" onClick={() => setAction('reject')} disabled={worker.data.status === 'rejected'}>
                  {appStrings.workers.reject}
                </button>
                <button className="btn secondary" type="button" onClick={() => setFocAction(worker.data!.is_foc_training ? 'remove' : 'add')} disabled={focSaving}>
                  {worker.data.is_foc_training ? 'F.O.C.-dan çıxar' : 'F.O.C. təlimə əlavə et'}
                </button>
              </div>
            ) : null}
            {actionError ? <div className="form-error">{actionError}</div> : null}
            {focError ? <div className="form-error">{focError}</div> : null}
          </div>

          <div className="panel">
            <h2>{appStrings.workers.documents}</h2>
            {documents.length > 0 ? (
              <ul className="document-list">
                {documents.map((doc, index) => (
                  <li key={`${doc.url}-${index}`}>
                    <span>{doc.name || doc.type || appStrings.workers.document}</span>
                    {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer">{appStrings.workers.openDocument}</a> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{appStrings.workers.noDocuments}</p>
            )}
          </div>

          <div className="panel">
            <h2>{appStrings.workers.ratings}</h2>
            {ratings.loading ? <LoadingState /> : null}
            {ratings.error ? <ErrorState message={ratings.error} onRetry={ratings.reload} /> : null}
            {ratings.data && ratings.data.data.length === 0 ? <p className="muted">{appStrings.workers.noRatings}</p> : null}
            {ratings.data && ratings.data.data.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{appStrings.workers.ratingScore}</th>
                      <th>{appStrings.workers.ratingOrder}</th>
                      <th>{appStrings.workers.ratingFeedback}</th>
                      <th>{appStrings.workers.ratingDate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratings.data.data.map((rating) => (
                      <tr key={rating.id}>
                        <td>{rating.score}/5</td>
                        <td>{rating.order?.title || rating.order_id}</td>
                        <td>{rating.feedback || rating.comment || appStrings.notAvailable}</td>
                        <td>{formatDateTime(rating.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <ConfirmModal
        open={action === 'approve'}
        title={appStrings.workers.approveTitle}
        message={appStrings.workers.approveMessage}
        confirmLabel={appStrings.workers.approve}
        loading={working}
        onCancel={() => setAction(null)}
        onConfirm={() => void confirm()}
      />
      <ConfirmModal
        open={action === 'reject'}
        title={appStrings.workers.rejectTitle}
        message={appStrings.workers.rejectMessage}
        confirmLabel={appStrings.workers.reject}
        tone="danger"
        requireReason
        loading={working}
        onCancel={() => setAction(null)}
        onConfirm={(reason) => void confirm(reason)}
      />
      <ConfirmModal
        open={focAction !== null}
        title={focAction === 'add' ? 'F.O.C. təlimə əlavə et' : 'F.O.C.-dan çıxar'}
        message={
          focAction === 'add'
            ? 'Seçilmiş işçi F.O.C. təlim siyahısına əlavə edilsin?'
            : 'Seçilmiş işçi F.O.C. təlim siyahısından çıxarılsın?'
        }
        confirmLabel={focAction === 'add' ? 'Əlavə et' : 'Çıxar'}
        loading={focSaving}
        onCancel={() => setFocAction(null)}
        onConfirm={() => void confirmFocTraining()}
      />
    </>
  );
}

function formatList(value: unknown): string {
  if (!Array.isArray(value)) return appStrings.workers.noData;
  const items = value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'name' in item) return String(item.name);
      return '';
    })
    .filter(Boolean);
  return items.length ? items.join(', ') : appStrings.workers.noData;
}
