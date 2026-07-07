# SET Service Admin Panel

React + TypeScript admin frontend for the existing SET Service backend MVP. It uses the current Swagger/OpenAPI contract and does not redefine backend behavior.

## Stack

- Vite
- React
- TypeScript
- React Router
- `fetch` based typed API layer
- Local storage token persistence
- Feature-first folder structure
- Centralized Azerbaijani UI strings in `src/shared/i18n/appStrings.ts`

## Local Setup

```bash
cd apps/admin_panel
npm install
cp .env.example .env
npm run dev
```

By default the panel calls `http://localhost:3000/v1`. Change `VITE_API_BASE_URL` in `.env` if your backend runs elsewhere. The value can be either the server root, such as `http://localhost:3000`, or the API root, such as `http://localhost:3000/v1`.

## Build

```bash
cd apps/admin_panel
npm run typecheck
npm run build
```

## Admin Flow

1. Sign in with the seeded super admin email and password (`admin@setservice.az` / `<explicit-admin-password>`) or a restricted admin account.
2. The backend returns the normal access/refresh token pair plus `role` and `permissions`. Admin OTP login is deprecated.
3. Review dashboard counts sourced from real backend list endpoints.
4. Approve or reject pending workers and companies.
5. View all orders and order details.
6. Create assignments by selecting an active order and approved available workers.
7. Cancel assignments when needed.
8. Review attendance check-in/check-out sessions.
9. Read and mark admin notifications.

Restricted demo admins:

- `ops@setservice.az` / `<explicit-admin-password>`
- `reports@setservice.az` / `<explicit-admin-password>`

Super Admin sees the full `Super Admin Panel`. Restricted admins see `Admin Panel`, only the drawer items they are allowed to access, and a restricted-state message for blocked routes.

Manage permissions automatically include the view permissions they need. For example, `manage_assignments` also grants `view_assignments`, `view_orders`, and `view_workers`.

Internal mobile access note: Admin girişi əsas ekranda SET Service loqosuna uzun basmaqla açılır. Bu mətn mobil tətbiqin public ekranlarında göstərilmir.

## Implemented Screens

- Admin email/password login with Azerbaijani UI
- Protected sidebar layout
- Dashboard overview
- Worker list and full detail with approve/reject actions, profile photo, skills, languages, work history, rating summary, and documents
- Company list and detail with approve/reject actions
- Orders list and detail, including multi-category staffing requirements
- Assignment creation, list, detail, filters, and cancellation
- Reports page with dashboard counts and date/company/worker/Şöbə/Departament/Vəzifə filters
- Attendance list and detail
- Dynamic attendance QR display for accepted active assignments
- Notifications list, mark read, and mark all read
- Adminlər section for creating/editing restricted admins and assigning grouped permissions
- Vəzifələr section for managing Şöbə, Departament, and Vəzifə taxonomy rows

## Environment

```env
VITE_API_BASE_URL=http://localhost:3000
```

Examples:

```env
# Local backend
VITE_API_BASE_URL=http://localhost:3000

# Backend API root also works
VITE_API_BASE_URL=http://localhost:3000/v1

# Production
VITE_API_BASE_URL=https://api.yourdomain.com
```

Production builds must provide `VITE_API_BASE_URL`. The admin panel intentionally fails instead of silently using `localhost` in production.

## Security Note

The current admin panel stores access and refresh tokens in browser local storage for MVP integration speed. This is acceptable only for local development and controlled MVP testing. Before a real production launch, move the refresh token to an HttpOnly secure cookie or apply an equivalent hardened session strategy with strong CSP, XSS controls, short token lifetimes, and strict domain isolation.

## Test Flow

Start the backend first:

```bash
docker compose up -d postgres
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Then run the admin panel:

```bash
cd apps/admin_panel
npm run dev
```

Use the seeded super admin credentials from the backend seed output or project environment. After login, verify:

- Pending workers load under Workers.
- Approve/reject actions update status.
- Pending companies load under Companies.
- Orders list shows company-created orders.
- Assignments can be created for active orders and approved available workers, with Vəzifə-aware selection when the order has multiple position rows.
- Reports page returns admin summary metrics from `/v1/admin/reports/summary`.
- Assignment detail opens from the assignment list and supports cancellation.
- Attendance sessions appear after worker QR check-in/out.
- Notifications can be marked as read.

## Known MVP Limitations

- Dashboard metrics are composed from existing list endpoints. A dedicated analytics endpoint would reduce round trips later.
- Attendance filtering uses existing `assignment_id`, `order_id`, `worker_id`, and `open_only` query support. There is no dedicated `company_id` attendance filter in the current backend contract.
- The panel respects the current product decision that super admin can view orders but cannot cancel company orders.
- Dynamic QR display uses `POST /v1/attendance/qr-token`, refreshes every 30 seconds, and remains protected by admin authentication.
