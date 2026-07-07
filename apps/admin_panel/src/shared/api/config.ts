const DEV_BASE_URL = 'http://localhost:3000';
const DEV_KIOSK_BASE_URL = 'http://localhost:5174';

export const API_BASE_URL = resolveApiBaseUrl();
export const KIOSK_BASE_URL = resolveKioskBaseUrl();

function resolveApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (!configuredUrl) {
    if (import.meta.env.PROD) {
      throw new Error('Admin panel üçün VITE_API_BASE_URL production mühitində mütləq verilməlidir.');
    }
    return appendApiVersion(DEV_BASE_URL);
  }

  const normalized = configuredUrl.replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Admin panel API ünvanı düzgün URL deyil.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Admin panel API ünvanı http və ya https ilə başlamalıdır.');
  }

  if (import.meta.env.PROD && isLocalhost(parsed.hostname)) {
    throw new Error('Production admin panel localhost API ünvanı ilə işləyə bilməz.');
  }

  return appendApiVersion(normalized);
}

function appendApiVersion(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function isLocalhost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(hostname);
}

function resolveKioskBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_KIOSK_BASE_URL?.trim();

  if (!configuredUrl) {
    if (import.meta.env.PROD) {
      throw new Error('Admin panel üçün VITE_KIOSK_BASE_URL production mühitində mütləq verilməlidir.');
    }
    return DEV_KIOSK_BASE_URL;
  }

  const normalized = configuredUrl.replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('QR kiosk ünvanı düzgün URL deyil.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('QR kiosk ünvanı http və ya https ilə başlamalıdır.');
  }

  if (import.meta.env.PROD && isLocalhost(parsed.hostname)) {
    throw new Error('Production admin panel localhost QR kiosk ünvanı ilə işləyə bilməz.');
  }

  return normalized;
}

export function resolveKioskUrl(kioskUrl: string): string {
  if (/^https?:\/\//i.test(kioskUrl)) return kioskUrl;
  const cleanPath = kioskUrl.startsWith('/') ? kioskUrl : `/${kioskUrl}`;
  return `${KIOSK_BASE_URL}${cleanPath}`;
}
