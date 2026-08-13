#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${APP_ENV_FILE:-.env}"
COMPOSE_FILE="docker-compose.prod.yml"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '\n==> %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

read_env_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]"]+|[[:space:]"]+$/, "", value)
      print value
      exit
    }
  ' "$ENV_FILE"
}

require_command docker
require_command git
require_command curl
require_command stat

[[ -f "$COMPOSE_FILE" ]] || fail "$COMPOSE_FILE is missing"
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE is missing; copy .env.production.example and fill every placeholder"

if ! docker info >/dev/null 2>&1; then
  fail "Docker Engine is not reachable"
fi
docker compose version >/dev/null 2>&1 || fail "Docker Compose is not available"

env_mode="$(stat -c '%a' "$ENV_FILE")"
if (( (8#$env_mode & 8#077) != 0 )); then
  fail "$ENV_FILE permissions are $env_mode; run chmod 600 $ENV_FILE"
fi

export APP_ENV_FILE="$ENV_FILE"
export RELEASE_SHA="${RELEASE_SHA:-$(git rev-parse HEAD)}"
export RELEASE_TAG="${RELEASE_TAG:-${RELEASE_SHA:0:12}}"

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

info "Validating Compose configuration"
"${compose[@]}" config -q

info "Pulling pinned Redis and Caddy images"
"${compose[@]}" pull redis caddy

info "Building API, outbox worker, and migration images"
"${compose[@]}" build --pull api outbox-worker migrate

info "Validating production environment without connecting to providers"
"${compose[@]}" run --rm --no-deps --entrypoint node api \
  -e 'require("./dist/lib/check-env").checkEnv()'

info "Validating Prisma schema"
"${compose[@]}" --profile tools run --rm --no-deps migrate npx prisma validate

info "Running read-only attendance migration preflight"
"${compose[@]}" --profile tools run --rm --no-deps --entrypoint sh migrate \
  -c 'psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/preflight-attendance-deploy.sql'

info "Applying approved Prisma migrations"
"${compose[@]}" --profile tools run --rm --no-deps migrate npm run db:migrate:deploy

info "Starting or updating production services"
"${compose[@]}" up -d --remove-orphans redis outbox-worker api caddy

info "Waiting for API dependency readiness"
ready=false
for _ in $(seq 1 30); do
  if "${compose[@]}" exec -T api node -e '
    fetch("http://127.0.0.1:3000/ready")
      .then((response) => process.exit(response.ok ? 0 : 1))
      .catch(() => process.exit(1));
  ' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 4
done
[[ "$ready" == true ]] || {
  "${compose[@]}" ps
  "${compose[@]}" logs --tail=100 api outbox-worker redis
  fail "API readiness did not become healthy"
}

"${compose[@]}" ps

api_domain="${API_DOMAIN:-$(read_env_value API_DOMAIN)}"
if [[ -n "$api_domain" ]] && getent ahosts "$api_domain" >/dev/null 2>&1; then
  info "Waiting for public HTTPS health at $api_domain"
  public_ready=false
  for _ in $(seq 1 24); do
    if curl --fail --silent --show-error --max-time 10 \
      "https://${api_domain}/health" >/dev/null; then
      public_ready=true
      break
    fi
    sleep 5
  done
  [[ "$public_ready" == true ]] || fail "Public HTTPS health check failed for $api_domain"
else
  printf '\nWARNING: %s does not resolve yet. Containers are ready, but Caddy cannot issue a public certificate until DNS points to this VPS.\n' \
    "${api_domain:-API_DOMAIN}"
fi

info "Deployment completed for commit $RELEASE_SHA"
