
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { recordAccountDeletionRequest } from './account-deletion.service';

const legalPagesRouter = Router();
export const publicAccountDeletionRouter = Router();

const AccountDeletionRequestSchema = z.object({
  role: z.enum(['worker', 'company']),
  identifier: z.string().trim().min(3).max(254).refine(
    (value) => !value.includes('@') || z.string().email().max(254).safeParse(value).success,
    'Düzgün telefon nömrəsi və ya e-poçt ünvanı daxil edin.',
  ),
  note: z.string().trim().max(1000).optional(),
}).strict();

legalPagesRouter.get('/privacy', (_req, res) => {
  res.status(200).type('html').set('Cache-Control', 'public, max-age=3600').send(
    page('SET Service Məxfilik Siyasəti', privacyBody()),
  );
});

legalPagesRouter.get('/terms', (_req, res) => {
  res.status(200).type('html').set('Cache-Control', 'public, max-age=3600').send(
    page('SET Service İstifadə Qaydaları', termsBody()),
  );
});

legalPagesRouter.get('/account-deletion', (_req, res) => {
  res.status(200).type('html').set('Cache-Control', 'no-store').send(
    page('SET Service hesabının silinməsi', accountDeletionBody()),
  );
});

legalPagesRouter.get('/data-deletion', (_req, res) => {
  res.status(200).type('html').set('Cache-Control', 'no-store').send(
    page('SET Service məlumatların silinməsi', dataDeletionBody()),
  );
});

publicAccountDeletionRouter.post(
  '/account-deletion-requests',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = AccountDeletionRequestSchema.parse(req.body);
      await recordAccountDeletionRequest(input);
      res.status(202).json({
        status: 'accepted',
        message: 'Sorğunuz qəbul edildi. Hesab mövcuddursa, hesab sahibliyi yoxlanıldıqdan sonra silinmə prosesi tamamlanacaq.',
      });
    } catch (error) {
      next(error);
    }
  },
);

