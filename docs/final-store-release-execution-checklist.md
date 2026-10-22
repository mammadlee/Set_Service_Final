# Final store release execution checklist

Status: **LOCAL PREPARATION ONLY — PRODUCTION NO-GO** until the Neon
production-sized clone migration, restore rehearsal, backup/PITR evidence, and
taxonomy preflight are reviewed and explicitly approved. The source candidate
is `1.0.0+15`; replace `<RELEASE_SHA>` and every image placeholder below with
the final reviewed immutable value.

## 1. Approve and rehearse Neon

- [ ] Confirm current backup/PITR retention and a recent recoverable point
  without printing connection strings.
- [ ] With separate approval, restore to an isolated production-sized Neon
  branch and prove restoration before running migrations.
- [ ] Run the exact pending migrations on the clone; record duration, locks,
  WAL/connection pressure, index validity, schema drift, and normal Build 14 and
  Build 15 traffic during the rehearsal.
- [ ] Confirm exactly one active `waiter-waitress` position joined to an active
  subdepartment and department. Stop if the count is not `1`.
- [ ] Rehearse API/outbox rollback by saved digest while leaving additive schema
  changes in place. Record the approved migration and rollback decision.

## 2. Make CI safe, then publish source

- [ ] Compare the 61 redacted historical secret-scan findings from five commits
  with the secret manager/provider inventories. Mark each inactive or unknown;
  rotate every still-active credential under separate approval before deploy.
- [ ] In the Bitrise dashboard, remove only the `ios_release` push and wildcard
  pull-request triggers. Preserve both `run_tests` triggers. Reload and capture
  evidence that `ios_release` is manual-only. This has not yet been changed.
- [ ] Set these four protected GitHub Actions variables exactly:

  ```text
  NODE_BASE_IMAGE=node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315
  RUNTIME_BASE_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:59c479c9b8c123e66047315c968aa2d35e31ae5149c856e4110a79c8b3563f0b
  POSTGRES_CI_IMAGE=postgres:16.15-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4
  REDIS_CI_IMAGE=redis:7.4.10-alpine3.21@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2
  ```

- [ ] After explicit approval, push `<RELEASE_SHA>` and open the reviewed pull
  request. Require all CI gates and verify the remote SHA before merge.
- [ ] Before a `main`/`master` push, configure the existing protected Android
  release values (`ANDROID_KEYSTORE_BASE64`, keystore/key passwords and alias,
  `ANDROID_GOOGLE_SERVICES_JSON_BASE64`, and `STAGING_API_BASE_URL`) through
  GitHub Actions secrets. They were absent during the read-only audit; pull
  requests skip the signed-AAB step, while a post-merge push requires it.

## 3. Build and publish five immutable images

- [ ] From a clean checkout at `<RELEASE_SHA>`, build `api`, `outbox-worker`,
  `migration`, `malware-scanner`, and `reviewer-provisioner` for
  `linux/amd64`, using the pinned base images and revision label.
- [ ] Generate SBOM/provenance, scan vulnerabilities and secrets, sign, publish,
  and record each registry digest. Deploy only `repository@sha256:<digest>`.
- [ ] Verify uid/gid 65532, direct Node entrypoints, no shell/package manager,
  and the provisioner's exact `plan|apply|check` interface with default `plan`.
  Adoption and password rotation remain separate tooling.

## 4. Deploy with rollback ready

- [ ] Obtain production-change approval. Record current commit, configuration
  checksums, image digests, health, queue state, and the rollback digest set.
- [ ] Run the read-only preflight, then the digest-pinned migration one-shot.
  Abort on lock timeout or migration/index failure; do not mark a failed Prisma
  migration successful.
- [ ] Verify migrations and index validity, then roll API, outbox, and scanner
  from the same digest set. Verify `/health`, `/ready`, outbox heartbeat/metrics,
  ordinary notification canaries, Build 14 compatibility, and Build 15
  password-step-up behavior.
- [ ] On application failure, restore the saved service digests and leave the
  additive schema in place. Keep reviewer-aware API/outbox code once reviewer
  accounts exist unless the separately approved cleanup has completed.

## 5. Provision and validate store reviewers

- [ ] Obtain a separate reviewer-provision approval. Inject five identifiers,
  three unique passwords, database URL, and encryption key from the secret
  manager; never place them in Git, shell arguments, or logs.
- [ ] Pause and drain provider outbox delivery. Run digest-pinned `plan`; set the
  apply and quiescence gates only in the one-off container; run `apply`; clear
  the gates. Do not adopt or rotate accounts through the release image.
- [ ] Through normal authenticated flows, upload the synthetic avatar, health
  certificate, and criminal-record PDF; wait for private storage and malware
  scanning to report ready/clean.
- [ ] Run digest-pinned `check`, remove the secret injection, and resume the
  outbox. Verify Worker, Company, and least-privilege Admin login, cohort
  isolation, synthetic fixtures, QR/attendance, and zero external SMS, email,
  or FCM delivery from reviewer activity.

## 6. Build and submit stores

- [ ] Google Play: confirm versionCode 15 is unused in every track, manually
  build/sign the AAB from `<RELEASE_SHA>`, validate production API behavior on a
  physical device, upload after approval, enter the shared three-role App
  Access instructions, then submit in the chosen track after metadata/privacy
  review.
- [ ] Apple: confirm build 15 is unused, manually start `ios_release` for
  `<RELEASE_SHA>` only after its triggers are manual-only, verify the checkout
  SHA and signed `1.0.0+15` archive, complete TestFlight smoke tests, enter the
  shared three-role Review Notes, and obtain separate approval for App Review
  submission.
- [ ] Monitor API health, outbox, reviewer isolation, crash reports, and store
  review feedback. Roll back application images by saved digest if required;
  use PITR only under the incident procedure.
