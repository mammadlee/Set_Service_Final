# SET Service — 14 oktyabr production-bazalı inteqrasiya hesabatı

Hesabat tarixi: 2026-10-15
Feature batch: 2026-10-14
Target repository: `C:\Users\ASUS\Desktop\hireapp-release-oct14`
Target branch: `release/set-service-oct14`
Production baseline / cari HEAD: `319fcb574bcbafe3094cc0f7487fec93a9796afb`
Source repository: `C:\Users\ASUS\Desktop\hireapp`
Source HEAD: `3a35dfdf6c7545e27e582850f210a2d73749ad35`

Bu inteqrasiya source repository-nin yalnız uncommitted 14 oktyabr feature dəyişikliklərini production baseline üzərinə gətirir. Source və target tarixçələrinin ortaq bazası `040361f03cceb0feba96212fe01b23258eb00cd1` olduğu üçün bütöv fayllar kopyalanmayıb; source working-tree diff-i üçtərəfli və manual code-level merge ilə tətbiq edilib. Commit, push, deploy, container restart, DNS/environment dəyişikliyi, mobil publish və production database əməliyyatı edilməyib.

Ortaq bazadan sonra production-da dəyişmiş 183 path ayrıca audit edilib: 153-ü bu inteqrasiyada toxunulmadan qalıb, feature-lərlə kəsişən 30 path manual merge və regression yoxlamasından keçib. Tracked production faylı silinməyib, merge marker və unmerged path yoxdur.

`output/`, `tmp/`, real `.env`, dependency/build qovluqları və secret-lər target-a köçürülməyib. Source kiosk hotline dəyəri `+994 70 231 51 51` qorunub.

## Feature tamamlanma cədvəli

| Funksiya | Status | Sübut / məhdudiyyət |
| --- | --- | --- |
| Company-specific reporting | COMPLETE | Real DB query-ləri, company/date/status/worker/position filtrləri, pagination, order drill-down, CSV və print/PDF axını; report regression-ları PASS. |
| Persistent company QR kiosk | COMPLETE | Company-bound context, avtomatik shift seçimi, multi-shift selector, checkout grace, 30 saniyəlik rotating QR, reload/offline recovery; backend 108-case QR/attendance və kiosk 16/16 PASS. |
| Admin attendance-də oxunaqlı adlar | COMPLETE | Worker/company/order/position əlaqələri və real timestamp/duration cavabları; monitor assignment-backed-dir. |
| Bulk worker assignment | COMPLETE | Multi-select, filter, confirmation, per-worker nəticə, capacity/availability/overlap/duplicate yoxlaması, row lock və mismatch warning; regressions PASS. |
| Worker telefon yeniləməsi | COMPLETE | Cari parol ilə step-up, non-enumerating request, strict rate limit, OTP-confirmed atomic update, uniqueness, session preservation və Flutter-də dərhal state update; backend və Flutter regressions PASS. |
| Assignment history | COMPLETE | Active/history scope, filters, pagination/sort, admin-only actor, profile image, schedule və real attendance vaxtları saxlanılır. |
| Attendance monitoring | COMPLETE | 15 saniyəlik controlled polling, reconnect/stale state, server timestamps, beş status və indexed latest-activity sorting tətbiq edilib; saxta checkout yaradılmır. |
| Admin worker documents | COMPLETE | Mövcud authenticated short-lived private URL və backend authorization/audit mexanizmi qorunub; permanent R2 URL əlavə edilməyib. |
| Full-size profile image | COMPLETE | Modal, zoom, Escape/close, loading/error/placeholder və responsive davranış test olunub. |
| Responsive/design uyğunluğu | PARTIAL | Automated admin/kiosk build və DOM regressions PASS; real desktop/tablet/mobile vizual QA aparılmayıb. |
| Prisma schema və migration | PARTIAL | Additive schema/backfill/index migration-ı isolated PostgreSQL 16-da bütün 29 migration ilə apply və status yoxlamasından keçib; production ölçülü staging clone-da lock/timing testi edilməyib. |
| OpenAPI/Swagger | COMPLETE | YAML, runtime drift və security contract 119 operation üzrə PASS. |
| Local automated validation | PARTIAL | Backend/admin/company/kiosk Node 24, Flutter suite/build və real PostgreSQL concurrency testləri PASS; bütün npm production/full audit-ləri 0-dır. iOS compile, production-size migration timing, Linux Docker build və manual device QA qalır. |
| Production rollout | NOT IMPLEMENTED | Təhlükəsizlik məhdudiyyətinə uyğun olaraq icra edilməyib. |

