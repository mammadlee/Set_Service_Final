# SET Service Staging Deployment

This guide prepares SET Service for a real staging environment without changing backend business logic.

## Staging Architecture

Recommended staging services:

- API runtime: Node.js host such as Render, Fly.io, Railway, ECS, or a VM.
- PostgreSQL: Neon staging project or another managed PostgreSQL database.
- Redis: managed Redis for OTP cooldown, rate-limit, and block state.
- Firebase: FCM project for staging push notification delivery.
- Object storage: S3 or Cloudflare R2 if document uploads are tested in staging.

## Neon PostgreSQL Setup

Create a dedicated Neon project or branch for staging. Keep staging isolated from production.

Use two connection strings:

```env
DATABASE_URL="postgresql://USER:PASSWORD@ep-example-pooler.REGION.aws.neon.tech/setservice_staging?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://USER:PASSWORD@ep-example.REGION.aws.neon.tech/setservice_staging?sslmode=require"
```

`DATABASE_URL` is used by the running API. `DIRECT_URL` is used by Prisma migrations through the `directUrl` datasource setting.

Checklist:

- [ ] Create Neon staging database or branch.
- [ ] Enable SSL by keeping `sslmode=require`.
- [ ] Use pooled URL for `DATABASE_URL` when the host provides one.
- [ ] Use direct non-pooler URL for `DIRECT_URL`.
- [ ] Store both values in the staging secret manager.
- [ ] Do not commit real Neon URLs or passwords.

If your PostgreSQL provider does not have pooled/direct split URLs, set `DIRECT_URL` to the normal direct PostgreSQL connection string.

## Staging Environment Variables

Minimum staging backend variables:

```env
NODE_ENV="production"
PORT=3000
DATABASE_URL="postgresql://USER:PASSWORD@ep-example-pooler.REGION.aws.neon.tech/setservice_staging?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://USER:PASSWORD@ep-example.REGION.aws.neon.tech/setservice_staging?sslmode=require"
REDIS_URL="redis://default:PASSWORD@redis-host:6379"
CORS_ORIGINS="https://staging-admin.yourdomain.com,https://staging-company.yourdomain.com"

JWT_SECRET="replace-with-random-32-plus-character-secret"
QR_HMAC_SECRET="replace-with-different-random-32-plus-character-secret"
OTP_PEPPER="replace-with-another-random-32-plus-character-secret"
OTP_TEST_MODE="false"
OTP_TEST_CODE="123456"
OTP_LOG_CODES="false"

SMS_PROVIDER="console"
PUSH_NOTIFICATIONS_ENABLED="false"
STORAGE_PROVIDER="s3"
STORAGE_PUBLIC_BASE_URL="https://staging-cdn.yourdomain.com"
```

For production-like staging, replace console SMS with `generic_http` and use dedicated test phone numbers. `OTP_TEST_MODE=true` is blocked when `NODE_ENV=production`; use it only in a separate isolated QA environment that is not configured as production.

## Migrations

Staging must use deployment-safe migrations:

```bash
npm ci
npx prisma validate
npm run db:migrate:deploy
npx prisma generate
npm run build
```

Never run these against staging:

```bash
npx prisma migrate dev
npx prisma migrate reset
```

Before deploying attendance-related migrations to an existing staging database, run:

```bash
psql "$DIRECT_URL" -f scripts/preflight-attendance-one-session.sql
```

The preflight must return zero duplicate attendance sessions before applying the unique index. Clean up data manually if rows are returned.

## Firebase Setup Checklist

Backend Firebase service account variables:

- `PUSH_NOTIFICATIONS_ENABLED=true`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Android Flutter app:

- Download `google-services.json` from Firebase Console.
- Place it at `apps/worker_app/android/app/google-services.json`.
- Confirm package id matches the Firebase Android app.
- Build with `flutter build apk --debug` or the intended staging build command.

iOS Flutter app:

- Download `GoogleService-Info.plist` from Firebase Console.
- Place it at `apps/worker_app/ios/Runner/GoogleService-Info.plist`.
- Add it to the Xcode Runner target before archiving.
- Upload an APNs authentication key to Firebase Console for iOS push delivery.

Local builds are allowed to run without Firebase config files. The app catches missing Firebase config, logs a development warning, and skips push token registration. Staging push delivery requires the files above plus backend Firebase service account variables.

## Build And Start

Backend:

```bash
npm ci
npm run typecheck
npm run build
npm run swagger:check
npm start
```

Flutter staging preview:

```bash
cd apps/worker_app
flutter run -d emulator --dart-define=BASE_URL=https://staging-api.yourdomain.com
flutter build apk --debug --dart-define=BASE_URL=https://staging-api.yourdomain.com
```

Admin and company web apps should point their `VITE_API_BASE_URL` values to the staging API origin.

## Staging Smoke Test

After the API is deployed and migrations have run:

```bash
BASE_URL=https://staging-api.yourdomain.com TEST_OTP=123456 npm run smoke:mvp
```

PowerShell:

```powershell
$env:BASE_URL="https://staging-api.yourdomain.com"
$env:TEST_OTP="123456"
npm run smoke:mvp
```

Expected coverage:

- health check
- worker registration and OTP verification
- admin approval
- worker login
- company login and order creation
- assignment creation and acceptance
- QR generation
- check-in/check-out
- duplicate attendance conflict checks
- profile/upload/rating/report/notification checks covered by the expanded smoke script

Automated smoke testing with `TEST_OTP=123456` requires the staging API to run in a dedicated QA mode where `OTP_TEST_MODE=true` is allowed. For production-like staging with `NODE_ENV=production`, keep `OTP_TEST_MODE=false` and run smoke tests with real SMS delivery or a provider-side test number setup.

## Staging Release Checklist

- [ ] Neon `DATABASE_URL` and `DIRECT_URL` are configured.
- [ ] Redis is configured.
- [ ] Secrets are random, non-placeholder, and not reused.
- [ ] OTP test mode is intentionally chosen for staging QA or disabled for production-like staging.
- [ ] CORS allows only staging frontend origins.
- [ ] Prisma migrations were applied with `npm run db:migrate:deploy`.
- [ ] Swagger parse check passes.
- [ ] Smoke test passes against staging.
- [ ] Firebase files and backend service account variables are configured if push delivery is tested.
- [ ] Document uploads use S3/R2, not local storage, when `NODE_ENV=production`.
