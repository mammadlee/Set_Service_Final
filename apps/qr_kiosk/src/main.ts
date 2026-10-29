import QRCode from 'qrcode';
import { resolveApiBaseUrl, resolveAppTimeZone } from './config';
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
  qr_available?: boolean;
  checkout_only?: boolean;
  selection_required?: boolean;
  eligible_orders?: KioskOrderOption[];
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

type KioskOrderOption = {
  id: string;
  title: string;
  status: string;
  company_id: string;
  location?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  checkout_only?: boolean;
};

type KioskQrResponse = KioskContext & {
  token: string;
  expires_at: string;
  refresh_after_seconds: number;
};

const API_BASE = resolveApiBaseUrl();
const APP_TIME_ZONE = resolveAppTimeZone();

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
  currentDateTime: byId<HTMLTimeElement>('currentDateTime'),
  connectionBadge: byId('connectionBadge'),
  connectionText: byId('connectionText'),
  shiftSelector: byId('shiftSelector'),
  orderSelect: byId<HTMLSelectElement>('orderSelect'),
  selectOrderButton: byId<HTMLButtonElement>('selectOrderButton'),
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
let contextInFlight = false;
let selectionInFlight = false;
let permanentlyInactive = false;
let waitingForShift = false;
let requestGeneration = 0;
let waitingMessage = 'QR ekranı üçün aktiv sifariş seçilməlidir.';

elements.fullscreenButton.addEventListener('click', () => {
  void document.documentElement.requestFullscreen?.();
});
elements.selectOrderButton.addEventListener('click', () => {
  void selectOrder();
});
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pagehide', handlePageHide);
window.addEventListener('pageshow', handlePageShow);
window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);

if (!token) {
  setInactiveState('QR keçidi etibarsızdır.');
} else {
  if (document.visibilityState !== 'visible') {
    hideQrForScreenLock();
  } else {
    void boot();
  }
}

async function boot() {
  startTicking();
  updateClock();
  updateConnectionState(hasNetworkConnection() ? 'checking' : 'offline');
  await loadContext();
}

async function loadContext() {
  if (!token || permanentlyInactive || contextInFlight) return;
  contextInFlight = true;

  try {
    const context = await requestJson<KioskContext>('/attendance/venue-kiosks/context');
    if (document.visibilityState !== 'visible' || permanentlyInactive) return;
    currentContext = context;
    renderContext(context);
    updateConnectionState('online');
    retryDelay = 1500;

    if (context.kiosk_status === 'disabled' || context.status === 'disabled') {
      setInactiveState('Bu QR ekranı deaktiv edilib');
      return;
    }

    if (!getActiveSession(context)) {
      setWaitingState(context.selection_required
        ? 'Davam etmək üçün aktiv növbəni seçin.'
        : 'Hazırda aktiv növbə yoxdur. Ekran avtomatik yenilənəcək.');
      scheduleContextPoll();
      return;
    }

    if (context.qr_available === false) {
      setWaitingState('Növbə başlanğıc vaxtında QR avtomatik açılacaq.');
      scheduleContextPoll();
      return;
    }

    waitingForShift = false;
    setStatus('active', 'Aktiv');
    await refreshQr();
  } catch (error) {
    if (handleRequestError(error) !== 'stop') scheduleContextPoll();
  } finally {
    contextInFlight = false;
  }
}

async function refreshQr() {
  if (!token || inFlight || permanentlyInactive) return;
  inFlight = true;
  const generation = requestGeneration;
  clearTimeout(refreshTimeout);
  clearTimeout(retryTimeout);

  try {
    const qr = await requestJson<KioskQrResponse>(
      '/attendance/venue-kiosks/qr-token',
      { method: 'POST' }
    );
    if (document.visibilityState !== 'visible' || permanentlyInactive || generation !== requestGeneration) return;
    const expiresAt = new Date(qr.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !qr.token?.trim()) {
      setWaitingState('QR müddəti bitib. Yenilənir…');
      scheduleContextPoll();
      return;
    }
    currentContext = {
      ...(currentContext ?? {} as KioskContext),
      ...qr,
      eligible_orders: currentContext?.eligible_orders ?? qr.eligible_orders,
      selection_required: currentContext?.selection_required ?? qr.selection_required,
    };
    renderContext(currentContext);
    await renderQr(qr.token, generation);
    if (document.visibilityState !== 'visible' || permanentlyInactive || generation !== requestGeneration) return;
    qrExpiresAt = expiresAt;
    waitingForShift = false;
    retryDelay = 1500;
    updateConnectionState('online');
    setStatus('active', 'Aktiv');
    scheduleRefresh(qr.refresh_after_seconds);
    scheduleContextPoll();
    updateCountdown();
  } catch (error) {
    if (generation !== requestGeneration || permanentlyInactive) return;
    const recovery = handleRequestError(error);
    if (recovery === 'retry') scheduleRetry();
    if (recovery === 'wait') scheduleContextPoll();
  } finally {
    inFlight = false;
    if (generation !== requestGeneration && !permanentlyInactive) scheduleContextPoll();
  }
}

