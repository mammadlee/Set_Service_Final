# SET Service production deployment

This runbook deploys the SET Service backend to a single Ubuntu 24.04 VPS with
Docker Compose, Caddy, Redis, and the official Cisco/Talos ClamAV image. Neon remains the PostgreSQL system of record
and Cloudflare R2 remains the object store. It does not containerize or deploy
the Vite frontends or Flutter mobile application.

## 1. Deployment scope and audited architecture

The backend is a TypeScript/Express modular monolith. Prisma owns the existing
migration history, Redis owns temporary OTP/rate-limit/outbox state, and a
separate outbox worker performs durable provider delivery. The existing API
already provides:

- `/health` for process liveness;
- `/ready` for PostgreSQL, Redis, and outbox-heartbeat readiness;
- production startup validation for required variables, independent strong
  secrets, OTP safety, explicit CORS origins, Redis, R2, providers, and Swagger;
- bounded reverse-proxy trust through `TRUST_PROXY_CIDRS`;
- Redis-backed OTP/rate limiting that fails closed in production;
- structured logging with credential/contact redaction;
- optional Sentry initialization and graceful SIGTERM/SIGINT shutdown;
- a separate API, outbox-worker, and migration Docker target.
- a first-party internal HTTP malware adapter backed by ClamAV `clamd`.

The VPS topology is:

```text
Internet
  -> Cloudflare DNS
  -> Caddy (host ports 80/443 only)
  -> API container (Docker proxy network, port 3000 not published)
       -> Neon PostgreSQL
       -> Redis (Docker backend network, port 6379 not published)
       -> Cloudflare R2 / Sentry / SMS / email / Firebase
       -> malware-scanner (internal scanner network, port 8080 not published)
            -> ClamAV clamd (internal scanner network, port 3310 not published)
  -> outbox-worker (backend + outbound networks, port 3001 not published)
```

Only ClamAV also joins the dedicated `scanner-updates` bridge so FreshClam can
download signature updates. No application container joins that network. The
`scanner` network is internal, neither scanner port is published, and
`clamav_data` persists `/var/lib/clamav` across image replacement.

Compose also defines a one-off `migrate` service. There is no PostgreSQL
container, PM2, Prisma Studio, Docker socket mount, privileged container, or
public debug port.

## 2. Mandatory security actions before production

### Revoke the exposed Cloudflare R2 credential

An older reachable Git commit contained R2/S3-compatible credentials that look
real. Treat that credential as compromised even though the current tracked
templates contain placeholders only.

Before production use, a Cloudflare administrator must manually:

1. create a new bucket-scoped R2 API token with only the object read/write/delete
   permissions required by SET Service;
2. place the new access-key ID and secret in `/opt/set-service/.env`;
3. perform an upload, authorized signed download, and delete canary test;
4. revoke the old exposed R2 token in Cloudflare;
5. verify the application still uploads and deletes after revocation.

Rotating the credential is mandatory. Rewriting Git history alone cannot make a
copied credential safe. A coordinated history rewrite may be performed later
using [docs/P0_SECRET_ROTATION_RUNBOOK.md](docs/P0_SECRET_ROTATION_RUNBOOK.md),
but this deployment task intentionally does not force-push or rewrite history.

### Production secrets

Generate every cryptographic value independently in an approved password/secret
manager. Do not paste generated values into Git, tickets, chat, Docker build
arguments, or image layers. At minimum these must be distinct:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `QR_HMAC_SECRET`
- `KIOSK_TOKEN_ENCRYPTION_SECRET`
- `OTP_PEPPER`
- `PROVIDER_OUTBOX_ENCRYPTION_SECRET`
- `MALWARE_SCANNER_API_KEY`

The app rejects missing, weak, repeated, or placeholder production secrets.
Keep `.env` owned by `deploy`, mode `600`, and back it up only to the approved
secret-management system.

## 3. External values to obtain

### Neon

- `DATABASE_URL`: pooled connection URL for normal API and worker traffic.
- `DIRECT_URL`: direct/non-pooler URL for migrations and preflight checks.

Both URLs normally require TLS. Enable Neon backups/PITR according to the
selected plan and record a restore point before applying migrations.

