# SET Service Environment Setup

This document describes local and production environment variables for the SET Service backend MVP.

The full MVP smoke test passed:

Auth -> Worker Approval -> Company Order -> Admin Assignment -> Worker Accept -> QR Check-in/out.

## Auth Model

Production-style authentication is password based:

- Worker registers with phone, verifies OTP, creates a password, then logs in with phone + password after admin approval.
- Company registers with company name, email, phone, verifies OTP, creates a password, then logs in with email + password after admin approval.
- Super admin logs in with email + password. There is no public admin signup and admin OTP login is deprecated.
- OTP is used only for first verification and password reset flows.

Seed credentials for local smoke testing:

```text
Super admin: admin@setservice.az / <explicit-admin-password>
Approved company: company@setservice.az / <explicit-company-password>
Seed workers: Worker123!
```

## Local PostgreSQL With Docker

```bash
docker run --name hireapp-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hireapp \
  -p 5433:5432 \
  -d postgres:15
```

## Create `.env`

```bash
cp .env.example .env
```

Recommended local `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/hireapp?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5433/hireapp?schema=public"
REDIS_URL=""

JWT_SECRET="local-placeholder-jwt-secret-replace-before-production-123456"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="30d"

QR_HMAC_SECRET="local-placeholder-qr-hmac-secret-replace-before-production-123456"
QR_TOKEN_TTL_SECONDS="300"

SENTRY_DSN=""

FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""
PUSH_NOTIFICATIONS_ENABLED="false"

PORT=3000
NODE_ENV="development"
CORS_ORIGINS="http://localhost:5173,http://localhost:5174,http://localhost:8080"

SMS_PROVIDER="console"
SMS_API_URL=""
SMS_API_KEY=""
SMS_FROM=""

EMAIL_PROVIDER="console"
EMAIL_API_URL=""
EMAIL_API_KEY=""
EMAIL_FROM="SET Service <no-reply@setservice.az>"

STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR="uploads"
STORAGE_PUBLIC_BASE_URL="/uploads"
S3_BUCKET=""
S3_REGION=""
S3_ENDPOINT=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""

OTP_PEPPER="local-placeholder-otp-pepper-replace-before-production-123456"
OTP_TEST_MODE="true"
OTP_TEST_CODE="123456"
OTP_LOG_CODES="true"
```

## Staging PostgreSQL With Neon

Use two database URLs for Neon staging:

- `DATABASE_URL`: pooled Neon connection string for the running API.
- `DIRECT_URL`: direct Neon connection string for Prisma migrations and schema operations.

Typical Neon staging values look like this:

```env
DATABASE_URL="postgresql://USER:PASSWORD@ep-example-pooler.REGION.aws.neon.tech/setservice_staging?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://USER:PASSWORD@ep-example.REGION.aws.neon.tech/setservice_staging?sslmode=require"
```

Rules:

- Keep both values in the staging secret manager, not in git.
- `DIRECT_URL` should not use the pooler host.
- Run staging migrations with `prisma migrate deploy`, never `prisma migrate dev` or `prisma migrate reset`.
- If you are not using a pooled URL, `DIRECT_URL` may point to the same direct PostgreSQL database as `DATABASE_URL`.

Staging migration command:

```bash
npm ci
npx prisma validate
npm run db:migrate:deploy
npx prisma generate
npm run build
```

## Environment Variables

