# Neon reviewer-release clone and restore rehearsal

This runbook is a plan only. It must not be executed against Neon until a
separate approval names the project, production branch, recovery point, and
rehearsal branch. Never paste database URLs, API keys, passwords, tokens, query
text, or application rows into the release record.

## Immutable inputs

Rehearsal starts only after the candidate has a reviewed clean commit and a
digest-pinned migration image. Record the full commit SHA, verified patch
SHA-256, image digest, Prisma and Node versions, and these migration checksums:

| Migration | SHA-256 |
| --- | --- |
| `20261014120000_assignment_attendance_activity` | `271388994cd48d568359bcf640b25238c07c07949d70261cafe90140d0383237` |
| `20261017120000_store_review_account_scope` | `2c810220369f282d676bde5f5fd849de3d1e3f8f04e75103781bc6551970a1bb` |
| `20261017121000_store_review_account_index` | `5d88990d8d891153ae8213eaaa5fbbfd8b5be5af1fe8557577cff39162ffc6b0` |

The third migration must contain exactly one `CREATE INDEX CONCURRENTLY`
statement. A changed checksum, schema, or candidate image invalidates prior
rehearsal evidence.

## Approval and branch creation

1. Read Neon control-plane metadata and record the production branch ID,
   protection state, PostgreSQL version, history-retention window, usable PITR
   interval, current compute settings, and branch/compute quota. Mark any field
   that cannot be proved as `UNKNOWN`.
2. Stop if migrations are unfinished or rolled back, unexpected migrations are
   present, or a long transaction would obstruct DDL.
3. Under a separate control-plane approval, capture a UTC run ID, recovery time
   and LSN. Create an immutable pre-release snapshot at that point and wait for
   its operation to finish. A timed-out create request must be reconciled from
   the operation list before any retry.
4. Create a protected point-in-time child branch named
   `rehearsal/setservice-reviewer-<UTC>` from the same production parent and
   recovery point. Two operators must confirm that its branch ID differs from
   production, its parent is production, and its LSN matches the snapshot.
5. Only after that check, attach a dedicated read-write compute with production
   equivalent sizing. Disable scale-to-zero for the measurement window.
6. Store clone-only pooled and direct URLs in the approved secret manager. Pass
   them through a mode-0600 tmpfs secret file to the one-off containers. Never
   put them in command arguments, Git, logs, screenshots, or tickets. Verify the
   credential-free rehearsal endpoint hostname differs from production before
   connecting.

The clone contains production data and must be handled as production-sensitive.
Restrict access and TTL, use separate Redis/test storage, omit production
provider credentials, block SMS/email/FCM egress, and never start the real
outbox worker. Tests may use only synthetic accounts and local provider sinks.

## Baseline and migration pass

Capture aggregate evidence only: complete migration names/statuses/checksums,
schema fingerprint, database and selected table/index sizes, estimated row
counts, invalid indexes, connection counts, lock summary, longest transaction
age without SQL text, and initial WAL LSN. Warm the clone and keep cold- and
warm-cache timing separate.

Run the exact digest-pinned migration image with both `DATABASE_URL` and
`DIRECT_URL` pointed at the clone direct endpoint. Set `lock_timeout=5s`,
`statement_timeout=15min`, and `idle_in_transaction_session_timeout=60s`.

1. Run `prisma validate`.
2. Run `scripts/preflight-attendance-deploy.sql` read-only.
3. Run `prisma migrate status` and require exactly the three migrations above.
4. Run `prisma migrate deploy` once. Do not automatically retry a lock timeout.
5. Observe aggregate locks, connections, WAL growth and
   `pg_stat_progress_create_index` from a second direct session.
6. Run synthetic Build 14 and Build 15 API workloads against the clone, with
   external providers replaced by sinks. Cover role login/profile, order and
   assignment list/detail, safe writes, legacy and versioned phone change, QR
   check-in/out and duplicate prevention, and in-app notifications.

Acceptance requires all three migrations finished with expected checksums, no
rolled-back/unfinished migration, no schema drift, four new indexes ready and
valid, no other invalid index, `login_succeeded` present, existing users still
`is_review_account=false`, reviewer-account count zero, and unchanged aggregate
row counts. Attendance backfill must match non-deleted attendance logs. Require
zero unexpected 5xx, zero external provider calls, p95 within the current SLO
and no more than 20% above the clone baseline. Migration duration must be under
10 minutes, lock acquisition under 5 seconds, and connection usage under 70%.

## Restore and repeat

1. Record `T_pre_migration`, stop the clone test harness, and have two operators
   reconfirm that the restore target is the rehearsal branch ID.
2. Restore the pre-migration snapshot with preview/finalization disabled first.
   Production can never be a restore target in this rehearsal.
3. On the preview branch, require the last migration to be
   `20260921120000_play_moderation_and_deletion_requests`, the new columns and
   four indexes to be absent, aggregate counts to match baseline, and the old
   API image to pass a read-only smoke test.
4. After a second approval, finalize only the rehearsal restore. Measure
   endpoint disconnect, pool reconnection and total RTO.
5. Reapply the exact three migrations with the same image digest and repeat all
   acceptance checks. Record RPO, RTO, timings, WAL, lock and compatibility
   evidence without private rows or credentials.

If in-place restore is unavailable, creating another point-in-time child proves
data availability only. It does not prove endpoint cutover and does not clear
the production gate. Cleanup of clone branches, computes and temporary
credentials requires a separate checked branch-ID approval.

Production remains NO-GO until retention/PITR is verified, a real isolated
restore completes, two clean migration passes succeed, and the release record
contains the measured evidence and named rollback owner.
