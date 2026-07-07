# SET Service API Handoff

This document summarizes the current working MVP backend for frontend, mobile, QA, and deployment handoff.

## Current MVP Status

The backend contains working vertical slices for:

- Password auth, OTP verification/reset, and JWT sessions
- Worker registration and approval
- Company email/password login
- Orders
- Assignments
- Attendance and QR
- Notifications and Firebase Cloud Messaging push delivery
- Audit logs
- Role-based access control

The full MVP smoke test passed:

Auth -> Worker Approval -> Company Order -> Admin Assignment -> Worker Accept -> QR Check-in/out.

## Base URLs

Local development:

```text
http://localhost:3000/v1
```

Health check:

```text
GET http://localhost:3000/health
```

Swagger:

```text
http://localhost:3000/docs
```

## Authentication Model

SET Service now uses production-style password login plus JWT tokens. OTP is used for first registration verification and password reset, not for every login.

Canonical login endpoints:

- Worker: `POST /v1/auth/worker/login` with `phone` + `password`
- Company: `POST /v1/auth/company/login` with `email` + `password`
- Super Admin / Admin: `POST /v1/auth/admin/login` with `email` + `password`

Registration/password endpoints:

```text
POST /v1/auth/worker/register
POST /v1/auth/worker/complete-registration
POST /v1/auth/worker/forgot-password
POST /v1/auth/worker/reset-password
POST /v1/auth/company/register
POST /v1/auth/company/complete-registration
POST /v1/auth/company/forgot-password
POST /v1/auth/company/reset-password
POST /v1/auth/admin/forgot-password
```

`POST /v1/auth/verify-otp` remains as a legacy verification endpoint. Login OTP purposes are deprecated and return `OTP_LOGIN_DEPRECATED`.

Successful login returns:

```json
{
  "access_token": "jwt-access-token",
  "refresh_token": "jwt-refresh-token",
  "user": {
    "id": "user-id",
    "phone": "+994700000001",
    "email": "admin@setservice.az",
    "role": "super_admin",
    "name": "Super Admin",
    "worker": null,
    "company": null,
    "permissions": ["view_dashboard", "manage_admins"]
  }
}
```

Use the access token:

```http
Authorization: Bearer <access_token>
```

## Super Admin and Restricted Admin Permissions

Roles:

- `super_admin`: full platform access; bypasses permission checks.
- `admin`: internal admin user with explicit permissions.
- `company` and `worker`: cannot access admin routes.

Admin accounts are not publicly registered. A super admin or an admin with `manage_admins` can manage them through:

```text
GET /v1/admin/admins
POST /v1/admin/admins
PATCH /v1/admin/admins/:id
DELETE /v1/admin/admins/:id
```

Available permissions:

```text
view_dashboard, view_workers, manage_workers, view_companies, manage_companies,
view_orders, view_assignments, manage_assignments, view_attendance,
view_reports, manage_kiosks, view_notifications, manage_admins
```

Permission dependencies are normalized by the backend:

```text
manage_workers -> view_workers
manage_companies -> view_companies
manage_assignments -> view_assignments, view_orders, view_workers
manage_kiosks -> view_orders, view_assignments
```

Restricted admin seed accounts:

```text
ops@setservice.az / <explicit-admin-password>
reports@setservice.az / <explicit-admin-password>
```

## Department / Subdepartment / Position Taxonomy

The app now uses a structured role taxonomy:

```text
Şöbə -> Departament -> Vəzifə
```

Public selector endpoints:

- `GET /v1/taxonomy`
- `GET /v1/taxonomy/positions`

Super admin or an admin with `manage_admins` can manage active/inactive taxonomy rows:

- `GET /v1/taxonomy/admin`
- `POST/PATCH /v1/taxonomy/admin/departments`
- `POST/PATCH /v1/taxonomy/admin/subdepartments`
- `POST/PATCH /v1/taxonomy/admin/positions`

New company orders and worker profiles should send `position_id` values. Legacy `category` / worker `position` strings remain supported for existing data display and backward compatibility.

Forbidden admin access returns `403` with `code: PERMISSION_DENIED` and an Azerbaijani message.

## Push Notification Tokens

Mobile clients should register the Firebase Cloud Messaging token after login or token refresh:

```http
POST /v1/auth/fcm-token
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "fcm_token": "fcm_registration_token_from_device",
  "platform": "android",
  "device_id": "optional-installation-id"
}
```

