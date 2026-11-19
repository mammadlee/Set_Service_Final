import { useState } from 'react';
import { useAuth } from '../../app/auth/AuthProvider';
import { getErrorMessage } from '../../shared/api/http';
import { hasPermission } from '../../shared/auth/permissions';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { useAsync } from '../../shared/hooks/useAsync';
import { formatDateTime } from '../../shared/utils/format';
import { moderationService, type ModerationReport, type ModerationStatus } from './moderation.service';

const statuses: Array<{ value: ModerationStatus | ''; label: string }> = [
  { value: '', label: 'Bütün şikayətlər' },
  { value: 'open', label: 'Açıq' },
  { value: 'reviewing', label: 'Baxılır' },
  { value: 'resolved', label: 'Həll edildi' },
  { value: 'dismissed', label: 'Rədd edildi' },
];

const targetLabels: Record<ModerationReport['target_type'], string> = {
  order: 'Sifariş',
  company_profile: 'Müəssisə profili',
  worker_profile: 'İşçi profili',
  rating: 'Reytinq və rəy',
};

const reasonLabels: Record<string, string> = {
  inappropriate_content: 'Uyğunsuz məzmun',
  harassment: 'Təqib və narahatlıq',
  false_information: 'Yanlış məlumat',
  spam: 'Spam',
  privacy: 'Məxfilik',
  other: 'Digər',
};

export function ModerationPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'manage_moderation');
  const [status, setStatus] = useState<ModerationStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const reports = useAsync(() => moderationService.list(status || undefined, page), [status, page]);
  const detail = useAsync(
    () => selectedId ? moderationService.get(selectedId) : Promise.resolve(null),
    [selectedId],
  );

  async function changeStatus(next: Exclude<ModerationStatus, 'open'>) {
    if (!selectedId || !canManage) return;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await moderationService.update(selectedId, next, note.trim() || undefined);
      detail.setData(updated);
      setNote('');
      await reports.reload();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Şikayətlər" description="İstifadəçi məzmunu ilə bağlı müraciətləri yoxlayın və nəticəni qeyd edin." />
      <div className="toolbar">
        <label className="field">
          <span>Vəziyyət</span>
          <select value={status} onChange={(event) => { setStatus(event.target.value as ModerationStatus | ''); setPage(1); setSelectedId(null); }}>
            {statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      {reports.loading ? <LoadingState /> : null}
      {reports.error ? <ErrorState message={reports.error} onRetry={reports.reload} /> : null}
      {reports.data && reports.data.data.length === 0 ? <EmptyState message="Bu vəziyyətdə şikayət yoxdur." /> : null}
      {reports.data && reports.data.data.length > 0 ? (
        <div className="moderation-grid">
          <section className="moderation-list" aria-label="Şikayət siyahısı">
            {reports.data.data.map((report) => (
              <button
                key={report.id}
                type="button"
                className={`moderation-list-item ${selectedId === report.id ? 'selected' : ''}`}
                onClick={() => { setSelectedId(report.id); setActionError(null); setNote(''); }}
              >
                <strong>{targetLabels[report.target_type]}</strong>
                <span className="moderation-status">{statuses.find((item) => item.value === report.status)?.label}</span>
                <span>{reasonLabels[report.reason] ?? report.reason}</span>
                <small>{formatDateTime(report.created_at)}</small>
              </button>
            ))}
            <div className="moderation-action-buttons">
              <button className="btn secondary" type="button" disabled={page <= 1} onClick={() => { setPage(page - 1); setSelectedId(null); }}>Əvvəlki</button>
              <span>{page} / {reports.data.meta.total_pages || 1}</span>
              <button className="btn secondary" type="button" disabled={page >= reports.data.meta.total_pages} onClick={() => { setPage(page + 1); setSelectedId(null); }}>Növbəti</button>
            </div>
          </section>
          <section className="panel moderation-detail" aria-label="Şikayət detalları">
            {!selectedId ? <EmptyState message="Detallara baxmaq üçün şikayət seçin." /> : null}
            {selectedId && detail.loading ? <LoadingState compact /> : null}
            {selectedId && detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : null}
            {detail.data ? (
              <>
                <div className="panel-heading"><div><h2>{targetLabels[detail.data.target_type]}</h2><p>{detail.data.target.label}</p></div></div>
                <dl className="moderation-fields">
                  <div><dt>Vəziyyət</dt><dd>{statuses.find((item) => item.value === detail.data?.status)?.label}</dd></div>
                  <div><dt>Şikayət edən</dt><dd>{detail.data.reporter.name} · {detail.data.reporter_role === 'worker' ? 'İşçi' : 'Müəssisə'}</dd></div>
                  <div><dt>Səbəb</dt><dd>{reasonLabels[detail.data.reason] ?? detail.data.reason}</dd></div>
                  <div><dt>Ətraflı qeyd</dt><dd>{detail.data.details || 'Qeyd yoxdur'}</dd></div>
                  {detail.data.target.comment ? <div><dt>Şikayət edilən rəy</dt><dd>{detail.data.target.comment}</dd></div> : null}
                  {detail.data.resolution_note ? <div><dt>Nəticə qeydi</dt><dd>{detail.data.resolution_note}</dd></div> : null}
                </dl>
                {canManage && (detail.data.status === 'open' || detail.data.status === 'reviewing') ? (
                  <div className="moderation-actions">
                    <label className="field"><span>Nəticə qeydi (istəyə bağlı)</span><textarea value={note} maxLength={1000} rows={3} onChange={(event) => setNote(event.target.value)} /></label>
                    {actionError ? <div className="form-error" role="alert">{actionError}</div> : null}
                    <div className="moderation-action-buttons">
                      {detail.data.status === 'open' ? <button className="btn secondary" type="button" disabled={saving} onClick={() => void changeStatus('reviewing')}>Baxılır</button> : null}
                      <button className="btn primary" type="button" disabled={saving} onClick={() => void changeStatus('resolved')}>Həll et</button>
                      <button className="btn secondary" type="button" disabled={saving} onClick={() => void changeStatus('dismissed')}>Rədd et</button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
