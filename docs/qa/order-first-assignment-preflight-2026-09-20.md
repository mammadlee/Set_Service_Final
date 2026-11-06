# Order visibility and first-assignment preflight — 2026-09-20

## Scope and safety

- Branch: `codex/flutter-responsive-hardening`; starting commit: `297d5e4c473ca927a048c4f05f8ca8f6cf71a2d8`.
- No production requests, deploy, service restart, database migration, reset, push, or merge were performed for this fix.
- `apps/qr_kiosk/index.html` has a pre-existing local hotline change. It is untouched and excluded from staging/commit.
- No authentication, QR capability/token security, worker approval, or company registration rules were relaxed.

## Root cause

Order creation deliberately writes `status: published` in `createOrderRecord` in `src/modules/orders/orders.repository.ts`. With no assignments, its response contains `assignment_count: 0`.

Both admin assignment selectors (React and Flutter) requested `GET /v1/orders?status=active`. The backend implements that parameter as an **exact persisted enum**, not an active-lifecycle group. A newly published order therefore never reached either selector, despite already being assignable by the assignment service.

The company Flutter UI already recognized `published` after the previous audit, but fetched unfiltered history and filtered it after pagination. More importantly, the company shell cached its order tab: creating from another screen after previously visiting that tab left its existing future stale. The fix supplies a backend lifecycle scope before pagination and refreshes the cached tab when it is revisited. Existing create-success and detail-return refreshes remain functional.

## Actual flow and findings

| Stage | Result verified in automated tests |
| --- | --- |
| Approved company creates a schema-valid order | Real creation service/repository stores `published`; response also says `published`, `assignment_count: 0`. Router returns HTTP 201 (router inspected; lifecycle regression invokes services rather than HTTP). |
| Company active orders | `GET /v1/orders?scope=active` includes the new order, scoped to its owning company. No assignment predicate. |
| Admin general orders | Unfiltered `GET /v1/orders` includes it. Existing permissions remain enforced by the router. |
| Admin assignment candidates | `GET /v1/orders?scope=staffing` includes the new order with zero workers. This is the existing orders endpoint with an additive query option, not a separate assignable-orders endpoint. The real React component renders the `0/1` option. |
| QR before staffing | Company creates and activates a kiosk/session, then obtains a signed QR while accepted assignment count is zero. |
| Admin first assignment | Actual `createAssignments` service and transactional repository create an `assigned` assignment. In the one-worker fixture the order becomes `assigned`; company list now reports count 1. Existing QR session survives unchanged. |
| Before acceptance | Even the assigned worker cannot check in until accepting. |
| Worker accepts and scans | Actual `acceptAssignment`, `checkIn`, and `checkOut` services succeed. Order transitions to `in_progress`, then `completed`. |
| Unrelated worker | Check-in fails with `KIOSK_ASSIGNMENT_NOT_FOUND`, including an attempt with the other worker's assignment ID. |

These are deterministic real-service/repository tests with an in-memory Prisma adapter, **not proof of execution against production or a real PostgreSQL database**.

## Query, expiry, timezone, and prerequisite rules

- `scope=active`: `active`, `published`, `partially_assigned`, `assigned`, `in_progress`.
- `scope=staffing`: the same existing staffing statuses, excluding `in_progress`.
- Both require a nondeleted order, approved nondeleted company, active nondeleted company user, and `shift_end > server time`.
- No existing assignment is required. Future shifts remain visible; there is no requirement that a shift already started to create QR or assign workers.
- Exact `status=active` remains unchanged for backward compatibility. If both `status` and `scope` are provided, they intersect.
- The lifecycle predicate is shared by list filtering, kiosk eligibility, assignment creation and the worker assignment-status transaction.
- Worker approval/availability, category/position compatibility, duplicate assignment and capacity checks remain in the existing assignment transaction after row locks. Lifecycle candidates can include fully staffed orders; actual remaining capacity is still enforced on assignment creation.
- Expired, draft, cancelled, completed, and in-progress orders are rejected for new staffing even through a manually constructed request. Pending/inactive companies are also rejected.
- Flutter submits UTC timestamps; API schema parses absolute dates and requires start in the future and end after start. Lists use absolute end-time comparison, not local calendar dates. Regression covers equivalent UTC/+04:00 timestamps and the exact expiry boundary (one millisecond before eligible; at expiry excluded).
- Flutter's existing local active predicate also includes `published` and compares the parsed end instant; it has no worker-count gate. Scoped querying now happens before pagination. The widget test proves the active card appears after returning to a previously cached empty tab and that switching to all-orders removes the scope.
- The backend pagination regression adds 101 more-recent completed orders and confirms these cannot crowd the published order out of the first active/staffing page.

## Changed files

Backend and API documentation:

- `src/modules/orders/orders.lifecycle.ts`
- `src/modules/orders/orders.schema.ts`
- `src/modules/orders/orders.service.ts`
- `src/modules/assignments/assignments.repository.ts`
- `src/modules/attendance/attendance.kiosk-eligibility.ts`
- `swagger.yaml`

Admin web:

- `apps/admin_panel/src/features/assignments/AssignmentsPage.tsx`
- `apps/admin_panel/src/features/orders/orders.service.ts`
- `apps/admin_panel/tests/order-staffing.test.mjs`

Flutter company and embedded admin:

- `apps/worker_app/lib/features/admin/data/admin_repository.dart`
- `apps/worker_app/lib/features/admin/presentation/admin_assignments_parts.dart`
- `apps/worker_app/lib/features/company/data/company_repository.dart`
- `apps/worker_app/lib/features/company/presentation/company_dashboard_part.dart`
- `apps/worker_app/lib/features/company/presentation/company_home_shell.dart`
- `apps/worker_app/lib/features/company/presentation/company_orders_part.dart`
- `apps/worker_app/test/company_order_mobile_test.dart`

Regression and report:

- `scripts/company-qr-attendance-regression.ts`
- `docs/qa/order-first-assignment-preflight-2026-09-20.md`

## Commands and final results

| Directory | Command | Result |
| --- | --- | --- |
| Repository root | `npm run typecheck` | PASS |
| Repository root | `npm run build` | PASS |
| Repository root | `npm test` | PASS, all 12 component suites, including 71 company QR/order/attendance behavioral cases |
| Repository root | `npm run swagger:check` | PASS |
| Repository root | `npm run swagger:drift` | PASS, 112 path/method operations |
| Repository root | `npm run swagger:security` | PASS |
| Repository root | `npm run test:auth-security` | PASS |
| Repository root | `npm run test:worker-security` | PASS |
| Repository root | `npm run test:backend-access` | PASS |
| Admin panel | `npm run typecheck` | PASS |
| Admin panel | `npm run test:regression` | PASS, 5 tests including 2 new real-component staffing/permission tests |
| Admin panel | `npm run test:release-config` | PASS, 4 tests |
| Admin panel | `npm run test:security` | PASS, 7 tests |
| Admin panel | `npm run build` with the existing public release URLs explicitly supplied | PASS, including built security-header verification |
| QR kiosk | `npm run typecheck` | PASS |
| QR kiosk | `npm run test:regression` | PASS, 11 tests; no kiosk source modified |
| Worker app | `flutter analyze` | PASS, no issues |
| Worker app | `flutter test` | PASS, 95 tests |
| Repository root | `git diff --check` | PASS |
| Repository root | `npm run test:orders-hardening` | NOT RUN: no verified isolated local test database configuration |

Admin build initially stopped at its safety guard because the shell did not have its required public environment variables. It passed with the existing configured URLs (no guard changed):

```powershell
$env:VITE_API_BASE_URL='https://api.setservice.az'
$env:VITE_KIOSK_BASE_URL='https://qr.setservice.az'
npm run build
```

The new Flutter test harness initially needed its required taxonomy fixture fields and bounded dashboard animation pumping plus `tester.runAsync` for repository IO. After those test-harness corrections the focused test and the entire Flutter suite passed.

## MANUAL QA REQUIRED — isolated real database

The configured root environment is production and references remote PostgreSQL/Redis. Docker Desktop's Linux engine is unavailable. A local PostgreSQL listener exists on port 5432, but there is no verified disposable test database/configuration for it; no Redis listener was detected on 6379. The existing listener was not assumed safe, and no credentials were requested or production safety guards bypassed.

Before deployment approval, use a verified isolated local/test PostgreSQL and Redis environment. Keep `test:orders-hardening` guards intact (nonproduction environment, explicitly confirmed test run, localhost database URL with a test database name, matching runtime database). Do not run that suite using the current root production environment.

Required real DB/device checks:

1. Create a future, one-worker order as an approved test company. Verify stored `published`, count 0, company active API/card and admin staffing API/selector.
2. Create/activate company QR before any assignment; verify a worker with no accepted assignment cannot scan in.
3. Admin assigns the first approved, available, position-matching worker; verify capacity, assignment notification/audit and order status.
4. Worker accepts; scan fresh QR for check-in/out in the permitted attendance window. Verify persisted attendance, company isolation and rejection of an unrelated worker.
5. Repeat through the Flutter create UI after previously visiting the order tab; navigate away/back and restart the app; verify the same persisted order remains visible while active.
6. Verify expired/terminal orders cannot be assigned through direct requests; repeat UTC/+04:00 equivalent dates and local-midnight cases.
7. Run the guarded `npm run test:orders-hardening` and the relevant real-DB concurrency suite on that isolated target. The in-memory adapter does not emulate PostgreSQL locks, transaction rollback/isolation or Redis behavior.

No migration is required. Production remains undeployed.