## İnteqrasiya edilmiş davranış

### Reporting

Admin company detail-dən ayrıca report səhifəsinə keçir. API company profilini, order status saylarını, tələb/təyinat saylarını, completed assignment-ləri, attendance qeydlərini və real işlənmiş dəqiqələri qaytarır. Sətirlər paginated-dir və fərdi order/assignment/attendance detail-i açılır. Date-only filtrlər `APP_TIME_ZONE=Asia/Baku` üzrə tam yerli günü əhatə edir.

CSV export eyni company və filter scope-u istifadə edir, UTF-8/Excel uyğunluğunu saxlayır, formula injection-u neytrallaşdırır və 10,000 order limiti üçün truncation header-i qaytarır. PDF ayrıca server faylı yaratmır; admin UI bütün filtrli səhifələri yükləyib brauzerin print/PDF axınından istifadə edir.

### QR kiosk və attendance

Persistent kiosk company-yə bağlıdır. Bir uyğun shift varsa avtomatik seçilir; bir neçə shift varsa capability-protected `select-order` əməliyyatı ilə seçim edilir. Açıq checkout olan yeni bitmiş shift yalnız konfiqurasiya olunan grace müddətində əlçatan qalır.

Capability yalnız URL fragmentində qalır və API-yə `X-Kiosk-Capability` header-i ilə gedir. Browser storage-a yazılmır. Attendance QR token-ləri qısaömürlü, nonce-li və replay-use qeydi ilə qorunur; backend kiosk/company/order/assignment/worker eligibility-ni yenidən yoxlayır. Production `buildKioskPublicUrl` / `resolveKioskPublicBaseUrl` allowlist-i qorunub və yanlış production origin hər hansı kiosk mutasiyasından əvvəl fail-closed olur.

Attendance monitor assignment-dən başlayır, buna görə check-in etməyən worker də görünür. `not_checked_in`, `currently_working`, `checked_out`, `completed` və `missing_incomplete` statusları ayrılır. Check-in/out vaxtı server vaxtıdır; `updated_since` indexed assignment activity sütunlarından istifadə edir.

### Assignment idarəetməsi

Admin ad, position/profession, availability və approval üzrə worker seçir, nəticəni təsdiqləyir və hər worker üçün success/failure/warning alır. Duplicate request, mövcud assignment, inactive/deleted worker account, capacity və üst-üstə düşən schedule rədd edilir. Order və worker row lock-ları paralel request-ləri seriallaşdırır.

Profil profession-u order position-u ilə fərqli olduqda səlahiyyətli admin üçün blok yaranmır; `WORKER_POSITION_MISMATCH` warning qaytarılır və worker profili dəyişdirilmir. Production-dakı `manage_assignments` və admin/super-admin authorization qatları qorunub.

### Telefon nömrəsi

Request endpoint cari parolu yoxlamadan target nömrənin mövcudluğuna baxmır və OTP yaratmır; buna görə tək oğurlanmış bearer session login identifikatorunu dəyişə bilmir. Başqa hesaba aid nömrə, OTP cooldown/block/rate vəziyyəti ilə eyni generic accepted cavabı qaytarır və qeydiyyat məlumatını açıqlamır. Hər iki phone-change endpoint 5 dəqiqədə IP və target üzrə 10 sorğulu strict auth limiter-dən keçir.

Uğurlu sorğuda OTP yeni canonical E.164 nömrəyə gedir. Confirm transaction-u user sətrini kilidləyir, uniqueness-i yenidən yoxlayır, OTP-ni atomik consume edir, telefonu yeniləyir və audit yazır. İtmiş success response üçün idempotent retry yalnız eyni, yaxın vaxtda consume olunmuş OTP ilə qəbul edilir. Session version dəyişmədiyi üçün cari parol ilə doğrulanmış axında mövcud sessiyalar qorunur. Flutter gizli cari-parol sahəsini validate edir, `current_password` göndərir və canonical backend cavabını AuthController/profil state-inə dərhal tətbiq edir.

### Private documents və profil şəkli

Admin health/criminal sənədləri mövcud metadata ilə görür. Secure view əvvəl backend-dən qısaömürlü URL alır, URL təhlükəsizlik siyasətini yoxlayır və signed URL-ni storage-a yazmadan açır. Production private-download helper-i, Safari-safe tab reservation, `noopener` / `no-referrer`, malware statusları, role/permission və R2 ownership yoxlamaları saxlanıb.

