#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $- == *x* ]]; then
  set +x
  printf 'ERROR: Refusing to run with shell tracing enabled.\n' >&2
  exit 2
fi
umask 077

readonly ROOT="${SET_SERVICE_ROOT:-/opt/set-service}"
readonly COMPOSE_FILE="$ROOT/docker-compose.prod.yml"
readonly ENV_FILE="$ROOT/.env"
readonly EXPECTED_SHA="${EXPECTED_SHA:-9d802bf30a0f8e9733eb44d63b0856999b587f79}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

for command_name in git docker curl stat find sort comm awk sed grep date; do
  command -v "$command_name" >/dev/null 2>&1 ||
    fail "Required command unavailable: $command_name"
done

[[ -d "$ROOT/.git" || -f "$ROOT/.git" ]] || fail 'Git checkout not found'
[[ -f "$COMPOSE_FILE" ]] || fail 'Compose file not found'
[[ -f "$ENV_FILE" ]] || fail 'Production env file not found'

cd "$ROOT"
readonly -a COMPOSE=(
  docker compose
  -f "$COMPOSE_FILE"
  --env-file "$ENV_FILE"
)

docker info >/dev/null 2>&1 || fail 'Docker Engine is unavailable'
"${COMPOSE[@]}" config -q >/dev/null 2>&1 ||
  fail 'Compose validation failed; details intentionally redacted'

printf '=== AUDIT METADATA ===\n'
printf 'audit_utc=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf 'root=%s\n' "$ROOT"

printf '\n=== GIT ===\n'
actual_sha="$(git rev-parse --verify HEAD)"
branch_name="$(git symbolic-ref -q --short HEAD || printf 'DETACHED')"
staged_count="$(git diff --cached --name-only | awk 'END { print NR + 0 }')"
unstaged_count="$(git diff --name-only | awk 'END { print NR + 0 }')"
untracked_count="$(git ls-files --others --exclude-standard | awk 'END { print NR + 0 }')"

printf 'head=%s\n' "$actual_sha"
printf 'expected_head=%s\n' "$EXPECTED_SHA"
printf 'head_matches_expected=%s\n' "$([[ "$actual_sha" == "$EXPECTED_SHA" ]] && printf true || printf false)"
printf 'branch=%s\n' "$branch_name"
printf 'staged_file_count=%s\n' "$staged_count"
printf 'unstaged_file_count=%s\n' "$unstaged_count"
printf 'untracked_file_count=%s\n' "$untracked_count"
printf 'tracked_status_only:\n'
git status --short --branch --untracked-files=no

