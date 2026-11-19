import { useState } from 'react';
import { getErrorMessage } from '../../shared/api/http';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { useAsync } from '../../shared/hooks/useAsync';
import { formatDateTime } from '../../shared/utils/format';
import { deletionService, type DeletionStatus, type OwnershipVerification } from './deletion.service';

const statuses: Array<{ value: DeletionStatus | ''; label: string }> = [
  { value: '', label: 'Bütün müraciətlər' },
  { value: 'open', label: 'Açıq' },
  { value: 'reviewing', label: 'Baxılır' },
  { value: 'resolved', label: 'İcra edildi' },
  { value: 'dismissed', label: 'Rədd edildi' },
];

export function DeletionRequestsPage() {
  const [status, setStatus] = useState<DeletionStatus | ''>('open');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [verification, setVerification] = useState<OwnershipVerification | ''>('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const requests = useAsync(() => deletionService.list(status || undefined, page), [status, page]);
  const detail = useAsync(() => selectedId ? deletionService.get(selectedId) : Promise.resolve(null), [selectedId]);

  async function changeStatus(next: Exclude<DeletionStatus, 'open'>) {
    if (!selectedId) return;
    if (next === 'resolved' && (!confirmed || !verification || note.trim().length < 3)) {
      setActionError('Sahibliyi ayrıca yoxlayın, üsulu seçin, qeydi yazın və silinməni təsdiqləyin.');
      return;
    }
    if (next === 'dismissed' && note.trim().length < 3) {
      setActionError('Rədd səbəbini ən azı 3 simvolla qeyd edin.');
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const updated = await deletionService.update(selectedId, next, note.trim() || undefined, next === 'resolved' ? verification as OwnershipVerification : undefined);
      detail.setData(updated);
      setConfirmed(false);
      setVerification('');
      setNote('');
      await requests.reload();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Hesab silmə müraciətləri" description="İctimai formanın sorğularını yalnız sahiblik ayrıca təsdiqləndikdən sonra icra edin." />
      <div className="toolbar">
        <label className="field"><span>Vəziyyət</span><select value={status} onChange={(event) => { setStatus(event.target.value as DeletionStatus | ''); setPage(1); setSelectedId(null); }}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
      {requests.loading ? <LoadingState /> : null}
      {requests.error ? <ErrorState message={requests.error} onRetry={requests.reload} /> : null}
      {requests.data && requests.data.data.length === 0 ? <EmptyState message="Bu vəziyyətdə müraciət yoxdur." /> : null}
      {requests.data && requests.data.data.length > 0 ? (
        <div className="moderation-grid">
          <section className="moderation-list" aria-label="Silinmə müraciətləri">
            {requests.data.data.map((request) => (
              <button key={request.id} type="button" className={`moderation-list-item ${selectedId === request.id ? 'selected' : ''}`} onClick={() => { setSelectedId(request.id); setNote(''); setVerification(''); setConfirmed(false); setActionError(null); }}>
                <strong>{request.role === 'worker' ? 'İşçi' : 'Müəssisə'} hesabı</strong>
                <span className="moderation-status">{statuses.find((item) => item.value === request.status)?.label}</span>
                <span>{request.account_user_id ? 'Uyğun hesab tapılıb' : 'Uyğun hesab tapılmayıb'}</span>
                <small>{formatDateTime(request.created_at)}</small>
              </button>
            ))}
            <div className="moderation-action-buttons">
              <button className="btn secondary" type="button" disabled={page <= 1} onClick={() => { setPage(page - 1); setSelectedId(null); }}>Əvvəlki</button>
              <span>{page} / {requests.data.meta.total_pages || 1}</span>
              <button className="btn secondary" type="button" disabled={page >= requests.data.meta.total_pages} onClick={() => { setPage(page + 1); setSelectedId(null); }}>Növbəti</button>
            </div>
          </section>
          <section className="panel moderation-detail" aria-label="Müraciət detalları">
            {!selectedId ? <EmptyState message="Müraciət seçin." /> : null}
            {selectedId && detail.loading ? <LoadingState compact /> : null}
            {selectedId && detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : null}
            {detail.data ? (
              <>
                <h2>{detail.data.role === 'worker' ? 'İşçi' : 'Müəssisə'} hesabı</h2>
                <dl className="moderation-fields">
                  <div><dt>Vəziyyət</dt><dd>{statuses.find((item) => item.value === detail.data?.status)?.label}</dd></div>
                  <div><dt>Müraciət kanalı</dt><dd>{detail.data.identifier_kind === 'phone' ? 'Telefon' : 'E-poçt'}</dd></div>
                  <div><dt>Müraciət qeydi</dt><dd>{detail.data.note || 'Qeyd yoxdur'}</dd></div>
                  <div><dt>Uyğun hesab</dt><dd>{detail.data.linked_account ? `${detail.data.linked_account.name} · ${detail.data.linked_account.phone} · ${detail.data.linked_account.email ?? 'E-poçt yoxdur'}` : 'Tapılmadı; hesabı fərziyyə ilə seçməyin.'}</dd></div>
                  {detail.data.resolution_note ? <div><dt>Nəticə qeydi</dt><dd>{detail.data.resolution_note}</dd></div> : null}
                </dl>
                {detail.data.status === 'open' || detail.data.status === 'reviewing' ? (
                  <div className="moderation-actions">
                    <label className="field"><span>Yoxlama / nəticə qeydi</span><textarea value={note} maxLength={1000} rows={3} onChange={(event) => setNote(event.target.value)} /></label>
                    {detail.data.status === 'reviewing' && detail.data.linked_account ? (
                      <>
                        <label className="field"><span>Sahiblik yoxlama üsulu</span><select value={verification} onChange={(event) => setVerification(event.target.value as OwnershipVerification | '')}><option value="">Seçin</option><option value="authenticated_account">Təsdiqlənmiş hesab sessiyası</option><option value="verified_phone_support">Telefonla ayrıca təsdiq</option><option value="verified_email_support">E-poçtla ayrıca təsdiq</option></select></label>
                        <label className="switch-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Sahibliyi ayrıca yoxladım; bu əməliyyat hesabı deaktiv edib şəxsi məlumatları anonimləşdirəcək.</span></label>
                      </>
                    ) : null}
                    {actionError ? <div className="form-error" role="alert">{actionError}</div> : null}
                    <div className="moderation-action-buttons">
                      {detail.data.status === 'open' ? <button className="btn secondary" type="button" disabled={saving} onClick={() => void changeStatus('reviewing')}>Baxışa götür</button> : null}
                      {detail.data.status === 'reviewing' && detail.data.linked_account ? <button className="btn primary" type="button" disabled={saving || !confirmed || !verification || note.trim().length < 3} onClick={() => void changeStatus('resolved')}>Hesabı sil və icra et</button> : null}
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
