# Private sənədlər — audit və düzəliş hesabatı

Audit başlanğıcı: 2026-10-09. Yekun yoxlama: 2026-10-10. Branch: `codex/play-store-live-final-hardening`.
İş qovluğu: `C:\Users\ASUS\Desktop\hireapp\.tmp\play-readiness`.

## Əhatə və təhlükəsizlik sərhədi

CV, sağlamlıq arayışı və məhkumluq arayışı üçün mövcud Flutter → Node API → private R2 axını saxlanılıb. Production DB, R2 obyektləri, bucket icazələri, DNS və VPS dəyişdirilməyib. Commit/push/deploy edilməyib. Schema/migration və build number dəyişikliyi yoxdur; Flutter `1.0.0+13` olaraq qalır. Əvvəlki admin təyinat işi üzrə uncommitted dəyişikliklər qorunub və bu hesabatın sənəd düzəlişləri ilə qarışdırılmamalıdır.

## Təsdiqlənən kök səbəblər

1. PDF validatoru bütün xam baytlarda `/OpenAction`, `/JavaScript`, `/JS` kimi sözləri axtarırdı. Scanner/print PDF-lərində təhlükəsiz ilkin səhifə/zoom göstərişi və hətta metadata mətni yanlış bloklanırdı. Eyni zamanda sıxılmış object stream və escaped adlarda həqiqi aktiv məzmun regex-dən yayınırdı.
2. Company web sənədləri metadata-dakı `document.url` ilə birbaşa açırdı. Private obyektin imzasız və ya köhnəlmiş ünvanı etibarlı download mexanizmi deyil. Admin web müvəqqəti linki fallback anchor-da saxlayırdı; Safari-də async sorğudan sonra popup da bloklana bilərdi.
3. Cari Flutter worker/enrollment kodu artıq səlahiyyətli endpoint-dən fresh link alırdı. Amma UI metadata URL-i olmayan, backend-in əlçatan saydığı legacy sənədləri də bloklayırdı. Company mobil kartlarında açılış əməliyyatı yox idi.
4. Backend URL-only legacy metadata-nı təhlükəsiz şəkildə həll etmirdi. Yeni private obyektlər üçün imzalanmış URL yaradılması object-in mövcudluğunu/read icazəsini yoxlamırdı; imzalama əməliyyatının özü R2-yə sorğu deyil.
5. Enrollment upload uğurundan sonra profile refresh xətası yeni sənədin ekranda saxlanmasına mane olurdu. Uğurlu upload cavabı indi ayrıca qorunur.

### Canlı AccessDenied barədə sübut sərhədi

Production-da konkret problemin köhnə/imzasız URL, vaxtı bitmiş signature, yanlış endpoint/bucket/key, revoked credential, yoxsa R2 read icazəsi olduğunu bu mühitdən təsdiqləmək mümkün olmadı. İş worktree-sində production env yoxdur; əsas checkout-un lokal env yoxlaması yalnız redaktə olunmuş boolean nəticələr verdi və R2 credential/endpoint mövcud deyil. Mövcud authorized VPS girişinin əvvəlki yoxlaması da uğursuz olub. Heç bir private key və secret tələb olunmayıb.

Köhnə əl ilə yazılmış SigV4 alqoritmində konkret signature xətası sübut olunmayıb; onu canlı problemin sübut edilmiş səbəbi kimi təqdim etmirik. Rəsmi AWS SDK signer-i ilə əvəzləmə uyğunluq riskini azaldır. Canlı R2/Safari inteqrasiyası ayrıca QA tələb edir.

## Tətbiq olunan axın