function privacyBody(): string {
  return [
    '<h1>SET Service Privacy Policy / Məxfilik Siyasəti</h1>',
    '<p><strong>Last updated / Son yenilənmə:</strong> 6 October 2026 / 6 oktyabr 2026</p>',

    '<h2>English</h2>',
    '<p>This Privacy Policy explains how the <strong>SET Service</strong> Android and iOS applications and related services collect, use, store, disclose, and delete user information. SET Service is intended for users aged 18 and over.</p>',

    '<h3>1. Information we collect</h3>',
    '<ul>',
    '<li><strong>Account and contact information:</strong> name, phone number, email address, company name, and related account information.</li>',
    '<li><strong>Worker profile information:</strong> job position, skills, languages, work history, availability, optional gender information, WhatsApp availability, profile photo, and ratings.</li>',
    '<li><strong>Sensitive documents:</strong> CV, health certificate, criminal-record certificate, and company registration, tax, licence, or similar verification documents when users choose or are asked to provide them.</li>',
    '<li><strong>Operational information:</strong> orders, job descriptions, workplace/location text entered by companies, assignments, attendance/check-in and check-out times, notes, ratings, reports, and moderation information.</li>',
    '<li><strong>Technical and security information:</strong> authentication/session information, audit and security logs, IP address, device/platform information, Firebase Cloud Messaging token, and application installation/device identifiers used for security and notifications.</li>',
    '</ul>',

    '<h3>2. Camera, files, notifications, and location</h3>',
    '<p>The mobile app uses the camera for QR-code scanning. Camera images used for QR scanning are not intentionally uploaded to or stored by SET Service. Users may select files or photos when uploading profile images and documents. Push-notification permission may be requested to deliver service notifications. The current Android and iOS applications do not request precise or approximate device-location permission and do not collect live GPS location. A workplace/location shown in an order is text entered by a company or authorised user.</p>',

    '<h3>3. How we use information</h3>',
    '<ul>',
    '<li>to create, authenticate, secure, and manage accounts;</li>',
    '<li>to operate worker, company, administrator, order, assignment, attendance, QR, notification, rating, reporting, and moderation features;</li>',
    '<li>to review account and profile eligibility and verification information;</li>',
    '<li>to provide customer support and communicate service-related information;</li>',
    '<li>to prevent fraud, abuse, unauthorised access, malware, and other security threats;</li>',
    '<li>to investigate technical issues and maintain audit records;</li>',
    '<li>to comply with applicable legal and regulatory obligations.</li>',
    '</ul>',

    '<h3>4. Sensitive documents</h3>',
    '<p>Health certificates, criminal-record certificates, CVs, and company verification documents are treated as restricted data. They are stored using access-controlled storage and are made available only to authorised roles when required for a legitimate SET Service function. A criminal-record certificate is not made available to company users. A health certificate may be made available only where the application authorises the requesting role and relationship. Uploaded files are subject to security and malware checks.</p>',

    '<h3>5. Service providers and data disclosure</h3>',
    '<p>SET Service does not sell personal data for advertising. Information may be processed by service providers that support the operation and security of the service, including database infrastructure, cloud/object storage, hosting, push notifications, email/SMS delivery, malware scanning, and error/security monitoring. Current infrastructure may include Neon for PostgreSQL database hosting, Cloudflare R2 for object storage, Firebase Cloud Messaging for push notifications, communications providers for email/SMS delivery, and Sentry when error monitoring is enabled. These providers receive only the information reasonably necessary to provide the relevant service.</p>',
    '<p>Information may also be disclosed where required by law, to protect users or the service, or to authorised Worker, Company, Admin, or Super Admin users where the relevant product feature requires that access.</p>',

    '<h3>6. Security</h3>',
    '<p>Production network traffic is protected with HTTPS/TLS. SET Service applies role-based access controls, password hashing, session controls, audit logging, rate limiting, malware scanning for uploaded files, and restricted access to sensitive documents. Sensitive document downloads use controlled, short-lived access mechanisms where applicable. No internet service can guarantee absolute security, but reasonable technical and organisational safeguards are used to reduce risk.</p>',

    '<h3>7. Retention and deletion</h3>',
    '<p>Personal data is retained only for as long as needed for the purposes described in this policy, account operation, security, dispute handling, fraud prevention, and applicable legal obligations. Security, audit, and operational records may be retained for a limited period after account deletion where reasonably necessary for those purposes. Data that is no longer required is deleted or anonymised according to the service retention process.</p>',
    '<p>Worker and Company users can request deletion from within the app. Users who cannot access the app can use the public <a href="/account-deletion">Account Deletion page</a>. When an authenticated deletion request is completed, account access is disabled, active sessions are revoked, personal profile/contact information is deleted or anonymised, and deletion of associated private files is initiated. A public web request is verified before account deletion is completed.</p>',

    '<h3>8. Children</h3>',
    '<p>SET Service is a professional workforce and business service intended for users aged <strong>18 and over</strong>. It is not directed to children.</p>',

    '<h3>9. Your choices and rights</h3>',
    '<p>Users may update supported profile information in the app and may request account deletion. Where applicable under local law, users may also request information about their personal data or raise a privacy concern through the available support channels.</p>',

    '<h3>10. Contact</h3>',
    '<p>For privacy or account-deletion enquiries, use the <a href="/account-deletion">Account Deletion page</a> or the SET Service support channels. Support phone: +994 70 231 51 51.</p>',

    '<hr />',
    '<h2>Azərbaycan dili</h2>',
    '<p>Bu Məxfilik Siyasəti <strong>SET Service</strong> Android və iOS tətbiqlərinin və əlaqəli xidmətlərin istifadəçi məlumatlarını necə topladığını, istifadə etdiyini, saxladığını, paylaşdığını və sildiyini izah edir. SET Service 18 yaş və yuxarı istifadəçilər üçün nəzərdə tutulub.</p>',

    '<h3>1. Topladığımız məlumatlar</h3>',
    '<ul>',
    '<li><strong>Hesab və əlaqə məlumatları:</strong> ad, telefon nömrəsi, e-poçt ünvanı, müəssisə adı və hesabla əlaqəli məlumatlar.</li>',
    '<li><strong>İşçi profil məlumatları:</strong> vəzifə, bacarıqlar, dillər, iş təcrübəsi, əlçatanlıq, istəyə bağlı gender məlumatı, WhatsApp əlçatanlığı, profil şəkli və reytinqlər.</li>',
    '<li><strong>Həssas sənədlər:</strong> CV, sağlamlıq arayışı, məhkumluq arayışı və istifadəçi tərəfindən təqdim edilən müəssisə qeydiyyat, vergi, lisenziya və digər yoxlama sənədləri.</li>',
    '<li><strong>Əməliyyat məlumatları:</strong> sifarişlər, iş təsvirləri, müəssisə tərəfindən daxil edilən iş/məkan mətni, təyinatlar, giriş-çıxış vaxtları, qeydlər, reytinqlər, şikayətlər və moderasiya məlumatları.</li>',
    '<li><strong>Texniki və təhlükəsizlik məlumatları:</strong> autentifikasiya və sessiya məlumatları, audit və təhlükəsizlik qeydləri, IP ünvanı, cihaz/platforma məlumatı, Firebase Cloud Messaging tokeni və təhlükəsizlik/bildiriş məqsədli tətbiq və cihaz identifikatorları.</li>',
    '</ul>',

    '<h3>2. Kamera, fayllar, bildirişlər və məkan</h3>',
    '<p>Kamera QR kodların oxunması üçün istifadə olunur. QR oxunması zamanı kamera görüntüləri SET Service serverlərinə qəsdən yüklənmir və saxlanılmır. Profil şəkli və sənədlər üçün istifadəçi fayl və ya şəkil seçə bilər. Xidmət bildirişləri üçün push icazəsi istənilə bilər. Hazırkı Android və iOS tətbiqləri dəqiq və ya təxmini cihaz məkanı icazəsi istəmir və canlı GPS məkanı toplamır. Sifarişdə görünən iş/məkan məlumatı müəssisə və ya səlahiyyətli istifadəçinin daxil etdiyi mətndir.</p>',

    '<h3>3. Məlumatlardan istifadə məqsədləri</h3>',
    '<ul>',
    '<li>hesabların yaradılması, giriş, təhlükəsizlik və idarə olunması;</li>',
    '<li>işçi, müəssisə, admin, sifariş, təyinat, davamiyyət, QR, bildiriş, reytinq, hesabat və moderasiya funksiyalarının təmin olunması;</li>',
    '<li>profil və uyğunluq/yoxlama məlumatlarının nəzərdən keçirilməsi;</li>',
    '<li>dəstək və xidmətlə bağlı kommunikasiyalar;</li>',
    '<li>fırıldaqçılıq, sui-istifadə, icazəsiz giriş, zərərli fayl və digər təhlükəsizlik risklərinin qarşısının alınması;</li>',
    '<li>texniki problemlərin araşdırılması və audit qeydlərinin saxlanması;</li>',
    '<li>qanuni öhdəliklərin yerinə yetirilməsi.</li>',
    '</ul>',

    '<h3>4. Həssas sənədlər</h3>',
    '<p>Sağlamlıq arayışları, məhkumluq arayışları, CV-lər və müəssisə yoxlama sənədləri məhdud girişli məlumat kimi qorunur. Bu sənədlər yalnız SET Service funksiyası üçün əsaslandırılmış ehtiyac olduqda səlahiyyətli rollara açılır. Məhkumluq arayışı müəssisə istifadəçilərinə göstərilmir. Sağlamlıq arayışına yalnız tətbiqin icazə verdiyi rol və əlaqə daxilində giriş verilə bilər. Yüklənən fayllar təhlükəsizlik və zərərli proqram yoxlamalarından keçirilir.</p>',

    '<h3>5. Xidmət təminatçıları və məlumatların paylaşılması</h3>',
    '<p>SET Service şəxsi məlumatları reklam məqsədilə satmır. Xidmətin işləməsi və təhlükəsizliyi üçün məlumatlar database infrastrukturu, cloud/object storage, hostinq, push bildiriş, e-poçt/SMS çatdırılması, zərərli fayl skanı və xəta/təhlükəsizlik monitorinqi təminatçıları tərəfindən emal oluna bilər. Mövcud infrastrukturda PostgreSQL üçün Neon, object storage üçün Cloudflare R2, push bildirişləri üçün Firebase Cloud Messaging, e-poçt/SMS üçün kommunikasiya təminatçıları və aktiv olduqda xəta monitorinqi üçün Sentry istifadə oluna bilər.</p>',

    '<h3>6. Təhlükəsizlik</h3>',
    '<p>Production trafiki HTTPS/TLS ilə qorunur. Rol əsaslı giriş nəzarəti, parol hash-lənməsi, sessiya nəzarəti, audit qeydləri, rate limiting, yüklənmiş faylların malware skanı və həssas sənədlər üçün məhdud giriş tətbiq edilir. Uyğun hallarda həssas fayllar qısa müddətli nəzarətli keçidlərlə təqdim olunur.</p>',

    '<h3>7. Saxlanma və silinmə</h3>',
    '<p>Şəxsi məlumatlar yalnız bu siyasətdə göstərilən məqsədlər, hesabın işləməsi, təhlükəsizlik, mübahisələrin həlli, fırıldaqçılığın qarşısının alınması və qanuni tələblər üçün lazım olan müddətdə saxlanılır. Hesab silindikdən sonra zəruri minimal təhlükəsizlik, audit və əməliyyat qeydləri əsaslandırılmış məhdud müddət ərzində saxlanıla bilər. Artıq lazım olmayan məlumatlar silinir və ya anonimləşdirilir.</p>',
    '<p>İşçi və Müəssisə istifadəçiləri tətbiq daxilindən hesab silinməsi tələb edə bilərlər. Tətbiqə daxil ola bilməyən istifadəçilər <a href="/account-deletion">Hesab Silmə səhifəsindən</a> istifadə edə bilər. Təsdiqlənmiş silinmə tamamlandıqda hesab girişi deaktiv edilir, aktiv sessiyalar ləğv olunur, şəxsi profil və əlaqə məlumatları silinir və ya anonimləşdirilir və əlaqəli şəxsi faylların silinməsi başladılır.</p>',

    '<h3>8. Yaş məhdudiyyəti</h3>',
    '<p>SET Service peşəkar işçi və müəssisə platformasıdır və yalnız <strong>18 yaş və yuxarı</strong> istifadəçilər üçün nəzərdə tutulub. Uşaqları hədəfləmir.</p>',

    '<h3>9. İstifadəçi seçimləri və hüquqları</h3>',
    '<p>İstifadəçilər tətbiqdə dəstəklənən profil məlumatlarını dəyişə və hesablarının silinməsini tələb edə bilərlər. Tətbiq olunan yerli qanunvericiliyə uyğun olaraq şəxsi məlumatlar barədə sorğu və ya məxfilik şikayəti də göndərilə bilər.</p>',

    '<h3>10. Əlaqə</h3>',
    '<p>Məxfilik və hesab silmə məsələləri üçün <a href="/account-deletion">Hesab Silmə səhifəsindən</a> və ya SET Service dəstək kanallarından istifadə edin. Qaynar xətt: +994 70 231 51 51.</p>',
  ].join('');
}