### Cloudflare R2

Obtain these from Cloudflare after revoking/replacing the exposed token:

- bucket name (`S3_BUCKET`);
- account-specific S3 API endpoint (`S3_ENDPOINT`);
- new bucket-scoped access-key ID (`S3_ACCESS_KEY_ID`);
- new secret access key (`S3_SECRET_ACCESS_KEY`);
- an intentionally public profile-asset origin (`STORAGE_PUBLIC_BASE_URL`) if
  profile photos are public.

Sensitive worker/company documents stay in private object keys and are returned
through short-lived authorized URLs. Do not make the private document bucket
public. If public profile photos are required, isolate their public prefix or
bucket and review the exact R2 policy.

### Other providers

- PG365 production public/private credentials and sender/originator.
- A Resend API key plus verified sender address (`EMAIL_PROVIDER=resend`,
  `RESEND_API_KEY`, and `EMAIL_FROM`), or the existing generic HTTP email
  provider variables. Console email delivery remains forbidden in production.
- The repository-provided malware adapter and official ClamAV service. Production
  validation accepts only `http://malware-scanner:8080/scan`, requires a real
  adapter bearer credential, and blocks deployment when scanning is optional.
- Optional Sentry DSN.
- Optional Firebase project ID, service-account email, and private key only when
  `PUSH_NOTIFICATIONS_ENABLED=true`.

## 4. DNS and TLS

Create an `A` record for `api.setservice.az` pointing to the VPS public IPv4.
Create an `AAAA` record only when working IPv6 is configured end to end. Do not
hardcode the VPS address in repository files.

For the first certificate issuance, using Cloudflare DNS-only mode is the
simplest configuration. Ports 80 and 443 must reach the VPS. Caddy then obtains
and renews the certificate automatically and redirects HTTP to HTTPS.

If Cloudflare proxying is enabled later, separately review trusted Cloudflare IP
ranges and real-client-IP handling. Do not trust `CF-Connecting-IP` from arbitrary
direct clients. The current deployment safely trusts only the fixed Docker proxy
subnet between Caddy and Express.

Verify DNS before expecting public HTTPS:

```bash
getent ahostsv4 api.setservice.az
```

The deploy helper can finish the internal API deployment when DNS is not ready;
it prints a warning and Caddy keeps retrying certificate issuance.

## 5. Create the deployment directory

First harden the VPS host. Keep the current SSH session open until a second
key-authenticated session succeeds; do not disable password login remotely
until recovery access is confirmed.

```bash
sudo apt-get update
sudo apt-get install -y ufw fail2ban unattended-upgrades

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'Caddy HTTP and ACME'
sudo ufw allow 443/tcp comment 'Caddy HTTPS'
sudo ufw allow 443/udp comment 'Caddy HTTP/3'
sudo ufw --force enable
sudo ufw status verbose

sudo install -m 0644 /dev/stdin /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
banaction = ufw
maxretry = 5
findtime = 10m
bantime = 1h
EOF
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
sudo ss -lntup
```

Mirror the same 22/TCP, 80/TCP, 443/TCP, and 443/UDP policy in the VPS
provider firewall/security group. Docker-published ports can interact directly
with the host firewall, so re-run `sudo ss -lntup` after every Compose change.
This Compose file publishes only Caddy's 80/443 ports; API, worker, migration,
Redis, malware-scanner, and ClamAV remain Docker-internal. Confirm that neither
3310 nor 8080 appears in `sudo ss -lntup`.

The dedicated `SCANNER_UPDATES_SUBNET` exists only for FreshClam. In the VPS
outbound firewall/`DOCKER-USER` policy, allow established traffic plus DNS and
HTTP(S) required to reach the official ClamAV signature mirrors from that
subnet, then deny its other outbound ports. Mirror addresses are CDN-backed and
can change, so validate this rule against the current Cisco/Talos mirror
documentation rather than hard-coding stale IP addresses. This host firewall
rule is a mandatory production step because Compose networks do not express
destination/port egress ACLs.

Run the privileged directory setup once:

```bash
sudo install -d -o deploy -g deploy -m 0750 /opt/set-service
```