Profile image modalı zoom və keyboard idarəsini dəstəkləyir. Siyahıda full-resolution image preload əlavə edilməyib.

## Həll edilən əsas merge konfliktləri

- `AssignmentsPage.tsx`: bulk/history UI production-dakı bütün worker səhifələrini yükləmə, 100-selection limiti, class/position filtrləri və cross-position advisory davranışı ilə birləşdirildi.
- `WorkerDetailPage.tsx` və `documents.ts`: yeni metadata/modal/polling production signed-URL validation və private-document workflow-u ilə birləşdirildi.
- `assignments.repository.ts`: sorted worker locks, overlap/capacity logic və warning-lər production inactive/deleted user guard-ı ilə birləşdirildi.
- Assignment və whole-order status keçidləri `attendance_activity_at` projection-ını eyni transaction-da yeniləyir; monitor `updated_at` sıralamasında status dəyişikliyi köhnə mövqedə qalmır.
- `attendance.service.ts`: auto-selection/grace/monitor logic production canonical kiosk-origin fail-closed yoxlaması ilə birləşdirildi.
- `auth.service.ts` və Flutter phone UI: source-un atomic phone update/state refresh-i production password auth-u ilə birləşdirildi; cari parol step-up, non-enumerating OTP request və session-preserving confirm əlavə edildi.
- `assignments.service.ts`: admin history üçün assignment creator saxlanıldı, company/worker caller-lardan daxili admin identifikatoru gizlədildi və lazımsız creator query-si dayandırıldı.
- `prisma/schema.prisma`: production moderation və external deletion modelləri/migration-ları saxlanıb, yalnız üç assignment activity sütunu və index əlavə edildi.
- Flutter worker profil/model/repository konfliktlərində moderation, ratings, legal/account deletion, responsive və private-document qoruması saxlanıb; phone canonical result/state update əlavə edildi.
- Kiosk regression faylında production expiry/countdown testləri source persistence/multi-shift/offline testləri ilə birləşdirildi.
- `swagger.yaml`: bütün 14 oktyabr contract-ları ilə yanaşı production company account-deletion schemas/route və worker approve-with-class contract-ı saxlanıldı.
- CI production env validation-a required canonical kiosk URL və app timezone əlavə edildi.
- QR token default və explicit TTL-i 300 saniyə ilə məhdudlaşdırıldı; production startup artıq `QR_TOKEN_TTL_SECONDS=1..300` aralığından kənar dəyəri qəbul etmir.
- Windows checkout-da production deployment regression-un CRLF-dən asılılığı newline normalization ilə aradan qaldırıldı; runtime/deployment faylı dəyişdirilmədi.

## Database migration

Yeni migration:

- `prisma/migrations/20261014120000_assignment_attendance_activity/migration.sql`

`assignments` cədvəlinə:

- `attendance_activity_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `last_checkin_at TIMESTAMP(3) NULL`
- `last_checkout_at TIMESTAMP(3) NULL`
- hər sütun üçün ayrıca index

Migration silmə və enum/FK dəyişikliyi etmir. Mövcud, silinməmiş `attendance_logs` qeydlərindən son check-in, checkout və activity-ni aggregate edib backfill edir; attendance/assignment tarixçəsini silmir. PostgreSQL 16 isolated test bazasında sıfırdan bütün 29 migration ardıcıllığı ilə uğurla tətbiq olunub, `prisma migrate status` schema-nın up-to-date olduğunu təsdiqləyib və real DB lifecycle/order concurrency suite-ləri həmin schema üzərində keçib. Production-da apply edilməyib. `CREATE INDEX` əməliyyatlarının production ölçülü cədvəldə lock və vaxt təsiri staging clone-da ölçülməlidir.

## Yeni və dəyişdirilmiş API endpoint-ləri

| Method və path | Dəyişiklik | Authorization |
| --- | --- | --- |
| `GET /v1/admin/reports/companies/{companyId}` | Yeni detailed company report | JWT + `view_reports` |
| `GET /v1/admin/reports/companies/{companyId}/export` | Yeni CSV export | JWT + `view_reports` |
| `POST /v1/assignments/bulk` | Yeni partial-result bulk assignment | JWT + `manage_assignments` |
| `GET /v1/assignments` | History scope, filters və enriched relations | Mövcud role/permission |
| `POST /v1/auth/worker/phone-change/request` | `phone` + `current_password`, generic anti-enumeration cavabı və yeni nömrəyə OTP | Worker JWT + strict auth limiter |
| `POST /v1/auth/worker/phone-change/confirm` | Atomic OTP consume və persisted phone response | Worker JWT |
| `GET /v1/attendance/venue-kiosks/companies` | Kiosk üçün approved active company list | JWT + `manage_kiosks` |
| `GET /v1/attendance/venue-kiosks/context` | Company/eligible shift safe context | `X-Kiosk-Capability` |
| `POST /v1/attendance/venue-kiosks/qr-token` | 30 saniyəlik QR grant | `X-Kiosk-Capability` |
| `POST /v1/attendance/venue-kiosks/select-order` | Concurrent shift seçimi | `X-Kiosk-Capability` |
| `GET /v1/attendance/monitor` | Assignment-backed live monitor | JWT + `view_attendance` |
| `GET /v1/attendance` | Readable relations/status/filter genişlənməsi | Mövcud role/permission |
| `POST /v1/attendance/check-in` | Replay/company/order/assignment validation və activity update | Approved worker JWT |
| `POST /v1/attendance/check-out` | Server time, duration, replay/duplicate validation | Approved worker JWT |

Legacy assignment endpoint-ləri və local-only kiosk bridge-ləri uyğunluq üçün saxlanıb; token-in-path bridge production-da qeydiyyata alınmır.

Assignment `assigned_by` sahəsi yalnız admin/super-admin cavablarında mövcuddur. Company və worker caller-ları daxili admin identifikatorunu almır.

## Dəyişən fayllar

### Root, CI və sənədlər

- `.env.example`
- `.env.production.example`
- `.github/workflows/ci.yml`
- `API_HANDOFF.md`
- `ENV_SETUP.md`
- `PRODUCTION_DEPLOYMENT.md`
- `package-lock.json`
- `package.json`
- `swagger.yaml`
- `docs/qa/oct14-production-integration-2026-10-14.md`
- `docs/qa/production-dependency-security-remediation-2026-10-15.md`

### Backend, Prisma və regression-lar

- `prisma/schema.prisma`
- `prisma/migrations/20261014120000_assignment_attendance_activity/migration.sql`
- `src/app.ts`
- `src/lib/check-env.ts`
- `src/lib/date-filters.ts`
- `src/lib/qr.ts`
- `src/lib/retention.ts`
- `src/modules/assignments/assignments.repository.ts`
- `src/modules/assignments/assignments.router.ts`
- `src/modules/assignments/assignments.rules.ts`
- `src/modules/assignments/assignments.schema.ts`
- `src/modules/assignments/assignments.service.ts`
- `src/modules/attendance/attendance.kiosk-eligibility.ts`
- `src/modules/attendance/attendance.repository.ts`
- `src/modules/attendance/attendance.router.ts`
- `src/modules/attendance/attendance.schema.ts`
- `src/modules/attendance/attendance.service.ts`
- `src/modules/auth/auth.router.ts`
- `src/modules/auth/auth.schema.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/companies/companies.router.ts`
- `src/modules/orders/orders.repository.ts`
- `src/modules/reports/company-report.schema.ts`
- `src/modules/reports/company-report.service.ts`
- `src/modules/reports/reports.router.ts`
- `src/modules/reports/reports.schema.ts`
- `src/modules/workers/workers.router.ts`
- `scripts/admin-assignment-position-regression.ts`
- `scripts/assignment-management-regression.ts`
- `scripts/company-detailed-report-regression.ts`
- `scripts/company-qr-attendance-regression.ts`
- `scripts/dependency-policy-regression.mjs`
- `scripts/kiosk-eligibility-regression.ts`
- `scripts/lifecycle-concurrency-regression.ts`
- `scripts/production-deployment-regression.mjs`
- `scripts/production-env-validation-regression.ts`
- `scripts/retention-regression.ts`
- `scripts/swagger-security-regression.mjs`
- `scripts/worker-phone-change-regression.ts`

### Admin panel

- `apps/admin_panel/.env.example`
- `apps/admin_panel/package-lock.json`
- `apps/admin_panel/src/app/App.tsx`
- `apps/admin_panel/src/features/assignments/AssignmentDetailPage.tsx`
- `apps/admin_panel/src/features/assignments/AssignmentsPage.tsx`
- `apps/admin_panel/src/features/assignments/assignments.service.ts`
- `apps/admin_panel/src/features/attendance/AttendanceDetailPage.tsx`
- `apps/admin_panel/src/features/attendance/AttendancePage.tsx`
- `apps/admin_panel/src/features/attendance/QrDisplayPage.tsx`
- `apps/admin_panel/src/features/attendance/attendance.display.ts`
- `apps/admin_panel/src/features/attendance/attendance.service.ts`
- `apps/admin_panel/src/features/companies/CompanyDetailPage.tsx`
- `apps/admin_panel/src/features/companies/CompanyReportPage.tsx`
- `apps/admin_panel/src/features/companies/companies.service.ts`
- `apps/admin_panel/src/features/workers/WorkerDetailPage.tsx`
- `apps/admin_panel/src/features/workers/workers.service.ts`
- `apps/admin_panel/src/shared/api/config.ts`
- `apps/admin_panel/src/shared/api/http.ts`
- `apps/admin_panel/src/shared/api/types.ts`
- `apps/admin_panel/src/shared/components/ImagePreviewModal.tsx`
- `apps/admin_panel/src/shared/hooks/usePolling.ts`
- `apps/admin_panel/src/shared/i18n/appStrings.ts`
- `apps/admin_panel/src/shared/utils/documents.ts`
- `apps/admin_panel/src/shared/utils/format.ts`
- `apps/admin_panel/src/styles.css`
- `apps/admin_panel/tests/assignment-position.test.mjs`
- `apps/admin_panel/tests/management-ui.test.mjs`
- `apps/admin_panel/tests/order-staffing.test.mjs`

### QR kiosk və Flutter

- `apps/company_dashboard/package-lock.json`
- `apps/qr_kiosk/.env.example`
- `apps/qr_kiosk/package-lock.json`
- `apps/qr_kiosk/index.html`
- `apps/qr_kiosk/src/config.ts`
- `apps/qr_kiosk/src/main.ts`
- `apps/qr_kiosk/src/styles.css`
- `apps/qr_kiosk/tests/kiosk-state.test.mjs`
- `apps/worker_app/ios/Runner/Info.plist`
- `apps/worker_app/lib/features/auth/data/models/auth_models.dart`
- `apps/worker_app/lib/features/auth/presentation/controllers/auth_controller.dart`
- `apps/worker_app/lib/features/worker/data/worker_repository.dart`
- `apps/worker_app/lib/features/worker/presentation/screens/worker_profile_screen.dart`
- `apps/worker_app/lib/features/worker/presentation/screens/worker_profile_screen_state.dart`
- `apps/worker_app/test/worker_phone_change_test.dart`

## Təhlükəsizlik nəticələri

- Production moderation, worker/company deletion, approval classification, ratings/reporting və private-document mexanizmləri saxlanıb.
- Heç bir production migration və tracked fayl silinməyib.
- R2 bucket/public policy dəyişməyib; permanent object URL və credential cavaba əlavə edilməyib.
- Kiosk capability URL query/path əvəzinə fragment + header modelindədir və production origin allowlist-i fail-closed qalır.
- QR replay, cross-company, assignment və worker eligibility yoxlamaları regression-larla yoxlanıb; config və runtime QR TTL maksimum 300 saniyədir.
- Phone change cari parol step-up tələb edir; yalnız access token oğurlanması ilə login nömrəsi dəyişdirilə bilmir.
- Phone request duplicate target və OTP cooldown/block/rate state-i üçün generic cavab verir; strict IP/target auth limiter enumeration və abuse səthini azaldır.
- Phone confirm OTP-ni eyni transaction-da consume edir, uniqueness-i lock altında yenidən yoxlayır; duplicate phone rədd edilir və cari parolla doğrulanmış sessiyalar qorunur.
- Assignment creator yalnız admin/super-admin cavabına daxil edilir; company/worker üçün query və response-dan çıxarılır.
- Report export formula injection və cache risklərinə qarşı qorunur.
- Cari working-tree secret scan PASS; 635 fayl yoxlanıb.
- Tam Git history secret scan FAIL: köhnə reachable commit-lərdə əvvəldən mövcud credential/R2 materialı tapılır. Cari inteqrasiya yeni secret əlavə etməyib; həmin köhnə credential-lar provider tərəfində revoked/rotated kimi təsdiqlənməlidir.
- Dependency security remediation tamamlanıb: Express 4 saxlanılmaqla `proxy-addr`, Multer, Sharp, gRPC, busboy, brace-expansion, qs/body-parser və js-yaml fixed patch/minor versiyalarına yenilənib. Multer 2.4 üçün worker/company upload field-name limiti açıq `100` bayt saxlanılıb.
- Root, admin, company dashboard və kiosk üçün həm production, həm də full dependency audit-ləri 0 advisory-dir. `nodemon/chokidar/braces` zənciri Node 24 daxili watch rejimi ilə, web build-lərindəki `source-map-js` isə 1.2.2 lock yeniləməsi ilə bağlanıb.

## İcra edilən test və build-lər

| Scope / command | Faktiki nəticə |
| --- | --- |
| Root `npm ci --ignore-scripts` | PASS; dependency remediation-dan sonra clean validation Node 24.19 ilə işləyib |
| Prisma generate və validate | PASS |
| Isolated PostgreSQL 16 migration deploy/status | PASS; bütün 29 migration apply, schema up to date |
| Real PostgreSQL order hardening | PASS, 19 scenario group |
| Real PostgreSQL lifecycle concurrency | PASS, 9 parallel scenario group; monitor activity projection daxil |
| Backend typecheck və build | PASS, Node 24.19 |
| Root aggregate `npm test` | PASS, Node 24.19, exit 0 |
| Worker phone regression | PASS; current-password, anti-enumeration, limiter və atomic confirm daxil |
| Detailed company report regression | PASS |
| Assignment management regression | PASS |
| Kiosk eligibility regression | PASS |
| Company QR/attendance regression | PASS, 108 cases |
| Retention regression | PASS |
| Production admin assignment compatibility | PASS, 42 cases |
| Auth, backend access, report isolation/aggregation, audit transaction, security header suites | PASS |
| Production seed/review account/approval/admin operations/privacy deletion/external deletion/moderation/document suites | PASS, aggregate daxilində |
| Swagger YAML/drift/security | PASS; 119 operations |
| Release runbook/security | PASS |
| Production deployment regression | PASS, CRLF portability düzəlişindən sonra |
| Dependency/source-map policy regression | PASS; reviewed runtime versions, web source-map patch, Node watch və Multer finite limitləri yoxlanır |
| Admin typecheck | PASS, Node 24.19 |
| Admin regression | PASS, 32/32 |
| Admin web security | PASS, 7/7 |
| Admin release config | PASS, 4/4 |
| Admin production build | PASS, Node 24.19, 1,805 modules; built-header check PASS |
| Admin dependency audit | Production və full PASS, 0 |
| Company dashboard typecheck/security/release config/build | PASS, Node 24.19, 1,781 modules; built-header check PASS |
| Company dashboard dependency audit | Production və full PASS, 0 |
| QR kiosk typecheck | PASS, Node 24.19 |
| QR kiosk regression | PASS, 16/16 |
| QR kiosk web security/release config | PASS, 7/7 və 4/4 |
| QR kiosk production build | PASS, Node 24.19; built-header check PASS |
| QR kiosk dependency audit | Production və full PASS, 0 |
| Flutter analyze | PASS |
| Flutter phone tests | PASS, 4/4 |
| Full Flutter suite | PASS, 189/189 |
| Changed-file Dart format check | PASS |
| Repo-wide Dart format audit | FAIL; iki əvvəlcədən mövcud, bu inteqrasiyada dəyişməyən fayl format tələb edir |
| Android debug APK build | PASS, son phone-step-up UI ilə; publish edilməyib |
| iOS plist/privacy/build-number static checks | PASS |
| `git diff --check`, conflict/deletion/excluded-artifact checks | PASS |
| Current-only secret scan | PASS, 635 files |
| Full-history secret scan | FAIL; pre-existing historical findings |
| Root production dependency audit | PASS, 0 advisories |
| Root full dependency audit | PASS, 0 advisories |
| iOS compile | BLOCKED; Windows host |

Node 24.17 və dependency remediation-dan sonra Node 24.19 clean runner ilə backend/admin/company/kiosk suite və build-ləri uğurla təkrarlanıb. Release CI supported Node 24 runtime ilə nəticəni yenə təsdiqləməlidir.

## Qalan risk və məhdudiyyətlər

1. Dependency audit-ləri 0-dır, lakin lokal Docker Desktop Linux daemon işləmədiyi üçün production Dockerfile və Sharp 0.35.5 Linux native runtime build-i bu hostda yoxlanmayıb; release CI image build/smoke etməlidir.
2. Migration production ölçülü staging clone-da apply/backfill/index lock vaxtı ilə yoxlanmayıb.
3. Fiziki kiosk planşeti, camera scan, sleep/wake, real offline/reconnect və müxtəlif brauzer vizual QA-sı aparılmayıb.
4. Real R2, malware scanner, Redis, push və SMS/OTP provider inteqrasiyası bu lokal sweep-də yoxlanmayıb.
5. Açıq admin worker detail telefon yeniləməsini növbəti 10 saniyəlik poll-da görə bilər.
6. PDF export browser print-to-PDF-dir; native server PDF və native XLSX yoxdur.
7. iOS build Windows-da işlədilə bilməyib; macOS CI/store QA tələb olunur.
8. Repo-wide Dart format audit-i bu dəyişiklikdən əvvəl mövcud iki əlaqəsiz faylı göstərir; inteqrasiya scope-unu pozmamaq üçün həmin fayllar dəyişdirilməyib.
9. Backend phone-change request-də `current_password` tələb edir. Köhnə Flutter build-i bu sahəni göndərmədiyi üçün backend rollout-dan sonra həmin build-də yalnız telefon dəyişmə əməliyyatı validation xətası alacaq; mobil rollout ardıcıllığı və minimum dəstəklənən versiya planı tələb olunur.
10. Full Git history-də köhnə secret materialı qalır; provider rotation təsdiqi lazımdır.
11. npm audit nəticəsi registry-nin 2026-10-15 snapshot-ıdır; release CI clean install-dan sonra production və full audit-i yenidən işlətməlidir.

## Manual QA checklist

### Reporting

- [ ] `view_reports` admin report açır; icazəsiz admin 403 alır.
- [ ] İki company məlumatı totals, order və assignment detail-də qarışmır.
- [ ] Date/status/worker/position filtrləri totals və export-da eyni nəticəni verir.
- [ ] Böyük dataset-də pagination/sort və 10,000 export limit davranışı yoxlanır.
- [ ] CSV Azərbaycan hərflərini saxlayır və formula başlayan hüceyrələri icra etmir.
- [ ] Print/PDF desktop və mobil ölçüdə daşmır.

### QR kiosk və attendance

- [ ] Approved company üçün order olmadan persistent kiosk yaradılır.
- [ ] Tək aktiv shift avtomatik seçilir; shift yoxdursa aydın empty state görünür.
- [ ] İki paralel shift düzgün selector göstərir.
- [ ] QR hər 30 saniyədə yenilənir; expired və replay token rədd edilir.
- [ ] Başqa company və assignment-sız worker scan-i rədd edilir.
- [ ] Shift bitəndən sonra yalnız açıq checkout grace müddətində işləyir.
- [ ] Reload/browser restore capability fragmentindən bərpa olunur; storage-a yazılmır.
- [ ] Offline/reconnect, screen sleep/wake və tablet portrait/landscape yoxlanır.

### Assignment və history

- [ ] Beş yerlik order üçün beş approved/available worker bulk assign edilir.
- [ ] Duplicate, invalid, inactive, unavailable, capacity və overlap hər worker üçün düzgün nəticə verir.
- [ ] Profession mismatch yalnız warning verir və profil profession-u dəyişmir.
- [ ] İki paralel admin capacity-ni aşmır və eyni worker üçün conflict yaradır.
- [ ] Active/history tabları, filters, pagination və sort düzgün işləyir.
- [ ] Completed order assignment/attendance tarixçəsini saxlayır.

### Phone, documents və şəkil

- [ ] Cari parol yanlış olduqda OTP sorğusu rədd edilir; tək oğurlanmış access token nömrəni dəyişə bilmir.
- [ ] Unikal nömrə + doğru cari parol üçün real OTP gəlir; confirm-dən sonra Flutter dərhal, admin refresh/poll sonrası canonical nömrəni göstərir.
- [ ] Başqa hesaba bağlı nömrə generic accepted cavabı verir, OTP göndərmir və qeydiyyatın mövcudluğunu API cavabında açıqlamır.
- [ ] Duplicate, wrong, expired, consumed və wrong-purpose OTP confirm-i rədd edilir; request/confirm rate limit işləyir.
- [ ] Mövcud session işləməyə davam edir və yeni nömrə ilə növbəti login mümkündür.
- [ ] Authorized admin health/criminal sənədi short-lived URL ilə açır.
- [ ] Unauthorized/guessed/missing/quarantined/expired sənəd girişləri rədd edilir.
- [ ] Log və browser storage-da signed URL, object key, OTP və capability yoxdur.
- [ ] Image modal zoom/close/Escape/loading/error/placeholder davranışları yoxlanır.

## Production deployment planı

1. Dəyişiklikləri review edin; bu working tree-dən ayrıca təsdiqlənmiş release commit/SHA yaradın. `output/`, `tmp/`, real `.env`, build/dependency qovluqlarını daxil etməyin.
2. Dependency security remediation diff və lockfile-ları review edin; release CI-də root/admin/company/kiosk production və full audit-lərinin yenə 0 olduğunu təsdiqləyin.
3. Release CI-də supported Node 24 ilə root install/generate/validate/typecheck/test/build, Linux Docker image/Sharp smoke, Swagger, release və current-secret gate-lərini təkrarlayın.
4. Admin və kiosk üçün clean `npm ci`, audit, typecheck, regression, security, release-config və production build-i təkrarlayın. Flutter analyze/test və Android/iOS release build-lərini release hostlarında işlədin.
5. Production snapshot-a yaxın isolated PostgreSQL staging clone yaradın. Backup/PITR restore testinin tarixini və rollback owner-ini qeyd edin.
6. Staging-də `prisma migrate deploy` işlədin; backfill sayı, index lock müddəti, DB load və migration statusunu ölçün. Real paralel bulk assignment/check-in/out testlərini burada aparın.
7. Staging environment-də `APP_TIME_ZONE=Asia/Baku`, `KIOSK_PUBLIC_BASE_URL=https://qr.setservice.az`, `QR_TOKEN_TTL_SECONDS` (1..300), checkout grace, QR retention və CORS dəyərlərini review edin. Secret-lər mövcud secret store-dan gəlməli və bir-birindən fərqli olmalıdır.
8. Manual QA checklist-in kritik report, kiosk, assignment, phone və private-document ssenarilərini staging-də tamamlayın.
9. Low-traffic production pəncərəsində əvvəl additive migration-ı `prisma migrate deploy` ilə tətbiq edin. Reset, force push və destructive manual SQL istifadə etməyin.
10. Yenilənmiş Flutter build-i store/internal track-də əvvəlcədən hazırlayın və `current_password` phone-change contract-ını staging backend ilə yoxlayın. Backend sərtləşdirməsi yayılanda köhnə mobil build-lər üçün minimum-version/support mesajı hazır olmalıdır.
11. Immutable backend/outbox/retention image-lərini deploy edin; health/readiness, error rate, DB pool, slow query və queue göstəricilərini yoxlayın.
12. Admin static build-i, sonra `qr.setservice.az` kiosk build-ini deploy edin. TLS/CSP/CORS/cache/header-ləri yoxlayın; işləyən DNS-i dəyişməyin.
13. Bir test company/order/worker ilə kiosk check-in/out, attendance monitor, bulk assignment, report CSV və private document end-to-end smoke edin.
14. İlk release pəncərəsində QR replay/expiry, phone password/OTP/conflict, polling load, signed URL və migration query latency metric-lərini izləyin.
15. Flutter dəyişikliklərini ayrıca signing/store QA prosesi ilə yayımlayın; backend deploy-un avtomatik hissəsi etməyin.

