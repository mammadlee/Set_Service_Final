# Migration incident note — 2026-07-16

## Sanitized summary

At approximately 2026-07-16 08:54 UTC (12:54 Asia/Dubai), a database migration
deployment command was run outside the intended manual release workflow. This
note intentionally excludes provider hostnames, project identifiers,
credentials, connection strings, and database names.

The observed command reported these migrations as applied:

- `20260715120000_order_idempotency_outbox`
- `20260716100000_order_state_machine_phase7`
- `20260716123000_refresh_token_families`

Repository SQL review shows additive tables, columns, enum values, indexes,
constraints, and bounded data backfills. No row-deletion statement was found.
The refresh-token migration intentionally invalidates legacy refresh JWTs that
do not contain the new token-family claims, so forced sign-in is a potential
user-visible effect. No destructive rollback was attempted, and this note does
not assert that the target environment is healthy or production-ready.

## Immediate manual actions

These actions must be performed by the authorized database/release owner, not
by automated audit tooling:

1. Identify and record the exact environment, cloud project, database, actor,
   command source, and application revision in the restricted incident record.
2. Freeze additional schema changes until the incident commander approves the
   next step.
3. Create and record a backup/PITR bookmark before any corrective action.
4. Inspect the target migration table for the three names above, their
   checksums, start/finish state, and failure logs. Compare with committed SQL;
   do not edit either side.
5. Verify the expected objects:
   - idempotency and outbox tables/indexes;
   - order version, order status values, history table, constraints, and
     outbox indexes;
   - user session version, refresh-token family columns, backfill completeness,
     and indexes.
6. Compare pre/post row counts where baselines exist. Confirm no unexpected
   nulls, duplicate token identifiers, or partial migration state.
7. Validate application health: sign-in/refresh behavior, order creation and
   transitions, assignment concurrency, outbox backlog, API error rate,
   database locks, and latency.
8. Decide whether to roll the application forward, roll the application back
   while retaining the additive schema, or create a reviewed forward
   corrective migration.

## Prohibited recovery shortcuts

- Do not run a migration reset against the affected environment.
- Do not delete or alter migration-history rows.
- Do not edit the applied migration SQL or its checksum.
- Do not drop the new schema objects merely to make the history appear clean.
- Do not restore over the original database without first proving the recovery
  on a new isolated target and receiving explicit incident approval.

## Closure evidence

The incident can be closed only after the owner records environment identity,
migration/checksum reconciliation, backup/PITR evidence, schema verification,
business row-count checks, application health results, monitoring duration,
and the approved follow-up decision.