Then work as the non-root `deploy` user:

```bash
cd /opt/set-service
git clone https://github.com/mammadlee/Set_Service_Final.git .
git fetch --tags --prune origin
git checkout --detach <approved-release-commit-sha>
```

Do not deploy an unreviewed moving branch tip. Record the full approved commit
SHA in the change record.

## 6. Configure the production environment

```bash
cd /opt/set-service
cp .env.production.example .env
chmod 600 .env
nano .env
```

Replace every angle-bracket placeholder. Keep these enforced values unchanged:

```dotenv
NODE_ENV=production
PORT=3000
REDIS_URL=redis://redis:6379
OUTBOX_WORKER_ENABLED=false
OTP_TEST_MODE=false
OTP_TEST_CODE=
OTP_LOG_CODES=false
SWAGGER_DOCS_ENABLED=false
ALLOW_PRODUCTION_SEED=false
```

Set `CORS_ORIGINS` to explicit HTTPS origins only. Do not use `*`, `null`, paths,
or trailing slashes. The worker mobile app does not send a browser Origin header,
so it does not need to be added to the browser allowlist.

`PROXY_SUBNET` and `TRUST_PROXY_CIDRS` must describe the same fixed proxy
network. If the default subnet conflicts with another VPS Docker network, change
both values together before first startup. The backend, egress, scanner, and
scanner-updates subnets must also not overlap existing VPS/VPN networks.

Generate the adapter credential directly into the production secret manager, or
use `openssl rand -base64 48` in a private operator shell and place the result in
the mode-600 `.env` file. Never reuse another application secret. Required values:

```dotenv
MALWARE_SCANNER_PROVIDER="http"
MALWARE_SCAN_REQUIRED="true"
MALWARE_SCANNER_URL="http://malware-scanner:8080/scan"
MALWARE_SCANNER_API_KEY="<injected-random-value>"
MALWARE_SCANNER_TIMEOUT_MS="10000"
MALWARE_SCANNER_MAX_ATTEMPTS="2"
```

