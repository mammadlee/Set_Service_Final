const DEV_BASE_URL = 'http://localhost:3000';
const DEV_KIOSK_BASE_URL = 'http://localhost:5174';

export const API_BASE_URL = resolveApiBaseUrl();
export const KIOSK_BASE_URL = resolveKioskBaseUrl();

function resolveApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (!configuredUrl) {
    if (import.meta.env.PROD) {
      throw new Error('Admin paneli üçün VITE_API_BASE_URL canlı mühitdə mütləq verilməlidir.');
    }
    return appendApiVersion(DEV_BASE_URL);
  }

  const normalized = configuredUrl.replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Admin panelinin API ünvanı düzgün URL deyil.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Admin panelinin API ünvanı HTTP və ya HTTPS ilə başlamalıdır.');
  }

  if (import.meta.env.PROD && parsed.protocol !== 'https:') {
    throw new Error('Canlı mühitdə admin panelinin API ünvanı HTTPS istifadə etməlidir.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Admin panelinin API ünvanında giriş məlumatları, sorğu sətri və ya fraqment olmamalıdır.');
  }
  if (import.meta.env.PROD && isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error('Canlı mühitdə admin paneli localhost API ünvanı ilə işləyə bilməz.');
  }

  return appendApiVersion(normalized);
}

function appendApiVersion(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function resolveKioskBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_KIOSK_BASE_URL?.trim();

  if (!configuredUrl) {
    if (import.meta.env.PROD) {
      throw new Error('Admin paneli üçün VITE_KIOSK_BASE_URL canlı mühitdə mütləq verilməlidir.');
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
    throw new Error('QR kiosk ünvanı HTTP və ya HTTPS ilə başlamalıdır.');
  }

  if (import.meta.env.PROD && parsed.protocol !== 'https:') {
    throw new Error('Canlı mühitdə QR kiosk ünvanı HTTPS istifadə etməlidir.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('QR kiosk ünvanında giriş məlumatları, sorğu sətri və ya fraqment olmamalıdır.');
  }
  if (import.meta.env.PROD && isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error('Canlı mühitdə admin paneli localhost QR kiosk ünvanı ilə işləyə bilməz.');
  }

  return normalized;
}

export function resolveKioskUrl(kioskUrl: string): string {
  if (/^https?:\/\//i.test(kioskUrl)) {
    const resolved = new URL(kioskUrl);
    if (resolved.origin !== new URL(KIOSK_BASE_URL).origin) {
      throw new Error('QR kiosk ünvanı konfiqurasiyada göstərilən mənbə ilə uyğun gəlmir.');
    }
    return resolved.toString();
  }
  const cleanPath = kioskUrl.startsWith('/') ? kioskUrl : `/${kioskUrl}`;
  return `${KIOSK_BASE_URL}${cleanPath}`;
}

function isPrivateOrLocalHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localdomain')
  ) {
    return true;
  }
  if (hostname.includes(':')) {
    return (
      hostname === '::' ||
      hostname === '::1' ||
      hostname.startsWith('::ffff:') ||
      /^(fc|fd|fe[89ab])/.test(hostname)
    );
  }

  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}
