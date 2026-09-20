
import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma';
import { normalizeEmail } from '../../lib/password';
import { normalizePhone } from '../../lib/phone';
import { Role } from '../../types/prisma';

const legalPagesRouter = Router();
export const publicAccountDeletionRouter = Router();

const AccountDeletionRequestSchema = z.object({
  role: z.enum(['worker', 'company']),
  identifier: z.string().trim().min(3).max(254),
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

async function recordAccountDeletionRequest(
  input: z.infer<typeof AccountDeletionRequestSchema>,
) {
  const rawIdentifier = input.identifier.trim();
  const identifierKind = rawIdentifier.includes('@') ? 'email' : 'phone';
  const normalizedIdentifier =
    identifierKind === 'email'
      ? normalizeEmail(rawIdentifier)
      : normalizePhone(rawIdentifier);

  const user = await prisma.user.findFirst({
    where: {
      role: input.role as Role,
      deleted_at: null,
      ...(identifierKind === 'email'
        ? { OR: [{ email: normalizedIdentifier }, { pending_email: normalizedIdentifier }] }
        : { phone: normalizedIdentifier }),
    },
    select: {
      id: true,
      worker: { select: { id: true, deleted_at: true } },
      company: { select: { id: true, deleted_at: true } },
    },
  });

  // Keep the public response identical whether an account exists or not.
  if (!user) return;

  const profileIsActive =
    input.role === 'worker'
      ? Boolean(user.worker && !user.worker.deleted_at)
      : Boolean(user.company && !user.company.deleted_at);
  if (!profileIsActive) return;

  const requestId = crypto.randomUUID();
  const identifierHash = crypto
    .createHash('sha256')
    .update(normalizedIdentifier)
    .digest('hex');
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['admin', 'super_admin'] },
      is_active: true,
      deleted_at: null,
    },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        actor_id: null,
        actor_role: input.role as Role,
        action: 'status_changed',
        entity_type: 'external_account_deletion_request',
        entity_id: requestId,
        metadata: {
          event: 'account_deletion_requested_from_web',
          status: 'pending_verification',
          source: 'public_web_form',
          requested_role: input.role,
          account_user_id: user.id,
          identifier_kind: identifierKind,
          identifier_sha256: identifierHash,
          note: input.note?.trim() || null,
        },
      },
    });

    for (const admin of admins) {
      await tx.notification.create({
        data: {
          recipient_id: admin.id,
          type: 'system',
          channel: 'in_app',
          title: 'Hesab silmə sorğusu',
          body: 'Web səhifəsindən yeni hesab silmə sorğusu daxil olub.',
          metadata: {
            request_id: requestId,
            account_user_id: user.id,
            requested_role: input.role,
            source: 'public_web_form',
          },
        },
      });
    }
  });
}

