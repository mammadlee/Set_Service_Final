import { QrCode } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getErrorMessage } from '../../shared/api/http';
import type { QrTokenResponse } from '../../shared/api/types';
import { PageHeader } from '../../shared/components/PageHeader';
import { appStrings } from '../../shared/i18n/appStrings';
import { formatDateTime } from '../../shared/utils/format';
import { attendanceService } from './attendance.service';

export function QrTokensPage() {
  const [assignmentId, setAssignmentId] = useState('');
  const [activeAssignmentId, setActiveAssignmentId] = useState('');
  const [qr, setQr] = useState<QrTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    if (!activeAssignmentId) return undefined;
    const interval = window.setInterval(() => {
      void generate(activeAssignmentId, true);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [activeAssignmentId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextAssignmentId = assignmentId.trim();
    setActiveAssignmentId(nextAssignmentId);
    await generate(nextAssignmentId);
  }

  async function generate(nextAssignmentId: string, silent = false) {
    if (!nextAssignmentId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    if (!silent) setQr(null);

    try {
      setQr(await attendanceService.generateQrToken(nextAssignmentId, 60));
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title={appStrings.qr.title}
        description={appStrings.qr.description}
      />

      <section className="split-layout">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>{appStrings.qr.generateTitle}</h2>
              <p>{appStrings.qr.generateDescription}</p>
            </div>
            <QrCode size={20} />
          </div>
          <form className="form-stack" onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span>{appStrings.qr.assignmentId}</span>
              <input value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} required />
            </label>
            {error ? <div className="form-error">{error}</div> : null}
            <button className="btn primary full" type="submit" disabled={loading || assignmentId.trim().length < 10}>
              {loading ? appStrings.qr.generating : appStrings.qr.generate}
            </button>
          </form>
        </div>

        <div className="panel dynamic-qr-panel">
          <div className="panel-heading">
            <div>
              <h2>{appStrings.qr.displayTitle}</h2>
              <p>{appStrings.qr.displayDescription}</p>
            </div>
          </div>
          {qr ? (
            <>
              <div className="qr-display-frame" aria-label={appStrings.qr.displayTitle}>
                <QRCodeSVG value={qr.token} size={320} level="M" includeMargin />
              </div>
              <dl className="detail-list">
                <dt>{appStrings.qr.assignment}</dt><dd>{qr.assignment_id}</dd>
                <dt>{appStrings.qr.order}</dt><dd>{qr.order_title ?? qr.order_id}</dd>
                <dt>{appStrings.company}</dt><dd>{qr.company_name ?? qr.company_id ?? appStrings.notAvailable}</dd>
                <dt>{appStrings.qr.expires}</dt><dd>{formatDateTime(qr.expires_at)}</dd>
                <dt>{appStrings.qr.refreshesEvery}</dt><dd>30 saniyə</dd>
                {lastUpdated ? <><dt>{appStrings.qr.lastUpdated}</dt><dd>{formatDateTime(lastUpdated)}</dd></> : null}
              </dl>
              {refreshing ? <p className="muted">{appStrings.qr.refreshing}</p> : null}
              <p className="muted">{appStrings.qr.manualFallback}</p>
              <textarea className="token-box" value={qr.token} readOnly rows={6} />
              <button className="btn secondary" type="button" onClick={() => void navigator.clipboard.writeText(qr.token)}>
                {appStrings.qr.copyToken}
              </button>
            </>
          ) : (
            <p className="muted">{appStrings.qr.empty}</p>
          )}
        </div>
      </section>
    </>
  );
}
