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
REDIS_URL=redis://default:password@redis-host:6379
```

Local development can run without Redis; the app uses an in-memory fallback only when `NODE_ENV` is not `production`.

### SMS

The app uses an SMS provider abstraction.

Local development only:

```env
SMS_PROVIDER=console
OTP_TEST_MODE=true
OTP_LOG_CODES=true
```

Production:

```env
SMS_PROVIDER=generic_http
SMS_API_URL=https://sms-provider.example/send
SMS_API_KEY=stored-in-secret-manager
SMS_FROM=SET Service
OTP_TEST_MODE=false
OTP_LOG_CODES=false
```

The generic HTTP provider is a production-ready boundary. Replace the endpoint and payload mapping with the chosen SMS vendor contract during provider onboarding.

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
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

When push is enabled in production, startup fails fast if Firebase service account variables are missing. Push delivery failures do not roll back the underlying business action; in-app notifications remain the durable source of truth. FCM tokens are stored per device in `device_tokens` and are revoked when the app logs out or Firebase reports an invalid registration token.

### Document Storage

The upload service abstraction is prepared for worker/company documents.

Local:

```env
STORAGE_PROVIDER=local
LOCAL_UPLOAD_DIR=uploads
STORAGE_PUBLIC_BASE_URL=/uploads
```

Object storage preparation:

```env
STORAGE_PROVIDER=s3
S3_BUCKET=hireapp-documents
S3_REGION=eu-central-1
S3_ACCESS_KEY_ID=stored-in-secret-manager
S3_SECRET_ACCESS_KEY=stored-in-secret-manager
STORAGE_PUBLIC_BASE_URL=https://cdn.example.com
```

For Cloudflare R2, use `STORAGE_PROVIDER=r2` and set `S3_ENDPOINT`.

`STORAGE_PROVIDER=local` is blocked in production. Use S3/R2 before enabling real worker/company document uploads.

## Required Production Env Vars

- `NODE_ENV=production`
- `DATABASE_URL`
- `DIRECT_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `QR_HMAC_SECRET`
- `OTP_PEPPER`
- `CORS_ORIGINS`
- `SMS_PROVIDER=generic_http`
- `SMS_API_URL`
- `SMS_API_KEY`
- `SMS_FROM`
- `PUSH_NOTIFICATIONS_ENABLED`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` when push is enabled
- `OTP_TEST_MODE=false`
- `OTP_LOG_CODES=false`

Secrets must be long, random, and different from each other. The app fails fast when production secrets are missing, weak, reused, or still using placeholder values.

## Security Settings

- Helmet is enabled.
- JSON body size is limited.
- CORS is allowlisted through `CORS_ORIGINS`.
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
npm start
```

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
- HTTP request logs are emitted through Morgan into the logger stream.
- Sentry is optional and enabled only when `SENTRY_DSN` is configured.
- Health endpoint is safe for load balancers: `GET /health`.

## Remaining Before Real Launch

- Choose and onboard the real SMS provider contract.
- Wire the object storage SDK for S3/R2 document upload flows when document upload endpoints are introduced.
- Add uptime monitoring for `/health`.
- Add database backup restore drill.
- Run security review on production CORS origins and secrets management.
