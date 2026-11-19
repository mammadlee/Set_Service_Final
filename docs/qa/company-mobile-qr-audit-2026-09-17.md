# SET Service — company mobile / QR / worker pre-deploy audit

Tarix: 2026-09-17
Repository: C:\Users\ASUS\Desktop\hireapp
Branch: codex/flutter-responsive-hardening
Başlanğıc commit: 0e7df2200ee745cb5b18d8652ce655059d60e7a8

Production deploy, VPS əməliyyatı, main merge, database reset və production seed edilməyib. Bu hesabat canlı production yoxlaması deyil.

## 1. Company UI

Uzun mətnlər üçün seçim xanası, order/assignment kartları və detal bölmələri yeniləndi. Şöbə seçimi artıq bir sətirlik kəsilmiş mətnə əsaslanmır. Mobil əsas hərəkətlər tam enli, form scroll/keyboard-safe saxlanılıb. Hesabat seçimləri enə uyğun genişlənir; qiymətləndirmə dialoqu scroll edilə bilir.

Dashboard aktiv sifarişləri yalnız legacy `active` ilə deyil, mövcud lifecycle statusları ilə sayır; bugünkü giriş göstəricisi tarixə görə süzülür. Mövcud pagination hədləri dəyişdirilməyib; dashboard tam server aggregate hesabatının əvəzi deyil.

## 2. Order creation

Mövcud 7 mərhələ və funksional sahələr saxlanıldı: şöbə, alt şöbə, vəzifə, say/qeyd, tarix/saat, ünvan, yekun məlumat. Tarix validasiyası, Azərbaycan dilində izahlar, loading və təkrar submit guard mövcuddur. Uğurlu POST-dan sonra yaradılmış order modeli qaytarılır; siyahı yenilənir və sifariş detalı açılır. QR bölməsi detaldadır.

## 3. Terminologiya

Backend taxonomy `department` xidmət/vəzifə iyerarxiyasıdır: **Şöbə → Alt şöbə → Vəzifə**. Fiziki məkan **İş yeri / Ünvan** kimi göstərilir. Domenə yeni Filial anlayışı əlavə edilməyib, DB/API açarları dəyişdirilməyib. Lifecycle statusları Azərbaycan dilində göstərilir.

## 4–6. QR: əvvəl / sonra və backend uyğunluğu

Əvvəl venue QR aktivləşdirməsi üçün qəbul edilmiş təyinat tələb olunurdu. İndi təsdiqlənmiş, aktiv müəssisə öz aktiv, silinməmiş və vaxtı bitməmiş sifarişi üçün təyinatdan əvvəl QR yarada bilir.

Flutter mövcud `/attendance/venue-kiosks/eligible-orders` cavabına əsaslanır; ayrıca client-only eligibility tərifi yoxdur. Axın:

Sifariş yarat → detal → QR yarat → QR ekranını aç / linki köçür.
Mövcud aktiv QR olduqda: QR-a bax.

Repository paralel create çağırışlarını birləşdirir, mövcud aktiv kiosk-u təkrar istifadə edir və uğursuz activation retry-də həmin yeni kiosk-u saxlayır. Backend eyni kiosk/order activation retry-də session-u və verilmiş QR-ləri səbəbsiz revoke etmir. Məhsulun mövcud çoxlu fiziki kiosk dəstəyi saxlanılıb; müxtəlif cihazlarda ayrıca kiosk yaradılması qlobal olaraq qadağan edilməyib.

Activation transaction daxilində order lock-dan sonra ownership, lifecycle, expiry, company approval və hesab aktivliyi yenidən yoxlanılır. Draft, cancelled, completed, expired, deleted sifarişlər rədd edilir. Başqa company ID göndərilməsi forbidden-dir.

## 7. Worker attendance

QR yaratmaq işçiyə attendance icazəsi vermir. İmzalı, müddəti keçməmiş və revoke edilməmiş token; düzgün kiosk/session; həmin işçinin qəbul edilmiş təyinatı; aktiv order; approved/active worker və company yoxlamaları saxlanılıb/gücləndirilib.

Check-in/out zamanı transaction daxilində order və assignment yenidən yoxlanılır. Eyni check-in təkrarı rədd edilir. Uğurlu checkout assignment/order lifecycle-ını mövcud qaydada tamamlayır.

