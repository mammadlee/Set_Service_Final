import { Errors } from './errors';

const PRODUCTION_KIOSK_ORIGIN = 'https://qr.setservice.az';

function configuredBase(environment: NodeJS.ProcessEnv): string {
  return (
    environment.KIOSK_PUBLIC_BASE_URL
    ?? (environment.NODE_ENV !== 'production' ? environment.PUBLIC_APP_URL : undefined)
    ?? ''
  ).trim();
}

// A kiosk capability must only be sent to the deployed kiosk, never an app/API
// fallback host. The optional /kiosk suffix is normalized, not appended twice.
export function kioskPublicUrlIssue(environment: NodeJS.ProcessEnv = process.env): string | null {
  const production = environment.NODE_ENV === 'production';
  const base = configuredBase(environment);
  if (!base) {
    return production ? 'KIOSK_PUBLIC_BASE_URL is required in production' : null;
  }

  try {
    const parsed = new URL(base);
    if (
      !/^https?:\/\//i.test(base)
      || /[\s\\]/.test(base)
      || parsed.username
      || parsed.password
      || base.includes('@')
      || base.includes('?')
      || base.includes('#')
      || !['/', '/kiosk', '/kiosk/'].includes(parsed.pathname)
      || /%|\/\.\.?([/]|$)/.test(base)
    ) {
      return 'KIOSK_PUBLIC_BASE_URL must be an HTTP(S) origin with an optional /kiosk path and no credentials, query or fragment';
    }
    if (production && parsed.origin !== PRODUCTION_KIOSK_ORIGIN) {
      return `KIOSK_PUBLIC_BASE_URL must use ${PRODUCTION_KIOSK_ORIGIN} in production`;
    }
    return null;
  } catch {
    return 'KIOSK_PUBLIC_BASE_URL must be a valid kiosk URL';
  }
}

export function resolveKioskPublicBaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  if (kioskPublicUrlIssue(environment)) {
    // Never echo the environment value: a malformed value can contain a token.
    throw Errors.unavailable('QR səhifəsinin ünvanı düzgün konfiqurasiya edilməyib.', 'KIOSK_URL_CONFIG_INVALID');
  }
  const base = configuredBase(environment);
  return base ? new URL(base).origin : '';
}

export function buildKioskPublicUrl(token: string, base = resolveKioskPublicBaseUrl()): string {
  return `${base}/kiosk#capability=${encodeURIComponent(token)}`;
}
