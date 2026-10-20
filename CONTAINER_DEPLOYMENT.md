# Container deployment

The production image is built once and exposes separate targets for schema
migrations, the HTTP API, and the outbox processor. Runtime secrets are supplied
by the deployment platform; they are never baked into an image.

Before building, set both immutable base-image inputs. `NODE_BASE_IMAGE` is the
verified official multi-architecture manifest for Node 24.22.0 trixie-slim and
is used only for build tooling. `RUNTIME_BASE_IMAGE` is the official nonroot
distroless Node 24 Debian 13 manifest used by the API, outbox, migration, and
malware-scanner final images. Each reference must include the full lowercase
SHA-256 digest published by its official registry. The Dockerfile intentionally
has no mutable fallback and fails when either value is absent.

The builder upgrades Node's bundled npm within major version 11 to the reviewed
`11.21.1` release before dependency installation. npm and the rest of the build
toolchain are not copied into any runtime image.

```bash
test -n "${NODE_BASE_IMAGE:-}"
test -n "${RUNTIME_BASE_IMAGE:-}"
printf '%s' "$NODE_BASE_IMAGE" \
  | grep -Eq '^node:24\.22\.0-trixie-slim@sha256:[a-f0-9]{64}$'
printf '%s' "$RUNTIME_BASE_IMAGE" \
  | grep -Eq '^gcr\.io/distroless/nodejs24-debian13:nonroot@sha256:[a-f0-9]{64}$'
docker build --build-arg NODE_BASE_IMAGE="$NODE_BASE_IMAGE" --build-arg RUNTIME_BASE_IMAGE="$RUNTIME_BASE_IMAGE" --target api -t setservice-api:release .
docker build --build-arg NODE_BASE_IMAGE="$NODE_BASE_IMAGE" --build-arg RUNTIME_BASE_IMAGE="$RUNTIME_BASE_IMAGE" --target outbox-worker -t setservice-outbox:release .
docker build --build-arg NODE_BASE_IMAGE="$NODE_BASE_IMAGE" --build-arg RUNTIME_BASE_IMAGE="$RUNTIME_BASE_IMAGE" --target migration -t setservice-migration:release .
docker build --build-arg NODE_BASE_IMAGE="$NODE_BASE_IMAGE" --build-arg RUNTIME_BASE_IMAGE="$RUNTIME_BASE_IMAGE" --target malware-scanner -t setservice-malware-scanner:release .
```

CI additionally requires protected repository variables `POSTGRES_CI_IMAGE` and
`REDIS_CI_IMAGE`. They must identify fully versioned official Postgres 16
bookworm and Redis 7 alpine images, respectively, each followed by a verified
`@sha256:` manifest digest. The immutable-input gate validates all four image
references, including `RUNTIME_BASE_IMAGE`, before any dependent job can start.

Run the migration target as a one-off release job before rolling out the API and
worker. On the SET Service VPS, use the production Compose file so API, Redis,
and worker ports remain internal:

```bash
export APP_ENV_FILE=.env
docker compose -f docker-compose.prod.yml --env-file .env --profile tools run --rm --no-deps migrate
docker compose -f docker-compose.prod.yml --env-file .env up -d redis outbox-worker api caddy
```

Never publish API `3000`, outbox health `3001`, or Redis `6379` on the host.
Only Caddy publishes host ports 80 and 443. See
[`PRODUCTION_DEPLOYMENT.md`](./PRODUCTION_DEPLOYMENT.md) for the complete VPS
sequence, migration preflight, verification, and rollback procedure.

The API, outbox, migration, and malware-scanner targets run as numeric uid/gid
65532 on a shell-free distroless runtime and invoke Node directly, without npm,
psql, or a package manager. The migration target calls the vendored Prisma CLI
through a Node wrapper that appends fixed session options to both database URLs:
`lock_timeout=5s`, `statement_timeout=15min`, and
`idle_in_transaction_session_timeout=60s`. It also runs its read-only attendance
guard through Prisma. Compose enables
its built-in init process for signal forwarding and child reaping. The
API has an HTTP liveness healthcheck. The orchestrator should use API `/health`
for liveness and `/ready`
for readiness. With `OUTBOX_WORKER_ENABLED=false`, readiness also requires a
fresh heartbeat from the separately deployed worker in Redis. The worker exposes
`/health` and Prometheus `/metrics` on `OUTBOX_HEALTH_PORT` (default `3001`).
Run exactly one migration job per release and at least one outbox worker replica.
Database, Redis, and provider-outbox encryption credentials must come from the
platform secret manager.

The container entrypoint invokes `dist/outbox-worker.js` directly. Non-container
deployments may continue to supervise `npm run start:outbox` as an independent
service.

Alert on a non-200 worker health response, a stale API outbox readiness check,
consecutive worker failures, growing pending backlog, and dead-letter events.

Recommended protected-branch gates are backend and web typechecks/builds,
security regression suites, secret scanning, production dependency audits,
Prisma validation/migration status, Swagger drift, container scanning, and SBOM
generation. Require those checks and at least one approving review before merge.