env_mode="$(stat -c '%a' "$ENV_FILE")"
printf 'env_file_mode=%s\n' "$env_mode"
if (( (8#$env_mode & 8#077) != 0 )); then
  printf 'env_file_mode_safe=false\n'
else
  printf 'env_file_mode_safe=true\n'
fi

printf '\n=== DOCKER ALLOWLISTED METADATA ===\n'
readonly -a SERVICES=(api outbox-worker malware-scanner clamav redis caddy)
for service in "${SERVICES[@]}"; do
  mapfile -t container_ids < <("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)
  if (( ${#container_ids[@]} == 0 )); then
    printf 'service=%s status=absent\n' "$service"
    continue
  fi

  for container_id in "${container_ids[@]}"; do
    [[ -n "$container_id" ]] || continue
    metadata="$(
      docker inspect --type container --format \
        '{{.Name}}|{{.Config.Image}}|{{.Image}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}not-defined{{end}}|{{.RestartCount}}|{{.State.StartedAt}}' \
        "$container_id" 2>/dev/null
    )" || {
      printf 'service=%s status=inspect-failed\n' "$service"
      continue
    }

    IFS='|' read -r container_name image_ref image_id state health restarts started_at \
      <<<"$metadata"
    container_name="${container_name#/}"
    repo_digests="$(
      docker image inspect --format '{{join .RepoDigests ","}}' \
        "$image_id" 2>/dev/null || true
    )"
    [[ -n "$repo_digests" ]] || repo_digests='none-recorded'

    printf 'service=%s container=%s image_ref=%s image_id=%s repo_digests=%s state=%s health=%s restarts=%s started_at=%s\n' \
      "$service" "$container_name" "$image_ref" "$image_id" "$repo_digests" \
      "$state" "$health" "$restarts" "$started_at"
  done
done

printf '\n=== PUBLIC HTTPS STATUS ===\n'
check_url() {
  local label="$1"
  local url="$2"
  local code rc

  set +e
  code="$(
    curl --silent --show-error --output /dev/null \
      --max-time 15 --write-out '%{http_code}' "$url" 2>/dev/null
  )"
  rc=$?
  set -e

  if (( rc == 0 )); then
    printf 'endpoint=%s http_status=%s transport=ok\n' "$label" "$code"
  else
    printf 'endpoint=%s http_status=%s transport=failed\n' "$label" "${code:-000}"
  fi
}

check_url api_health 'https://api.setservice.az/health'
check_url api_ready 'https://api.setservice.az/ready'
check_url admin_root 'https://admin.setservice.az/'
check_url qr_root 'https://qr.setservice.az/'

set +e
db_report="$("${COMPOSE[@]}" exec -T api node - 2>/dev/null <<'NODE'
const { PrismaClient } = require('@prisma/client');

const safe = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  return String(value).replace(/[|\r\n]/g, '_').slice(0, 200);
};

const emit = (kind, row, keys) => {
  process.stdout.write([kind, ...keys.map((key) => safe(row[key]))].join('|') + '\n');
};

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  process.stdout.write('DB_AUDIT_ERROR|DIRECT_URL_UNAVAILABLE\n');
  process.exit(2);
}

const prisma = new PrismaClient({
  datasources: { db: { url: directUrl } },
  errorFormat: 'minimal',
  log: [],
});

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '12s'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'");

    const server = await tx.$queryRawUnsafe(`
      SELECT
        current_setting('server_version') AS server_version,
        pg_size_pretty(pg_database_size(current_database())) AS database_size,
        pg_has_role(current_user, 'pg_monitor', 'member')::text AS has_pg_monitor
    `);
    for (const row of server) {
      emit('DATABASE', row, ['server_version', 'database_size', 'has_pg_monitor']);
    }

    const migrations = await tx.$queryRawUnsafe(`
      SELECT
        migration_name,
        CASE
          WHEN rolled_back_at IS NOT NULL THEN 'rolled_back'
          WHEN finished_at IS NOT NULL THEN 'finished'
          ELSE 'unfinished'
        END AS status,
        to_char(started_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_utc,
        COALESCE(
          to_char(finished_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          ''
        ) AS finished_utc
      FROM "_prisma_migrations"
      ORDER BY started_at, migration_name
    `);
    for (const row of migrations) {
      emit('MIGRATION', row,
        ['migration_name', 'status', 'started_utc', 'finished_utc']);
    }

    const tables = await tx.$queryRawUnsafe(`
      SELECT
        relname AS table_name,
        n_live_tup::bigint AS estimated_rows,
        pg_total_relation_size(relid)::bigint AS total_bytes,
        pg_relation_size(relid)::bigint AS table_bytes,
        pg_indexes_size(relid)::bigint AS index_bytes,
        COALESCE(
          to_char(GREATEST(last_analyze, last_autoanalyze) AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          ''
        ) AS last_analyze_utc
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
        AND relname = ANY(ARRAY[
          'users',
          'workers',
          'companies',
          'orders',
          'assignments',
          'attendance_logs',
          'refresh_tokens',
          'device_tokens',
          'otp_codes',
          'outbox_events',
          'notifications',
          'audit_logs',
          'moderation_reports',
          'external_account_deletion_requests'
        ]::text[])
      ORDER BY pg_total_relation_size(relid) DESC, relname
    `);
    for (const row of tables) {
      emit('TABLE', row, [
        'table_name',
        'estimated_rows',
        'total_bytes',
        'table_bytes',
        'index_bytes',
        'last_analyze_utc',
      ]);
    }

    const databaseStats = await tx.$queryRawUnsafe(`
      SELECT
        numbackends::bigint,
        xact_commit::bigint,
        xact_rollback::bigint,
        deadlocks::bigint,
        temp_files::bigint,
        temp_bytes::bigint
      FROM pg_stat_database
      WHERE datname = current_database()
    `);
    for (const row of databaseStats) {
      emit('DB_STATS', row, [
        'numbackends',
        'xact_commit',
        'xact_rollback',
        'deadlocks',
        'temp_files',
        'temp_bytes',
      ]);
    }

    const connectionStates = await tx.$queryRawUnsafe(`
      SELECT COALESCE(state, 'internal') AS state, count(*)::bigint AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY COALESCE(state, 'internal')
      ORDER BY state
    `);
    for (const row of connectionStates) {
      emit('CONNECTION_STATE', row, ['state', 'count']);
    }

    const lockSummary = await tx.$queryRawUnsafe(`
      SELECT
        l.locktype,
        l.mode,
        l.granted::text AS granted,
        count(*)::bigint AS count
      FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE a.datname = current_database()
      GROUP BY l.locktype, l.mode, l.granted
      ORDER BY l.granted, l.locktype, l.mode
    `);
    for (const row of lockSummary) {
      emit('LOCK_SUMMARY', row, ['locktype', 'mode', 'granted', 'count']);
    }

    const longOrBlocked = await tx.$queryRawUnsafe(`
      SELECT
        pid::text,
        COALESCE(backend_type, '') AS backend_type,
        COALESCE(state, '') AS state,
        COALESCE(wait_event_type, '') AS wait_event_type,
        COALESCE(wait_event, '') AS wait_event,
        COALESCE(
          round(extract(epoch FROM (clock_timestamp() - xact_start))::numeric, 1)::text,
          ''
        ) AS transaction_age_seconds,
        CASE
          WHEN state = 'active' THEN
            COALESCE(
              round(extract(epoch FROM (clock_timestamp() - query_start))::numeric, 1)::text,
              ''
            )
          ELSE ''
        END AS active_age_seconds,
        cardinality(pg_blocking_pids(pid))::text AS blocking_pid_count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND (
          cardinality(pg_blocking_pids(pid)) > 0
          OR (
            xact_start IS NOT NULL
            AND clock_timestamp() - xact_start > interval '30 seconds'
          )
          OR (
            state = 'active'
            AND query_start IS NOT NULL
            AND clock_timestamp() - query_start > interval '30 seconds'
          )
        )
      ORDER BY xact_start NULLS LAST, query_start NULLS LAST, pid
    `);
    for (const row of longOrBlocked) {
      emit('LONG_OR_BLOCKED', row, [
        'pid',
        'backend_type',
        'state',
        'wait_event_type',
        'wait_event',
        'transaction_age_seconds',
        'active_age_seconds',
        'blocking_pid_count',
      ]);
    }

    const invalidIndexes = await tx.$queryRawUnsafe(`
      SELECT
        ns.nspname AS schema_name,
        tbl.relname AS table_name,
        idx.relname AS index_name,
        i.indisready::text AS is_ready,
        i.indisvalid::text AS is_valid
      FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = idx.relnamespace
      WHERE ns.nspname = 'public'
        AND (NOT i.indisready OR NOT i.indisvalid)
      ORDER BY tbl.relname, idx.relname
    `);
    if (invalidIndexes.length === 0) {
      process.stdout.write('INVALID_INDEX|none\n');
    } else {
      for (const row of invalidIndexes) {
        emit('INVALID_INDEX', row,
          ['schema_name', 'table_name', 'index_name', 'is_ready', 'is_valid']);
      }
    }

    const expectedIndexes = await tx.$queryRawUnsafe(`
      WITH expected(index_name) AS (
        VALUES
          ('assignments_attendance_activity_at_idx'),
          ('assignments_last_checkin_at_idx'),
          ('assignments_last_checkout_at_idx'),
          ('users_is_review_account_role_idx')
      ),
      actual AS (
        SELECT idx.relname AS index_name, i.indisready, i.indisvalid
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_namespace ns ON ns.oid = idx.relnamespace
        WHERE ns.nspname = 'public'
      )
      SELECT
        expected.index_name,
        CASE
          WHEN actual.index_name IS NULL THEN 'missing'
          ELSE actual.indisready::text
        END AS is_ready,
        CASE
          WHEN actual.index_name IS NULL THEN 'missing'
          ELSE actual.indisvalid::text
        END AS is_valid
      FROM expected
      LEFT JOIN actual USING (index_name)
      ORDER BY expected.index_name
    `);
    for (const row of expectedIndexes) {
      emit('EXPECTED_INDEX', row, ['index_name', 'is_ready', 'is_valid']);
    }
  }, { maxWait: 5000, timeout: 30000 });
}

