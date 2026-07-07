# SET Service Postman Testing Guide

This guide helps QA, frontend, and mobile developers test the current SET Service MVP backend manually with Postman.

The automated MVP smoke test passed for:

Auth -> Worker Approval -> Company Order -> Admin Assignment -> Worker Accept -> QR Check-in/out.

## Prerequisites

Start local PostgreSQL, migrate, seed, and run the server:

```bash
npx prisma migrate dev
npm run db:seed
npm run dev
```

Server URLs:

```text
Base URL: http://localhost:3000
API URL:  http://localhost:3000/v1
Docs:     http://localhost:3000/docs
Health:   http://localhost:3000/health
```

## Postman Environment Variables

Create a Postman environment named `SET Service Local`.

Variables:

```text
base_url = http://localhost:3000
api_url = http://localhost:3000/v1
test_otp = 123456

admin_email = admin@setservice.az
admin_password = <explicit-admin-password>
ops_admin_email = ops@setservice.az
reports_admin_email = reports@setservice.az
company_email = company@setservice.az
company_password = <explicit-company-password>
worker_password = Worker123!
worker_phone = +994559001001

admin_access_token =
company_access_token =
worker_access_token =

worker_id =
company_id =
order_id =
order_category_item_id =
assignment_id =
attendance_qr_token =
attendance_id =
```

Use bearer auth for protected requests:

```text
Authorization: Bearer {{admin_access_token}}
```

or the company/worker equivalent.

## Admin Permission Checks

Admin login accepts both `super_admin` and restricted `admin` users:

```http
POST {{api_url}}/auth/admin/login
Content-Type: application/json

{
  "email": "{{reports_admin_email}}",
  "password": "{{admin_password}}"
}
```

The response includes `user.role` and `user.permissions`.

Permission test examples:

```http
GET {{api_url}}/admin/reports/summary
Authorization: Bearer {{reports_admin_access_token}}
```

Expected: `200`.

```http
GET {{api_url}}/attendance
Authorization: Bearer {{reports_admin_access_token}}
```

Expected: `403` with `code = PERMISSION_DENIED`.

Super admin or an admin with `manage_admins` can manage restricted admins:

```http
POST {{api_url}}/admin/admins
Authorization: Bearer {{admin_access_token}}
Content-Type: application/json

{
  "name": "Operations Admin",
  "email": "ops2@setservice.az",
  "password": "<explicit-admin-password>",
  "is_active": true,
  "permissions": ["view_dashboard", "view_workers", "manage_workers"]
}
```

Optional FCM device token registration after login:

```http
POST {{api_url}}/auth/fcm-token
Authorization: Bearer {{worker_access_token}}
Content-Type: application/json
```

```json
{
  "fcm_token": "{{fcm_token}}",
  "platform": "android"
}
```

On logout/device removal:

```http
DELETE {{api_url}}/auth/fcm-token
Authorization: Bearer {{worker_access_token}}
Content-Type: application/json
```

```json
{
  "fcm_token": "{{fcm_token}}"
}
```

## 1. Health Check

```http
GET {{base_url}}/health
```

Expected:

```json
{
  "status": "ok",
  "ts": "2026-05-18T10:00:00.000Z"
}
```

## 2. Worker Register

```http
POST {{api_url}}/auth/worker/register
Content-Type: application/json
```

Body:

```json
{
  "full_name": "Smoke Worker",
  "phone": "{{worker_phone}}",
  "position": "Event Staff",
  "skills": ["events", "setup"],
  "languages": ["az", "en"],
  "documents": []
}
```

Expected:

- `201 Created`
- Save `worker_id` as `{{worker_id}}`
- Status should be `pending_otp`

## 3. Verify Worker Registration OTP and Create Password

```http
POST {{api_url}}/auth/worker/complete-registration
Content-Type: application/json
```

Body:

```json
{
  "phone": "{{worker_phone}}",
  "otp_code": "{{test_otp}}",
  "password": "{{worker_password}}"
}
```

Expected:

- `200 OK`
- Status becomes `pending_approval`
- Password is set for future phone/password login

## 4. Worker Login Blocked Before Approval

```http
POST {{api_url}}/auth/worker/login
Content-Type: application/json
```

Body:

```json
{
  "phone": "{{worker_phone}}",
  "password": "{{worker_password}}"
}
```

Expected:

- `403 Forbidden`
- Error code: `WORKER_NOT_APPROVED`

## 5. Admin Login

```http
POST {{api_url}}/auth/admin/login
Content-Type: application/json
```

Body:

```json
{
  "email": "{{admin_email}}",
  "password": "{{admin_password}}"
}
```

Expected:

- `200 OK`
- Save `access_token` as `{{admin_access_token}}`

## 6. Admin Approves Worker

```http
PATCH {{api_url}}/admin/workers/{{worker_id}}/approve
Authorization: Bearer {{admin_access_token}}
Content-Type: application/json
```

Body:

```json
{}
```

Expected:

- `200 OK`
- Worker status becomes `approved`

## 7. Worker Login After Approval

```http
POST {{api_url}}/auth/worker/login
Content-Type: application/json
```

