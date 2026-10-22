# Database performance review (DB-free preparation)

This review is based on Prisma schema and query-shape inspection only. No
database was contacted and no execution plan was collected. An authorized
operator must run `scripts/performance-explain.sql` against an isolated,
production-like staging clone before release.

## High-value query and index map

| Workload | Expected supporting index |
| --- | --- |
| Company order list by status | `orders(company_id, status)` |
| Company order list by recency | `orders(company_id, created_at)` |
| Global/status order queues | `orders(status, created_at)` |
| Assignments for an order | `assignments(order_id, status)` |
| Worker assignments by state | `assignments(worker_id, status)` |
| Unread notification feed | `notifications(recipient_id, read_at, created_at)` |
| Outbox claim queue | `outbox_events(status, available_at, created_at)` |
| Outbox recovery monitoring | `outbox_events(status, updated_at)` |
| Refresh-token family revocation | `refresh_tokens(family_id, revoked_at)` |
| User token-family lookup | `refresh_tokens(user_id, family_id)` |
| Order status timeline | `order_status_history(order_id, created_at)` |
| Entity audit lookup | `audit_logs(entity_type, entity_id)` |

## Review risks

- Soft-delete predicates are frequent. Confirm plans remain selective when
  `deleted_at IS NULL` is added to tenant and status filters.
- Every list endpoint must have a bounded limit and stable ordering. Deep
  offset pagination should be replaced with cursor/keyset pagination for large
  tables.
- The outbox claim query must use its status/availability index and keep the
  locked batch small. Track oldest pending age, retry attempts, and dead-letter
  volume.
- Order status writes update a version, history row, audit row, and outbox row
  transactionally. Measure lock duration and conflict rate under concurrent
  assignment and cancellation traffic.
- Refresh-token family lookup and revocation must remain indexed as token
  volume grows. Expired/revoked token retention needs a bounded cleanup policy.
- JSON payloads in orders, idempotency responses, outbox events, and audit logs
  must not be selected on list screens unless required.

## Staging acceptance evidence

For production-like cardinality and statistics:

1. Run the read-only explain pack with representative tenant, worker, and order
   identifiers.
2. Capture plans and buffers before and after migration.
3. Investigate sequential scans on large tenant/status paths unless the planner
   demonstrates they are cheaper for the supplied cardinality.
4. Confirm row estimates are reasonably close to actual rows; refresh
   statistics in the controlled staging environment if they are stale.
5. Record p50/p95/p99 latency, rows examined, shared-buffer reads, temporary
   spills, lock waits, and connection-pool saturation.
6. Exercise concurrent order transitions and outbox claims, not only isolated
   reads.
7. Define a release stop condition from the baseline rather than accepting an
   unspecified latency increase.

The SQL pack contains `EXPLAIN (ANALYZE, BUFFERS)` and therefore executes its
`SELECT` statements. It is guarded by a read-only transaction but must still be
run only on an approved staging clone.