- Upload: `POST /v1/workers/me/documents`, multipart fayl field-i `file`, sənəd növü `type`.
- Dəstəklənən tələblər: PDF, JPG/JPEG, PNG; əvvəlki WebP dəstəyi saxlanılıb. Maksimum 5 MiB; extension, deklarasiya olunmuş MIME, magic bytes, ölçü/struktur uyğunluğu və malware scan saxlanılıb.
- PDF obyektləri parser vasitəsilə yoxlanır. JavaScript, embedded files, Launch, XFA, aktiv multimedia və təhlükəli actions bloklanır; təhlükəsiz səhifə naviqasiyası və adi CV linkləri qəbul edilir.
- PDF parser ayrıca worker-dədir: 10 saniyə deadline, 128 MB V8 old heap, 16 MB young heap, 4 MB stack; maksimum 2 paralel və 4 növbədə yoxlama. V8 limiti ümumi RSS/ArrayBuffer limiti deyil; production container yaddaş limiti saxlanmalıdır.
- Upload əvvəl quarantine-a yazılır, scan uğurundan sonra final key-ə promote olunur; transaction DB metadata-nı əvəzləyir. Köhnə obyektin cleanup işi yalnız uğurlu transaction-dan sonra outbox-a yazılır. Validation/scan/storage/DB xətasında əvvəlki uğurlu sənəd saxlanılır.
- Object key: `workers/<worker-id>/documents/<type>/<uuid>.<extension>`; quarantine ayrı namespace-dir. Metadata-da ad, MIME, ölçü, status/scan, hash və tarixlər saxlanılır; istifadəçiyə raw key və R2 URL verilmir.
- Açılış: owner `GET /v1/workers/me/documents/:type/download`; admin/company `GET /v1/workers/:id/documents/:type/download`. Hər açılışda auth/ownership/permission yenidən yoxlanır.
- Admin üçün `view_workers`; company üçün approved hesab + mövcud icazəli assignment əlaqəsi + `company_visible=true` tələb edilir. Company yalnız sağlamlıq arayışını ala bilər; CV/məhkumluq sənədi bu rola açılmır. Başqa worker-in sənədi rədd edilir.
- Default link ömrü 300 saniyədir; mövcud TTL konfiqurasiyası 1–900 saniyə ilə məhdudlaşır. `HeadObject` read/mövcudluq/ölçü yoxlamasından sonra rəsmi AWS presigner ilə GET URL yaradılır. Missing → 404; storage/permission problemi → məxfi provider detalı olmayan API 503.
- Müvəqqəti URL yadda saxlanılmır; hər toxunuşda fresh URL. Flutter vaxtı keçmiş `expires_at` cavabında bir dəfə yeni link istəyir. Veb Safari tab-ı klik zamanı açır, opener/referrer-i söndürür; popup bloklanıbsa fresh URL ilə həmin tabda açır.
- Legacy URL yalnız konfiqurasiya edilmiş origin/bucket altında sahibin düzgün document namespace-inə uyğundursa locator sayılır. Backend URL-ə HTTP fetch etmir; private object-i ölçü məhdudiyyətli stream ilə oxuyub struktur/malware yoxlamasından keçirir, yalnız sonra sign edir. Bu oxuma DB metadata-nı və R2 object-i dəyişmir. Naməlum status, xarici host, traversal, quarantine, deleted və rejected sənədlər açılmır. Tanınmayan köhnə path üçün təhlükəsiz re-upload mesajı qalır.
- Signed URLs, R2 locator/credential-ları log və Sentry-dən redaktə edilir; audit-də yalnız key hash saxlanılır.

## Dəyişən fayllar — bu sənəd işi

Backend və dependency:

- `src/lib/file-security.ts`
- `src/lib/pdf-document-validation.ts` (yeni)
- `src/lib/pdf-validation.ts` (yeni)
- `src/lib/uploads.ts`
- `src/lib/logger.ts`
- `src/instrument.ts`
- `src/modules/workers/workers.service.ts` (əvvəlki assignment diff-i də bu fayldadır)
- `package.json`, `package-lock.json` (`@aws-sdk/s3-request-presigner`)

Veb:

- `apps/admin_panel/src/features/workers/WorkerDetailPage.tsx`
- `apps/admin_panel/src/shared/utils/documents.ts`
- `apps/admin_panel/src/shared/i18n/appStrings.ts`
- `apps/admin_panel/tests/documents.test.mjs`
- `apps/company_dashboard/src/features/assignments/AssignmentsPage.tsx`
- `apps/company_dashboard/src/features/workers/workers.service.ts`
- `apps/company_dashboard/src/shared/utils/documents.ts`
- `apps/company_dashboard/src/shared/i18n/appStrings.ts`

Flutter (`apps/worker_app/`):