main()
  .catch((error) => {
    const candidate = error && typeof error.code === 'string' ? error.code : 'REDACTED';
    const safeCode = /^[A-Z0-9_-]{1,64}$/.test(candidate) ? candidate : 'REDACTED';
    process.stdout.write(`DB_AUDIT_ERROR|${safeCode}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
NODE
)"
db_rc=$?
set -e

printf '\n=== DATABASE READ-ONLY REPORT ===\n'
if (( db_rc != 0 )); then
  printf 'database_audit=failed\n'
  printf 'database_error_details=redacted\n'
  exit "$db_rc"
fi
printf '%s\n' "$db_report"

pending_migrations="$(
  comm -23 \
    <(find "$ROOT/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -u) \
    <(printf '%s\n' "$db_report" | awk -F'|' '$1 == "MIGRATION" && $3 == "finished" { print $2 }' | sort -u)
)"
database_only_migrations="$(
  comm -13 \
    <(find "$ROOT/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -u) \
    <(printf '%s\n' "$db_report" | awk -F'|' '$1 == "MIGRATION" && $3 == "finished" { print $2 }' | sort -u)
)"

printf '\n=== MIGRATION RECONCILIATION ===\n'
if [[ -n "$pending_migrations" ]]; then
  printf 'pending_local_migrations:\n'
  printf '%s\n' "$pending_migrations" | sed 's/^/  /'
else
  printf 'pending_local_migrations=none\n'
fi
if [[ -n "$database_only_migrations" ]]; then
  printf 'database_migrations_missing_from_checkout:\n'
  printf '%s\n' "$database_only_migrations" | sed 's/^/  /'
else
  printf 'database_migrations_missing_from_checkout=none\n'
fi

printf 'reviewer_release_migrations:\n'
for migration_name in \
  20261014120000_assignment_attendance_activity \
  20261017120000_store_review_account_scope \
  20261017121000_store_review_account_index; do
  if printf '%s\n' "$db_report" |
    awk -F'|' '$1 == "MIGRATION" && $3 == "finished" { print $2 }' |
    grep -Fqx -- "$migration_name"; then
    printf '  %s|finished\n' "$migration_name"
  else
    printf '  %s|pending\n' "$migration_name"
  fi
done

printf '\n=== BACKUP / PITR EVIDENCE BOUNDARY ===\n'
printf 'backup_pitr_status=NOT_VERIFIED\n'
printf '%s\n' \
  'SQL and Docker metadata cannot prove Neon retention, snapshot completion, or recoverability.' \
  'Record branch protection, retention, recovery point, isolated restore result, RPO/RTO, and owner in the restricted release record.' \
  'Do not paste database URLs, API keys, passwords, tokens, or connection strings into that record.'

printf '\n=== AUDIT COMPLETE ===\n'