async function selectOrder() {
  if (!token || selectionInFlight || permanentlyInactive) return;
  const orderId = elements.orderSelect.value;
  if (!orderId) return;

  selectionInFlight = true;
  elements.selectOrderButton.disabled = true;
  elements.selectOrderButton.textContent = 'Açılır…';
  requestGeneration += 1;
  clearTimeout(refreshTimeout);
  clearTimeout(retryTimeout);
  clearVisibleQr('Növbə dəyişdirilir');
  setStatus('warning', 'Növbə açılır');

  try {
    const context = await requestJson<KioskContext>('/attendance/venue-kiosks/select-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_id: orderId }),
    });
    if (document.visibilityState !== 'visible' || permanentlyInactive) return;
    currentContext = context;
    renderContext(context);
    retryDelay = 1500;
    updateConnectionState('online');
    await refreshQr();
  } catch (error) {
    const recovery = handleRequestError(error);
    if (recovery !== 'stop') scheduleContextPoll();
  } finally {
    selectionInFlight = false;
    elements.selectOrderButton.disabled = false;
    elements.selectOrderButton.textContent = 'Növbəni aç';
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15000),
    headers: {
      accept: 'application/json',
      'cache-control': 'no-store',
      ...(token ? { 'x-kiosk-capability': token } : {}),
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
    throw new KioskError(message, response.status, typeof payload?.code === 'string' ? payload.code : undefined);
  }

  return payload as T;
}

async function renderQr(value: string, generation: number) {
  const dataUrl = await QRCode.toDataURL(value, {
    width: 420,
    margin: 2,
    color: {
      dark: '#1E1B18',
      light: '#FFF8F0',
    },
    errorCorrectionLevel: 'M',
  });

  if (document.visibilityState !== 'visible' || permanentlyInactive || generation !== requestGeneration) return;
  elements.qrImage.src = dataUrl;
  elements.qrImage.classList.remove('visible', 'refreshed');
  void elements.qrImage.offsetWidth;
  elements.qrImage.classList.add('visible', 'refreshed');
  elements.qrPlaceholder.classList.add('hidden');
}

function renderContext(context: KioskContext) {
  const activeSession = getActiveSession(context);
  elements.companyName.textContent = context.company_name || 'SET Service';
  elements.orderTitle.textContent = activeSession?.order_title || context.order_title || 'Aktiv sifariş gözlənilir';
  elements.locationText.textContent =
    activeSession?.location || context.location || context.location_label || '-';
  elements.shiftText.textContent = formatShift(
    activeSession?.shift_start || context.shift_start,
    activeSession?.shift_end || context.shift_end,
  );
  elements.categoryText.textContent = context.category || context.kiosk_name || context.name || '-';
  renderOrderSelector(context);
}

function renderOrderSelector(context: KioskContext) {
  const orders = context.eligible_orders ?? [];
  const activeOrderId = getActiveSession(context)?.order_id ?? context.order_id ?? null;
  const shouldShow = orders.length > 1
    || Boolean(context.selection_required)
    || Boolean(context.checkout_only && orders.some((order) => order.id !== activeOrderId));

  elements.shiftSelector.hidden = !shouldShow;
  elements.orderSelect.replaceChildren();
  for (const order of orders) {
    const option = document.createElement('option');
    option.value = order.id;
    option.textContent = `${order.title} — ${formatShift(order.shift_start, order.shift_end)}${order.checkout_only ? ' (yalnız çıxış)' : ''}`;
    option.selected = order.id === activeOrderId;
    elements.orderSelect.append(option);
  }
  if (orders.length > 0 && !elements.orderSelect.value) elements.orderSelect.value = orders[0]!.id;
  elements.selectOrderButton.disabled = selectionInFlight || orders.length === 0;
}

