# Store-review account provisioning

The Apple App Review and Google Play App Access accounts use normal password
authentication. They do not use a universal OTP, master password, or
authentication bypass. All five identifiers and all three passwords must be
injected from the production secret manager through the `STORE_REVIEW_*`
variables. Never place their values in a repository, command transcript,
screenshot, issue, or application log.

The generic `npm run db:seed` command is for local/CI fixtures. It is not the
store-review installer and must not be run in production for this purpose.

## Safe operator sequence

1. Deploy the two ordered additive migrations and reviewed application code.
   They add `users.is_review_account` (default `false`), its concurrent role
   index, and the `login_succeeded` audit action. They create no accounts.
2. Inject the eight `STORE_REVIEW_*` values into a short-lived one-off shell or
   container. Keep `ALLOW_PRODUCTION_REVIEW_PROVISION=false` in long-running
   services.
3. Run `npm run store-review:plan`. This is read-only and reports counts only.
   It never prints identifiers or passwords.
4. Before every apply, including creation of new accounts, pause new outbox
   claims and let every processing SMS/email provider event finish. Verify the
   provider-event processing count is zero. Then set both
   `ALLOW_PRODUCTION_REVIEW_PROVISION=true` and
   `STORE_REVIEW_OUTBOX_QUIESCED=true` only in the one-off process and run
   `npm run store-review:apply`. The second gate is an operator attestation;
   it does not pause the worker itself.
5. If the plan detects legacy accounts that predate `is_review_account`, stop
   and verify their ownership independently. Adoption requires both the
   `--adopt-existing` flag and the separate
   `ALLOW_PRODUCTION_REVIEW_ADOPTION=true` gate. The provisioner rejects split
   identifiers, configured emails found in any other account's pending-email
   field, incorrect roles, missing expected profiles, or cross-role
   profile relations. It also rejects candidates with any pre-existing domain
   footprint, including assignments, orders, ratings, notifications, audit or
   moderation relations, kiosk relations, documents, populated work/profile
   data, worker gender/class, FOC-training state, rating aggregates, approval or
   rejection timestamps, or existing Admin permissions. Adoption is only for
   an independently verified, otherwise pristine account scaffold whose Worker
   and Company moderation state is still at the schema default.
6. The apply gate is mandatory in every environment, regardless of `NODE_ENV`
   or the database hostname. Adoption remains disabled by default and requires
   both `--adopt-existing` and the separate adoption gate. Never enable
   adoption merely to work around an identifier collision.
7. Keep the outbox paused through apply and readiness. Passwords are preserved when they already match,
   but adoption always increments the session version, revokes every refresh
   and device token, clears FCM, and consumes outstanding OTP records. A
   password mismatch fails
   closed. An approved rotation requires `--rotate-passwords`; rotation bumps
   the session version, revokes refresh and device tokens, and clears the
   legacy FCM token.
8. Every apply clears the legacy FCM field and revokes active device-delivery
   tokens, even when the password already matches. Company and Admin review
   emails are marked verified and stale pending-email challenges are cleared.
   If an already marked Worker or Company review profile is inactive,
   suspended, deleted, or no longer approved, reconciliation treats the change
   as a reactivation: it increments the session version, revokes refresh and
   device tokens, and consumes outstanding user-bound and identifier-bound OTP
   records before restoring the synthetic profile.
9. After readiness succeeds, resume the outbox worker. Immediately return all
   three production gates to `false` and remove the short-lived secret
   injection.

The readiness check repeats the exact phone/email/pending-email collision scan;
an otherwise healthy reviewer cohort is not ready while any cross-field
identifier collision exists.

Every apply runs in one serializable transaction protected by a PostgreSQL
advisory transaction lock. It reconciles only marked review accounts and their
synthetic company, orders, assignments, attendance, and in-app notifications.
It does not create SMS, email, push, or outbox deliveries.

Every successful apply also rolls the synthetic active shift forward so that
it ends 30 days after the apply time. The readiness check requires at least 14
full days to remain. Run apply and readiness shortly before store submission;
if review is delayed beyond that buffer, repeat the approved idempotent apply
and readiness sequence. Do not extend the fixture by editing production rows
manually.

Before marking an adopted user as reviewer, the same transaction decrypts and
quarantines pending or processing SMS/email outbox events linked to the
configured identifiers, previous pending email, or owned OTP records. The
provider dispatcher independently resolves current User and historical OTP
ownership again at delivery time. Any reviewer or indeterminate owner is
suppressed before the SMS/email provider function is called; database lookup
failure also fails closed. Targets with no owner remain permitted for normal
first-time registration, and explicitly non-review owners retain ordinary
delivery. Resume the outbox worker only after apply and readiness succeed.