- `lib/core/network/private_document_download.dart` (yeni)
- `lib/features/worker/data/worker_repository.dart`
- `lib/features/auth/data/models/auth_models.dart`
- `lib/features/auth/presentation/screens/enrollment_documents_section.dart`
- `lib/features/worker/presentation/screens/worker_profile_screen_sections.dart`
- `lib/features/worker/presentation/screens/worker_profile_screen_state.dart`
- `lib/features/company/data/company_repository.dart`
- `lib/features/company/presentation/company_worker_profile_part.dart`
- `lib/shared/app_strings.dart`
- `lib/shared/models/mobile_models.dart`
- `test/worker_document_access_test.dart` (yeni)
- `test/worker_repository_document_url_test.dart`

Backend regression:

- `scripts/pdf-security-regression.ts` (yeni)
- `scripts/private-document-storage-regression.ts` (yeni)
- `scripts/document-log-security-regression.ts` (yeni)
- `scripts/worker-security-regression.ts`

## Test nəticələri

- Backend `npm run typecheck` və `npm run build`: PASS.
- Tam `npm test`: PASS, sənəd suite-ləri əsas test zəncirinə daxil edilib.
- PDF/file security: 61/61 PASS (təhlükəsiz PDF-lər, compressed/escaped zərərli obyektlər, paylaşılmış manual/automatic action chain, parser timeout/queue, MIME/magic/extension/struktur, JPG/JPEG/PNG).
- Private storage: 13/13 PASS (rəsmi signer + müstəqil SigV4 yoxlaması, Unicode key, legacy/expired locator, ölçü, storage 404/503, owner/admin/company, real localhost HTTP 401/403/200).
- `test:worker-security`: PASS (uğurlu upload/list/read, uğursuz validation/scan/DB transaction zamanı əvvəlki sənədin qorunması daxil).
- `test:document-backfill`: PASS; backfill icra edilməyib, yalnız regression test işləyib.
- Document logging: PASS (logger və faktiki Sentry error/transaction/breadcrumb callback-ləri).
- Admin veb regression: 26/26 PASS; web security: 7/7 PASS.
- Admin və company web production build + bundled security headers: PASS; artifact deploy edilməyib.
- Flutter analyze: PASS; tam Flutter suite: 185/185 PASS. Mobil build/version dəyişməyib: `1.0.0+13`.
- Swagger parse/security: PASS. `git diff --check`: PASS (Windows line-ending xəbərdarlığı xəta deyil).
- Cari fayllar üçün secret scan: PASS (619 fayl). Tam history scan cari diff-lə əlaqəsi olmayan köhnə commit-lərdə əvvəlcədən mövcud secret-pattern tapıntılarına görə FAIL oldu; heç bir dəyər bu hesabatda göstərilmir. Tarixin rewrite/secret rotation işi bu task-da aparılmayıb.

Read-only production HTTP yoxlaması (2026-10-10): autentifikasiyasız `GET /v1/workers/me/documents/cv/download` JSON `401` və `Cache-Control: no-store`; uydurma private document path-i `/uploads/.../documents/...` altında JSON `404` qaytardı. Bu, auth/public-route sərhədini təsdiqləyir, amma real R2 object, fresh presigned URL və Safari download-u təsdiqləmir.

### Dependency audit — deploy üçün açıq risk

Əlavə `npm audit` hazır dependency ağacında 14 xəbərdarlıq qaytardı: 1 critical, 9 high, 4 moderate. Kritik `proxy-addr`, upload-la əlaqəli `multer` və `sharp` daxil olmaqla xəbərdarlıq olan paketlər əvvəlki HEAD lockfile-da da eyni versiyadadır. Bu task yalnız AWS presigner dependency-sini əlavə edir; bulk dependency upgrade və override dəyişiklikləri edilməyib. Buna görə bütün production təhlükəsizliyinə ümumi PASS verilmir. Dependency düzəlişləri ayrıca yoxlanmalı və deploy-dan əvvəl qiymətləndirilməlidir.

Test metodologiyası: real validator, service/repository, signer, local HTTP middleware və Flutter widget kodları işlədir. DB/object storage/scanner çağırışları deterministik test doubles-dır; bu, canlı PostgreSQL/Redis/R2 və iPhone Safari yoxlamasının sübutu deyil. Təhlükəsiz real DB/Redis mühiti mövcud olmadığından production DB-yə integration test yönəldilməyib.

