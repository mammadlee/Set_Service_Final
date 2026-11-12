# Database release runbook

This is an operator runbook, not an automated test. The repository audit that
produced this document did not connect to a database and did not execute any
migration.

## Mandatory controls

1. Only the named release operator may run database commands.
2. Confirm the target environment, cloud project, database name, account, and
   application revision with a second person. Do not infer the target from a
   local `.env` file or shell history.
3. Record a backup/PITR bookmark and prove that the restore procedure has been
   exercised in an isolated environment.
4. Review every pending migration file and its committed checksum. Never edit a
   migration after it has been applied and never alter migration history by
   hand.
5. Apply and observe the release in an isolated staging database before the
   production change window.
6. Keep application rollout, schema rollout, and background-worker rollout as
   separate, observable steps.

## Pre-deployment evidence

- Approved change ticket, owner, start time, stop conditions, and incident
  channel.
- Current application revision and the exact intended revision.
- Migration inventory from the target database, reviewed against repository
  migration names and checksums.
- Backup/PITR bookmark identifier and restore owner.
- Staging results for API smoke checks, outbox processing, authentication,
  order transitions, and the read-only performance review in
  `scripts/performance-explain.sql`.
- Capacity headroom, connection-pool limits, lock-timeout policy, and alert
  ownership.

The three migrations requiring explicit verification after the 2026-07-16
incident are:

- `20260715120000_order_idempotency_outbox`
- `20260716100000_order_state_machine_phase7`
- `20260716123000_refresh_token_families`

## Controlled execution

The operator may use the repository's `npm run db:migrate:deploy` command only
after the controls above are satisfied. Do not run development migration,
reset, or seed commands against shared staging or production environments.

1. Put the release in a monitored maintenance/change window.
2. Capture the pre-change migration inventory, row-count baselines, and health
   metrics.
3. Apply the schema migration once.
4. Re-read migration history and verify each applied checksum and completion
   state.
5. Verify expected tables, columns, enum values, defaults, foreign keys, and
   indexes.
6. Deploy compatible application instances gradually.
7. Deploy the outbox worker separately and confirm backlog age, attempts, and
   error rate.
8. Monitor authentication failures, refresh-token reuse events, order conflict
   responses, database locks, query latency, and connection saturation.

## Rollback and recovery

There is no automatic destructive database rollback.

1. Stop or roll back the application revision first while retaining additive
   schema. Confirm the previous application remains compatible with the
   expanded schema before doing so.
2. Pause background workers if they are creating incompatible writes or an
   outbox retry storm.
3. Preserve evidence: migration inventory, logs, metrics, row-count deltas, and
   the backup/PITR bookmark.
4. A database restore or compensating migration requires an incident commander,
   database owner, reviewed SQL, a tested recovery target, and explicit
   approval. Restore to a new isolated database first.
5. Never delete migration records, rewrite applied SQL, change migration
   checksums, or use `prisma migrate reset` as a recovery shortcut.

For the already-applied 2026-07-16 migrations, prefer application rollback and
forward-compatible corrective migrations. Do not reverse enum additions or
drop the new tables/columns without a separately reviewed data-retention and
compatibility plan.

## Post-deployment closure

- Reconcile migration names and checksums.
- Compare business row counts and critical API outcomes with the pre-change
  baseline.
- Confirm outbox backlog returns to normal and refresh-token behavior matches
  the planned forced re-authentication policy.
- Attach the performance review, monitoring window, and incident observations
  to the release record.
- A successful migration alone is not evidence that the system is
  production-ready.