Body:

```json
{
  "phone": "{{worker_phone}}",
  "password": "{{worker_password}}"
}
```

Expected:

- `200 OK`
- Save `access_token` as `{{worker_access_token}}`

## 8. Company Login

Seeded approved company:

```text
company@setservice.az / <explicit-company-password>
```

```http
POST {{api_url}}/auth/company/login
Content-Type: application/json
```

Body:

```json
{
  "email": "{{company_email}}",
  "password": "{{company_password}}"
}
```

Expected:

- `200 OK`
- Save `access_token` as `{{company_access_token}}`
- Save `user.company.id` as `{{company_id}}`

## 9. Load Taxonomy Positions

```http
GET {{api_url}}/taxonomy/positions
```

Save:

- `data[?slug=waiter-waitress].department_id` as `{{food_beverage_department_id}}`
- `data[?slug=waiter-waitress].subdepartment_id` as `{{restaurant_subdepartment_id}}`
- `data[?slug=waiter-waitress].id` as `{{waiter_position_id}}`
- `data[?slug=bartender].subdepartment_id` as `{{bar_subdepartment_id}}`
- `data[?slug=bartender].id` as `{{bartender_position_id}}`

## 10. Company Creates Order

```http
POST {{api_url}}/orders
Authorization: Bearer {{company_access_token}}
Content-Type: application/json
```

Body:

```json
{
  "title": "Postman banquet shift",
  "description": "Waiter and setup support for a Postman MVP test.",
  "category": "Waiter/Waitress",
  "required_count": 3,
  "category_items": [
    {
      "department_id": "{{food_beverage_department_id}}",
      "subdepartment_id": "{{restaurant_subdepartment_id}}",
      "position_id": "{{waiter_position_id}}",
      "required_count": 2,
      "notes": "White shirt uniform required."
    },
    {
      "department_id": "{{food_beverage_department_id}}",
      "subdepartment_id": "{{bar_subdepartment_id}}",
      "position_id": "{{bartender_position_id}}",
      "required_count": 1
    }
  ],
  "start_datetime": "2030-01-15T10:00:00.000Z",
  "end_datetime": "2030-01-15T18:00:00.000Z",
  "location": "Grand Hotel Baku, Baku",
  "pay_rate": 18.5,
  "required_skills": ["events"],
  "notes": "Created from Postman."
}
```

Expected:

- `201 Created`
- Save `id` as `{{order_id}}`
- Save `category_items[0].id` as `{{order_category_item_id}}`

## 11. Super Admin Assigns Worker

Use `POST /assignments` for multi-category orders. The deprecated `POST /orders/:id/assign` wrapper is single-category compatibility only.

```http
POST {{api_url}}/assignments
Authorization: Bearer {{admin_access_token}}
Content-Type: application/json
```

Body:

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

Expected:

- `201 Created`
- Save `assignments[0].id` as `{{assignment_id}}`
- Assignment status is `assigned`

## 11. Worker Accepts Assignment

```http
PATCH {{api_url}}/assignments/{{assignment_id}}/accept
Authorization: Bearer {{worker_access_token}}
Content-Type: application/json
```

Body:

```json
{}
```

Expected:

- `200 OK`
- Assignment status becomes `accepted`

## 12. Company Generates Attendance QR Token

```http
POST {{api_url}}/attendance/qr-token
Authorization: Bearer {{company_access_token}}
Content-Type: application/json
```

Body:

```json
{
  "assignment_id": "{{assignment_id}}"
}
```

Expected:

- `200 OK`
- Save `token` as `{{attendance_qr_token}}`

## 13. Worker Checks In

```http
POST {{api_url}}/attendance/check-in
Authorization: Bearer {{worker_access_token}}
Content-Type: application/json
```

Body:

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

Expected:

- `201 Created`
- Save `id` as `{{attendance_id}}`

## 14. Duplicate Check-In

Repeat the previous check-in request.

Expected:

- `409 Conflict`
- Error code: `ATTENDANCE_ALREADY_CHECKED_IN`

## 15. Worker Checks Out

```http
POST {{api_url}}/attendance/check-out
Authorization: Bearer {{worker_access_token}}
Content-Type: application/json
```

Body:

```json
{
  "assignment_id": "{{assignment_id}}",
  "qr_token": "{{attendance_qr_token}}",
  "location": {
    "latitude": 40.4093,
    "longitude": 49.8671,
    "address": "Grand Hotel Baku exit"
  },
  "notes": "Shift completed."
}
```

Expected:

- `200 OK`
- `checkout_time` is populated

## 16. Re-Check-In After Checkout

Repeat check-in after checkout.

Expected:

- `409 Conflict`
- Error code: `ATTENDANCE_ALREADY_COMPLETED`

## 17. Attendance Visibility Checks

Worker:

```http
GET {{api_url}}/attendance?assignment_id={{assignment_id}}
Authorization: Bearer {{worker_access_token}}
```

Company:

```http
GET {{api_url}}/attendance?assignment_id={{assignment_id}}
Authorization: Bearer {{company_access_token}}
```