Yeni 51-case test real order service/repository, QR/HMAC və attendance kodunu in-memory Prisma adapter ilə işlədir. Real PostgreSQL lock/concurrency sübutu deyil.

## 8. Admin audit

Mövcud primary/mobile navigation, permission gate və super_admin qoruması saxlanıldı. Company approval-da registration certificate tələbi geri qaytarılmadı. Workers üçün health_certificate/criminal_record məcburiliyi, CV-nin optional olması saxlanılıb.

Tapılan xəta: sənəd keçidi authenticated JSON endpoint-i birbaşa açırdı. İndi admin düyməsi authenticated API ilə müddətli download URL alır, təhlükəsiz protokolu yoxlayır, sonra açır. Popup bloklanarsa alternativ keçid görünür. Raw storage key göstərilmir. CV ayrıca optional bölmədir.

QR idarəsində müəssisənin öz QR yaratma imkanına uyğun mətnlər və clipboard error handling düzəldildi. Uzun sənəd adları/action sıraları wrap edilir.

Login, dashboard, bütün list/detail, approval, reports, navigation və permission axınlarının real browser + API kombinasiyası **MANUAL QA REQUIRED**. Build/security/unit keçməsi bütün həmin ekranlarda canlı interaktiv testi əvəz etmir.

## 9. Kiosk audit

Expired/malformed QR görüntülənmir. Invalid/disabled capability üçün daimi retry dayandırılır. Order inactive olduqda köhnə QR silinir və növbəti aktiv order üçün context polling saxlanılır. Gecikmiş response deaktiv edilmiş/gizlədilmiş QR-ni yenidən göstərmir. AZ mətnləri, səhv tarix fallback-i, mobil/landscape CSS yaxşılaşdırılıb.

DOM runtime regression real kiosk main.ts kodunu simulated DOM/network ilə yoxlayır: 11/11. Real browser rendering, kamera ilə scan, ekran yuxusu/oyanması və şəbəkə dəyişməsi **MANUAL QA REQUIRED**.

## 10. Worker app audit

Tapılan bloklayıcı uyğunsuzluq: document route enrollment token qəbul etsə də upload service yalnız approved worker qəbul edirdi; pending worker tələb olunan arayışları yükləyə bilmirdi. Bu, pending/approved document enrollment qaydasına uyğunlaşdırıldı.

Flutter registration-dan gələn qısamüddətli tokeni yaddaşda saxlayır və pending ekranında tələb olunan sənədləri yükləməyə imkan verir. App yenidən açılanda pending worker telefon/şifrə ilə dar sənəd sessiyası ala bilir. Bu, company resume registration deyil və tətbiqə tam login yaratmır.

Əlavə endpoint-lər:
- POST /v1/auth/worker/document-session — rate-limited, password-authenticated; yalnız pending worker; access/refresh token vermir.
- GET /v1/workers/me/enrollment — yalnız öz enrollment profili.
- GET /v1/workers/me/documents/:type/download — yalnız öz sənədi üçün icazəli müddətli URL.

Enrollment bearer normal access token storage-a yazılmır və normal refresh/session mexanizmini işə salmır. Pending/rejected hesab protected app ekranlarına keçmir.

Required document upload → fiziki private fayl → DB metadata adapteri → profile GET zənciri test edildi. Təzə storage service ilə faylın oxunması yoxlanıldı. Bu, production container restart/deploy testi deyil.

CV upload/replace/delete, cleanup outbox scheduling, required sənədlərin və manual work_history məlumatının toxunulmazlığı test edildi. Profil foto public/private route regressions və name-update/profile state-sync testləri də keçdi. Real cihazda foto/CV açma, kamera, OTP/SMS və notifications **MANUAL QA REQUIRED**.

## 11. Security findings