function privacyBody(): string {
  return [
    '<h1>SET Service Məxfilik Siyasəti</h1>',
    '<p><strong>Son yenilənmə:</strong> 20 sentyabr 2026</p>',
    '<p>Bu siyasət SET Service Android tətbiqi və əlaqəli xidmətlərin istifadəçi məlumatlarını necə emal etdiyini izah edir.</p>',
    '<h2>Topladığımız məlumatlar</h2>',
    '<ul>',
    '<li><strong>Hesab və əlaqə məlumatları:</strong> ad və soyad, telefon nömrəsi, e-poçt ünvanı, müəssisə adı və əlaqədar şəxs.</li>',
    '<li><strong>İşçi profil məlumatları:</strong> vəzifə, bacarıqlar, dillər, iş təcrübəsi, könüllü gender məlumatı və WhatsApp əlçatanlığı.</li>',
    '<li><strong>Fayllar və sənədlər:</strong> profil şəkli, CV, sağlamlıq arayışı, məhkumluq arayışı və müəssisə qeydiyyat/vergi/lisenziya sənədləri.</li>',
    '<li><strong>Əməliyyat məlumatları:</strong> sifarişlər, iş təsvirləri, iş yeri/məkan mətni, təyinatlar, giriş-çıxış vaxtları, qeydlər, reytinqlər və rəylər.</li>',
    '<li><strong>Texniki və təhlükəsizlik məlumatları:</strong> sessiya və audit qeydləri, IP ünvanı, cihaz/platforma məlumatı, Firebase Cloud Messaging tokeni və tətbiq quraşdırma identifikatoru.</li>',
    '</ul>',
    '<h2>Həssas sənədlər</h2>',
    '<p>Sağlamlıq və məhkumluq arayışları işçi uyğunluğunun və qeydiyyat tələblərinin yoxlanılması üçün istifadə olunur. Sənədlər məhdud girişli saxlamada qorunur. Sağlamlıq arayışı yalnız səlahiyyətli adminlərə və işçi ilə uyğun təyinat əlaqəsi olan təsdiqlənmiş müəssisələrə göstərilə bilər.</p>',
    '<h2>Kamera və məkan</h2>',
    '<p>Android tətbiqi kameradan yalnız QR kodu oxumaq üçün istifadə edir. Kamera görüntüləri SET Service serverlərinə yüklənmir və saxlanılmır. Hazırkı Android tətbiqi dəqiq cihaz məkanına icazə istəmir və istifadəçinin canlı dəqiq fiziki məkanını toplamır. Sifarişdəki məkan müəssisənin daxil etdiyi iş/məkan mətnidir.</p>',
    '<h2>Məlumatlardan istifadə məqsədləri</h2>',
    '<ul><li>hesab yaratmaq, giriş və hesab idarəetməsi;</li><li>işçi və müəssisə uyğunluğunu/təsdiqini yoxlamaq;</li><li>sifariş, təyinat, QR giriş-çıxış və reytinq funksiyalarını təmin etmək;</li><li>push və xidmət bildirişləri göndərmək;</li><li>təhlükəsizlik, fırıldaqçılığın qarşısının alınması, audit və texniki nasazlıqların araşdırılması;</li><li>qanuni və tənzimləyici öhdəliklərə əməl etmək.</li></ul>',
    '<h2>Məlumatların paylaşılması</h2>',
    '<p>Məlumatlar yalnız funksiyanın işləməsi üçün zəruri olduqda səlahiyyətli istifadəçilər və texniki xidmət təminatçıları ilə paylaşılır. SET Service hostinq/saxlama və push bildirişləri üçün xidmət təminatçılarından, o cümlədən Firebase Cloud Messaging-dən istifadə edə bilər. İstifadəçi məlumatları reklam məqsədilə satılmır və tətbiq Advertising ID istifadə etmir.</p>',
    '<h2>Təhlükəsizlik</h2>',
    '<p>Production şəbəkə trafiki HTTPS/TLS ilə şifrələnir. Həssas sənədlər məhdud giriş və müddətli imzalanmış keçidlər vasitəsilə təqdim olunur. Giriş nəzarəti, sessiya ləğvi, audit qeydləri və fayl təhlükəsizlik yoxlamaları tətbiq olunur.</p>',
    '<h2>Hesab və məlumatların silinməsi</h2>',
    '<p>İstifadəçilər tətbiq daxilindən və ya <a href="/account-deletion">hesab silmə səhifəsindən</a> hesablarının və əlaqəli şəxsi məlumatlarının silinməsini tələb edə bilərlər. Silinmə zamanı giriş deaktiv edilir, sessiyalar ləğv olunur, şəxsi profil məlumatları anonimləşdirilir/silinir və saxlanılan şəxsi faylların silinməsi başladılır. Təhlükəsizlik, fırıldaqçılığın qarşısının alınması və qanuni öhdəliklər üçün zəruri minimal audit/əməliyyat qeydləri əsaslandırılan müddət ərzində saxlanıla bilər.</p>',
    '<h2>Yaş məhdudiyyəti</h2><p>SET Service peşəkar işçi və müəssisə istifadəsi üçün nəzərdə tutulub və 18 yaşdan kiçik şəxslər üçün hədəflənməyib.</p>',
    '<h2>Əlaqə</h2><p>Məxfilik və hesab silmə məsələləri üçün tətbiqdəki dəstək kanallarından və ya <a href="/account-deletion">hesab silmə formasından</a> istifadə edin. Qaynar xətt: +994 70 231 51 51.</p>',
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
    '<p>İşçi uyğunluğunun yoxlanması üçün sağlamlıq və məhkumluq arayışları, müəssisə təsdiqi üçün isə korporativ sənədlər tələb oluna bilər. Saxta və ya dəyişdirilmiş sənəd təqdim etmək qadağandır.</p>',
    '<h2>Hesabın dayandırılması və silinməsi</h2>',
    '<p>Qaydaların, təhlükəsizlik tələblərinin və ya qanunların pozulması hesabın dayandırılması və ya deaktiv edilməsi ilə nəticələnə bilər. İstifadəçi tətbiq daxilindən və ya <a href="/account-deletion">hesab silmə səhifəsindən</a> hesabının silinməsini tələb edə bilər.</p>',
    '<h2>Məxfilik</h2><p>Şəxsi məlumatların emalı <a href="/privacy">SET Service Məxfilik Siyasəti</a> ilə tənzimlənir.</p>',
  ].join('');
}

function accountDeletionBody(): string {
  return [
    '<h1>SET Service hesabının silinməsi</h1>',
    '<p>Bu səhifə SET Service Android tətbiqinin istifadəçilərinə tətbiqi yenidən quraşdırmadan hesab və əlaqəli şəxsi məlumatların silinməsini tələb etməyə imkan verir.</p>',
    '<p>Tətbiqə daxil ola bilirsinizsə, hesab parametrlərindəki <strong>Hesabı sil</strong> seçimi ən sürətli yoldur. Daxil ola bilmirsinizsə, aşağıdakı formanı göndərin.</p>',
    '<form id="deletion-form">',
    '<label for="role">Hesab növü</label><select id="role" name="role" required><option value="worker">İşçi</option><option value="company">Müəssisə</option></select>',
    '<label for="identifier">Hesaba bağlı telefon və ya e-poçt</label><input id="identifier" name="identifier" required maxlength="254" placeholder="+994... və ya email@example.com" />',
    '<label for="note">Əlavə qeyd (istəyə bağlı)</label><textarea id="note" name="note" maxlength="1000" rows="4"></textarea>',
    '<button type="submit">Silinmə sorğusu göndər</button><p id="status" role="status" aria-live="polite"></p>',
    '</form>',
    '<h2>Nə silinir?</h2>',
    '<p>Sorğu təsdiqləndikdən sonra hesab girişiniz deaktiv edilir, sessiyalar ləğv olunur, şəxsi profil və əlaqə məlumatları anonimləşdirilir/silinir və hesabla bağlı saxlanılan şəxsi faylların silinməsi başladılır. Təhlükəsizlik, fırıldaqçılığın qarşısının alınması və qanuni tələblər üçün zəruri minimal audit/əməliyyat qeydləri saxlanıla bilər.</p>',
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