`CLAMAV_IMAGE` is a non-secret official image reference pinned to an immutable
digest. Review the [Cisco/Talos ClamAV Docker repository](https://github.com/Cisco-Talos/clamav-docker)
and the [official image listing](https://hub.docker.com/r/clamav/clamav), then
verify the digest before changing it.

The pinned image references in the template are non-secret release inputs. When
upgrading them, review the upstream release, resolve its multi-platform digest,
update CI policy, and run all container/security tests.

## 7. First deployment

Docker Engine and Docker Compose are already installed; Node.js/npm do not need
to be installed on the VPS.

```bash
cd /opt/set-service
chmod +x scripts/deploy-production.sh
bash scripts/deploy-production.sh
```

The helper deliberately does not fetch code. It deploys the checked-out commit
and performs this sequence:

1. verify Docker, Compose, `.env`, and mode `600`;
2. validate the Compose model without printing it;
3. pull pinned Caddy, Redis, and official ClamAV images;
4. build the API, malware-scanner, outbox, and migration images;
5. run application production-environment validation;
6. run `prisma validate`;
7. run the read-only attendance duplicate guard;
8. run `prisma migrate deploy`;
9. update services without deleting containers or volumes;
10. wait for `/ready`, display service status, and test public HTTPS when DNS
    resolves.

It never runs `prisma migrate dev`, `prisma migrate reset`, `prisma db push`, or
production seed. It never runs `docker compose down -v`.

### Manual equivalent checks

Use these when reviewing a change window. Do not print a resolved Compose model
because production values may be visible in output.

```bash
cd /opt/set-service
export APP_ENV_FILE=.env
export RELEASE_SHA="$(git rev-parse HEAD)"
export RELEASE_TAG="${RELEASE_SHA:0:12}"

docker compose -f docker-compose.prod.yml --env-file .env config -q
docker compose -f docker-compose.prod.yml --env-file .env pull redis caddy clamav
docker compose -f docker-compose.prod.yml --env-file .env build --pull api malware-scanner outbox-worker migrate
docker compose -f docker-compose.prod.yml --env-file .env --profile tools run --rm --no-deps migrate npx prisma validate
docker compose -f docker-compose.prod.yml --env-file .env --profile tools run --rm --no-deps migrate npm run db:migrate:deploy
docker compose -f docker-compose.prod.yml --env-file .env up -d --remove-orphans redis clamav malware-scanner outbox-worker api caddy
```

The deployment helper additionally runs the required attendance preflight before
the migration command. Prefer the helper for the real release.

## 8. Verification and operations

### Service status and internal readiness

```bash
cd /opt/set-service
docker compose -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.prod.yml --env-file .env exec -T api \
  node -e 'fetch("http://127.0.0.1:3000/health").then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})'
docker compose -f docker-compose.prod.yml --env-file .env exec -T api \
  node -e 'fetch("http://127.0.0.1:3000/ready").then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})'
docker compose -f docker-compose.prod.yml --env-file .env exec -T clamav clamdcheck.sh
docker compose -f docker-compose.prod.yml --env-file .env exec -T malware-scanner \
  node -e 'fetch("http://127.0.0.1:8080/health").then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})'
```

The first ClamAV start can take several minutes while FreshClam initializes the
signature database. `malware-scanner` does not become healthy until `clamd`
answers `PING`, and the API has a healthy dependency on the adapter.

### Malware scanner canaries

Run a clean in-memory canary from the API container; it should print
`200 {"status":"clean","scanner":"clamav"}`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec -T api node -e '
const crypto=require("node:crypto");
const body=Buffer.from("SET Service scanner deployment canary");
fetch(process.env.MALWARE_SCANNER_URL,{method:"POST",headers:{
  "Content-Type":"text/plain",
  "X-Content-SHA256":crypto.createHash("sha256").update(body).digest("hex"),
  "Authorization":"Bearer "+process.env.MALWARE_SCANNER_API_KEY
},body}).then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)});
'
```

During an approved security test window, use the harmless industry-standard
EICAR anti-malware test file directly in memory. It is intentionally detected by
security products, so notify the VPS/network monitoring owner first. The expected
adapter result is `200 {"status":"infected","scanner":"clamav"}`; the file is
never uploaded to R2:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec -T api node -e '
const crypto=require("node:crypto");
fetch("https://secure.eicar.org/eicar.com.txt").then(r=>{if(!r.ok)throw Error("EICAR download failed");return r.arrayBuffer()}).then(raw=>{
  const body=Buffer.from(raw);
  return fetch(process.env.MALWARE_SCANNER_URL,{method:"POST",headers:{
    "Content-Type":"application/octet-stream",
    "X-Content-SHA256":crypto.createHash("sha256").update(body).digest("hex"),
    "Authorization":"Bearer "+process.env.MALWARE_SCANNER_API_KEY
  },body});
}).then(async r=>{const text=await r.text();console.log(r.status,text);process.exit(r.status===200&&text.includes("infected")?0:1)}).catch(()=>process.exit(1));
'
```

The adapter returns non-2xx for authentication, integrity, size, timeout,
protocol, and availability failures. The API therefore fails closed when the
scanner cannot prove a file is clean.

### Public checks

```bash
curl -fsS https://api.setservice.az/health
curl -fsS https://api.setservice.az/ready
curl -I https://api.setservice.az/health
```

Confirm HTTPS, HSTS, content-type, frame, referrer, and permissions headers.
`/docs` must not be mounted in production.

