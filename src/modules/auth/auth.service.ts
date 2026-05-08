import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { signAccessToken, signRefreshToken, verifyToken } from '../../lib/jwt';
import { Errors } from '../../lib/errors';
import { RegisterInput, VerifyOtpInput } from './auth.schema';
import { Role } from '../../types/prisma';

const OTP_EXPIRES_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 3;
const IS_TEST = process.env.NODE_ENV !== 'production';

// ── OTP ──────────────────────────────────────────────────────────────────────

function generateOtp(): string {
  if (IS_TEST) return '123456'; // test mühitində sabit
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendSms(phone: string, code: string): Promise<void> {
  // TODO: real SMS provider inteqrasiyası
  console.log(`[SMS] ${phone} → OTP: ${code}`);
}

// ── AUTH SERVICE ─────────────────────────────────────────────────────────────

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) throw Errors.conflict('Bu telefon artıq qeydiyyatdadır');

  const user = await prisma.user.create({
    data: {
      phone: input.phone,
      role: input.role as Role,
      name: input.name,
    },
  });

  // Profil yarat (company / worker)
  if (input.role === 'company') {
    await prisma.company.create({ data: { user_id: user.id, name: input.name } });
  } else if (input.role === 'worker') {
    await prisma.worker.create({ data: { user_id: user.id } });
  }

  // OTP yarat (ya da yenilə)
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

  await prisma.otp.upsert({
    where: { user_id: user.id },
    update: { code, expires_at: expiresAt, attempts: 0 },
    create: { user_id: user.id, code, expires_at: expiresAt },
  });

  await sendSms(input.phone, code);
  return { user_id: user.id, otp_sent: true };
}

export async function verifyOtp(input: VerifyOtpInput) {
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user) throw Errors.unauthorized('İstifadəçi tapılmadı');

  const otp = await prisma.otp.findUnique({ where: { user_id: user.id } });
  if (!otp) throw Errors.unauthorized('OTP tapılmadı — yenidən göndərin');

  // Cəhd limitini yoxla
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw Errors.tooMany('Çox sayda yanlış cəhd — yeni OTP tələb edin');
  }

  // Vaxt yoxlaması
  if (otp.expires_at < new Date()) {
    throw Errors.unauthorized('OTP-nin vaxtı keçib');
  }

  // Kod yoxlaması
  if (otp.code !== input.otp_code) {
    await prisma.otp.update({
      where: { user_id: user.id },
      data: { attempts: { increment: 1 } },
    });
    throw Errors.unauthorized('OTP yanlışdır');
  }

  // Uğurlu — OTP-ni sil
  await prisma.otp.delete({ where: { user_id: user.id } });

  return buildTokenResponse(user.id, user.role);
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyToken(refreshToken);
  } catch {
    throw Errors.unauthorized('Refresh token etibarsızdır');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expires_at < new Date()) {
    throw Errors.unauthorized('Refresh token etibarsızdır və ya müddəti bitib');
  }

  // Köhnə token-i sil, yenisini ver (token rotation)
  await prisma.refreshToken.delete({ where: { token: refreshToken } });

  return buildTokenResponse(payload.sub, payload.role);
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}

export async function updateFcmToken(userId: string, fcmToken: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { fcm_token: fcmToken } });
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function buildTokenResponse(userId: string, role: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken({ sub: userId, role });

  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      user_id: userId,
      token: refreshToken,
      expires_at: refreshExpiresAt,
    },
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
      created_at: user.created_at,
    },
  };
}
