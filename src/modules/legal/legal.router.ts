
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
    '<p>İctimai forma hesabı avtomatik silmir. Müraciət baxış üçün qeydə alınır və hesab sahibliyi ayrıca yoxlanılır. Sahiblik təsdiqləndikdən sonra hesabın silinməsi icra oluna bilər: giriş deaktiv edilir, sessiyalar ləğv olunur, şəxsi profil və əlaqə məlumatları anonimləşdirilir/silinir və şəxsi faylların silinməsi başladılır. Təhlükəsizlik, fırıldaqçılığın qarşısının alınması və qanuni tələblər üçün zəruri minimal audit/əməliyyat qeydləri saxlanıla bilər.</p>',
    '<p><a href="/privacy">Məxfilik Siyasəti</a> · <a href="/terms">İstifadə Qaydaları</a></p>',
    '<script>',
    "const form=document.getElementById('deletion-form');const status=document.getElementById('status');",
    "form.addEventListener('submit',async(e)=>{e.preventDefault();status.textContent='Göndərilir…';const payload={role:form.role.value,identifier:form.identifier.value.trim(),note:form.note.value.trim()||undefined};try{const r=await fetch('/v1/public/account-deletion-requests',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw new Error('request failed');form.reset();status.textContent='Sorğunuz qəbul edildi. Hesab sahibliyi yoxlanıldıqdan sonra silinmə prosesi tamamlanacaq.';}catch(_){status.textContent='Sorğunu göndərmək mümkün olmadı. Bir qədər sonra yenidən cəhd edin.';}});",
    '</script>',
  ].join('');
}

function page(title: string, body: string): string {
  return '<!doctype html><html lang="az"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>' +
    title +
    '</title><style>:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{margin:0;background:#fffaf4;color:#241b1b}main{width:min(860px,calc(100% - 32px));margin:0 auto;padding:48px 0 72px}h1,h2{color:#5d1827;line-height:1.2}h1{font-size:clamp(2rem,5vw,3rem)}h2{margin-top:2rem}p,li{line-height:1.7}a{color:#7b2034}form{display:grid;gap:10px;padding:20px;border:1px solid #e6d8ce;border-radius:18px;background:white}label{font-weight:700;margin-top:6px}input,select,textarea,button{font:inherit;border-radius:10px;padding:12px;border:1px solid #cab9ad}button{background:#681a2c;color:white;border:0;font-weight:700;cursor:pointer;margin-top:8px}#status{min-height:24px;font-weight:600}</style></head><body><main>' +
    body +
    '</main></body></html>';
}

export default legalPagesRouter;
