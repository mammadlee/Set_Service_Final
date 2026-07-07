# SET Service Company Dashboard

React + TypeScript company frontend for the existing SET Service backend MVP. It uses the current Swagger/OpenAPI contract and does not change backend APIs.

## Stack

- Vite
- React
- TypeScript
- React Router
- Feature-first folders
- Typed API service layer
- Local storage token persistence
- Responsive SaaS dashboard UI
- Azerbaijani UI copy for all app-owned screens, states, buttons, and errors

## Local Setup

```bash
cd apps/company_dashboard
npm install
cp .env.example .env
npm run dev
```

The default API target is `http://localhost:3000/v1`. Set `VITE_API_BASE_URL` in `.env` to either the backend root or the `/v1` API root:

```env
VITE_API_BASE_URL=http://localhost:3000
```

For production builds, `VITE_API_BASE_URL` is required and must point to a real HTTPS API host. The app intentionally refuses to silently use `localhost` in production.

```env
VITE_API_BASE_URL=https://api.yourdomain.com
```

## Security Notes

- The frontend verifies that the stored access token is a company session before opening protected routes.
- Backend RBAC remains the authority for every protected request.
- Token persistence uses localStorage for the MVP. For production, prefer an HttpOnly refresh cookie or a stronger CSP/session strategy before handling real customer traffic.
- The app does not log access tokens, refresh tokens, OTP codes, QR tokens, or secrets.

## Validation

```bash
cd apps/company_dashboard
npm run typecheck
npm run build
```

## Implemented Company Flow

1. Company signs in with email + password.
2. Access is blocked when the company is not approved.
3. Approved company can view dashboard summaries.
4. Approved company can create, list, view, and cancel its own orders.
5. Company can view assignments connected to its own orders.
6. Company can generate attendance QR tokens for accepted active assignments.
7. Company can view attendance logs and detail records for its own orders.
8. Company can view notifications and mark them read.

## Main Screens

- Company email/password login
- Pending approval state
- Protected sidebar layout
- Dashboard overview
- Orders list, multi-category create form, detail, and cancel confirmation
- Assignments list with QR generation action and company-safe assigned worker profile view
- Attendance list and detail
- Dynamic QR display/token generator with 30-second refresh
- Notifications list with unread state

## Backend Routes Used

- `POST /v1/auth/company/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `POST /v1/orders`
- `GET /v1/orders`
- `GET /v1/orders/:id`
- `PATCH /v1/orders/:id/cancel`
- `GET /v1/assignments`
- `GET /v1/workers/:id/company-profile`
- `GET /v1/assignments/:id`
- `POST /v1/attendance/qr-token`
- `GET /v1/attendance`
- `GET /v1/attendance/:id`
- `GET /v1/notifications`
- `PATCH /v1/notifications/:id/read`
- `PATCH /v1/notifications/read-all`

## Company Test Flow

Start the backend first:

```bash
docker compose up -d postgres
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Then start the company dashboard:

```bash
cd apps/company_dashboard
npm run dev
```

Test with an approved company from seed data:

1. Login with the seeded company credentials: `company@setservice.az` / `<explicit-company-password>`.
3. Create a future order.
4. Add one or more category rows, such as waiter and bartender.
5. Confirm the order appears in the order list with category requirements.
6. After super admin assigns workers, open Assignments.
7. Generate QR only for accepted active assignments.
8. After worker check-in/out, verify Attendance list and details.
9. Open Notifications and mark entries as read.

## Known MVP Limitations

- There is no dedicated company profile endpoint, so the dashboard uses token payload data for the signed-in company identity.
- Dashboard metrics are composed from existing list endpoints. A dedicated summary endpoint would reduce round trips later.
- Company cannot create assignments; assignment creation is intentionally super-admin-only in the current backend contract.
- QR tokens are generated on demand, displayed as a large QR code, and refreshed every 30 seconds. They are not persisted by the frontend.
