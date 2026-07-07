# SET Service Backend MVP

SET Service is a workforce and job platform backend for four roles:

- Worker
- Company
- Super Admin
- Restricted Admin

The current MVP supports the full operational flow:

Worker registration with OTP + password creation -> admin approval -> worker phone/password login -> approved company email/password login creates an order -> super admin assigns a worker -> worker accepts assignment -> QR-based attendance check-in and check-out.

The full MVP smoke test passed for:

Auth -> Worker Approval -> Company Order -> Admin Assignment -> Worker Accept -> QR Check-in/out.

## Admin Permission System

`super_admin` has full access. `admin` accounts are internal-only and can access only explicitly assigned permissions:

```text
view_dashboard, view_workers, manage_workers, view_companies, manage_companies,
view_orders, view_assignments, manage_assignments, view_attendance,
view_reports, manage_kiosks, view_notifications, manage_admins
```

Seeded credentials:

```text
Super Admin: admin@setservice.az / <explicit-admin-password>
Ops Admin:   ops@setservice.az / <explicit-admin-password>
Reports:     reports@setservice.az / <explicit-admin-password>
```

Admin management endpoints are under `/v1/admin/admins`; there is no public admin signup.

## Department / Position Taxonomy

Orders and worker profiles now use a structured selector model:

```text
Şöbə -> Departament -> Vəzifə
```

Public selector endpoints are `/v1/taxonomy` and `/v1/taxonomy/positions`. Super admin or an admin with `manage_admins` can add, edit, activate, or deactivate departments, subdepartments, and positions from `/v1/taxonomy/admin/*`.

## Tech Stack

- Runtime: Node.js + TypeScript
- HTTP framework: Express
- Database: PostgreSQL
- ORM: Prisma
- Auth: JWT access tokens, refresh tokens, password login, OTP verification/reset
- Validation: Zod
- API docs: Swagger/OpenAPI at `/docs`
- Notifications: in-app notifications plus Firebase Cloud Messaging push delivery
- Monitoring hook: Sentry

## Architecture Summary

The backend is organized as a modular monolith. Each production-ready vertical slice follows this shape:

```text
validator/schema -> router/controller -> service -> repository/prisma
```

Important directories:

```text
src/
  app.ts
  index.ts
  lib/
  middleware/
  modules/
    auth/
    workers/
    companies/
    orders/
    assignments/
    attendance/
    notifications/
    ratings/
prisma/
  schema.prisma
  migrations/
scripts/
  seed.ts
  mvp-flow-smoke.ts
swagger.yaml
```

Core responsibilities:

- Routers handle HTTP shape only.
- Zod schemas validate request bodies, params, and query strings.
- Services own business rules.
- Repositories own Prisma queries and transactions.
- Middleware handles auth, RBAC, approved-account checks, and error formatting.

## Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start PostgreSQL With Docker

```bash
docker run --name hireapp-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hireapp \
  -p 5433:5432 \
  -d postgres:15
```

If the container already exists:

```bash
docker start hireapp-postgres
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Minimum development values:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/hireapp?schema=public"
JWT_SECRET="change-this-to-a-secure-random-string-min-32-chars"
QR_HMAC_SECRET="change-this-too-min-32-chars"
QR_TOKEN_TTL_SECONDS="300"
OTP_TEST_MODE="true"
OTP_TEST_CODE="123456"
OTP_LOG_CODES="true"
```

See [ENV_SETUP.md](./ENV_SETUP.md) for the full environment reference.

Push notifications are optional locally. Set `PUSH_NOTIFICATIONS_ENABLED=true` and provide Firebase service account variables only when testing real FCM delivery.

### 4. Migrate and Seed

```bash
npx prisma generate
npx prisma migrate dev
npm run db:seed
```

Seeded default accounts:

```text
Super Admin: +994700000001
Company:     +994700000002
Worker:      +994700000003 approved
Worker:      +994700000004 pending approval
Worker:      +994700000005 rejected
Test OTP:    123456
```

### 5. Run Development Server

```bash
npm run dev
```

Server defaults:

```text
API:     http://localhost:3000/v1
Health:  http://localhost:3000/health
Swagger: http://localhost:3000/docs
```

## Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run db:migrate
npm run db:seed
npm run db:studio
npm run smoke:mvp
```

## MVP Smoke Test

Run with the API server already running:

```bash
BASE_URL=http://localhost:3000 TEST_OTP=123456 npm run smoke:mvp
```

PowerShell:

```powershell
$env:BASE_URL="http://localhost:3000"
$env:TEST_OTP="123456"
npm run smoke:mvp
```

The smoke test dynamically creates a worker and order, then verifies the full MVP flow:

Auth -> Worker Approval -> Company Order -> Admin Assignment -> Worker Accept -> QR Check-in/out.

## Role-Based Flows

### Worker

1. Registers with phone and profile details.
2. Receives OTP.
3. Verifies OTP.
4. Moves to `pending_approval`.
5. Cannot log in until approved.
6. After super admin approval, can log in with phone and password.
7. Can accept or reject own assignments.
8. Can check in/out only for own accepted assignments.
9. Can view own attendance records.

### Company

1. Logs in with email and password if approved.
2. Creates orders only when approved.
3. Lists and views own orders.
4. Views assignments connected to own orders.
5. Generates attendance QR tokens for own accepted assignments.
6. Views attendance for own order assignments.

### Super Admin

1. Logs in with email and password.
2. Lists and approves/rejects workers.
3. Lists and approves/rejects companies.
4. Lists and views all orders.
5. Creates and cancels assignments.
6. Views all attendance records.

## Main API Areas

### Auth

- `POST /v1/auth/worker/register`
- `POST /v1/auth/worker/complete-registration`
- `POST /v1/auth/worker/login`
- `POST /v1/auth/worker/forgot-password`
- `POST /v1/auth/worker/reset-password`
- `POST /v1/auth/company/register`
- `POST /v1/auth/company/complete-registration`
- `POST /v1/auth/company/login`
- `POST /v1/auth/company/forgot-password`
- `POST /v1/auth/company/reset-password`
- `POST /v1/auth/admin/login`
- `POST /v1/auth/admin/forgot-password`
- `POST /v1/auth/verify-otp`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`

