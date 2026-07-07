import QRCode from 'qrcode';
import './styles.css';

type KioskContext = {
  id: string;
  kiosk_id?: string;
  assignment_id?: string | null;
  order_id?: string | null;
  order_title?: string | null;
  company_id: string;
  company_name: string;
  name?: string | null;
  kiosk_name?: string | null;
  location_label?: string | null;
  location?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  category?: string | null;
  status: string;
  kiosk_status: string;
  expires_at?: string | null;
  refresh_interval_seconds: number;
  active_session?: {
    id: string;
    order_id: string;
    order_title: string;
    location?: string | null;
    shift_start?: string | null;
    shift_end?: string | null;
    expires_at?: string | null;
  } | null;
};

type KioskQrResponse = KioskContext & {
  token: string;
  expires_at: string;
  refresh_after_seconds: number;
};

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  (import.meta.env.PROD ? `${window.location.origin}/v1` : 'http://localhost:3000/v1');

const token = readKioskToken();
const elements = {
  companyName: byId('companyName'),
  orderTitle: byId('orderTitle'),
  locationText: byId('locationText'),
  shiftText: byId('shiftText'),
  categoryText: byId('categoryText'),
  qrImage: byId<HTMLImageElement>('qrImage'),
  qrPlaceholder: byId('qrPlaceholder'),
  qrCard: byId('qrCard'),
  statusBadge: byId('statusBadge'),
  countdownValue: byId('countdownValue'),
  countdownText: byId('countdownText'),
  networkText: byId('networkText'),
  fullscreenButton: byId<HTMLButtonElement>('fullscreenButton'),
};

let currentContext: KioskContext | null = null;
let qrExpiresAt = 0;
let refreshTimeout: number | undefined;
let tickInterval: number | undefined;
let retryTimeout: number | undefined;
let contextPollTimeout: number | undefined;
let retryDelay = 1500;
let inFlight = false;

elements.fullscreenButton.addEventListener('click', () => {
  void document.documentElement.requestFullscreen?.();
});

if (!token) {
  setInactiveState('Bu QR ekranı deaktiv edilib');
} else {
  void boot();
}

async function boot() {
  startTicking();
  await loadContext();
}

async function loadContext() {
  if (!token) return;

  try {
    const context = await requestJson<KioskContext>(
      `/attendance/venue-kiosks/${encodeURIComponent(token)}`
    );
    currentContext = context;
    renderContext(context);
    retryDelay = 1500;

    if (context.kiosk_status === 'disabled' || context.status === 'disabled') {
      setInactiveState('Bu QR ekranı deaktiv edilib');
      return;
    }

    if (!getActiveSession(context)) {
      setWaitingState();
      scheduleContextPoll();
      return;
    }

    setStatus('active', 'Aktiv');
    await refreshQr();
  } catch (error) {
    handleRequestError(error);
    scheduleContextPoll();
  }
}

async function refreshQr() {
  if (!token || inFlight) return;
  inFlight = true;
  clearTimeout(refreshTimeout);
  clearTimeout(retryTimeout);

  try {
    const qr = await requestJson<KioskQrResponse>(
      `/attendance/venue-kiosks/${encodeURIComponent(token)}/qr-token`,
      { method: 'POST' }
    );
    currentContext = qr;
    renderContext(qr);
    await renderQr(qr.token);
    qrExpiresAt = new Date(qr.expires_at).getTime();
    retryDelay = 1500;
    setStatus('active', 'Aktiv');
    scheduleRefresh(qr.refresh_after_seconds);
    scheduleContextPoll();
    updateCountdown();
  } catch (error) {
    handleRequestError(error);
    scheduleRetry();
  } finally {
    inFlight = false;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : response.status === 410
          ? 'Bu QR ekranı deaktiv edilib'
          : response.status === 409
            ? 'QR ekranı hazır deyil'
            : 'Şəbəkə bağlantısı yoxlanılır';
    throw new KioskError(message, response.status);
  }

  return payload as T;
}

async function renderQr(value: string) {
  const dataUrl = await QRCode.toDataURL(value, {
    width: 420,
    margin: 2,
    color: {
      dark: '#1E1B18',
      light: '#FFF8F0',
    },
    errorCorrectionLevel: 'M',
  });

  elements.qrImage.src = dataUrl;
  elements.qrImage.classList.remove('visible', 'refreshed');
  void elements.qrImage.offsetWidth;
  elements.qrImage.classList.add('visible', 'refreshed');
  elements.qrPlaceholder.classList.add('hidden');
}

function renderContext(context: KioskContext) {
  const activeSession = getActiveSession(context);
  elements.companyName.textContent = context.company_name || 'SET Service';
  elements.orderTitle.textContent = activeSession?.order_title || context.order_title || 'Admin tərəfindən aktiv ediləcək';
  elements.locationText.textContent =
    activeSession?.location || context.location || context.location_label || '-';
  elements.shiftText.textContent = formatShift(
    activeSession?.shift_start || context.shift_start,
    activeSession?.shift_end || context.shift_end,
  );
  elements.categoryText.textContent = context.category || context.kiosk_name || context.name || '-';
}