Admin:

```http
GET {{api_url}}/attendance?assignment_id={{assignment_id}}
Authorization: Bearer {{admin_access_token}}
```

Expected for all three:

- `200 OK`
- Response includes `{{attendance_id}}`

## 18. Company Rates Worker After Checkout

Use the company token after step 15.

```http
POST {{api_url}}/ratings
Authorization: Bearer {{company_access_token}}
Content-Type: application/json

{
  "assignment_id": "{{assignment_id}}",
  "score": 5,
  "feedback": "İşçi növbəni vaxtında və keyfiyyətlə tamamladı."
}
```

Expected:

- `201 Created`
- Response includes `score: 5`

Repeat the same request.

Expected:

- `409 Conflict`
- Error code: `DUPLICATE_RATING`

## 19. Worker Rating History

```http
GET {{api_url}}/ratings/me
Authorization: Bearer {{worker_access_token}}
```

Expected:

- `200 OK`
- `rating_count` is at least `1`

## 20. Admin Worker Class

```http
PATCH {{api_url}}/admin/workers/{{worker_id}}/class
Authorization: Bearer {{admin_access_token}}
Content-Type: application/json

{
  "worker_class": "A"
}
```

Expected:

- `200 OK`
- Response includes `worker_class: "A"`

## 21. Persistent Venue QR Kiosk

Create a persistent venue/tablet kiosk link:

```http
POST {{api_url}}/attendance/venue-kiosks
Authorization: Bearer {{company_access_token}}
Content-Type: application/json

{
  "name": "Hilton əsas giriş",
  "location_label": "Lobby / əsas giriş"
}
```

Expected:

- `201 Created`
- Save `id` as `{{venue_kiosk_id}}`
- Save `kiosk_token` as `{{venue_kiosk_token}}`
- Response includes `kiosk_url`

Before activation, fetch public kiosk context:

```http
GET {{api_url}}/attendance/venue-kiosks/{{venue_kiosk_token}}
```

Expected:

- `200 OK`
- Safe company/kiosk context only
- `active_session` is `null`
- No auth token, QR signing secret, worker phone, or worker email

Activate an active order/shift on the kiosk:

```http
POST {{api_url}}/attendance/venue-kiosks/{{venue_kiosk_id}}/activate
Authorization: Bearer {{company_access_token}}
Content-Type: application/json

{
  "order_id": "{{order_id}}"
}
```

Generate the public kiosk QR after activation:

```http
POST {{api_url}}/attendance/venue-kiosks/{{venue_kiosk_token}}/qr-token
```

Expected:

- `200 OK`
- Response includes `token`, `expires_at`, and `refresh_after_seconds: 30`
- Response includes `order_id`; it does not need `assignment_id`
- Tablet UI must refresh this QR every 30 seconds

Deactivate the active QR on that kiosk:

```http
DELETE {{api_url}}/attendance/venue-kiosks/{{venue_kiosk_id}}/active-session
Authorization: Bearer {{company_access_token}}
```

Expected:

- `200 OK`
- A later `POST /attendance/venue-kiosks/{{venue_kiosk_token}}/qr-token` returns `409 Conflict` with `KIOSK_WAITING_FOR_ACTIVE_ORDER`

Local tablet/admin flow:

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

Admin panel local defaults:

- API: `http://localhost:3000`
- Admin panel: `http://localhost:5173`
- QR kiosk: `http://localhost:5174/kiosk/{{venue_kiosk_token}}`
- Configure `VITE_KIOSK_BASE_URL` if the kiosk app runs elsewhere.

## Automated Smoke Test

The full Postman flow is also automated:

```bash
BASE_URL=http://localhost:3000 TEST_OTP=123456 npm run smoke:mvp
```

PowerShell:

```powershell
$env:BASE_URL="http://localhost:3000"
$env:TEST_OTP="123456"
npm run smoke:mvp
```

Expected output:

```text
[PASS] 1. Health check
[PASS] 2. Worker register
[PASS] 3. Worker registration OTP verify and password creation
[PASS] 4. Worker login blocked while pending approval
[PASS] 5. Admin login with email and password
[PASS] 6. Admin approves worker
[PASS] 7. Worker login with phone and password after approval
[PASS] 8. Company login with email and password
[PASS] 9. Company creates order
[PASS] 10. Super admin assigns worker to order
[PASS] 11. Worker accepts assignment
[PASS] 12. Company generates attendance QR token
[PASS] 13. Worker checks in
[PASS] 14. Duplicate check-in returns expected 409
[PASS] 15. Worker checks out
[PASS] 16. Re-check-in after checkout returns expected 409
[PASS] 17. Worker/company/admin attendance list visibility checks
```

## Common Testing Notes

- Use unique worker phone numbers for repeated manual tests.
- Use future dates for order start/end.
- If OTP cooldown occurs, wait 60 seconds or verify the existing OTP using the same test code.
- QR token expires according to `QR_TOKEN_TTL_SECONDS`.
- Reusing the QR token after checkout should return `ATTENDANCE_ALREADY_COMPLETED` for the same assignment.
