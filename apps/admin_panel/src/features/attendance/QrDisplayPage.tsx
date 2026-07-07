import { Copy, ExternalLink, Power, QrCode, TabletSmartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { resolveKioskUrl } from '../../shared/api/config';
import { getErrorMessage } from '../../shared/api/http';
import type { VenueKioskResponse } from '../../shared/api/types';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings } from '../../shared/i18n/appStrings';
import { formatDateTime } from '../../shared/utils/format';
import { companiesService } from '../companies/companies.service';
import { ordersService } from '../orders/orders.service';
import { attendanceService } from './attendance.service';

export function QrDisplayPage() {
  const [companyId, setCompanyId] = useState('');
  const [kioskId, setKioskId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [kioskName, setKioskName] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [result, setResult] = useState<VenueKioskResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const companies = useAsync(
    () => companiesService.list({ page: 1, limit: 100, status: 'approved' }),
    [],
  );
  const orders = useAsync(
    () => ordersService.list({ page: 1, limit: 100, status: 'active' }),
    [],
  );
  const kiosks = useAsync(
    () => attendanceService.listVenueKiosks(companyId || undefined),
    [companyId],
  );

  const selectedCompany = companies.data?.data.find((company) => company.id === companyId);
  const companyKiosks = useMemo(
    () => (kiosks.data?.data ?? []).filter((kiosk) => !companyId || kiosk.company_id === companyId),
    [kiosks.data, companyId],
  );
  const companyOrders = useMemo(
    () => (orders.data?.data ?? []).filter((order) => !companyId || order.company_id === companyId),
    [orders.data, companyId],
  );
  const selectedKiosk = companyKiosks.find((kiosk) => kiosk.id === kioskId);
  const selectedOrder = companyOrders.find((order) => order.id === orderId);
  const kioskUrl = result?.kiosk_url
    ? resolveKioskUrl(result.kiosk_url)
    : selectedKiosk?.kiosk_url
      ? resolveKioskUrl(selectedKiosk.kiosk_url)
      : '';

  async function createKiosk() {
    if (!companyId || !kioskName.trim()) return;
    setLoading(true);
    clearFeedback();

    try {
      const created = await attendanceService.createVenueKiosk({
        company_id: companyId,
        name: kioskName.trim(),
        ...(locationLabel.trim() ? { location_label: locationLabel.trim() } : {}),
      });
      setResult(created);
      setKioskId(created.id);
      setMessage('Kiosk yaradıldı. Link sabit qalacaq.');
      await kiosks.reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function activateKiosk() {
    if (!kioskId || !orderId) return;
    setLoading(true);
    clearFeedback();

    try {
      const activated = await attendanceService.activateVenueKiosk(kioskId, { order_id: orderId });
      setResult(activated);
      setMessage('QR ekranı seçilmiş sifariş üçün aktiv edildi.');
      await kiosks.reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function deactivateKiosk() {
    const id = result?.id || kioskId;
    if (!id) return;
    setLoading(true);
    clearFeedback();

    try {
      const deactivated = await attendanceService.deactivateVenueKiosk(id);
      setResult(deactivated);
      setMessage('QR ekranı deaktiv edildi.');
      await kiosks.reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function copyKioskLink() {
    if (!kioskUrl) return;
    await navigator.clipboard.writeText(kioskUrl);
    setMessage('QR ekranı linki kopyalandı.');
  }

  function openKioskLink() {
    if (!kioskUrl) return;
    window.open(kioskUrl, '_blank', 'noopener,noreferrer');
  }

  function onCompanyChange(value: string) {
    setCompanyId(value);
    setKioskId('');
    setOrderId('');
    setResult(null);
    clearFeedback();
  }

  function clearFeedback() {
    setError(null);
    setMessage(null);
  }

  return (
    <>
      <PageHeader
        title="Venue QR kioskları"
        description="Hər tablet üçün sabit kiosk linki yaradın. Admin yalnız həmin kioskda hansı aktiv sifarişin göstəriləcəyini dəyişir."
      />

      <section className="split-layout">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Kiosk yarat</h2>
              <p>Tablet və ya brauzer üçün bir dəfəlik sabit link yaradılır.</p>
            </div>
            <TabletSmartphone size={20} />
          </div>

          {companies.loading ? <LoadingState compact /> : null}
          {companies.error ? <ErrorState message={companies.error} onRetry={companies.reload} /> : null}

          <div className="form-stack">
            <label className="field">
              <span>Müəssisə</span>
              <select value={companyId} onChange={(event) => onCompanyChange(event.target.value)}>
                <option value="">Müəssisə seçin</option>
                {companies.data?.data.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Kiosk adı</span>
              <input
                value={kioskName}
                onChange={(event) => setKioskName(event.target.value)}
                placeholder="Hilton əsas giriş"
              />
            </label>

            <label className="field">
              <span>Məkan etiketi</span>
              <input
                value={locationLabel}
                onChange={(event) => setLocationLabel(event.target.value)}
                placeholder="Lobby / əsas giriş"
              />
            </label>

            <button className="btn primary full" type="button" disabled={loading || !companyId || !kioskName.trim()} onClick={() => void createKiosk()}>
              Kiosk yarat
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>QR-ı aktiv et</h2>
              <p>Bu QR ekranı seçilmiş sifariş üzrə təyin olunmuş və işi qəbul etmiş işçilər üçün aktiv olacaq.</p>
            </div>
            <QrCode size={20} />
          </div>

          {kiosks.loading || orders.loading ? <LoadingState compact /> : null}
          {kiosks.error ? <ErrorState message={kiosks.error} onRetry={kiosks.reload} /> : null}
          {orders.error ? <ErrorState message={orders.error} onRetry={orders.reload} /> : null}
          {companyId && !kiosks.loading && companyKiosks.length === 0 ? (
            <EmptyState message="Bu müəssisə üçün hələ kiosk yaradılmayıb." />
          ) : null}

          <div className="form-stack">
            <label className="field">
              <span>Kiosk / tablet</span>
              <select
                value={kioskId}
                onChange={(event) => {
                  setKioskId(event.target.value);
                  setResult(companyKiosks.find((kiosk) => kiosk.id === event.target.value) ?? null);
                  clearFeedback();
                }}
                disabled={!companyId}
              >
                <option value="">Kiosk seçin</option>
                {companyKiosks.map((kiosk) => (
                  <option key={kiosk.id} value={kiosk.id}>
                    {kiosk.kiosk_name || kiosk.name} {kiosk.active_session ? `- ${kiosk.active_session.order_title}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Aktiv sifariş / növbə</span>
              <select value={orderId} onChange={(event) => setOrderId(event.target.value)} disabled={!companyId}>
                <option value="">Sifariş seçin</option>
                {companyOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.title} - {formatDateTime(order.start_datetime)}
                  </option>
                ))}
              </select>
            </label>

            {selectedCompany && selectedKiosk ? (
              <div className="inline-note">
                {selectedCompany.name} / {selectedKiosk.kiosk_name || selectedKiosk.name}
              </div>
            ) : null}

            {error ? <div className="form-error">{error}</div> : null}
            {message ? <div className="form-success">{message}</div> : null}

            <button className="btn primary full" type="button" disabled={loading || !kioskId || !orderId} onClick={() => void activateKiosk()}>
              Bu kioskda QR-ı aktiv et
            </button>
          </div>
        </div>
      </section>

      <section className="panel kiosk-result-panel">
        <div className="panel-heading">
          <div>
            <h2>QR ekranı hazırdır</h2>
            <p>Bu linki girişdəki tablet və ya brauzerdə açın. İşçilər mobil tətbiqdən QR kodu oxudaraq giriş-çıxış edəcəklər.</p>
          </div>
          <QrCode size={20} />
        </div>

        {result || selectedKiosk ? (
          <>
            <dl className="detail-list">
              <dt>Müəssisə</dt><dd>{result?.company_name || selectedKiosk?.company_name || selectedCompany?.name || appStrings.notAvailable}</dd>
              <dt>Kiosk</dt><dd>{result?.kiosk_name || result?.name || selectedKiosk?.kiosk_name || selectedKiosk?.name}</dd>
              <dt>Sifariş</dt><dd>{result?.active_session?.order_title || selectedOrder?.title || selectedKiosk?.active_session?.order_title || 'Admin tərəfindən aktiv ediləcək'}</dd>
              <dt>Link</dt><dd className="break-word">{kioskUrl || 'Link yalnız kiosk yaradıldıqdan sonra göstərilir.'}</dd>
            </dl>

            <div className="action-row wrap">
              <button className="btn secondary" type="button" disabled={!kioskUrl} onClick={() => void copyKioskLink()}>
                <Copy size={16} />
                Linki kopyala
              </button>
              <button className="btn primary" type="button" disabled={!kioskUrl} onClick={openKioskLink}>
                <ExternalLink size={16} />
                QR ekranını aç
              </button>
              <button className="btn danger" type="button" disabled={loading || !(result || selectedKiosk)} onClick={() => void deactivateKiosk()}>
                <Power size={16} />
                Deaktiv et
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Kiosk yaradın və ya mövcud kiosk seçin.</p>
        )}
      </section>
    </>
  );
}
