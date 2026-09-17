import { Copy, ExternalLink, Power, QrCode, TabletSmartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { resolveKioskUrl } from '../../shared/api/config';
import { getErrorMessage } from '../../shared/api/http';
import type { VenueKioskResponse } from '../../shared/api/types';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings } from '../../shared/i18n/appStrings';
import { formatDateTime } from '../../shared/utils/format';
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

  const eligibleOrders = useAsync(
    () => attendanceService.listKioskEligibleOrders(),
    [],
  );
  const kiosks = useAsync(
    () => companyId
      ? attendanceService.listVenueKiosks(companyId)
      : Promise.resolve({ data: [] }),
    [companyId],
  );

  const eligibleCompanies = useMemo(() => {
    const companiesById = new Map<string, { id: string; name: string }>();
    for (const order of eligibleOrders.data?.data ?? []) {
      companiesById.set(order.company.id, order.company);
    }
    return [...companiesById.values()].sort((left, right) => left.name.localeCompare(right.name, 'az'));
  }, [eligibleOrders.data]);
  const selectedCompany = eligibleCompanies.find((company) => company.id === companyId);
  const companyKiosks = useMemo(
    () => (kiosks.data?.data ?? []).filter((kiosk) => !companyId || kiosk.company_id === companyId),
    [kiosks.data, companyId],
  );
  const companyOrders = useMemo(
    () => (eligibleOrders.data?.data ?? []).filter((order) => order.company_id === companyId),
    [eligibleOrders.data, companyId],
  );
  const selectedKiosk = companyKiosks.find((kiosk) => kiosk.id === kioskId);
  const selectedOrder = companyOrders.find((order) => order.id === orderId);
  const kioskUrl = result?.kiosk_url
    ? resolveKioskUrl(result.kiosk_url)
    : selectedKiosk?.kiosk_url
      ? resolveKioskUrl(selectedKiosk.kiosk_url)
      : '';

  useEffect(() => {
    if (!companyId || !eligibleOrders.data) return;
    if (eligibleCompanies.some((company) => company.id === companyId)) return;
    setCompanyId('');
    setKioskId('');
    setOrderId('');
    setResult(null);
  }, [companyId, eligibleCompanies, eligibleOrders.data]);

  async function createKiosk() {
    if (!selectedCompany || companyOrders.length === 0 || !kioskName.trim()) {
      setError('QR yaratmaq üçün aktiv sifariş yoxdur.');
      return;
    }
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
      await eligibleOrders.reload();
    } finally {
      setLoading(false);
    }
  }

  async function activateKiosk() {
    if (!kioskId || !selectedOrder || selectedOrder.company_id !== companyId) {
      setError('QR yaratmaq üçün aktiv sifariş yoxdur.');
      return;
    }
    setLoading(true);
    clearFeedback();

    try {
      const activated = await attendanceService.activateVenueKiosk(kioskId, { order_id: orderId });
      setResult(activated);
      setMessage('QR ekranı seçilmiş sifariş üçün aktiv edildi.');
      await kiosks.reload();
    } catch (err) {
      setError(getErrorMessage(err));
      setOrderId('');
      await eligibleOrders.reload();
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
    try {
      await navigator.clipboard.writeText(kioskUrl);
      setMessage('QR ekranı linki köçürüldü.');
    } catch {
      setError('Link avtomatik köçürülmədi. Aşağıdakı keçidi seçib köçürün.');
    }
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
        title="Məkan QR kioskları"
        description="Hər tablet üçün sabit kiosk linki yaradın və göstəriləcək aktiv sifarişi seçin. Müəssisə də mobil tətbiqdən öz sifarişinin QR ekranını idarə edə bilər."
      />

      {!eligibleOrders.loading && !eligibleOrders.error && eligibleOrders.data?.data.length === 0 ? (
        <section className="panel">
          <EmptyState message="QR yaratmaq üçün aktiv sifariş yoxdur." />
        </section>
      ) : null}

      <section className="split-layout">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Kiosk yarat</h2>
              <p>Tablet və ya brauzer üçün dəyişməyən sabit link yaradılır.</p>
            </div>
            <TabletSmartphone size={20} />
          </div>

          {eligibleOrders.loading ? <LoadingState compact /> : null}
          {eligibleOrders.error ? <ErrorState message={eligibleOrders.error} onRetry={eligibleOrders.reload} /> : null}

          <div className="form-stack">
            <label className="field">
              <span>Müəssisə</span>
              <select
                value={companyId}
                onChange={(event) => onCompanyChange(event.target.value)}
                disabled={eligibleOrders.loading || eligibleCompanies.length === 0}
              >
                <option value="">Müəssisə seçin</option>
                {eligibleCompanies.map((company) => (
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
                disabled={!selectedCompany}
              />
            </label>

            <label className="field">
              <span>Məkan etiketi</span>
              <input
                value={locationLabel}
                onChange={(event) => setLocationLabel(event.target.value)}
                placeholder="Lobbi / əsas giriş"
                disabled={!selectedCompany}
              />
            </label>

            <button className="btn primary full" type="button" disabled={loading || !selectedCompany || companyOrders.length === 0 || !kioskName.trim()} onClick={() => void createKiosk()}>
              Kiosk yarat
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>QR ekranını aktiv et</h2>
              <p>Aktiv sifariş üçün QR əvvəlcədən yaradıla bilər. Giriş-çıxış yalnız həmin sifarişə təyin olunmuş və işi qəbul etmiş işçilər üçün mümkündür.</p>
            </div>
            <QrCode size={20} />
          </div>

          {kiosks.loading || eligibleOrders.loading ? <LoadingState compact /> : null}
          {kiosks.error ? <ErrorState message={kiosks.error} onRetry={kiosks.reload} /> : null}
          {eligibleOrders.error ? <ErrorState message={eligibleOrders.error} onRetry={eligibleOrders.reload} /> : null}
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
              <span>Aktiv sifariş və ya növbə</span>
              <select value={orderId} onChange={(event) => setOrderId(event.target.value)} disabled={!companyId || companyOrders.length === 0}>
                <option value="">Sifariş seçin</option>
                {companyOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.title} - {formatDateTime(order.start_datetime)}
                  </option>
                ))}
              </select>
            </label>

            {companyId && !eligibleOrders.loading && companyOrders.length === 0 ? (
              <EmptyState message="QR yaratmaq üçün aktiv sifariş yoxdur." />
            ) : null}

            {selectedCompany && selectedKiosk ? (
              <div className="inline-note">
                {selectedCompany.name} / {selectedKiosk.kiosk_name || selectedKiosk.name}
              </div>
            ) : null}

            {error ? <div className="form-error">{error}</div> : null}
            {message ? <div className="form-success">{message}</div> : null}

            <button className="btn primary full" type="button" disabled={loading || !kioskId || !selectedOrder} onClick={() => void activateKiosk()}>
              Bu kioskda QR ekranını aktiv et
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
              <dt>Sifariş</dt><dd>{result?.active_session?.order_title || selectedOrder?.title || selectedKiosk?.active_session?.order_title || 'Aktiv sifariş seçilməlidir'}</dd>
              <dt>Link</dt><dd className="break-word">{kioskUrl || 'Link yalnız kiosk yaradıldıqdan sonra göstərilir.'}</dd>
            </dl>

            <div className="action-row wrap">
              <button className="btn secondary" type="button" disabled={!kioskUrl} onClick={() => void copyKioskLink()}>
                <Copy size={16} />
                Linki köçür
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