The lock query returns a supported Boolean projection rather than PostgreSQL's
`void` value, avoiding Prisma P2010. Serializable conflicts are retried a
bounded three times. CI runs parallel apply, idempotent apply, adoption session
revocation, queued provider-event quarantine, unsafe relationship and profile-state
adoption rejection,
token cleanup, and identifier-collision checks against PostgreSQL 16 in a disposable,
loopback-only database. To run the same destructive test locally, point
`STORE_REVIEW_PG_TEST_DATABASE_URL` only at a database named with the strict
`setservice_review_provision_test_` prefix and the `public` schema, set
`STORE_REVIEW_PG_INTEGRATION_CONFIRM=1`, and run
`npm run test:store-review-postgres`. The test refuses non-loopback hosts and
drops and recreates only that allowlisted test database. The dedicated name is
required because older migrations explicitly reference the `public` schema.

## Migration preflight

The review schema change is split into two ordered additive migrations.
Existing users first receive `is_review_account=false` and the audit enum
receives `login_succeeded`. A second migration contains exactly one
`CREATE INDEX CONCURRENTLY` statement for the composite user index. Keeping
that statement alone prevents the PostgreSQL protocol from placing it in the
implicit transaction used for a multi-statement migration. The concurrent
build avoids blocking normal user writes for the duration of a
production-sized index scan. Enum additions are forward-only; an application
rollback should leave the column, enum value, and valid index in place.

Before production migration approval:

1. Confirm the exact `_prisma_migrations` state and all pending migrations.
2. Restore the latest backup/PITR point to an isolated production-sized clone.
3. Run all pending migrations on the clone while measuring duration, WAL,
   connection pressure, table/index size, and application latency.
4. Exercise ordinary Worker, Company, and Admin reads/writes during the
   concurrent index build.
5. Confirm the new index is valid in `pg_index`, schema drift is zero, and all
   pre-existing users have `is_review_account=false`.
6. Test restoration from the pre-migration backup. A backup that has not been
   restored successfully is not an adequate rollback control.

If a concurrent index build fails, stop deployment, keep the old application
running, inspect for an invalid index, and follow the approved DBA procedure to
drop that invalid index concurrently before resolving/retrying the migration.
Do not manually mark a failed Prisma migration successful.

## Private documents and profile image

The provisioner intentionally does not forge document metadata or write files
directly to R2. Prepare a synthetic avatar and two synthetic PDFs clearly
labelled `STORE REVIEW DEMO — NOT A REAL DOCUMENT`. They must contain no real
name, identity number, signature, address, medical fact, or criminal-history
fact.

Using the approved review Worker account and the normal authenticated mobile
flow:

1. upload the avatar through the standard profile-photo flow;
2. upload one `health_certificate` PDF and one `criminal_record` PDF through
   the standard document flow;
3. wait for the existing malware scanner and private-storage pipeline to mark
   both objects `ready` and `clean`;
4. confirm that document responses expose authenticated download actions, not
   permanent R2 URLs.

Do not insert document JSON manually, publish objects, copy a real customer's
file, or bypass scanning. `npm run store-review:check` deliberately fails until
the avatar and both owned private documents are ready. The account cohort is
not store-review ready until this authenticated upload and scan step has
completed successfully.

## Final readiness

Run `npm run store-review:check` from a one-off process with the same secret
injection. It checks normal password hashes, approved/active state, the review
scope marker, exact least-privilege Admin permissions, profile completeness,
owned private documents, synthetic orders, assignments, closed attendance,
in-app notifications, relationship isolation, and absence of review-order
outbox events. Output contains counts and error codes only.

After readiness passes, verify all three logins from an external test device.
The reviewer Admin must see only review-scoped records, arbitrary production
record IDs must return not found, and the review Company must not notify real
operators when it creates a sample order.

## Deprovision and rollback plan

Deprovisioning is a separate, explicitly approved maintenance operation; the
provision command never performs it automatically. Preserve audit history and
the additive schema. In one reviewed transaction, deactivate only users with
the exact configured identifiers **and** `is_review_account=true`, increment
their session versions, clear legacy FCM fields, and revoke all refresh and
device tokens. Revoke their kiosk/QR sessions, prevent new reviewer logins,
and soft-delete only fixture records carrying the review account relations and
the known fixture titles/version. Do not select records by title alone.

Delete the synthetic private objects through the normal audited storage
deletion flow after the database transaction; never enumerate or delete a
bucket prefix without verifying Worker ownership. Run readiness afterward and
expect it to fail with the account-inactive/not-found code. Keep the migration
column, enum value, and index because the previous backend ignores additive
schema. Use PITR only for an actual data-loss incident, not routine reviewer
cleanup. A production cleanup utility must be separately implemented,
reviewed, rehearsed on a restored clone, and approved before use.