function termsBody(): string {
  return [
    '<h1>SET Service İstifadə Qaydaları</h1>',
    '<p><strong>Son yenilənmə:</strong> 20 sentyabr 2026</p>',
    '<p>SET Service-dən istifadə etməklə aşağıdakı qaydaları qəbul edirsiniz.</p>',
    '<h2>Uyğunluq və hesablar</h2>',
    '<p>Xidmət 18 yaş və yuxarı peşəkar istifadəçilər və müəssisələr üçün nəzərdə tutulub. Qeydiyyat zamanı düzgün və aktual məlumat təqdim etməli və hesab giriş məlumatlarınızı qorumalısınız.</p>',
    '<h2>Platformanın məqsədi</h2>',
    '<p>SET Service işçi profilləri, müəssisə sifarişləri, təyinatlar, QR əsaslı giriş-çıxış, bildirişlər və reytinq funksiyalarını idarə edən workforce/service platformasıdır. SET Service bank, kredit, ödəniş cüzdanı və ya investisiya xidməti deyil.</p>',
    '<h2>İstifadəçi tərəfindən yaradılan məzmun</h2>',
    '<p>Profil məlumatları, sifariş başlığı və təsviri, qeydlər, reytinqlər və rəylər istifadəçi tərəfindən yaradılan məzmun ola bilər. Qanunsuz, təhdidedici, təhqiredici, ayrı-seçkilik yaradan, seksual, saxta, aldadıcı, spam və ya başqasının məxfi məlumatını icazəsiz açıqlayan məzmun qadağandır.</p>',
    '<p>İstifadəçilər tətbiq daxilində uyğun olmayan məzmunu və ya profili şikayət edə bilərlər. SET Service şikayətləri araşdırmaq, məzmunu məhdudlaşdırmaq/silmək və qaydaları pozan hesabları dayandırmaq hüququnu saxlayır.</p>',
    '<h2>Sənədlər</h2>',
    '<p>SET Service uyğunluq və yoxlama məqsədilə sağlamlıq, məhkumluq, CV və digər təsdiq sənədlərinin təqdim edilməsinə imkan verir və müəyyən iş proseslərində bu sənədlər tələb oluna bilər. Sənədlərin mövcudluğu admin tərəfindən işçi hesabının ilkin təsdiqini avtomatik bloklamır. Saxta və ya dəyişdirilmiş sənəd təqdim etmək qadağandır.</p>',
    '<h2>Hesabın dayandırılması və silinməsi</h2>',
    '<p>Qaydaların, təhlükəsizlik tələblərinin və ya qanunların pozulması hesabın dayandırılması və ya deaktiv edilməsi ilə nəticələnə bilər. İstifadəçi tətbiq daxilindən və ya <a href="/account-deletion">hesab silmə səhifəsindən</a> hesabının silinməsini tələb edə bilər.</p>',
    '<h2>Məxfilik</h2><p>Şəxsi məlumatların emalı <a href="/privacy">SET Service Məxfilik Siyasəti</a> ilə tənzimlənir.</p>',
  ].join('');
}

