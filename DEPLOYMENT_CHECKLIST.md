# SET Service Deployment Checklist

This checklist is for preparing the current SET Service backend MVP for staging or production deployment.

The full MVP smoke test passed:

Auth -> Worker Approval -> Company Order -> Admin Assignment -> Worker Accept -> QR Check-in/out.

## 1. Code Readiness

- [ ] `npm install` completes successfully.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npx prisma validate` passes.
- [ ] `npm run swagger:check` parses `swagger.yaml` successfully.
- [ ] No local-only debug changes are included.
- [ ] No raw OTP or QR token logging is enabled for production.
- [ ] Backend logic matches Swagger/OpenAPI routes.

## 2. Database

- [ ] Production PostgreSQL database is created.
- [ ] `DATABASE_URL` points to the production runtime database URL.
- [ ] `DIRECT_URL` points to the direct PostgreSQL URL for Prisma migrations.
- [ ] For Neon, `DATABASE_URL` uses the pooler host and `DIRECT_URL` uses the direct non-pooler host.
- [ ] Database user has the minimum required permissions.
- [ ] Database backups are enabled.
- [ ] Database SSL is enabled if required by the provider.
- [ ] Migrations are applied with:

```bash
npm run db:migrate:deploy
npx prisma generate
```

- [ ] `prisma migrate reset` is never used in production.
- [ ] `psql "$DATABASE_URL" -f scripts/preflight-attendance-one-session.sql` returns zero rows before deploying attendance one-session migration.
- [ ] Any duplicate attendance sessions found by the preflight are manually reviewed and cleaned/merged/archived before migration.
- [ ] Partial indexes for attendance are present after migration.

## 3. Environment Variables

Required:

- [ ] `DATABASE_URL`
- [ ] `DIRECT_URL`
- [ ] `REDIS_URL`
- [ ] `JWT_ACCESS_SECRET`
- [ ] `JWT_REFRESH_SECRET`
- [ ] `JWT_ISSUER`
- [ ] `JWT_AUDIENCE`
- [ ] `QR_HMAC_SECRET`
- [ ] `KIOSK_TOKEN_ENCRYPTION_SECRET`
- [ ] `OTP_PEPPER`
- [ ] `PROVIDER_OUTBOX_ENCRYPTION_SECRET`
- [ ] `OUTBOX_WORKER_ENABLED=false`
- [ ] `CORS_ORIGINS`
- [ ] `AUTH_COOKIE_SAME_SITE`

Recommended:

- [ ] `JWT_ACCESS_EXPIRES_IN`
- [ ] `JWT_REFRESH_EXPIRES_IN`
- [ ] `QR_TOKEN_TTL_SECONDS`
- [ ] `SENTRY_DSN`
- [ ] `OUTBOX_HEALTH_PORT`
- [ ] `OUTBOX_MAX_CONSECUTIVE_FAILURES`
- [ ] `OUTBOX_HEARTBEAT_TTL_SECONDS`

Production safety:

- [ ] `NODE_ENV=production`
- [ ] `OTP_TEST_MODE=false`
- [ ] `OTP_LOG_CODES=false`
- [ ] `SMS_PROVIDER=pg365`
- [ ] `PG365_API_URL`, `PG365_PUBLIC_KEY`, `PG365_PRIVATE_KEY`, `PG365_ORIGINATOR`, and `PG365_TIMEOUT_MS` are configured; the private key is sourced from the secret manager.
- [ ] `EMAIL_PROVIDER` is `resend` or `generic_http`; `console` is not used in production.
- [ ] For Resend, `RESEND_API_KEY` is injected from the secret manager and `EMAIL_FROM` uses a verified sender domain.
- [ ] For generic HTTP email, `EMAIL_API_URL`, `EMAIL_API_KEY`, and `EMAIL_FROM` are configured.
- [ ] Email delivery is exercised through the outbox, and retry/dead-letter monitoring is enabled without logging recipients or message bodies.
- [ ] `PUSH_NOTIFICATIONS_ENABLED` is explicitly set.
- [ ] Firebase service account env vars are configured if push is enabled.
- [ ] `JWT_ACCESS_SECRET` is 32+ random characters.
- [ ] `JWT_REFRESH_SECRET` is 32+ random characters and differs from the access key.
- [ ] `QR_HMAC_SECRET` is 32+ random characters.
- [ ] `KIOSK_TOKEN_ENCRYPTION_SECRET` is 32+ random characters.
- [ ] `OTP_PEPPER` is 32+ random characters.
- [ ] JWT access/refresh, kiosk, QR, and OTP secrets are all different.
- [ ] `CORS_ORIGINS` contains only trusted frontend origins and no wildcard.
- [ ] `AUTH_COOKIE_SAME_SITE` is `lax`/`strict` for a same-site topology, or `none` only when every cross-site web/API origin is HTTPS and explicitly allowlisted.
- [ ] `SWAGGER_DOCS_ENABLED=false`.
- [ ] API runs with `OUTBOX_WORKER_ENABLED=false`.
- [ ] At least one separately supervised `npm run start:outbox` process is running.
- [ ] API `/ready` verifies a fresh outbox-worker Redis heartbeat.
- [ ] Worker `/health` and `/metrics` are monitored and alerted.

## 4. Auth and OTP

- [ ] Real SMS provider decision is confirmed.
- [ ] SMS provider credentials are stored securely.
- [ ] OTP test mode is disabled.
- [ ] OTP code logging is disabled.
- [ ] Redis-backed OTP rate limit, cooldown, and block state is available.
- [ ] OTP rate limits are acceptable for production traffic.
- [ ] JWT access and refresh expiration values match product policy.
- [ ] Refresh tokens remain hashed in the database.
- [ ] Logout revokes refresh tokens.
- [ ] Logout deactivates the current FCM device token when the client can reach the API.

## 5. RBAC and Approval Rules

- [ ] Worker APIs require worker role.
- [ ] Company APIs require company role.
- [ ] Admin APIs require super admin role.
- [ ] Worker protected APIs require approved worker status.
- [ ] Company protected APIs require approved company status.
- [ ] Pending/rejected/suspended/inactive workers cannot log in.
- [ ] Pending/rejected/suspended/inactive companies cannot log in.

## 6. Worker Approval Flow

- [ ] Worker registration creates `pending_otp`.
- [ ] Registration OTP verification moves worker to `pending_approval`.
- [ ] Pending worker login is blocked with `WORKER_NOT_APPROVED`.
- [ ] Super admin approval changes worker to `approved`.
- [ ] Approval creates an audit log.
- [ ] Approval creates a notification.
- [ ] Approval sends push notification when FCM is enabled and the user has registered devices.
- [ ] Rejection requires a reason.
- [ ] Rejection creates an audit log.
- [ ] Rejection creates a notification.
- [ ] Rejection sends push notification when FCM is enabled and the user has registered devices.

## 7. Orders

- [ ] Approved company can create order.
- [ ] Non-approved company cannot create order.
- [ ] Worker cannot create order.
- [ ] Super admin can list and get all orders.
- [ ] Company can list and get own orders.
- [ ] Only approved company owner can cancel own order.
- [ ] Super admin cannot cancel orders in current MVP.
- [ ] Order create/cancel audit logs are created.
- [ ] Admin notification is created when order is created.
- [ ] Admin push notification is sent for new orders when FCM is enabled.

## 8. Assignments

- [ ] Super admin can assign approved available workers.
- [ ] Worker must be approved.
- [ ] Worker must be available.
- [ ] Order must be active.
- [ ] Capacity cannot exceed order `required_count`.
- [ ] Duplicate worker assignment is blocked.
- [ ] Worker can accept/reject only own assignment.
- [ ] Company can view assignments for own orders.
- [ ] Worker can view own assignments.
- [ ] Super admin can view all assignments.
- [ ] Assignment create/cancel/status actions create audit logs.
- [ ] Assigned worker receives notification.
- [ ] Assigned/cancelled worker receives push notification when FCM is enabled.

## 9. Attendance and QR

- [ ] QR generation requires super admin or approved company.
- [ ] Company QR generation is scoped to own order assignments.
- [ ] Assignment must be accepted.
- [ ] Parent order must be active.
- [ ] Worker can check in only for own accepted assignment.
- [ ] Worker cannot check in for assigned/rejected/cancelled/completed assignment.
- [ ] Duplicate open attendance is blocked.
- [ ] One attendance session per assignment is enforced for MVP.
- [ ] Checkout requires existing open check-in.
- [ ] Re-check-in after checkout returns `ATTENDANCE_ALREADY_COMPLETED`.
- [ ] QR expiration is enforced.
- [ ] Raw QR tokens are not stored.
- [ ] Attendance check-in/check-out creates audit logs.
- [ ] Worker/company/admin attendance visibility is scoped correctly.

## 10. Notifications

- [ ] In-app notification creation works.
- [ ] Worker approval/rejection notifications are created.
- [ ] Company approval/rejection notifications are created.
- [ ] Order-created notifications are created for admins.
- [ ] Assignment notifications are created for workers.
- [ ] Durable provider outbox delivery is running and dead-letter/backlog metrics are monitored.

## 11. API Documentation

- [ ] Swagger is available at `/docs`.
- [ ] `swagger.yaml` matches implemented routes.
- [ ] Frontend/mobile team has `API_HANDOFF.md`.
- [ ] QA team has `POSTMAN_TESTING.md`.
- [ ] DevOps team has `ENV_SETUP.md` and this checklist.

## 12. Smoke Test

Run against staging or local production-like environment:

```bash
BASE_URL=https://api.example.com TEST_OTP=123456 npm run smoke:mvp
```

For real production, use caution:

- Do not leave OTP test mode enabled.
- Prefer a staging environment for full smoke testing.
- Use dedicated test accounts and data.

Expected passing flow:

```text
[PASS] 1. Health check
[PASS] 2. Worker register
[PASS] 3. Worker registration OTP verify
[PASS] 4. Worker login blocked while pending approval
[PASS] 5. Admin login OTP flow
[PASS] 6. Admin approves worker
[PASS] 7. Worker login OTP flow after approval
[PASS] 8. Company login OTP flow
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

## 13. Known MVP Limitations

- Payroll is not implemented.
- SMS provider integration is not productionized yet.
- OTP test mode is for development only.
- In-app notifications are durable; push/email/SMS delivery requires the separately supervised outbox worker and configured providers.
- Attendance is one session per assignment for MVP.
- Advanced scheduling and worker availability calendars are not implemented.
- Order completion automation is not implemented.
- Admin cannot cancel company orders in current MVP by product decision.
- Super admin can cancel assignments, but company cannot cancel assignments yet.

## 14. Release Decision

Before release, confirm:

- [ ] Product owner accepts known MVP limitations.
- [ ] QA signs off on smoke test and Postman scenarios.
- [ ] DevOps signs off on environment and database setup.
- [ ] Security review confirms secrets, OTP, JWT, and logging settings.
- [ ] Rollback plan is documented.