`/v1/auth/verify-otp` is retained for legacy registration/reset compatibility. OTP login purposes are deprecated; production login is password-based.

### Admin Worker Approval

- `GET /v1/admin/workers`
- `GET /v1/admin/workers/:id`
- `PATCH /v1/admin/workers/:id/approve`
- `PATCH /v1/admin/workers/:id/reject`

### Orders

- `POST /v1/orders`
- `GET /v1/orders`
- `GET /v1/orders/:id`
- `PATCH /v1/orders/:id/cancel`

Orders now support multi-position staffing requirements through `category_items` with `department_id`, `subdepartment_id`, and `position_id`, for example 3 waiters and 2 bartenders in a single order. Legacy `category` + `required_count` requests remain supported.

### Assignments

- `POST /v1/assignments`
- `GET /v1/assignments`
- `GET /v1/assignments/:id`
- `PATCH /v1/assignments/:id/accept`
- `PATCH /v1/assignments/:id/reject`
- `PATCH /v1/assignments/:id/cancel`

### Attendance and QR

- `POST /v1/attendance/qr-token`
- `GET /v1/attendance/venue-kiosks`
- `POST /v1/attendance/venue-kiosks`
- `GET /v1/attendance/venue-kiosks/:token`
- `POST /v1/attendance/venue-kiosks/:id/activate`
- `DELETE /v1/attendance/venue-kiosks/:id/active-session`
- `DELETE /v1/attendance/venue-kiosks/:id`
- `POST /v1/attendance/venue-kiosks/:token/qr-token`
- `POST /v1/attendance/kiosk-sessions`
- `GET /v1/attendance/kiosk-sessions/:token`
- `POST /v1/attendance/kiosk-sessions/:token/qr-token`
- `DELETE /v1/attendance/kiosk-sessions/:id`
- `POST /v1/attendance/check-in`
- `POST /v1/attendance/check-out`
- `GET /v1/attendance`
- `GET /v1/attendance/:id`

Standalone venue kiosk:

- Web app: `apps/qr_kiosk`
- Route: `/kiosk/:venue_kiosk_token` (`/qr-kiosk/:venue_kiosk_token` is also accepted by the client)
- The kiosk URL is persistent for the venue/tablet; only the QR token inside the page changes every 30 seconds.
- Admin creates a venue kiosk once, then activates/deactivates the current order/shift remotely.
- The kiosk QR is order/shift-based. On scan, the backend finds the authenticated worker's accepted assignment under that order.
- The tablet stores no admin/company credentials.
- Kiosk display tokens are random, hash-persisted, revocable, and separate from auth tokens.
- The public kiosk QR endpoint returns a fresh attendance QR every 30 seconds.
- If network fails, the UI stops presenting an expired QR as valid and shows an Azerbaijani reconnect state.

Local QR kiosk test:

```bash
# Terminal 1
npm run dev

# Terminal 2
cd apps/admin_panel
npm run dev

# Terminal 3
cd apps/qr_kiosk
npm run dev

# Terminal 4
cd apps/worker_app
flutter run -d emulator-5554 --dart-define=BASE_URL=http://10.0.2.2:3000
```

Then log in to the admin panel, open `QR ekranı`, create/select a venue kiosk, select an active order with accepted workers, click `Bu kioskda QR-ı aktiv et`, copy/open the persistent kiosk link, log in as the assigned worker on mobile, scan the kiosk QR, and verify the check-in/check-out in `Giriş-çıxış`.

### Ratings and Worker Class

- `POST /v1/ratings`
- `GET /v1/ratings/me`
- `GET /v1/workers/:id/ratings`
- `PATCH /v1/admin/workers/:id/class`

### Admin Reports

- `GET /v1/admin/reports/summary`
- `GET /v1/admin/reports`

Reports include dashboard counts, worker work counts, attendance totals, company usage, rating stats, and assignment status stats with optional date/company/worker/category filters.

## Known MVP Limitations

- SMS provider is not integrated for production delivery yet.
- OTP test mode is intended only for development and smoke testing.
- Push notifications use Firebase Cloud Messaging when `PUSH_NOTIFICATIONS_ENABLED=true`; email is still an extension point.
- Attendance supports one session per assignment for MVP.
- Payroll is not implemented.
- QR tokens are HMAC-signed and time-limited; standalone kiosk display sessions are revocable and expire separately from worker auth.
- Order completion lifecycle is not fully automated.
- Rating becomes available after attendance checkout is completed; payroll is still out of scope.
- Position-aware order rows enforce that assigned workers have the selected `position_id`.
- Deprecated `POST /v1/orders/:id/assign` is kept only for single-category compatibility.

## More Documentation

- [API_HANDOFF.md](./API_HANDOFF.md)
- [POSTMAN_TESTING.md](./POSTMAN_TESTING.md)
- [ENV_SETUP.md](./ENV_SETUP.md)
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