function scheduleRefresh(refreshAfterSeconds: number) {
  if (document.visibilityState !== 'visible' || permanentlyInactive) return;
  const safeSeconds = Number.isFinite(refreshAfterSeconds) && refreshAfterSeconds > 0
    ? refreshAfterSeconds
    : 30;
  const nextRefreshMs = Math.max(1000, safeSeconds * 1000 - 1200);
  refreshTimeout = window.setTimeout(() => {
    void refreshQr();
  }, nextRefreshMs);
}

function scheduleRetry() {
  if (document.visibilityState !== 'visible' || permanentlyInactive) return;
  retryTimeout = window.setTimeout(() => {
    void refreshQr();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 1.7, 15000);
}

function scheduleContextPoll() {
  if (document.visibilityState !== 'visible' || permanentlyInactive) return;
  clearTimeout(contextPollTimeout);
  contextPollTimeout = window.setTimeout(() => {
    void loadContext();
  }, 8000);
}

function startTicking() {
  clearInterval(tickInterval);
  tickInterval = window.setInterval(() => {
    updateCountdown();
    updateClock();
  }, 1000);
}

function updateClock() {
  const now = new Date();
  elements.currentDateTime.dateTime = now.toISOString();
  elements.currentDateTime.textContent = new Intl.DateTimeFormat('az-Latn-AZ', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
}

function updateCountdown() {
  if (permanentlyInactive) return;
  if (!qrExpiresAt) {
    elements.countdownValue.textContent = waitingForShift ? '0' : '30';
    elements.countdownText.textContent = waitingForShift
      ? waitingMessage
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

function handleRequestError(error: unknown): 'stop' | 'wait' | 'retry' {
  const message = error instanceof KioskError ? error.message : 'Şəbəkə bağlantısı yoxlanılır';
  if (error instanceof KioskError && error.code === 'KIOSK_ORDER_INACTIVE') {
    setWaitingState('Sifariş artıq aktiv deyil. Yeni aktiv sifariş seçilməlidir.');
    return 'wait';
  }
  if (error instanceof KioskError && [400, 401, 403, 404, 410].includes(error.status)) {
    setInactiveState(error.status === 410 ? 'Bu QR ekranı deaktiv edilib' : 'QR keçidi etibarsızdır və ya giriş icazəsi yoxdur.');
    return 'stop';
  }
  if (error instanceof KioskError && error.status === 409) {
    setWaitingState();
    return 'wait';
  }

  setStatus('warning', 'Bağlantı yoxlanılır');
  updateConnectionState(hasNetworkConnection() ? 'checking' : 'offline');
  elements.networkText.textContent = message;
  if (!qrExpiresAt || Date.now() >= qrExpiresAt) {
    clearQrIfExpired();
  }
  return 'retry';
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
  permanentlyInactive = true;
  waitingForShift = true;
  requestGeneration += 1;
  stopScheduling();
  qrExpiresAt = 0;
  elements.qrImage.removeAttribute('src');
  elements.qrImage.classList.remove('visible');
  elements.qrPlaceholder.textContent = message;
  elements.qrPlaceholder.classList.remove('hidden');
  elements.countdownValue.textContent = '0';
  elements.countdownText.textContent = message;
  setStatus('inactive', 'Deaktiv');
  elements.networkText.textContent = message;
}

function setWaitingState(message = 'QR ekranı üçün aktiv sifariş seçilməlidir.') {
  requestGeneration += 1;
  waitingForShift = true;
  waitingMessage = message;
  clearTimeout(refreshTimeout);
  clearTimeout(retryTimeout);
  qrExpiresAt = 0;
  clearVisibleQr('QR ekranı hazır deyil');
  elements.countdownValue.textContent = '0';
  elements.countdownText.textContent = message;
  setStatus('warning', 'Gözləyir');
  elements.networkText.textContent = message;
}

function clearVisibleQr(message: string) {
  elements.qrImage.removeAttribute('src');
  elements.qrImage.classList.remove('visible', 'refreshed');
  elements.qrPlaceholder.textContent = message;
  elements.qrPlaceholder.classList.remove('hidden');
}

function getActiveSession(context: KioskContext) {
  return context.active_session ?? null;
}

function readKioskToken(): string | null {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const capability = fragment.get('capability')?.trim();
  // Keep the capability in the URL fragment so a dedicated tablet can reload
  // or restore the page without losing its kiosk identity. Browsers do not send
  // fragments in HTTP requests or Referer headers, and the kiosk never copies it
  // into local/session storage.
  if (capability) return capability;
  if (!import.meta.env.DEV) return null;

  const parts = window.location.pathname.split('/').filter(Boolean);
  const routeIndex = Math.max(parts.lastIndexOf('qr-kiosk'), parts.lastIndexOf('kiosk'));
  const encodedToken = routeIndex >= 0 && parts[routeIndex + 1]
    ? parts[routeIndex + 1]
    : parts.at(-1);
  if (!encodedToken) return null;

  try {
    const legacyCapability = decodeURIComponent(encodedToken);
    const safePath = window.location.pathname.replace(
      new RegExp(`/${escapeRegExp(encodedToken)}/*$`),
      '',
    );
    clearLegacyPathCapability(safePath);
    return legacyCapability;
  } catch {
    return null;
  }
}

function clearLegacyPathCapability(pathname: string): void {
  const safePath = pathname || '/kiosk';
  window.history.replaceState(null, '', `${window.location.origin}${safePath}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function handleVisibilityChange() {
  if (permanentlyInactive) return;
  if (document.visibilityState !== 'visible') {
    stopScheduling();
    hideQrForScreenLock();
    return;
  }

  if (!token) return;
  retryDelay = 1500;
  startTicking();
  void loadContext();
}

function handlePageHide() {
  stopScheduling();
  hideQrForScreenLock();
}

function handlePageShow(event: PageTransitionEvent) {
  if (!event.persisted || !token || permanentlyInactive || document.visibilityState !== 'visible') return;
  retryDelay = 1500;
  startTicking();
  void loadContext();
}

function handleOffline() {
  if (permanentlyInactive) return;
  updateConnectionState('offline');
  setStatus('warning', 'Oflayn');
  elements.networkText.textContent = 'İnternet bağlantısı kəsilib. Bərpa olunduqda ekran avtomatik yenilənəcək.';
  if (!qrExpiresAt || Date.now() >= qrExpiresAt) clearVisibleQr('Bağlantı gözlənilir');
}

function handleOnline() {
  if (!token || permanentlyInactive || document.visibilityState !== 'visible') return;
  updateConnectionState('checking');
  retryDelay = 1500;
  clearTimeout(retryTimeout);
  void loadContext();
}

function updateConnectionState(status: 'online' | 'offline' | 'checking') {
  elements.connectionBadge.dataset.status = status;
  elements.connectionText.textContent = status === 'online'
    ? 'Bağlantı aktivdir'
    : status === 'offline'
      ? 'Bağlantı yoxdur'
      : 'Bağlantı yoxlanılır';
}

function hasNetworkConnection() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function hideQrForScreenLock() {
  if (permanentlyInactive) return;
  requestGeneration += 1;
  qrExpiresAt = 0;
  elements.qrImage.removeAttribute('src');
  elements.qrImage.classList.remove('visible', 'refreshed');
  elements.qrPlaceholder.textContent = 'Ekran aktiv olduqda yeni QR yaradılacaq';
  elements.qrPlaceholder.classList.remove('hidden');
  elements.countdownValue.textContent = '0';
  elements.countdownText.textContent = 'QR təhlükəsizlik üçün gizlədildi';
  setStatus('warning', 'Kilidli');
  elements.networkText.textContent = 'Ekran aktiv olduqda sessiya yenidən yoxlanılacaq';
}

function stopScheduling() {
  clearTimeout(refreshTimeout);
  clearTimeout(retryTimeout);
  clearTimeout(contextPollTimeout);
  clearInterval(tickInterval);
  refreshTimeout = undefined;
  retryTimeout = undefined;
  contextPollTimeout = undefined;
  tickInterval = undefined;
}

function formatShift(start?: string | null, end?: string | null): string {
  if (!start && !end) return '-';
  const formatter = new Intl.DateTimeFormat('az-Latn-AZ', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const validDate = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? formatter.format(new Date(value)) : '-';
  const startText = validDate(start);
  const endText = validDate(end);
  return `${startText} - ${endText}`;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

class KioskError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'KioskError';
  }
}
