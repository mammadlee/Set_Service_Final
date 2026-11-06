# SET Service Production Readiness

The backend MVP flow has passed smoke testing:

Auth -> Worker Approval -> Company Order -> Admin Assignment -> Worker Accept -> QR Check-in/out.

This document covers the infrastructure and release requirements before a real production launch.

## Required Services

### PostgreSQL

- Use a managed PostgreSQL instance or a hardened self-hosted cluster.
- Enable automated backups and point-in-time recovery if available.
- Use a dedicated database user with the minimum permissions needed by Prisma.
- Store `DATABASE_URL` and `DIRECT_URL` in the deployment platform secret manager.
- For Neon or other pooled PostgreSQL providers, use the pooled URL for `DATABASE_URL` and the direct non-pooler URL for `DIRECT_URL`.
- Apply migrations with:

```bash
psql "$DIRECT_URL" -f scripts/preflight-attendance-one-session.sql
npm run db:migrate:deploy
npx prisma generate
```

The attendance preflight must return zero rows before deploying the one-session-per-assignment unique index. If it returns rows, manually review and clean/merge/archive duplicate attendance records first. The preflight script does not destroy data.

### Redis

Redis is required in production for OTP rate-limit, cooldown, and temporary block state.

```env
REDIS_URL=<redis-url>
```

Local development can run without Redis; the app uses an in-memory fallback only when `NODE_ENV` is not `production`.

### SMS

The app uses an SMS provider abstraction.

Local development only:

```env
SMS_PROVIDER=console
OTP_TEST_MODE=false
OTP_LOG_CODES=false
```

Fixed OTPs are available only to isolated test processes using `NODE_ENV=test`,
`OTP_TEST_MODE=true`, and an explicitly configured six-digit `OTP_TEST_CODE`.

Production:

```env
SMS_PROVIDER=pg365
PG365_API_URL=https://api.poctgoyercini.com
PG365_PUBLIC_KEY=<public-key>
PG365_PRIVATE_KEY=<secret-reference>
PG365_ORIGINATOR=SET
PG365_TIMEOUT_MS=10000
OTP_TEST_MODE=false
OTP_LOG_CODES=false
```

PG365 is the production OTP provider. Its private key must remain in the deployment secret manager and OTP delivery requests are never retried automatically.

### Push Notifications

Firebase Cloud Messaging is wired through a backend provider abstraction and the Flutter app registers device tokens per authenticated role.

Local/staging without Firebase:

```env
PUSH_NOTIFICATIONS_ENABLED=false
```

Production with push enabled:

```env
PUSH_NOTIFICATIONS_ENABLED=true
FIREBASE_PROJECT_ID=hireapp-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@example.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=<secret-reference>
```

When push is enabled in production, startup fails fast if Firebase service account variables are missing. Push delivery failures do not roll back the underlying business action; in-app notifications remain the durable source of truth. FCM tokens are stored per device in `device_tokens` and are revoked when the app logs out or Firebase reports an invalid registration token.

### Document Storage

The upload service abstraction is prepared for worker/company documents.

Local:

```env
STORAGE_PROVIDER=local
LOCAL_UPLOAD_DIR=uploads
PRIVATE_DOWNLOAD_SIGNING_SECRET=<secret-reference>
STORAGE_SIGNED_URL_TTL_SECONDS=300
STORAGE_PUBLIC_BASE_URL=/uploads
```

Object storage preparation:

```env
STORAGE_PROVIDER=s3
S3_BUCKET=hireapp-documents
S3_REGION=eu-central-1
S3_ACCESS_KEY_ID=<r2-access-key-id>
S3_SECRET_ACCESS_KEY=<r2-secret-access-key>
STORAGE_SIGNED_URL_TTL_SECONDS=300
STORAGE_PUBLIC_BASE_URL=https://cdn.example.com
```

For Cloudflare R2, use `STORAGE_PROVIDER=r2` and set `S3_ENDPOINT`.