On logout, call:

```http
DELETE /v1/auth/fcm-token
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "fcm_token": "fcm_registration_token_from_device"
}
```

The backend supports multiple devices per user. FCM tokens must not be logged by clients or servers.

## Roles

Supported roles:

- `worker`
- `company`
- `super_admin`

Protected worker and company APIs also require the underlying worker/company profile to be approved.

## Worker Status Lifecycle

```text
draft
pending_otp
pending_approval
approved
rejected
suspended
inactive
```

MVP flow:

1. Worker registers.
2. Worker status becomes `pending_otp`.
3. Worker verifies registration OTP and creates a password through `/auth/worker/complete-registration`.
4. Worker status becomes `pending_approval`.
5. Super admin approves worker.
6. Worker status becomes `approved`.
7. Worker can log in with phone + password and use worker APIs.

Non-approved workers receive clear blocking responses during login.

## Company Status Lifecycle

```text
pending_approval
approved
rejected
suspended
inactive
```

Company registration requires company name, email, phone, OTP verification, and password creation. Company login uses email + password and remains blocked until the company status is `approved`. For MVP smoke testing, the seed script creates an approved company.

## OTP Flow

Development OTP defaults:

```text
123456
```

Development mode is controlled by:

```env
OTP_TEST_MODE="true"
OTP_TEST_CODE="123456"
```

Production requirements:

- Disable OTP logging.
- Disable test OTP mode.
- Configure a real SMS provider.
- Keep OTP hashes protected with `OTP_PEPPER`.

OTP security behavior:

- Raw OTP codes are not stored in the database.
- OTP codes are hashed.
- OTP expires.
- Failed attempts are limited.
- Temporary blocking is supported.
- Cooldown is applied to resend/login requests.

## Worker Approval APIs

List workers:

```text
GET /v1/admin/workers
```

Get worker detail:

```text
GET /v1/admin/workers/:id
```

Approve worker:

```text
PATCH /v1/admin/workers/:id/approve
```

Reject worker:

```text
PATCH /v1/admin/workers/:id/reject
```

Reject body:

```json
{
  "reason": "Documents are incomplete."
}
```

## Worker Profile and Documents

Approved worker profile:

```text
GET /v1/workers/me
PATCH /v1/workers/me
```

Workers can update `skills`, `languages`, `availability`, and `work_history_summary`.

Secure uploads:

```text
POST /v1/workers/me/profile-photo
POST /v1/workers/me/documents
```

Both upload endpoints require worker Bearer auth and approved worker status. Uploads use `multipart/form-data` with a `file` field. Document upload also requires `type`, currently `health_certificate` or `criminal_record`.

Company-safe worker profile:

```text
GET /v1/workers/:id/company-profile
```

Companies can only view workers assigned to their own orders. Phone, email, and private contact data are intentionally omitted. Company responses include profile photo, position, skills, languages, allowed documents, work history summary, and rating summary.

Approval/rejection creates audit logs and notifications.

## Company Order Flow

Approved company creates an order:

```text
POST /v1/orders
```

Request body:

```json
{
  "title": "Banquet service shift",
  "description": "Waiter and kitchen support for an evening hotel banquet.",
  "category": "Waiter/Waitress",
  "required_count": 6,
  "category_items": [
    {
      "department_id": "{{food_beverage_department_id}}",
      "subdepartment_id": "{{restaurant_subdepartment_id}}",
      "position_id": "{{waiter_position_id}}",
      "required_count": 3,
      "notes": "White shirt uniform required."
    },
    {
      "department_id": "{{food_beverage_department_id}}",
      "subdepartment_id": "{{bar_subdepartment_id}}",
      "position_id": "{{bartender_position_id}}",
      "required_count": 2
    }
  ],
  "start_datetime": "2030-01-15T10:00:00.000Z",
  "end_datetime": "2030-01-15T18:00:00.000Z",
  "location": "Grand Hotel Baku, Baku",
  "pay_rate": 18.5,
  "required_skills": ["waiter"],
  "notes": "Formal dress required."
}
```

Rules:

- Only approved companies can create orders.
- Worker count must be positive.
- Start date must be in the future.
- End date must be after start date.
- Super admin or an admin with `view_orders` can list/get all orders.
- Company can list/get own orders.
- Only the approved company owner can cancel its own order.
- Super admin cannot cancel orders in the current MVP.
- `category_items` with `department_id`, `subdepartment_id`, and `position_id` is the preferred multi-position format. `category` + `required_count` remains supported for legacy clients.