## Təsdiqdən sonra deploy və smoke planı

1. Ayrı approval-dan sonra nəzərdən keçirilmiş diff-i release commit/artifact-ə daxil etmək. Mövcud başqa assignment diff-ini ayrıca nəzərdən keçirmək. Heç bir secret və build output daxil edilməməlidir.
2. Mövcud authorized deployment access ilə secret-ləri göstərmədən yoxlamaq: `STORAGE_PROVIDER=r2`, `S3_REGION=auto`; `S3_ENDPOINT` hesabın HTTPS S3 API origin-i olmalıdır, public custom domain və ya bucket əlavə olunmuş URL deyil; `S3_BUCKET` ayrıca olmalıdır. Credential eyni private bucket-də read/write/copy/delete işlərini dəstəkləməlidir. Bucket-i public etmək olmaz.
3. Malware scanner sağlam və tələb olunan rejimdə qalmalıdır. Hazır container memory/CPU limitləri saxlanmalıdır. Node 24 istifadə edilməlidir.
4. `npm ci`, `npm run typecheck`, `npm run build`, `npm test` release artifact-də təkrar yoxlanmalıdır. Compiled `dist/lib/pdf-document-validation.js` image-də olmalıdır. Mövcud Dockerfile bütün `dist`-i kopyalayır.
5. Yalnız təsdiqdən sonra API/outbox image-lərini təsdiqlənmiş release tag ilə qurub yeniləmək. Mövcud `scripts/deploy-production.sh` avtomatik migration da işlədir; bu sənəd düzəlişi üçün migration lazım deyil, ona görə onu kor-koranə işə salmaq olmaz. Bucket permission/DB migration/volume əməliyyatı bu task-a daxil deyil.
6. Admin web üçün build/artifact yenilənməlidir. `company_dashboard` kodu təhlükəsizləşdirilib, amma yeni company web production məhsulu/domain deploy edilmir.
7. Yeni iOS və Android mobil build lazımdır; build number və store upload bu task-da dəyişdirilməyib və ayrıca təsdiq tələb edir.
8. Rollback: əvvəlki API/outbox/admin artifact/image tag-ına qayıtmaq; DB və R2-yə rollback/reset/delete yoxdur. Yeni və köhnə sənəd formatları ilə backward-compatible metadata saxlanılır.

### Production-dan əvvəl real smoke checklist

- Hər növ üçün təhlükəsiz PDF və JPG/JPEG/PNG yükləmək; POST success → private object → DB metadata → getMe/list → mobil kart → restart sonrası görünmə.
- İcazəli owner/admin və icazəli company health sənədi üçün backend download 200; fresh URL GET 200, uyğun content-type. Tam URL/token və response body-ni loglara yazmamaq.
- Eyni sənədi 5 dəqiqədən sonra yenidən açmaq: yeni authorization və fresh link alınır. Köhnə imzanın expiry-dən sonra rəddini ayrıca yoxlamaq.
- Başqa worker/unrelated company və icazəsiz admin üçün 401/403; company CV/criminal üçün 403. `/uploads` vasitəsilə private sənəd/quarantine 404.
- Standart scanner PDF-də təhlükəsiz OpenAction qəbul edilir; JavaScript/embedded/Launch test faylı rədd edilir.
- Real mövcud legacy sənədi DB/R2 dəyişmədən açmaq. Unknown legacy path üçün aydın re-upload mesajı olmalıdır; fərziyyə əsasında migration etməmək.
- Replacement zamanı malware, storage failure və DB rollback: köhnə sənəd qalmalıdır; uğurlu replacement-dən sonra yeni sənəd getMe/restart-da görünməlidir.
- Real iPhone Safari və Android-də CV/arayış açılışı, filename, expiry və Azərbaycan dilində səhvlər yoxlanmalıdır.

Cloudflare konfiqurasiya mənbəyi: [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) — presign yalnız müvəqqəti object icazəsi verir; SDK region `auto`, S3 API endpoint və ayrıca bucket/key istifadə olunur.