### Logs

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=200 api
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=200 malware-scanner clamav
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=200 outbox-worker
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=200 caddy
docker compose -f docker-compose.prod.yml --env-file .env logs -f --since=10m api outbox-worker
```

Docker log rotation is set to five 10 MB files per service. The malware adapter
logs no request bodies, file data, SHA values, Authorization headers, or API
keys; do not add HTTP request/debug logging around it. API logs redact
tokens, OTP/password text, private-key blocks, credentialed URLs, email, and
phone values. Caddy access logging is deliberately disabled because legacy
kiosk/document routes can contain short-lived capabilities in the URL; Caddy
operational errors are still available through container logs. Do not enable
request-body or raw URL access logging.

### Restart

```bash
docker compose -f docker-compose.prod.yml --env-file .env restart clamav malware-scanner api outbox-worker
docker compose -f docker-compose.prod.yml --env-file .env restart caddy
```

Redis is persistent but temporary security state. Restarting it should be an
intentional operation because active OTP/cooldown state may be affected.

## 9. Updating the deployment

Select a reviewed commit explicitly:

```bash
cd /opt/set-service
git status --short
git fetch --tags --prune origin
git checkout --detach <new-approved-release-commit-sha>
bash scripts/deploy-production.sh
```

Do not deploy with local uncommitted changes. Keep the previous commit SHA and
image tags in the change record until the release is verified.

## 10. Rollback

Application rollback is realistic only when the previous application remains
compatible with every migration already applied.

```bash
cd /opt/set-service
git checkout --detach <previous-known-good-commit-sha>
bash scripts/deploy-production.sh
```

Important constraints:

- Prisma migrations are not automatically reversible.
- Do not run `migrate reset`, `db push`, manual `DROP`, or volume deletion as a
  rollback shortcut.
- For additive/backward-compatible migrations, application-image rollback is
  usually the first response.
- For an incompatible migration, stop and execute the reviewed database recovery
  plan using the Neon backup/PITR bookmark and the database owner.
- Never roll back to exposed R2, JWT, SMS, or other revoked credentials. Issue a
  new credential if the replacement fails.

See [docs/DATABASE_RELEASE_RUNBOOK.md](docs/DATABASE_RELEASE_RUNBOOK.md) for the
database change-control procedure.

## 11. Backup and recovery

The VPS should be disposable. A replacement VPS must be recoverable by cloning
an approved commit, restoring `.env` from the secret manager, restoring DNS, and
running the deployment helper.

- Neon: enable plan-appropriate backups/PITR, record a pre-migration restore
  point, and perform periodic restore drills to an isolated branch/project.
- R2: decide whether bucket versioning/lifecycle/replication is required by the
  legal retention policy. Test object recovery and do not rely on the VPS.
- Caddy: `caddy_data` contains certificate/account state and `caddy_config`
  contains runtime state. Backing them up reduces reissuance risk, although
  Caddy can normally obtain certificates again after DNS recovery.
- Redis: `redis_data` uses AOF persistence, but Redis is not the primary system
  of record. Do not treat it as a database backup.
- VPS: retain only OS/repository configuration and encrypted operational backup
  material. Never place an unencrypted `.env` in a generic VPS snapshot or Git.

Named volumes can be listed without deleting them:

```bash
docker volume ls | grep set-service
```

Never use `docker compose down -v` in production.

## 12. Frontends and mobile release

`apps/admin_panel`, `apps/company_dashboard`, and `apps/qr_kiosk` are separate
Vite/static projects. They are intentionally not copied into the backend image.
A later phase can deploy reviewed static builds to:

- `https://admin.setservice.az`
- `https://company.setservice.az`
- `https://kiosk.setservice.az`

Each production build must inject `VITE_API_BASE_URL=https://api.setservice.az`.
Update `CORS_ORIGINS` only when those domains are live.

`apps/worker_app` is Flutter and must not run in Docker on the VPS. Build a mobile
release with the production API supplied at compile time, for example:

```bash
cd apps/worker_app
flutter build appbundle --release \
  --dart-define=BASE_URL=https://api.setservice.az \
  --dart-define=KIOSK_BASE_URL=https://kiosk.setservice.az
```

Mobile signing, store credentials, Firebase files, and release certificates stay
outside this deployment task and outside Git.

## 13. Remaining launch gates

Production must not go live until all of these are complete:

- exposed historical R2 credentials are manually revoked and replacement canary
  tests pass;
- Git history remediation is scheduled after credential rotation, or the
  security owner explicitly accepts the already-revoked historical disclosure;
- Neon pooled/direct URLs and a tested backup/PITR plan exist;
- DNS points to the VPS and Caddy has issued a valid certificate;
- PG365, email, and malware-scanner providers pass staging canaries;
- exact production CORS origins are approved;
- Sentry/Firebase choices and privacy/legal processor records are approved;
- the full MVP flow is verified in staging without enabling fixed OTP behavior
  in production.
