import * as Sentry from '@sentry/node';
import { redactSensitive } from './lib/logger';

function sanitizeSentryEvent<T extends Sentry.Event>(event: T): T {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
      delete event.request.query_string;
      if (event.request.url) {
        event.request.url = event.request.url
          .replace(
            /(\/(?:kiosk-sessions|venue-kiosks|kiosk|qr-kiosk|private-worker-documents)\/)[^/?#]+/gi,
            '$1:token',
          )
          .replace(/[?#].*$/, '');
      }
      if (event.request.headers) {
        event.request.headers = Object.fromEntries(
          Object.entries(event.request.headers).filter(([key]) =>
            !['authorization', 'cookie', 'set-cookie', 'x-kiosk-capability'].includes(
              key.toLowerCase(),
            ),
          ),
        );
      }
    }
    if (event.user) {
      event.user = event.user.id ? { id: event.user.id } : undefined;
    }
    return redactSensitive(event) as T;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? '',
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.RELEASE_SHA ?? process.env.GIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  sendDefaultPii: false,
  beforeSend: sanitizeSentryEvent,
  // Sentry does not call beforeSend for performance transactions. Outgoing
  // object-storage spans must receive the same privacy filtering as errors.
  beforeSendTransaction: sanitizeSentryEvent,
  beforeBreadcrumb(breadcrumb) {
    return redactSensitive(breadcrumb) as typeof breadcrumb;
  },
  // An empty DSN keeps Sentry optional and must never stop the API.
  enabled: !!process.env.SENTRY_DSN,
});
