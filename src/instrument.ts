import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? '',
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.RELEASE_SHA ?? process.env.GIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  // DSN boşdursa (dev mühiti) Sentry işləmir amma crash etmir
  enabled: !!process.env.SENTRY_DSN,
});