## Assignment Flow

Super admin or an admin with `manage_assignments` assigns approved available workers:

```text
POST /v1/assignments
```

Request body:

```json
{
  "order_id": "{{order_id}}",
  "assignments": [
    {
      "worker_id": "{{worker_id}}",
      "order_category_item_id": "{{order_category_item_id}}"
    }
  ]
}
```

Rules:

- Requires `super_admin` or admin with `manage_assignments`.
- Worker must be approved and available.
- Order must be active.
- Assignment count cannot exceed the selected category requirement when `category_items` are present.
- Duplicate worker assignment to the same order is blocked.
- Worker can accept or reject only own assignment.
- Company can view assignments connected to own orders.
- Worker can view own assignments.
- Super admin or an admin with `view_assignments` can view all assignments.
- If an order row has `position_id`, assignment enforces that the selected worker has that position in `worker_positions`.
- Deprecated `POST /v1/orders/:id/assign` is single-category compatibility only. Multi-category orders should use `POST /v1/assignments` with `order_category_item_id`.

Worker accepts:

```text
PATCH /v1/assignments/:id/accept
```

Worker rejects:

```text
PATCH /v1/assignments/:id/reject
```

Super admin or an admin with `manage_assignments` cancels:

```text
PATCH /v1/assignments/:id/cancel
```

## Attendance and QR Flow

Attendance is based on accepted assignments only.

Generate QR token:

```text
POST /v1/attendance/qr-token
```

Request body:

```json
{
  "assignment_id": "{{assignment_id}}"
}
```

Who can generate:

- Super admin or an admin with `manage_kiosks` for any accepted assignment on an active order.
- Approved company for accepted assignments on its own active orders.

Worker check-in:

```text
POST /v1/attendance/check-in
```

Request body:

```json
{
  "assignment_id": "{{assignment_id}}",
  "qr_token": "{{attendance_qr_token}}",
  "location": {
    "latitude": 40.4093,
    "longitude": 49.8671,
    "address": "Grand Hotel Baku entrance"
  },
  "notes": "Arrived on time."
}
```

Worker check-out:

```text
POST /v1/attendance/check-out
```

Request body:

```json
{
  "assignment_id": "{{assignment_id}}",
  "qr_token": "{{attendance_qr_token}}",
  "notes": "Shift completed."
}
```

Rules:

- Worker can check in only for own accepted assignment.
- Assignment parent order must be active.
- Duplicate open attendance is blocked.
- MVP allows only one attendance session per assignment.
- After checkout, a second check-in returns `409 ATTENDANCE_ALREADY_COMPLETED`.
- QR tokens are HMAC-signed and expire.
- Raw QR token is not stored in the database.

List attendance:

```text
GET /v1/attendance
```

Visibility:

- Worker sees own records.
- Company sees records for own order assignments.
- Super admin or an admin with `view_attendance` sees all records.

## Notifications

MVP notification architecture supports:

- `worker_approved`
- `worker_rejected`
- `company_approved`
- `company_rejected`
- `order_created`
- `job_assigned`
- `system`

Channels:

- `in_app`
- `sms`
- `email`
- `push`

MVP primarily uses in-app notifications. External channel delivery can be expanded later.

## Audit Logs

Sensitive actions create audit logs, including:

- Worker approval/rejection
- Company approval/rejection
- Order creation/cancellation
- Assignment creation/cancellation/status changes
- Attendance check-in/check-out
- Rating creation
- Worker class updates
- Login failure
- OTP blocking

Audit logs include actor, role, action, entity type, entity id, metadata, and timestamp.

## Ratings and Worker Class

Rating rule:

- A company can rate a worker only after the worker has completed checkout for that company assignment.
- Duplicate rating for the same assignment/order/worker is rejected with `DUPLICATE_RATING`.
- If checkout is not completed yet, the API returns `RATING_NOT_AVAILABLE`.
- Creating a rating updates `worker.rating_avg` and `worker.rating_count`.

Endpoints:

- `POST /v1/ratings` with `{ "assignment_id": "{{assignment_id}}", "score": 5, "feedback": "..." }`
- `GET /v1/ratings/me` for worker rating summary/history
- `GET /v1/workers/:id/ratings` requires `super_admin` or admin with `view_workers`

