# Immutable reviewer release and rollback

This procedure prepares immutable artifacts. It does not authorize a deploy,
migration, service restart, reviewer-account creation, push, or store build.

## Build and attest

1. Create a reviewed commit only after the integrated worktree is clean. Record
   its full SHA, the verified patch SHA-256, lockfile SHA-256, migration
   checksums, test report, and approved Node base-image digest.
2. In a fresh checkout, require `git status --porcelain` to be empty and
   `git rev-parse HEAD` to equal the approved full SHA. Verify signatures or
   protected-branch provenance according to repository policy.
3. On a trusted Linux builder, build `api`, `outbox-worker`,
   `malware-scanner`, `migration`, and `reviewer-provisioner` from that SHA for
   `linux/amd64`. Pass the
   base image by digest, add `org.opencontainers.image.revision=<full SHA>`,
   create SBOM/provenance, and tag each artifact with the full SHA. Never use
   `latest` or a moving branch as the release identity.

Example form, to be filled only after approval:

```bash
docker buildx build --pull --platform linux/amd64 --target api \
  --build-arg NODE_BASE_IMAGE="$NODE_BASE_IMAGE" \
  --build-arg RUNTIME_BASE_IMAGE="$RUNTIME_BASE_IMAGE" \
  --label "org.opencontainers.image.revision=$RELEASE_SHA" \
  --tag "$REGISTRY/setservice-api:$RELEASE_SHA" \
  --provenance=mode=max --sbom=true --push .
```

Repeat for the other four Dockerfile targets with their distinct repository
names. Resolve and record each registry digest. Scan and sign by digest, verify
SBOM/provenance and revision labels, then create a reviewed deployment manifest
that references only `repository@sha256:<digest>` values. Validate Compose with
`config -q`; do not print the resolved environment.

The reviewer-provisioner must retain its numeric uid/gid 65532 distroless
runtime and direct Node entrypoint. It contains no shell, npm, npx, ts-node, or
package manager. Its only accepted commands are `plan`, `apply`, and `check`,
with `plan` as the default. Use the digest-pinned image for ordinary reviewer
provisioning. Account adoption and password rotation remain separate tooling;
the release image must not expose those flags.

The protected GitHub Actions variables for this release are:

```text
NODE_BASE_IMAGE=node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315
RUNTIME_BASE_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:59c479c9b8c123e66047315c968aa2d35e31ae5149c856e4110a79c8b3563f0b
POSTGRES_CI_IMAGE=postgres:16.15-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4
REDIS_CI_IMAGE=redis:7.4.10-alpine3.21@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2
```

The current `scripts/deploy-production.sh` builds local mutable tags and couples
migration with rollout. It must not be used unchanged for this digest-pinned,
staged release. Deployment must use `--no-build` and explicit digest overrides.

## Staged release order

Before any change, record the current Git SHA, Compose/Caddy checksums, and exact
API, outbox and malware-scanner image IDs/digests. If a current local image has
no registry digest, preserve it in controlled encrypted storage and record the
archive checksum during the approved window.

1. Complete the Neon clone/restore rehearsal and approve its evidence.
2. Run the production read-only audit and reconcile the exact pending migration
   list and lock state. Confirm the `waiter-waitress` position and its parent
   subdepartment and department are active; reviewer provisioning must stop if
   this taxonomy path is absent or duplicated.
3. Keep the current services running while the digest-pinned migration image
   performs the approved preflight and migration. Use its default timeout-
   enforcing command; a lock timeout aborts the release and is not retried.
4. Verify schema state and index validity.
5. Roll API and outbox from the same release SHA/digest set. The reviewer-aware
   schema must exist before either new image starts because ownership checks use
   `users.is_review_account`.
6. Verify API health/readiness, outbox heartbeat, normal provider canaries,
   reviewer suppression, and the independent dead-letter alerts:
   `setservice_outbox_queue_events{state="dead"} > 0`, current-batch failures,
   pending growth, and heartbeat staleness.
7. Provisioning is a later, separate approval. Pause and drain the outbox for
   every reviewer apply, run `plan`, set the one-off apply and quiescence gates,
   run `apply`, then run `check` with the same digest-pinned provisioner image.
   Clear all gates and secret injection before resuming the worker.

## Application rollback

- Before migration, abort and leave current services running.
- After these additive migrations, roll API/outbox/scanner back by their saved
  digests and leave the additive schema in place. Do not remove the enum,
  columns, indexes, or migration rows.
- Pause outbox first if retry storms or incompatible event handling are
  suspected. API and outbox compatibility must be evaluated as a pair.
- After reviewer accounts exist, never roll back to code lacking reviewer
  cohort isolation and provider suppression. Retain the reviewer-aware API and
  outbox, or use the separately approved deprovision procedure and prove no
  reviewer provider event remains pending/processing.
- Never run `prisma migrate reset`, `db push`, delete migration records, drop
  data-bearing columns, or use `docker compose down -v`.
- PITR is an incident action, not routine application rollback. Restore to an
  isolated branch first and obtain incident-command approval because a restore
  can discard writes after the recovery point.

Rollback is successful only after old image digests are verified, health and
readiness pass, normal notification canaries work, outbox queue/heartbeat are
stable, and reviewer external-delivery isolation remains intact.