function dataDeletionBody(): string {
  return [
    '<h1>SET Service məlumatların silinməsi / Data deletion</h1>',
    '<p>Bu səhifə SET Service istifadəçilərinə hesabı silmədən müəyyən şəxsi məlumatların necə silinə biləcəyini izah edir.</p>',
    '<h2>Hesabı silmədən hansı məlumatları silmək olar?</h2>',
    '<p>İşçi istifadəçiləri yüklədikləri CV sənədini hesablarını silmədən tətbiq daxilindən silə bilərlər.</p>',
    '<h2>CV-ni silmək üçün addımlar</h2>',
    '<ol><li>SET Service tətbiqinə daxil olun.</li><li><strong>Profilim</strong> bölməsini açın.</li><li>CV/sənədlər hissəsinə keçin.</li><li>CV üçün <strong>Sil</strong> əməliyyatını seçin və təsdiqləyin.</li></ol>',
    '<p>Silinmə təsdiqləndikdən sonra CV profilinizdən çıxarılır və əlaqəli saxlanılan faylın silinməsi başladılır. İş təcrübəsi kimi ayrıca profil sahələri CV faylı silindikdə avtomatik silinmir; istifadəçi dəstəklənən profil məlumatlarını tətbiqdən redaktə edə bilər.</p>',
    '<h2>Digər məlumatlar</h2>',
    '<p>Digər şəxsi məlumatlarla bağlı silinmə və ya məxfilik sorğusu üçün SET Service dəstək kanallarından istifadə edin. Bütün hesabı və əlaqəli şəxsi məlumatları silmək üçün <a href="/account-deletion">Hesab Silmə səhifəsindən</a> istifadə edin.</p>',
    '<h2>Saxlanılan məlumatlar və müddət</h2>',
    '<p>Təhlükəsizlik, fırıldaqçılığın qarşısının alınması, audit, mübahisələrin həlli və qanuni öhdəliklər üçün zəruri minimal qeydlər məhdud müddət saxlanıla bilər: audit qeydləri maksimum 365 gün, müddəti bitmiş və ya ləğv olunmuş refresh-token qeydləri maksimum 90 gün, OTP qeydləri isə müddəti bitdikdən sonra maksimum 30 gün. Artıq lazım olmayan məlumatlar silinir və ya anonimləşdirilir.</p>',
    '<hr />',
    '<h2>English</h2>',
    '<p>This page explains how SET Service users can delete certain personal data without deleting their account.</p>',
    '<h3>Delete an uploaded CV</h3>',
    '<ol><li>Sign in to the SET Service app.</li><li>Open <strong>My Profile</strong>.</li><li>Open the CV/documents section.</li><li>Select <strong>Delete</strong> for the CV and confirm.</li></ol>',
    '<p>After confirmation, the CV is removed from the profile and deletion of the associated stored file is initiated. Separately entered profile information, such as work-history fields, is not automatically deleted when the CV file is deleted.</p>',
    '<p>For other privacy or deletion requests, use the SET Service support channels. To delete the entire account and associated personal data, use the <a href="/account-deletion">Account Deletion page</a>.</p>',
    '<p>Limited security and operational records may be retained where reasonably necessary: audit records for up to 365 days, expired or revoked refresh-token records for up to 90 days, and expired OTP records for up to 30 days. Data that is no longer required is deleted or anonymised.</p>',
  ].join('');
}