`STORAGE_PROVIDER=local` is blocked in production. Worker documents are stored by object key and are delivered only through authenticated, short-lived signed URLs. `STORAGE_PUBLIC_BASE_URL` is reserved for explicitly public profile assets.

## Required Production Env Vars

- `NODE_ENV=production`
- `DATABASE_URL`
- `DIRECT_URL`
- `REDIS_URL`
- `OUTBOX_WORKER_ENABLED=false`
- `OUTBOX_HEALTH_PORT`
- `OUTBOX_MAX_CONSECUTIVE_FAILURES`
- `OUTBOX_HEARTBEAT_TTL_SECONDS`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `QR_HMAC_SECRET`
- `KIOSK_TOKEN_ENCRYPTION_SECRET`
- `OTP_PEPPER`
- `CORS_ORIGINS`
- `AUTH_COOKIE_SAME_SITE`
- `SMS_PROVIDER=pg365`
- `PG365_API_URL`
- `PG365_PUBLIC_KEY`
- `PG365_PRIVATE_KEY`
- `PG365_ORIGINATOR`
- `PG365_TIMEOUT_MS`
- `PROVIDER_OUTBOX_ENCRYPTION_SECRET`
- `PUSH_NOTIFICATIONS_ENABLED`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` when push is enabled
- `OTP_TEST_MODE=false`
- `OTP_LOG_CODES=false`
- `SWAGGER_DOCS_ENABLED=false`

Secrets must be long, random, and different from each other. The app fails fast when production secrets are missing, weak, reused, or still using placeholder values.

## Security Settings

- Helmet is enabled.
- JSON body size is limited.
- CORS is allowlisted through `CORS_ORIGINS`.
- Browser refresh tokens use rotating `HttpOnly` cookies. `AUTH_COOKIE_SAME_SITE` must be `lax`/`strict` for same-site deployments; `none` is reserved for intentional cross-site HTTPS deployments and forces `Secure`.
- OTP codes are never stored raw.
- OTP test mode and OTP logging are blocked in production.
- Refresh tokens remain hashed in PostgreSQL.
- QR tokens are HMAC signed and expire.
- Unexpected errors return a generic response and are sent to Sentry when configured.

## Build And Start

```bash
npm ci
npm run db:migrate:deploy
npx prisma generate
npm run build
```

Run the compiled artifact as two separately supervised services:

```bash
# API replicas
OUTBOX_WORKER_ENABLED=false npm run start:api

# At least one durable outbox worker replica
npm run start:outbox
```

Do not omit the worker: notification/provider delivery depends on it. An
intentional single-process deployment may use `OUTBOX_WORKER_ENABLED=true`, but
that topology couples API and delivery availability and is not the recommended
production setup.

## Smoke Test

Run against staging:

```bash
BASE_URL=https://staging-api.example.com TEST_OTP=123456 npm run smoke:mvp
```

Do not enable OTP test mode in real production. Production smoke testing should use either a staging environment or dedicated test accounts with real SMS delivery.

## Rollback Notes

- Keep the previous application image available.
- Database migrations should be reviewed for reversibility before deployment.
- For additive Prisma migrations, rollback is usually application-image rollback first.
- For destructive migrations, prepare a manual rollback SQL plan and backup restore point.
- Preserve Redis across deploys; OTP state is temporary and can be flushed only if product/support accepts active OTP invalidation.

## Observability

- Logs are structured JSON through the logger abstraction.
- Sentry is optional and enabled only when `SENTRY_DSN` is configured.
- API liveness is `GET /health`; API readiness is `GET /ready` and includes the
  PostgreSQL, Redis, and outbox-heartbeat state.
- The outbox worker exposes `GET /health` and Prometheus `GET /metrics` on
  `OUTBOX_HEALTH_PORT` (default `3001`).
- Alert on stale worker heartbeats, consecutive failed batches, pending backlog,
  and dead-letter count.

## Remaining Before Real Launch

- Choose and onboard the real SMS provider contract.
- Add uptime monitoring for API `/health` and `/ready` plus worker `/health`.
- Add database backup restore drill.
- Run security review on production CORS origins and secrets management.