- Company CV/criminal metadata-dakı yanlış `company_visible=true` dəyərinə artıq etibar edilmir. Company yalnız uyğun health_certificate görə bilər; CV/criminal download service-də ayrıca rədd olunur.
- Deaktiv edilmiş company user-in köhnə kiosk capability-si public context/QR almaq üçün istifadə oluna bilmir.
- Order expiry attendance zamanı da yoxlanılır.
- Sənəd sessiyası /workers/me, /orders, /assignments, /admin/workers və /attendance/venue-kiosks kimi protected route-lara giriş vermir.
- Public photo route regressions: photo 200; private/arbitrary/traversal path-lər rədd; size limit və storage error coverage.
- Ümumi secret scan köhnə reachable Git commit-lərində potensial secret material aşkarladı (məsələn b65cdc7...). Tarixçə dəyişdirilmədi, secret-lər çıxarılmadı. Cari fayllar üçün scan keçdi. Tarixçədəki nəticələrin real credential olub-olmaması və lazım olan rotation ayrıca release yoxlamasıdır.

## 12–17. Test nəticələri

| Scope / command | Nəticə |
| --- | --- |
| Root npm run typecheck | PASS |
| Root npm run build | PASS |
| Root npm test | PASS — 12 regression suite, o cümlədən QR 51 case |
| npm run test:auth-security | PASS |
| npm run test:worker-security | PASS — real local private files + mocked DB, local HTTP checks |
| npm run test:backend-access | PASS |
| npm run test:company-report-isolation | PASS |
| Company registration, approval-document-security, admin-operations, kiosk-eligibility | PASS — npm test daxilində |
| Public-profile-assets / malware-scanner | PASS — npm test daxilində |
| swagger:check / swagger:drift / swagger:security | PASS; 112 documented path/method operations |
| Admin npm ci | PASS; 30 packages, 0 reported vulnerabilities |
| Admin typecheck / build / built security headers | PASS |
| Admin test:release-config / test:security / test:regression | 4/4, 7/7, 3/3 PASS |
| Kiosk typecheck / build / built security headers | PASS |
| Kiosk test:release-config / test:security / test:regression | 4/4, 7/7, 11/11 PASS |
| Flutter analyze | PASS — no issues |
| Flutter test | PASS — 94/94; company order/QR suite 14 tests |
| node scripts/check-secrets.mjs --current-only | PASS — current files only |
| npm run secrets:check | FAIL — historical potential secret findings; not silently ignored |
| git diff --check | PASS |

Yeni company widget tests 360/375/390/412/430 px-də uzun şöbə/vəzifə/ünvan, keyboard inset, uğurlu order POST, QR yarat/bax və backend ineligible halını yoxlayır. Pending worker document ekranı 360/430 px-də təkrar API oxunuşu ilə yoxlanılır. Existing company registration tests phone-only atomic registration/pending/rejected axınlarını əhatə edir.

`npm run test:orders-hardening` təhlükəsizlik guard-ı ilə dayandı: environment production idi. Guard bypass edilmədi, DB əməliyyatı aparılmadı. PostgreSQL tələb edən lifecycle concurrency və MVP smoke **NOT RUN**: lokal API/DB/Redis listener yox idi, Docker daemon əlçatan deyildi. Flutter ayrıca integration_test qovluğu yoxdur.

## 18. Migration

**Migration: none.** Prisma schema və mövcud data dəyişdirilməyib. Company registration atomic phone-only axını, company sənədsiz approval və mövcud approved hesabların davranışı saxlanılıb.

## 19. Qalan məsələlər / manual QA

**MANUAL QA REQUIRED — release təsdiqi verilməyib.**

1. İzolyasiya edilmiş lokal/test PostgreSQL + Redis + API ilə real MVP registration → phone OTP → password → pending → admin approve → company order → QR → worker documents → worker approval → assignment accept → check-in/out → company/admin attendance zənciri. Production seed və production DB istifadə etməyin.
2. DB transaction rollback/lock/concurrency testləri, həqiqi restart/deploy sonrası storage persistence və R2/S3 signed download.
3. Admin 1440/1024/768/430/390/375/360 px: login, dashboard, workers/companies/orders/assignments/attendance/admins list/detail, reports; full-width search, wrap, modal/keyboard, bottom navigation, destructive action separation; limited-admin və super-admin linkləri.
4. Flutter real cihazda 360/375/390/412/430 px: order flow, long strings, böyük mətn ölçüsü, keyboard, pending/rejected/approved login, QR browser link, clipboard, foto, CV file picker/view/replace/delete, manual work history.
5. Kiosk real tablet/phone portrait+landscape: valid/expired/disabled QR, online/offline, background/resume; authorized/unauthorized worker camera scan.
6. API-də mövcud pagination limitlərinə görə böyük company dataset-də dashboard/list nəticələrini ayrıca yoxlayın.
7. Köhnə Git secret-scan findings-i review edin; real secret aşkarlanarsa authorized rotation planı tələb olunur. Bu task tarixçə rewrite/credential rotation etməyib.

