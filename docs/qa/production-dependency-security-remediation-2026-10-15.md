# SET Service — production dependency security remediation

Hesabat tarixi: 2026-10-15
Repository: `C:\Users\ASUS\Desktop\hireapp-release-oct14`
Branch: `release/set-service-oct14`
Baseline / cari HEAD: `319fcb574bcbafe3094cc0f7487fec93a9796afb`
İstifadə olunan runtime: Node.js `24.19.0`, npm `10.9.2`

Bu iş yalnız dependency təhlükəsizlik remediations, lockfile-lar və Multer 2.4 üçün upload limitinin açıq saxlanmasını əhatə edir. Commit, push, deploy, production container restart, production environment dəyişikliyi və production database əməliyyatı edilməyib.

## Nəticə

| Yoxlama | Status | Nəticə |
| --- | --- | --- |
| Root production dependency audit | COMPLETE | `1 critical / 7 high / 4 moderate` səviyyəsindən `0`-a endirildi |
| Root full dependency audit | COMPLETE | `1 critical / 10 high / 4 moderate` səviyyəsindən `0`-a endirildi |
| Admin production/full audit | COMPLETE | Hər ikisi `0` |
| Company dashboard production/full audit | COMPLETE | Hər ikisi `0` |
| QR kiosk production/full audit | COMPLETE | Hər ikisi `0` |
| Backend və web regression/build | COMPLETE | Aşağıdakı faktiki nəticələrin hamısı PASS |
| Flutter regression | COMPLETE | Analyze və 189/189 test PASS |
| Linux Docker image build | BLOCKED | Lokal Docker client var, Docker Desktop Linux daemon işləmirdi |
| Production rollout | NOT IMPLEMENTED | Təhlükəsizlik məhdudiyyətinə uyğun icra edilməyib |

## İlkin audit tapıntıları

Root `npm audit --omit=dev` əvvəl 12 nəticə verirdi:

- `proxy-addr@2.0.7`: critical IP spoofing; Express trust-proxy və `req.ip` əsaslı rate limiting üçün material risk.
- `@fastify/busboy@3.2.0`: multipart boundary/prototype header DoS və CRLF injection tapıntıları.
- `@grpc/grpc-js@1.14.4`: authorization context certificate validation tapıntısı; Firebase Admin → Firestore → Google GAX zənciri ilə gəlirdi.
- `brace-expansion@5.0.9`: CPU və stack exhaustion DoS tapıntıları.
- `multer@2.2.0`: crafted field name, array index, aborted upload və file-limit davranışları üzrə high/moderate/low tapıntılar.
- `sharp@0.35.3`: bundled libheif/librsvg native memory-safety tapıntıları.
- `qs@6.15.3`, `body-parser@1.20.6`, `express@4.22.2` və `js-yaml@5.2.3`: query/merge-key DoS və limit bypass moderate tapıntıları.

Full root audit əlavə olaraq `nodemon@3.1.14 → chokidar@3.6.0 → braces@3.0.3` zəncirində üç high nəticə verirdi. Admin, company dashboard və kiosk production ağacları əvvəl də təmiz idi; hər üçünün build ağacında `postcss → source-map-js@1.2.1` high tapıntısı var idi.

## Tətbiq edilən minimal yeniləmələr

### Birbaşa runtime dependencies

| Paket | Əvvəl | Sonra | Uyğunluq qərarı |
| --- | --- | --- | --- |
| `express` | `4.22.2` | `4.22.3` | Express 4 saxlanıldı; Express 5 major keçidi edilmədi |
| `multer` | `2.2.0` | `2.4.0` | Eyni major; mövcud `memoryStorage`, `.single()`, limits və `MulterError` API-ləri saxlanır |
| `sharp` | `0.35.3` | `0.35.5` | Eyni minor xəttində native təhlükəsizlik patch-i |
| `js-yaml` | lock-da `5.2.3` | `5.4.3` | Eyni major; istifadə olunan `load` API-si dəyişmir |

### Transitive təhlükəsizlik resolutions

| Paket | Əvvəl | Sonra |
| --- | --- | --- |
| `@fastify/busboy` | `3.2.0` | `3.2.3` |
| `@grpc/grpc-js` | `1.14.4` | `1.14.6` |
| `body-parser` | `1.20.6` | `1.20.8` |
| `brace-expansion` | `5.0.9` | `5.0.12` |
| `proxy-addr` | `2.0.7` | `2.0.8` |
| `qs` | `6.15.3` | `6.16.1` |

Yalnız mövcud dependency contract-ının qəbul etdiyi patch/minor versiyalar seçildi. Təhlükəsiz transitive versiyaların lockfile regeneration zamanı geri düşməməsi üçün mövcud `overrides` siyasəti nəzərdən keçirilib və yuxarıdakı review olunmuş versiyalar exact override kimi saxlanılıb.

### Build və development dependencies

- Admin, company dashboard və kiosk lockfile-larında yalnız `source-map-js 1.2.1 → 1.2.2` yeniləndi; Vite, React və TypeScript major versiyaları dəyişmədi.
- Registry-də təhlükəsiz `braces` 3.x olmadığı üçün `nodemon/chokidar/braces` zənciri çıxarıldı. Repository artıq tələb etdiyi Node 24-ün portativ daxili watch rejimindən istifadə edir: `node --watch --require ts-node/register src/index.ts`.
- `npm audit fix --force` işlədilmədi, advisory suppress/ignore əlavə edilmədi və audit gate-ləri söndürülmədi.

### Upload sərtləşdirməsi

