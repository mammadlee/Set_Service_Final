# API contract security

This document summarizes the security-sensitive behavior that is enforced by
`swagger.yaml` and checked without a database by
`npm run swagger:security`.

## Request tracing and errors

- Every response carries `X-Request-ID` and `X-Correlation-ID`.
- A caller-supplied identifier is accepted only when it is 8-128 characters
  from `[A-Za-z0-9._:-]`; otherwise the API generates a safe identifier.
- JSON error responses use the shared `Error` schema and include `error`,
  `code`, `request_id`, and `timestamp`.

## Authentication and recovery

- `BearerAuth` accepts access JWTs only. Refresh tokens are restricted to the
  refresh and logout request bodies.
- OTP and password-recovery acknowledgement means that delivery was accepted
  by the durable provider queue; it does not guarantee receipt.
- Public admin password recovery is disabled. `POST
  /auth/admin/forgot-password` is deprecated and returns `410
  ADMIN_PASSWORD_RESET_DISABLED`; privileged recovery follows the operational
  runbook.
- Interactive Swagger UI is disabled in production.

## Orders

- Order list endpoints expose the shared pagination contract.
- Order creation accepts `Idempotency-Key`, scoped to the authenticated actor
  and operation for 24 hours. Reuse with another payload returns
  `IDEMPOTENCY_KEY_REUSED`; an in-flight duplicate returns
  `IDEMPOTENCY_REQUEST_IN_PROGRESS`.
- Order responses include a monotonic `version`. Cancellation clients should
  send it as `expected_version`; stale writes return
  `ORDER_VERSION_CONFLICT`.

## Private documents and deletion

- Private-document authorization returns a short-lived capability URL with a
  maximum lifetime of 900 seconds and `no-store` response semantics. Capability
  URLs must not be logged, persisted, placed in analytics, or forwarded as a
  referrer.
- `DELETE /workers/me/documents/{type}` deletes a worker-owned document through
  the authenticated API. The metadata tombstone and an idempotent storage
  deletion event are committed in one transaction; the supervised outbox
  worker retries provider failures and exposes dead-letter health.
- `POST /workers/me/account-deletion-request` immediately anonymizes and
  deactivates the worker account, revokes sessions, tombstones documents, and
  transactionally queues owned-object deletion. Operational history is
  retained; this is not a database hard delete.

## Regression commands

```text
npm run swagger:check
npm run swagger:drift
npm run swagger:security
```

The drift and security checks are static and must not connect to a database.