Screenshot yaradılmayıb. Yuxarıdakı checklist vizual QA-nın qalan dəqiq scope-udur; bütün ekranların vizual olaraq yoxlandığı iddia edilmir.

## 20. Exact files changed

Aşağıdakılar repo root-a nəzərən task fayllarıdır (hesabat özü də commit-ə daxildir):

```text
apps/admin_panel/package.json
apps/admin_panel/src/features/attendance/QrDisplayPage.tsx
apps/admin_panel/src/features/workers/WorkerDetailPage.tsx
apps/admin_panel/src/features/workers/workers.service.ts
apps/admin_panel/src/shared/utils/documents.ts
apps/admin_panel/src/styles.css
apps/admin_panel/tests/documents.test.mjs
apps/qr_kiosk/package.json
apps/qr_kiosk/src/main.ts
apps/qr_kiosk/src/styles.css
apps/qr_kiosk/tests/kiosk-state.test.mjs
apps/worker_app/lib/core/network/api_client.dart
apps/worker_app/lib/features/attendance/data/models/attendance.dart
apps/worker_app/lib/features/auth/data/auth_repository.dart
apps/worker_app/lib/features/auth/data/models/auth_models.dart
apps/worker_app/lib/features/auth/presentation/controllers/auth_controller.dart
apps/worker_app/lib/features/auth/presentation/screens/enrollment_documents_section.dart
apps/worker_app/lib/features/auth/presentation/screens/pending_approval_screen.dart
apps/worker_app/lib/features/company/data/company_kiosk.dart
apps/worker_app/lib/features/company/data/company_repository.dart
apps/worker_app/lib/features/company/presentation/company_attendance_part.dart
apps/worker_app/lib/features/company/presentation/company_dashboard_part.dart
apps/worker_app/lib/features/company/presentation/company_home_shell.dart
apps/worker_app/lib/features/company/presentation/company_order_creation_part.dart
apps/worker_app/lib/features/company/presentation/company_order_qr_part.dart
apps/worker_app/lib/features/company/presentation/company_orders_part.dart
apps/worker_app/lib/features/company/presentation/company_reports_part.dart
apps/worker_app/lib/features/company/presentation/company_strings.dart
apps/worker_app/lib/features/company/presentation/company_worker_profile_part.dart
apps/worker_app/lib/features/worker/data/worker_repository.dart
apps/worker_app/lib/shared/app_strings.dart
apps/worker_app/lib/shared/models/mobile_models.dart
apps/worker_app/test/api_client_session_test.dart
apps/worker_app/test/company_order_mobile_test.dart
apps/worker_app/test/worker_profile_state_sync_test.dart
docs/qa/company-mobile-qr-audit-2026-09-17.md
package.json
scripts/company-qr-attendance-regression.ts
scripts/kiosk-eligibility-regression.ts
scripts/swagger-security-regression.mjs
scripts/worker-security-regression.ts
src/app.ts
src/modules/attendance/attendance.kiosk-eligibility.ts
src/modules/attendance/attendance.repository.ts
src/modules/attendance/attendance.service.ts
src/modules/auth/auth.router.ts
src/modules/auth/auth.service.ts
src/modules/workers/workers.router.ts
src/modules/workers/workers.service.ts
swagger.yaml
```

## 21–22. Git state / commit

Task current branch-də commit edilir; exact SHA və son `git status --short` completion cavabında verilir. Push, merge və deploy edilmir.

`apps/qr_kiosk/index.html` task-dan əvvəl olan qaynar xətt dəyişiklikləri ilə saxlanılıb: +994 70 231 51 51. Bu fayl stage/commit edilmir. Kiosk source dəyişiklikləri ayrı fayllardadır. Commit-dən sonra gözlənilən yeganə dirty fayl həmin index.html-dir.
