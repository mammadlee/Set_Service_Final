const DEV_BASE_URL = 'http://localhost:3000';

export const API_BASE_URL = resolveApiBaseUrl();

function resolveApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (!configuredUrl) {
    if (import.meta.env.PROD) {
      throw new Error('Şirkət paneli üçün VITE_API_BASE_URL canlı mühitdə mütləq verilməlidir.');
    }
    return appendApiVersion(DEV_BASE_URL);
  }

  const normalized = configuredUrl.replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Şirkət paneli API ünvanı düzgün URL deyil.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Şirkət paneli API ünvanı http və ya https ilə başlamalıdır.');
  }

  if (import.meta.env.PROD && isLocalhost(parsed.hostname)) {
    throw new Error('Canlı mühitdə şirkət paneli localhost API ünvanı ilə işləyə bilməz.');
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