Multer 2.4 bəzi multipart limitlərinin default-larını genişləndirdiyi üçün worker və company document router-larında `fieldNameSize: 100` açıq şəkildə təyin edildi. Mövcud 5 MiB file, bir file, iki field, üç part və 1 KiB field-value limitləri saxlanıldı.

## Dəyişdirilən fayllar

- `package.json`
- `package-lock.json`
- `apps/admin_panel/package-lock.json`
- `apps/company_dashboard/package-lock.json`
- `apps/qr_kiosk/package-lock.json`
- `scripts/dependency-policy-regression.mjs`
- `src/modules/workers/workers.router.ts`
- `src/modules/companies/companies.router.ts`
- `docs/qa/oct14-production-integration-2026-10-14.md`
- `docs/qa/production-dependency-security-remediation-2026-10-15.md`

Dependency policy regression-u review olunmuş runtime versiyalarını, hər üç web app üçün `source-map-js@1.2.2`-ni, Node 24 watch keçidini, Sharp optional artifact versiyalarını və hər iki upload router-də finite field-name limitini yoxlayır.

## Audit nəticələri

Təmiz `npm ci --ignore-scripts` install-dan sonra:

| Package tree | `npm audit --omit=dev` | Full `npm audit` | `npm ls --all` |
| --- | --- | --- | --- |
| Root/backend | 0 | 0 | PASS |
| Admin panel | 0 | 0 | PASS |
| Company dashboard | 0 | 0 | PASS |
| QR kiosk | 0 | 0 | PASS |

Audit registry-nin 2026-10-15 tarixində qaytardığı nəticədir. Yeni advisory dərc olunarsa CI audit gate-i yenidən qərar verəcək.

## İcra edilən test və build-lər

| Scope | Faktiki nəticə |
| --- | --- |
| Root/admin/company/kiosk clean `npm ci --ignore-scripts` | PASS |
| Prisma generate və validate | PASS |
| Backend typecheck və TypeScript build | PASS |
| Root aggregate `npm test` | PASS, exit 0 |
| Bütün əlavə `test:*` regression-lar | PASS; auth, access, reports, infrastructure, headers, audit, retention, deletion, moderation və document təhlükəsizliyi daxil |
| Dependency/source-map policy | PASS |
| Isolated PostgreSQL 16 migration deploy/status | PASS; 29 migration, schema up to date |
| Real PostgreSQL order hardening | PASS, 19 scenario group |
| Real PostgreSQL lifecycle concurrency | PASS, 9 parallel scenario group |
| Swagger YAML/drift/security | PASS, 119 operation |
| Admin typecheck/regression/security/release config | PASS; regression 32/32, security 7/7, config 4/4 |
| Admin production build/header verification | PASS; 1,805 module |
| Company typecheck/security/release config/build | PASS; 1,781 module, built-header PASS |
| QR kiosk typecheck/regression/security/release config | PASS; regression 16/16, security 7/7, config 4/4 |
| QR kiosk production build/header verification | PASS; 34 module |
| Flutter analyze | PASS |
| Flutter full regression | PASS, 189/189 |
| Windows Sharp runtime/image encode | PASS; dependency policy və worker image-security regressions daxilində |
| Linux Docker image build | BLOCKED; lokal Docker daemon unavailable |

Web build-lərində sənədləşdirilmiş production URL-ləri (`api.setservice.az`, `qr.setservice.az`) yalnız build-time validation üçün verildi. Heç bir şəbəkə deploy-u və production config mutation-u edilmədi.

## Uyğunluq və təhlükəsizlik qiymətləndirməsi

- Authentication, JWT/OTP, worker phone update və session davranışında source dəyişikliyi edilməyib; müvafiq regressions keçib.
- QR kiosk, replay protection, company isolation və attendance regressions keçib.
- Bulk assignment, history, company reports və real PostgreSQL concurrency regressions keçib.
- R2/AWS SDK paketləri dəyişməyib. Private document authorization, signed URL, malware/PDF və log-redaction testləri keçib.
- Moderation, account deletion və external deletion regressions keçib.
- `proxy-addr@2.0.8` trust-proxy parsing üçün fixed versiyadır; mövcud explicit CIDR/fail-closed infrastructure siyasəti saxlanılıb.
- Multer upload limitləri dependency default-una buraxılmır.
- Sharp 0.35.5 Windows-da real PNG/JPEG/EXIF/sanitize testlərindən keçib.

## Qalan risklər

1. Docker Desktop Linux daemon işləmədiyi üçün production Dockerfile ilə Linux/Sharp native image build-i bu hostda icra edilmədi. Release CI həmin image build, `npm prune --omit=dev` və runtime Sharp smoke testini işlətməlidir.
2. Dependency audit point-in-time registry nəticəsidir; release CI install-dan dərhal sonra production və full audit-i təkrar işlətməlidir.
3. Əvvəlki inteqrasiya hesabatındakı production ölçülü migration timing, fiziki kiosk/manual device QA, iOS build və historical-secret rotation işləri bu dependency remediations scope-undan kənarda qalır.
4. Heç bir production deploy və ya database əməliyyatı edilməyib; staging smoke test və normal release approval prosesi hələ tələb olunur.

## Rollback

Deploy-dan əvvəl rollback repository səviyyəsindədir: bu remediation-dakı manifest/lockfile, upload-limit və policy dəyişikliklərini review olunmuş əvvəlki revision-a qaytarıb clean `npm ci`, audit və bütün suite-ləri yenidən işlətmək lazımdır. Production database schema dəyişmədiyi üçün dependency rollback üçün database rollback tələb olunmur.