Worker class:

- Requires `super_admin` or admin with `manage_workers` to assign `A`, `B`, or `C` via `PATCH /v1/admin/workers/:id/class`.
- Worker class is admin-only for MVP and is not returned in company-safe worker profile responses.

## Admin Reports

Super admin or an admin with `view_dashboard` / `view_reports` can read dashboard/report metrics:

- `GET /v1/admin/reports/summary`
- `GET /v1/admin/reports`

Supported filters:

- `start_date`
- `end_date`
- `company_id`
- `worker_id`
- `category`
- `department_id`
- `subdepartment_id`
- `position_id`

Response includes today's active orders, pending orders, active assignments, checked-in workers today, rejected assignments, pending approvals, worker work counts, attendance totals, company usage, rating stats, assignment status stats, position demand, department demand, and company-position usage.

## Standalone QR Kiosk

Partner venues can open a public tablet-safe QR page without storing admin or company credentials on the device.

Lifecycle:

- Admin creates a persistent venue kiosk for a company/tablet, then activates the current order/shift on that kiosk.
- The API returns the raw `venue_kiosk_token` once on creation and a reusable `kiosk_url`.
- The kiosk URL stays stable; only the signed attendance QR token refreshes every 30 seconds.
- The kiosk page calls public token-protected endpoints to fetch safe display context and a fresh attendance QR.
- Worker scan resolves by authenticated worker plus kiosk QR order context; no worker name is encoded into the venue QR.
- Disabled kiosks return `VENUE_KIOSK_DISABLED`; inactive kiosks return `KIOSK_WAITING_FOR_ACTIVE_ORDER`.
- Default web route is `/kiosk/:venue_kiosk_token`; the kiosk client also accepts `/qr-kiosk/:venue_kiosk_token` for compatibility.

Endpoints:

- `GET /v1/attendance/venue-kiosks` protected kiosk list.
- `POST /v1/attendance/venue-kiosks` protected persistent kiosk creation.
- `GET /v1/attendance/venue-kiosks/:token` public token-protected safe context.
- `POST /v1/attendance/venue-kiosks/:id/activate` protected order/shift activation.
- `DELETE /v1/attendance/venue-kiosks/:id/active-session` protected active order deactivation.
- `DELETE /v1/attendance/venue-kiosks/:id` protected kiosk disable/revoke.
- `POST /v1/attendance/venue-kiosks/:token/qr-token` public token-protected fresh 30 second attendance QR.
- Legacy assignment-specific `/attendance/kiosk-sessions` endpoints remain for compatibility.

Local admin/kiosk setup:

- Backend: `npm run dev` on `http://localhost:3000`
- Admin panel: `cd apps/admin_panel && npm run dev` on `http://localhost:5173`
- Kiosk: `cd apps/qr_kiosk && npm run dev` on `http://localhost:5174`
- Worker app emulator: `flutter run -d emulator-5554 --dart-define=BASE_URL=http://10.0.2.2:3000`
- Admin panel can resolve relative backend `kiosk_url` values with `VITE_KIOSK_BASE_URL`.

Security model:

- Kiosk tokens are random display tokens, not auth tokens.
- Only SHA-256 token hashes are used for lookup; encrypted token ciphertext is stored only so admins can re-copy the persistent kiosk link.
- HTTP request logs redact kiosk tokens from kiosk URLs.
- Company users can manage only their own company kiosks/orders; admin can manage all kiosks.
- The public context excludes worker phone/email and never exposes QR signing secrets.
- Worker mobile check-in/check-out uses the existing attendance rules; order-based kiosk QR finds the worker's accepted assignment under the active order.

## Error Format

Application errors are returned in a consistent shape:

```json
{
  "error": "Worker is not approved for login.",
  "code": "WORKER_NOT_APPROVED",
  "details": {
    "status": "pending_approval"
  },
  "timestamp": "2026-05-18T10:00:00.000Z"
}
```

Validation errors return:

```json
{
  "error": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "phone",
      "message": "Phone number must be E.164, for example +994501234567"
    }
  ]
}
```

## Known MVP Limitations

- Payroll is not implemented.
- SMS delivery provider is not integrated yet.
- Production OTP mode must disable test codes and OTP logs.
- Push/email/SMS notification delivery is prepared but not fully productized.
- Automated order completion is not implemented.
- Advanced worker availability scheduling is not implemented.
