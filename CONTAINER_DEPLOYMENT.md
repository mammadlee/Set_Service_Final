# Container deployment

The production image is built once and exposes separate targets for schema
migrations, the HTTP API, and the outbox processor. Runtime secrets are supplied
by the deployment platform; they are never baked into an image.

Before building, set `NODE_BASE_IMAGE` to the verified official multi-architecture
manifest reference for Node 24.17.0 bookworm-slim. The value must have the exact
shape `node:24.17.0-bookworm-slim@sha256:` followed by the 64 lowercase hex
characters published by the official image registry. Never copy a digest from an
untrusted source. The Dockerfile intentionally has no mutable fallback and the
build fails when this value is absent.

```bash
test -n "${NODE_BASE_IMAGE:-}"
printf '%s' "$NODE_BASE_IMAGE" \
  | grep -Eq '^node:24\.17\.0-bookworm-slim@sha256:[a-f0-9]{64}$'
docker build --build-arg NODE_BASE_IMAGE="$NODE_BASE_IMAGE" --target api -t setservice-api:release .
docker build --build-arg NODE_BASE_IMAGE="$NODE_BASE_IMAGE" --target outbox-worker -t setservice-outbox:release .
docker build --build-arg NODE_BASE_IMAGE="$NODE_BASE_IMAGE" --target migration -t setservice-migration:release .
```

CI additionally requires protected repository variables `POSTGRES_CI_IMAGE` and
`REDIS_CI_IMAGE`. They must identify fully versioned official Postgres 16
bookworm and Redis 7 alpine images, respectively, each followed by a verified
`@sha256:` manifest digest. The immutable-input gate validates all three image
references before any dependent job can start.

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

The API target runs as the non-root `node` user and has an HTTP liveness
healthcheck. The orchestrator should use API `/health` for liveness and `/ready`
for readiness. With `OUTBOX_WORKER_ENABLED=false`, readiness also requires a
fresh heartbeat from the separately deployed worker in Redis. The worker exposes
`/health` and Prometheus `/metrics` on `OUTBOX_HEALTH_PORT` (default `3001`).
Run exactly one migration job per release and at least one outbox worker replica.
Database, Redis, and provider-outbox encryption credentials must come from the
platform secret manager.

The container entrypoint uses `npm run start:outbox`; non-container deployments
must supervise that same command as an independent service.

Alert on a non-200 worker health response, a stale API outbox readiness check,
consecutive worker failures, growing pending backlog, and dead-letter events.

Recommended protected-branch gates are backend and web typechecks/builds,
security regression suites, secret scanning, production dependency audits,
Prisma validation/migration status, Swagger drift, container scanning, and SBOM
generation. Require those checks and at least one approving review before merge.