function scheduleRefresh(refreshAfterSeconds: number) {
  const safeSeconds = Number.isFinite(refreshAfterSeconds) && refreshAfterSeconds > 0
    ? refreshAfterSeconds
    : 30;
  const nextRefreshMs = Math.max(1000, safeSeconds * 1000 - 1200);
  refreshTimeout = window.setTimeout(() => {
    void refreshQr();
  }, nextRefreshMs);
}

function scheduleRetry() {
  retryTimeout = window.setTimeout(() => {
    void refreshQr();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 1.7, 15000);
}

function scheduleContextPoll() {
  clearTimeout(contextPollTimeout);
  contextPollTimeout = window.setTimeout(() => {
    void loadContext();
  }, 8000);
}

function startTicking() {
  clearInterval(tickInterval);
  tickInterval = window.setInterval(updateCountdown, 1000);
}

function updateCountdown() {
  if (!qrExpiresAt) {
    elements.countdownValue.textContent = currentContext && !getActiveSession(currentContext) ? '0' : '30';
    elements.countdownText.textContent = currentContext && !getActiveSession(currentContext)
      ? 'Admin tərəfindən aktiv ediləcək'
      : 'QR 30 saniyədən sonra yenilənəcək';
    return;
  }

  const remaining = Math.max(0, Math.ceil((qrExpiresAt - Date.now()) / 1000));
  elements.countdownValue.textContent = String(remaining);
  elements.countdownText.textContent = `QR ${remaining} saniyədən sonra yenilənəcək`;

  if (remaining === 0) {
    clearQrIfExpired();
  }
}

function clearQrIfExpired() {
  if (!qrExpiresAt || Date.now() < qrExpiresAt) return;
  elements.qrImage.removeAttribute('src');
  elements.qrImage.classList.remove('visible', 'refreshed');
  elements.qrPlaceholder.textContent = 'QR yenilənir';
  elements.qrPlaceholder.classList.remove('hidden');
  setStatus('warning', 'Yenilənir');
}

function handleRequestError(error: unknown) {
  const message = error instanceof KioskError ? error.message : 'Şəbəkə bağlantısı yoxlanılır';
  if (error instanceof KioskError && (error.status === 404 || error.status === 410)) {
    setInactiveState('Bu QR ekranı deaktiv edilib');
    return;
  }
  if (error instanceof KioskError && error.status === 409) {
    setWaitingState();
    return;
  }

  setStatus('warning', 'Bağlantı yoxlanılır');
  elements.networkText.textContent = message;
  if (!qrExpiresAt || Date.now() >= qrExpiresAt) {
    clearQrIfExpired();
  }
}

function setStatus(kind: 'active' | 'warning' | 'inactive', text: string) {
  elements.statusBadge.textContent = text;
  elements.qrCard.dataset.status = kind;
  elements.networkText.textContent =
    kind === 'active'
      ? 'QR kod aktivdir'
      : kind === 'inactive'
        ? 'Bu QR ekranı deaktiv edilib'
        : 'Şəbəkə bağlantısı yoxlanılır';
}

function setInactiveState(message: string) {
  clearTimeout(refreshTimeout);
  clearTimeout(retryTimeout);
  clearTimeout(contextPollTimeout);
  qrExpiresAt = 0;
  elements.qrImage.removeAttribute('src');
  elements.qrImage.classList.remove('visible');
  elements.qrPlaceholder.textContent = message;
  elements.qrPlaceholder.classList.remove('hidden');
  elements.countdownValue.textContent = '0';
  elements.countdownText.textContent = message;
  setStatus('inactive', 'Deaktiv');
}

function setWaitingState() {
  clearTimeout(refreshTimeout);
  qrExpiresAt = 0;
  elements.qrImage.removeAttribute('src');
  elements.qrImage.classList.remove('visible', 'refreshed');
  elements.qrPlaceholder.textContent = 'QR ekranı hazır deyil';
  elements.qrPlaceholder.classList.remove('hidden');
  elements.countdownValue.textContent = '0';
  elements.countdownText.textContent = 'Admin tərəfindən aktiv ediləcək';
  setStatus('warning', 'Gözləyir');
  elements.networkText.textContent = 'Admin tərəfindən aktiv ediləcək';
}

function getActiveSession(context: KioskContext) {
  return context.active_session ?? null;
}

function readKioskToken(): string | null {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const routeIndex = Math.max(parts.lastIndexOf('qr-kiosk'), parts.lastIndexOf('kiosk'));
  if (routeIndex >= 0 && parts[routeIndex + 1]) {
    return decodeURIComponent(parts[routeIndex + 1]);
  }
  return parts.at(-1) ? decodeURIComponent(parts.at(-1)!) : null;
}

function formatShift(start?: string | null, end?: string | null): string {
  if (!start && !end) return '-';
  const formatter = new Intl.DateTimeFormat('az-Latn-AZ', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const startText = start ? formatter.format(new Date(start)) : '-';
  const endText = end ? formatter.format(new Date(end)) : '-';
  return `${startText} - ${endText}`;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

class KioskError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'KioskError';
  }
}
