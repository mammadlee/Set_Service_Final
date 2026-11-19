# Immutable image publication and production checklist

This checklist is an execution control for the existing SET Service release.
It does not authorize a merge, registry publication, production change,
migration, reviewer-account creation, or store upload.

## Release artifact gate

- [ ] The approved release is a clean full 40-character commit on
  `codex/final-store-release-preparation` in
  `mammadlee/Set_Service_Final`.
- [ ] `.github/workflows/publish-release-images.yml` exists on the default
  branch so GitHub permits manual dispatch. It has no automatic trigger.
- [ ] The full-history secret gate passes using exact evidence records. The
  twelve unresolved identities documented in
  `store-review-secret-history-response.md` must be provider-verified; an
  `active` or `unknown` identity blocks publication.
- [ ] `NODE_BASE_IMAGE`, `RUNTIME_BASE_IMAGE`, `POSTGRES_CI_IMAGE`, and
  `REDIS_CI_IMAGE` are approved digest-pinned repository variables.
- [ ] The publication is explicitly approved, then manually dispatched for
  the exact release commit:

  ```bash
  gh workflow run publish-release-images.yml \
    --repo mammadlee/Set_Service_Final \
    --ref codex/final-store-release-preparation \
    -f release_sha=<FINAL_RELEASE_SHA> \
    -f confirmation=PUBLISH_SIGN_RELEASE_IMAGES
  ```

- [ ] The workflow first builds isolated candidate tags. All five candidates
  pass runtime metadata validation, SBOM generation, Trivy vulnerability and
  secret scanning, and exact-identity Cosign verification before full-SHA tags
  are created. An existing full-SHA tag with a different digest is a hard
  failure.
- [ ] Download `setservice-immutable-release-<FINAL_RELEASE_SHA>` and verify its
  signed `release-manifest.json`, checksum, workflow run URL, source/tree SHA,
  lockfile checksum, migration checksums, pinned inputs, five image digests,
  revision labels, SBOM checksums, zero HIGH/CRITICAL/secret scan counts, and
  Cosign identities. Deployment references only
  `repository@sha256:<digest>` values.

The five required manifest targets are `api`, `outbox-worker`, `migration`,
`malware-scanner`, and `reviewer-provisioner`. Publication alone cannot deploy,
run migrations, invoke Bitrise, or upload a store build.

## Production approval boundary

- [ ] Keep `/opt/set-service/docker-compose.prod.yml`, `.env`, `Caddyfile`, the
  Git working tree, and current image tags unchanged.
- [ ] Record the current production Git SHA, Compose/Caddy checksums, six
  container health states, exact API/outbox/scanner image IDs, outbox queue
  state, and rollback image references without printing environment values.
- [ ] Reconfirm the approved Neon PITR/restore and migration rehearsal evidence,
  the expected production migration baseline, no unfinished migration, no
  invalid index, and no long blocking transaction.
- [ ] Create a root-readable mode-0600 Compose override under
  `/run/set-service/<FINAL_RELEASE_SHA>/`. It may override only these images:

  ```yaml
  services:
    malware-scanner:
      image: ghcr.io/mammadlee/setservice-malware-scanner@sha256:<digest>
    api:
      image: ghcr.io/mammadlee/setservice-api@sha256:<digest>
    outbox-worker:
      image: ghcr.io/mammadlee/setservice-outbox@sha256:<digest>
    migrate:
      image: ghcr.io/mammadlee/setservice-migration@sha256:<digest>
  ```

- [ ] Verify each digest signature and revision label before it enters the
  override. Hash and retain the override with the release record.
- [ ] Validate the combined configuration without rendering it to logs:

  ```bash
  docker compose \
    -f /opt/set-service/docker-compose.prod.yml \
    -f /run/set-service/<FINAL_RELEASE_SHA>/digest-override.yml \
    --env-file /opt/set-service/.env config -q
  ```

- [ ] Stop here for explicit migration and sequential-rollout approval.

## Approved migration and sequential rollout

- [ ] With the digest override and `--no-build`, run the migration image's
  Prisma validation and read-only attendance preflight. Require exactly the
  three rehearsed pending migrations and expected taxonomy state.
- [ ] Run the migration one-shot once. Never retry a lock timeout
  automatically, mark a failed migration applied, run `db push`, or use
  `migrate reset`.
- [ ] Verify all three migrations completed and all expected indexes are valid.
- [ ] Roll `malware-scanner`, then `api`, then `outbox-worker`, each with
  `--no-deps --no-build`; wait for health/readiness before advancing. Redis,
  ClamAV, and Caddy remain untouched.
- [ ] Verify API health/readiness, outbox heartbeat and queue metrics, ordinary
  provider canaries, reviewer external-delivery suppression, Build 14 legacy
  compatibility, and Build 15 password-step-up behavior.

## Rollback and reviewer boundary

- [ ] On application failure, restore the saved scanner digest and restore API
  and outbox as a compatible pair. Leave the additive schema and Prisma ledger
  intact; PITR is an incident action, not routine rollback.
- [ ] Reviewer provisioning is a separate approval. Run the signed
  `reviewer-provisioner` digest with `plan`, then approval-gated `apply`, then
  `check`; keep secrets in the approved secret injection path and never in Git,
  command arguments, or artifacts.
- [ ] Store submission remains a later independent approval after reviewer
  login, isolation, external-delivery suppression, signed Android/iOS builds,
  and store metadata are verified.