## Rollback

1. App regression zamanı əvvəlki backend image digest-ə qayıdın; köhnə API additive sütunları görməzlikdən gəlir.
2. Admin və kiosk static artifact-lərini əvvəlki versiyaya qaytarın. Kiosk problemi varsa yeni kiosk session-larını revoke/disable edin.
3. Yeni optional environment dəyərləri əvvəlki kod üçün təhlükəsizdir; zərurət olduqda əvvəlki config revision-u secret/config manager vasitəsilə qaytarın.
4. Təcili rollback zamanı yeni sütun və index-ləri drop etməyin. Bu data itkisi və table lock riski yaradır; cleanup ayrıca forward migration olmalıdır.
5. Migration qismən uğursuz olarsa Prisma migration statusu və PostgreSQL catalog-u DBA tərəfindən yoxlanmadan manual SQL işlətməyin. Data integrity pozuntusunda təsdiqlənmiş PITR/backup runbook-dan istifadə edin.
6. Rollback-dən sonra login/OTP, mövcud assignment yaratma, attendance list/check-in/out, company kiosk və private-document smoke testlərini işlədin.
7. Incident log-da vaxt, image digest, migration vəziyyəti və request ID-ləri saxlayın; signed URL, OTP, capability və document content yazmayın.

## Release qərarı

Feature kodu production baseline üzərinə inteqrasiya olunub və dependency remediation-dan sonra root/admin/company/kiosk production və full npm audit-ləri 0-dır. Node 24 backend/web suite və build-ləri, Flutter suite/Android build-i, isolated PostgreSQL 16 migration və concurrency testləri keçir. Cari working tree hələ production deploy üçün təsdiqlənmir: Linux Docker/Sharp image build-i, production ölçülü staging migration timing, phone-change mobil rollout ardıcıllığı, historical-secret rotation təsdiqi, iOS build və fiziki/manual QA bağlanmalıdır.