| Variable | Required | Local Example | Production Notes |
|---|---:|---|---|
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5433/hireapp?schema=public` | Use managed PostgreSQL. Enable SSL if required by provider. |
| `DIRECT_URL` | Production/staging migrations | Same as local `DATABASE_URL` | Direct PostgreSQL URL for Prisma migrations. For Neon, use the non-pooler connection string with `sslmode=require`. |
| `REDIS_URL` | Production | Empty locally | Required in production for OTP rate-limit, cooldown, and block state. |
| `JWT_SECRET` | Yes | 32+ char placeholder | Must be long, random, non-placeholder, and different from QR/OTP secrets. |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Keep short for production. |
| `JWT_REFRESH_EXPIRES_IN` | No | `30d` | Match product session policy. |
| `QR_HMAC_SECRET` | Yes | 32+ char placeholder | Must be long, random, non-placeholder, and different from JWT/OTP secrets. |
| `QR_TOKEN_TTL_SECONDS` | No | `300` | Positive integer. Invalid values fall back safely. |
| `OTP_PEPPER` | Production | 32+ char placeholder | Required in production. Must be random and different from JWT/QR secrets. |
| `OTP_TEST_MODE` | No | `true` | Must be `false` in production. |
| `OTP_TEST_CODE` | No | `123456` | Development only. Ignored for generated production OTPs. |
| `OTP_LOG_CODES` | No | `true` | Must be `false` in production. |
| `CORS_ORIGINS` | Production | Local frontend URLs | Required in production. Comma-separated allowlist. No wildcard. |
| `PORT` | No | `3000` | App server port. |
| `NODE_ENV` | No | `development` | Use `production` in production. |
| `SENTRY_DSN` | No | Empty | Enables Sentry when set. |
| `SMS_PROVIDER` | No | `console` | Production must use `generic_http`. |
| `SMS_API_URL` | Provider-specific | Empty | Required when `SMS_PROVIDER=generic_http`. |
| `SMS_API_KEY` | Provider-specific | Empty | Required when `SMS_PROVIDER=generic_http`. Store securely. |
| `SMS_FROM` | Provider-specific | Empty | Required when `SMS_PROVIDER=generic_http`. |
| `EMAIL_PROVIDER` | No | `console` | Production must use `generic_http`; `console` is development only. |
| `EMAIL_API_URL` | Provider-specific | Empty | Required when `EMAIL_PROVIDER=generic_http`. |
| `EMAIL_API_KEY` | Provider-specific | Empty | Required when `EMAIL_PROVIDER=generic_http`. Store securely. |
| `EMAIL_FROM` | Provider-specific | `SET Service <no-reply@setservice.az>` | Required when `EMAIL_PROVIDER=generic_http`. |
| `STORAGE_PROVIDER` | No | `local` | `local`, `s3`, or `r2`. Production must use `s3` or `r2`; local storage is blocked in production. |
| `LOCAL_UPLOAD_DIR` | No | `uploads` | Development-only local storage directory. |
| `STORAGE_PUBLIC_BASE_URL` | Provider-specific | `/uploads` | Required for object storage public URLs. |
| `S3_BUCKET` | Provider-specific | Empty | Required for `s3` or `r2`. |
| `S3_REGION` | Provider-specific | Empty | Required for `s3`. |
| `S3_ENDPOINT` | Provider-specific | Empty | Required for `r2` or custom S3-compatible storage. |
| `S3_ACCESS_KEY_ID` | Provider-specific | Empty | Required for `s3` or `r2`. Store securely. |
| `S3_SECRET_ACCESS_KEY` | Provider-specific | Empty | Required for `s3` or `r2`. Store securely. |
| `PUSH_NOTIFICATIONS_ENABLED` | No | `false` | Set `true` to enable Firebase Cloud Messaging delivery. In production, Firebase variables are required when this is true. |
| `FIREBASE_PROJECT_ID` | Push-specific | Empty | Firebase service account project ID. Required when push is enabled in production. |
| `FIREBASE_CLIENT_EMAIL` | Push-specific | Empty | Firebase service account client email. Required when push is enabled in production. |
| `FIREBASE_PRIVATE_KEY` | Push-specific | Empty | Firebase service account private key. Store with escaped `\n` line breaks in env managers. |

## Push Notifications

Local development can run without Firebase credentials:

```env
PUSH_NOTIFICATIONS_ENABLED="false"
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""
```

For staging/production push delivery:

```env
PUSH_NOTIFICATIONS_ENABLED="true"
FIREBASE_PROJECT_ID="hireapp-prod"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@example.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

The backend stores multiple FCM device tokens per authenticated user through `POST /v1/auth/fcm-token` and deactivates them through `DELETE /v1/auth/fcm-token`. Tokens are never logged.

### Firebase Mobile Setup Checklist

Android:

- Add Firebase Android app for the SET Service package id.
- Download `google-services.json`.
- Place it at `apps/worker_app/android/app/google-services.json`.
- Keep the file out of git unless your release process explicitly manages Firebase app config files.

iOS:

- Add Firebase iOS app for the SET Service bundle id.
- Download `GoogleService-Info.plist`.
- Place it at `apps/worker_app/ios/Runner/GoogleService-Info.plist`.
- Add it to the Xcode Runner target when preparing an iOS archive.
- Upload an APNs authentication key in Firebase Console so FCM can deliver iOS notifications.

Backend Firebase service account:

- `PUSH_NOTIFICATIONS_ENABLED=true`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

The Flutter app is designed to continue local development when Firebase files are missing. Firebase initialization logs a local warning and push registration is skipped. Real staging push delivery requires the mobile config files plus backend Firebase service account variables.

## Redis

Local Redis is optional. If `REDIS_URL` is missing in development, the backend uses local in-memory OTP state. Production never falls back to memory.

```env
REDIS_URL="redis://default:password@redis-host:6379"
```