function accountDeletionBody(): string {
  return [
    '<h1>SET Service hesabının silinməsi</h1>',
    '<p>Bu səhifə SET Service mobil tətbiqlərinin (Android və iOS) istifadəçilərinə tətbiqi yenidən quraşdırmadan hesab və əlaqəli şəxsi məlumatların silinməsini tələb etməyə imkan verir.</p>',
    '<p>Tətbiqə daxil ola bilirsinizsə, hesab parametrlərindəki <strong>Hesabı sil</strong> seçimi ən sürətli yoldur. Daxil ola bilmirsinizsə, aşağıdakı formanı göndərin.</p>',
    '<form id="deletion-form">',
    '<label for="role">Hesab növü</label><select id="role" name="role" required><option value="worker">İşçi</option><option value="company">Müəssisə</option></select>',
    '<label for="identifier">Hesaba bağlı telefon və ya e-poçt</label><input id="identifier" name="identifier" required maxlength="254" placeholder="+994... və ya email@example.com" />',
    '<label for="note">Əlavə qeyd (istəyə bağlı)</label><textarea id="note" name="note" maxlength="1000" rows="4"></textarea>',
    '<button type="submit">Silinmə sorğusu göndər</button><p id="status" role="status" aria-live="polite"></p>',
    '</form>',
    '<h2>Nə silinir?</h2>',
    '<p>İctimai forma hesabı avtomatik silmir. Müraciət baxış üçün qeydə alınır və hesab sahibliyi ayrıca yoxlanılır. Sahiblik təsdiqləndikdən sonra giriş deaktiv edilir, aktiv sessiyalar ləğv olunur, şəxsi profil və əlaqə məlumatları silinir və ya anonimləşdirilir, şəxsi faylların silinməsi başladılır. Təhlükəsizlik və qanuni öhdəliklər üçün məhdud qeydlər saxlanıla bilər: audit qeydləri maksimum 365 gün, müddəti bitmiş və ya ləğv olunmuş refresh-token qeydləri maksimum 90 gün, OTP qeydləri isə müddəti bitdikdən sonra maksimum 30 gün.</p>',
    '<p><a href="/privacy">Məxfilik Siyasəti</a> · <a href="/terms">İstifadə Qaydaları</a></p>',
    '<script>',
    "const form=document.getElementById('deletion-form');const status=document.getElementById('status');",
    "form.addEventListener('submit',async(e)=>{e.preventDefault();status.textContent='Göndərilir…';const payload={role:form.role.value,identifier:form.identifier.value.trim(),note:form.note.value.trim()||undefined};try{const r=await fetch('/v1/public/account-deletion-requests',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw new Error('request failed');form.reset();status.textContent='Sorğunuz qəbul edildi. Hesab sahibliyi yoxlanıldıqdan sonra silinmə prosesi tamamlanacaq.';}catch(_){status.textContent='Sorğunu göndərmək mümkün olmadı. Bir qədər sonra yenidən cəhd edin.';}});",
    '</script>',
  ].join('');
}