## SMS Provider

Local development:

```env
SMS_PROVIDER="console"
OTP_TEST_MODE="true"
OTP_LOG_CODES="true"
```

Production:

```env
SMS_PROVIDER="generic_http"
SMS_API_URL="https://sms-provider.example/send"
SMS_API_KEY="stored-securely"
SMS_FROM="SET Service"
OTP_TEST_MODE="false"
OTP_LOG_CODES="false"
```

## Email Provider

Local development:

```env
EMAIL_PROVIDER="console"
EMAIL_FROM="SET Service <no-reply@setservice.az>"
```

Production:

```env
EMAIL_PROVIDER="generic_http"
EMAIL_API_URL="https://email-provider.example/send"
EMAIL_API_KEY="stored-securely"
EMAIL_FROM="SET Service <no-reply@setservice.az>"
```

`EMAIL_PROVIDER=console` is intentionally blocked when `NODE_ENV=production`, and OTP/email verification codes must not be logged in production.

## Storage Provider

Local development placeholder only:

```env
STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR="uploads"
STORAGE_PUBLIC_BASE_URL="/uploads"
```

`STORAGE_PROVIDER=local` is intentionally blocked when `NODE_ENV=production`.

S3:

```env
STORAGE_PROVIDER="s3"
S3_BUCKET="hireapp-documents"
S3_REGION="eu-central-1"
S3_ACCESS_KEY_ID="stored-securely"
S3_SECRET_ACCESS_KEY="stored-securely"
STORAGE_PUBLIC_BASE_URL="https://cdn.example.com"
```

Cloudflare R2:

```env
STORAGE_PROVIDER="r2"
S3_BUCKET="hireapp-documents"
S3_ENDPOINT="https://account-id.r2.cloudflarestorage.com"
S3_ACCESS_KEY_ID="stored-securely"
S3_SECRET_ACCESS_KEY="stored-securely"
STORAGE_PUBLIC_BASE_URL="https://cdn.example.com"
```

## Local Commands

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev
```

Run checks:

```bash
npx prisma validate
npm run typecheck
npm run build
npm run swagger:check
```

Run full MVP smoke test:

```bash
BASE_URL=http://localhost:3000 TEST_OTP=123456 SMOKE_ADMIN_PASSWORD=<explicit-admin-password> npm run smoke:mvp
```

PowerShell:

```powershell
$env:BASE_URL="http://localhost:3000"
$env:TEST_OTP="123456"
$env:SMOKE_ADMIN_PASSWORD="<explicit-admin-password>"
npm run smoke:mvp
```

Run staging smoke test after the staging API is deployed:

```bash
BASE_URL=https://staging-api.yourdomain.com TEST_OTP=123456 SMOKE_ADMIN_PASSWORD=<explicit-admin-password> npm run smoke:mvp
```

PowerShell:

```powershell
$env:BASE_URL="https://staging-api.yourdomain.com"
$env:TEST_OTP="123456"
$env:SMOKE_ADMIN_PASSWORD="<explicit-admin-password>"
npm run smoke:mvp
```

For staging, `OTP_TEST_MODE=true` may be used only in an isolated QA environment where `NODE_ENV` is not `production`. For production-like staging with `NODE_ENV=production`, keep `OTP_TEST_MODE=false` and use real SMS delivery or provider-side test numbers.

## Seeded Local Accounts

After `npm run db:seed`:

```text
Super Admin: +994700000001
Company:     +994700000002
Worker:      +994700000003 approved
Worker:      +994700000004 pending approval
Worker:      +994700000005 rejected
OTP:         123456
```

## Production Rules

- Set `NODE_ENV=production`.
- Set `DIRECT_URL` for Prisma migrations.
- Set `REDIS_URL`; production Redis is required.
- Set `OTP_TEST_MODE=false`.
- Set `OTP_LOG_CODES=false`.
- Set `SMS_PROVIDER=generic_http`.
- Configure `SMS_API_URL`, `SMS_API_KEY`, and `SMS_FROM`.
- Set `EMAIL_PROVIDER=generic_http`.
- Configure `EMAIL_API_URL`, `EMAIL_API_KEY`, and `EMAIL_FROM`.
- Set `CORS_ORIGINS` to trusted frontend origins only.
- Use long random values for `JWT_SECRET`, `QR_HMAC_SECRET`, and `OTP_PEPPER`.
- Do not reuse the same value for JWT, QR, and OTP secrets.
- Run Prisma migrations with deployment-safe commands only.

Production Prisma commands:

```bash
npm run db:migrate:deploy
npx prisma generate
```

Do not use `prisma migrate reset` against production.