function page(title: string, body: string): string {
  return '<!doctype html><html lang="az"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><meta name="theme-color" content="#ffffff"><title>' +
    title +
    '</title><style>' +
    ':root{font-family:Arial,Helvetica,sans-serif;color-scheme:light;--black:#111111;--text:#252525;--muted:#666666;--line:#e6e6e6;--soft:#f8f8f8;--white:#ffffff}' +
    '*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--white);color:var(--text);-webkit-font-smoothing:antialiased}' +
    'a{color:var(--black);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}a:hover{color:#555555}' +
    '.topbar{background:var(--white);border-bottom:1px solid var(--line)}' +
    '.nav{width:min(980px,calc(100% - 32px));min-height:72px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:28px}' +
    '.brand{display:flex;align-items:center;gap:12px;color:var(--black);text-decoration:none;font-size:18px;font-weight:700}.brandmark{width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--black);background:var(--white);color:var(--black);font-size:11px;font-weight:700;letter-spacing:.04em}' +
    '.links{display:flex;align-items:center;gap:22px;flex-wrap:wrap}.links a{color:#4d4d4d;text-decoration:none;font-size:13px;font-weight:600}.links a:hover{color:var(--black);text-decoration:underline}' +
    '.hero{width:min(820px,calc(100% - 32px));margin:46px auto 0;padding:0 0 18px;border-bottom:1px solid var(--line)}' +
    '.eyebrow{font-size:12px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:#777777}' +
    'main{width:min(820px,calc(100% - 32px));margin:0 auto 80px}.content{padding:34px 0 0}' +
    'h1,h2,h3{color:var(--black);font-weight:700;letter-spacing:-.015em}' +
    'h1{font-size:clamp(2rem,5vw,3rem);line-height:1.12;margin:0 0 26px}' +
    'h2{font-size:1.45rem;line-height:1.3;margin:52px 0 18px;padding-top:30px;border-top:1px solid var(--line)}' +
    'h3{font-size:1.08rem;line-height:1.4;margin:34px 0 12px}' +
    'p{font-size:15.5px;line-height:1.8;margin:0 0 20px;color:var(--text)}' +
    'ul,ol{margin:0 0 24px;padding-left:26px}li{font-size:15.5px;line-height:1.75;padding-left:3px;color:var(--text)}li+li{margin-top:9px}' +
    'strong{color:var(--black);font-weight:700}hr{border:0;border-top:1px solid var(--line);margin:52px 0}' +
    'form{display:grid;gap:16px;margin:30px 0 42px;padding:26px;border:1px solid #d9d9d9;background:var(--soft)}' +
    'label{display:block;margin-top:2px;color:var(--black);font-size:14px;font-weight:700}' +
    'input,select,textarea,button{width:100%;font:inherit;font-size:15px;padding:13px 14px;border:1px solid #bdbdbd;border-radius:4px;background:var(--white);color:var(--black);outline:none}' +
    'input:focus,select:focus,textarea:focus{border-color:var(--black);box-shadow:0 0 0 1px var(--black)}textarea{min-height:116px;resize:vertical}' +
    'button{margin-top:4px;border-color:var(--black);background:var(--black);color:var(--white);font-weight:700;cursor:pointer}button:hover{background:#333333}' +
    '#status{min-height:22px;margin:0;font-size:14px;font-weight:600;color:var(--black)}' +
    '.footer{border-top:1px solid var(--line);background:var(--white)}.footerin{width:min(820px,calc(100% - 32px));margin:0 auto;padding:28px 0 36px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;color:var(--muted);font-size:12.5px;line-height:1.6}.footer a{font-size:12.5px}' +
    '@media(max-width:700px){.nav{min-height:64px}.links{display:none}.hero{margin-top:28px;padding-bottom:14px}.content{padding-top:26px}h1{font-size:2rem;margin-bottom:22px}h2{font-size:1.3rem;margin-top:42px;padding-top:24px}h3{margin-top:28px}p,li{font-size:15px}form{padding:20px;margin:26px 0 36px}.footerin{display:block}.footerin span{display:block;margin-bottom:8px}}' +
    '</style></head><body>' +
    '<header class="topbar"><nav class="nav" aria-label="Legal navigation"><a class="brand" href="/privacy"><span class="brandmark">SET</span><span>SET Service</span></a><div class="links"><a href="/privacy">Privacy Policy</a><a href="/data-deletion">Data Deletion</a><a href="/account-deletion">Account Deletion</a><a href="/terms">Terms</a></div></nav></header>' +
    '<section class="hero"><span class="eyebrow">Legal information</span></section>' +
    '<main><article class="content">' + body + '</article></main>' +
    '<footer class="footer"><div class="footerin"><span>© 2026 SET Service</span><span><a href="/privacy">Privacy Policy</a> · <a href="/data-deletion">Data Deletion</a> · <a href="/account-deletion">Account Deletion</a> · <a href="/terms">Terms</a></span></div></footer>' +
    '</body></html>';
}
export default legalPagesRouter;
