import { prisma } from '../../lib/prisma';
import { signAccessToken, signRefreshToken, verifyToken } from '../../lib/jwt';
import { Errors } from '../../lib/errors';
import { generateNumericCode, hmacSha256, safeCompareHex, sha256 } from '../../lib/crypto';
import { normalizePhone } from '../../lib/phone';
import { recordAudit } from '../../lib/audit';
import {
  AdminLoginInput,
  CompanyLoginInput,
  CompanyRegisterInput,
  RegisterInput,
  VerifyOtpInput,
  WorkerLoginInput,
  WorkerRegisterInput,
  WorkerRequestOtpInput,
} from './auth.schema';
import { CompanyStatus, OtpPurpose, Role, WorkerStatus } from '../../types/prisma';

const OTP_EXPIRES_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_BLOCK_MS = 15 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
const OTP_RATE_MAX_BY_PHONE = 5;
const OTP_RATE_MAX_BY_IP = 20;

type Bucket = { count: number; reset_at: number };
const buckets = new Map<string, Bucket>();

function consumeRateLimit(key: string, max: number): void {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.reset_at <= now) {
    buckets.set(key, { count: 1, reset_at: now + OTP_RATE_WINDOW_MS });
    return;
  }

  if (current.count >= max) {
    throw Errors.tooMany('Too many OTP requests. Please try again later.', 'OTP_RATE_LIMITED', {
      retry_after_seconds: Math.ceil((current.reset_at - now) / 1000),
    });
  }

  current.count += 1;
}

function generateOtp(): string {
  if (process.env.NODE_ENV !== 'production' && process.env.OTP_TEST_MODE !== 'false') {
    return process.env.OTP_TEST_CODE ?? '123456';
  }

  return generateNumericCode(6);
}

async function sendSms(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
  const canLogCode = process.env.NODE_ENV !== 'production' && process.env.OTP_LOG_CODES !== 'false';
  if (canLogCode) {
    console.log(`[OTP DEV] ${phone} ${purpose}: ${code}`);
    return;
  }

  // Real SMS provider integration belongs here. The service boundary is kept
  // small so Redis/SMS providers can replace this without touching auth flow.
  console.log(`[OTP] queued for ${phone} (${purpose})`);
}

function otpHash(phone: string, purpose: OtpPurpose, code: string): string {
  return hmacSha256(`${phone}:${purpose}:${code}`, process.env.OTP_PEPPER ?? process.env.JWT_SECRET ?? 'dev-otp-pepper');
}

export async function register(input: RegisterInput, ip?: string) {
  if (input.role === 'company') {
    return registerCompany({
      name: input.name,
      contact_name: input.contact_name ?? input.name,
      phone: input.phone,
      docs_url: input.docs_url,
      documents: input.documents ?? [],
    }, ip);
  }

  return registerWorker({
    full_name: input.full_name ?? input.name ?? '',
    phone: input.phone,
    position: input.position,
    skills: input.skills ?? [],
    languages: input.languages ?? [],
    documents: input.documents ?? [],
  }, ip);
}

export async function registerWorker(input: WorkerRegisterInput, ip?: string) {
  const phone = normalizePhone(input.phone);
  const existing = await prisma.user.findUnique({ where: { phone }, include: { worker: true } });

  if (existing) {
    if (existing.role === 'worker' && existing.worker?.status === 'pending_otp') {
      await requestOtp({
        phone,
        purpose: 'worker_registration',
        user_id: existing.id,
        ip_address: ip,
      });
      return {
        user_id: existing.id,
        worker_id: existing.worker.id,
        status: existing.worker.status,
        otp_sent: true,
      };
    }

    throw Errors.conflict('This phone number is already registered.', 'PHONE_ALREADY_REGISTERED');
  }

  const user = await prisma.user.create({
    data: {
      phone,
      role: 'worker' as Role,
      name: input.full_name,
      worker: {
        create: {
          position: input.position,
          skills: input.skills,
          languages: input.languages,
          documents: input.documents,
          status: 'pending_otp' as WorkerStatus,
        },
      },
    },
    include: { worker: true },
  });

  await requestOtp({ phone, purpose: 'worker_registration', user_id: user.id, ip_address: ip });

  return {
    user_id: user.id,
    worker_id: user.worker.id,
    status: user.worker.status,
    otp_sent: true,
  };
}

export async function requestWorkerOtp(input: WorkerRequestOtpInput, ip?: string) {
  const phone = normalizePhone(input.phone);
  const purpose = input.purpose ?? 'worker_login';
  const user = await prisma.user.findUnique({ where: { phone }, include: { worker: true } });

  if (!user || user.role !== 'worker' || !user.worker) {
    return genericOtpResponse();
  }

  if (purpose === 'worker_registration') {
    if (user.worker.status !== 'pending_otp') {
      throw Errors.forbidden('Worker registration is not waiting for OTP verification.', 'WORKER_REGISTRATION_ALREADY_VERIFIED', {
        status: user.worker.status,
      });
    }
  } else if (user.worker.status !== 'approved') {
    await recordAudit({
      actor_id: user.id,
      actor_role: 'worker',
      action: 'login_failed',
      entity_type: 'worker',
      entity_id: user.worker.id,
      metadata: { reason: 'worker_not_approved', status: user.worker.status },
    });
    assertWorkerCanLogin(user.worker.status);
  }

  await requestOtp({ phone, purpose, user_id: user.id, ip_address: ip });
  return { otp_sent: true, purpose, retry_after_seconds: 60 };
}

export async function loginWorker(input: WorkerLoginInput, ip?: string) {
  return requestWorkerOtp({ phone: input.phone, purpose: 'worker_login' }, ip);
}

export async function registerCompany(input: CompanyRegisterInput, ip?: string) {
  const phone = normalizePhone(input.phone);
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) throw Errors.conflict('This phone number is already registered.', 'PHONE_ALREADY_REGISTERED');

  const user = await prisma.user.create({
    data: {
      phone,
      role: 'company' as Role,
      name: input.contact_name,
      company: {
        create: {
          name: input.name,
          docs_url: input.docs_url,
          documents: input.documents,
          status: 'pending_approval' as CompanyStatus,
        },
      },
    },
    include: { company: true },
  });

  await requestOtp({ phone, purpose: 'company_registration', user_id: user.id, ip_address: ip });

  return {
    user_id: user.id,
    company_id: user.company.id,
    status: user.company.status,
    otp_sent: true,
  };
}

export async function loginCompany(input: CompanyLoginInput, ip?: string) {
  const phone = normalizePhone(input.phone);
  const user = await prisma.user.findUnique({ where: { phone }, include: { company: true } });

  if (!user || user.role !== 'company' || !user.company) return genericOtpResponse();
  if (user.company.status !== 'approved') {
    await recordAudit({
      actor_id: user.id,
      actor_role: 'company',
      action: 'login_failed',
      entity_type: 'company',
      entity_id: user.company.id,
      metadata: { reason: 'company_not_approved', status: user.company.status },
    });
    assertCompanyCanLogin(user.company.status);
  }

  await requestOtp({ phone, purpose: 'company_login', user_id: user.id, ip_address: ip });
  return { otp_sent: true, purpose: 'company_login', retry_after_seconds: 60 };
}

export async function loginAdmin(input: AdminLoginInput, ip?: string) {
  const phone = normalizePhone(input.phone);
  const user = await prisma.user.findUnique({ where: { phone }, include: { admin: true } });

  if (!user || user.role !== 'super_admin') return genericOtpResponse();

  await requestOtp({ phone, purpose: 'admin_login', user_id: user.id, ip_address: ip });
  return { otp_sent: true, purpose: 'admin_login', retry_after_seconds: 60 };
}

export async function verifyOtp(input: VerifyOtpInput, ip?: string) {
  const phone = normalizePhone(input.phone);
  const otp = await verifyOtpCode(phone, input.otp_code, input.purpose);
  const user = await prisma.user.findFirst({
    where: { id: otp.user_id ?? undefined, phone },
    include: { worker: true, company: true, admin: true },
  });

  if (!user) throw Errors.unauthorized('OTP could not be matched to an account.', 'OTP_ACCOUNT_NOT_FOUND');

  if (otp.purpose === 'worker_registration') {
    if (!user.worker) throw Errors.notFound('Worker profile not found.', 'WORKER_NOT_FOUND');
    const worker = await prisma.worker.update({
      where: { id: user.worker.id },
      data: {
        status: user.worker.status === 'pending_otp' ? 'pending_approval' : user.worker.status,
      },
    });
    return {
      user_id: user.id,
      worker_id: worker.id,
      status: worker.status,
      message: 'OTP verified. Worker is pending admin approval.',
    };
  }

  if (otp.purpose === 'company_registration') {
    return {
      user_id: user.id,
      company_id: user.company?.id,
      status: user.company?.status,
      message: 'OTP verified. Company is pending admin approval.',
    };
  }

  if (otp.purpose === 'worker_login') {
    assertWorkerCanLogin(user.worker?.status);
    return buildTokenResponse(user.id, user.role, ip);
  }

  if (otp.purpose === 'company_login') {
    assertCompanyCanLogin(user.company?.status);
    return buildTokenResponse(user.id, user.role, ip);
  }

  if (otp.purpose === 'admin_login') {
    if (user.role !== 'super_admin') {
      throw Errors.forbidden('Only super admins can use admin login.', 'ROLE_FORBIDDEN');
    }
    return buildTokenResponse(user.id, user.role, ip);
  }

  throw Errors.unauthorized('Unsupported OTP purpose.', 'UNSUPPORTED_OTP_PURPOSE');
}

export async function refresh(refreshToken: string, ip?: string) {
  let payload;
  try {
    payload = verifyToken(refreshToken);
  } catch {
    throw Errors.unauthorized('Refresh token is invalid.', 'INVALID_REFRESH_TOKEN');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token_hash: sha256(refreshToken) } });
  if (!stored || stored.revoked_at || stored.expires_at < new Date()) {
    throw Errors.unauthorized('Refresh token is invalid or expired.', 'INVALID_REFRESH_TOKEN');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revoked_at: new Date() },
  });

  return buildTokenResponse(payload.sub, payload.role, ip);
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token_hash: sha256(refreshToken), revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export async function updateFcmToken(userId: string, fcmToken: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { fcm_token: fcmToken } });
}

async function requestOtp(input: {
  phone: string;
  purpose: OtpPurpose;
  user_id?: string;
  ip_address?: string;
}) {
  consumeRateLimit(`phone:${input.phone}:${input.purpose}`, OTP_RATE_MAX_BY_PHONE);
  consumeRateLimit(`ip:${input.ip_address ?? 'unknown'}:${input.purpose}`, OTP_RATE_MAX_BY_IP);

  const now = new Date();
  const latest = await prisma.otpCode.findFirst({
    where: { phone: input.phone, purpose: input.purpose, verified_at: null },
    orderBy: { created_at: 'desc' },
  });

  if (latest?.blocked_until && latest.blocked_until > now) {
    throw Errors.tooMany('Too many failed OTP attempts. Please try again later.', 'OTP_BLOCKED', {
      retry_after_seconds: secondsUntil(latest.blocked_until),
    });
  }

  if (latest && latest.last_sent_at.getTime() + OTP_COOLDOWN_MS > now.getTime()) {
    throw Errors.tooMany('Please wait before requesting another OTP.', 'OTP_COOLDOWN', {
      retry_after_seconds: Math.ceil((latest.last_sent_at.getTime() + OTP_COOLDOWN_MS - now.getTime()) / 1000),
    });
  }

  const code = generateOtp();
  const expires_at = new Date(now.getTime() + OTP_EXPIRES_MS);
  const code_hash = otpHash(input.phone, input.purpose, code);

  if (latest) {
    await prisma.otpCode.update({
      where: { id: latest.id },
      data: {
        user_id: input.user_id ?? latest.user_id,
        code_hash,
        expires_at,
        attempts: 0,
        max_attempts: OTP_MAX_ATTEMPTS,
        resend_count: { increment: 1 },
        blocked_until: null,
        last_sent_at: now,
        ip_address: input.ip_address,
      },
    });
  } else {
    await prisma.otpCode.create({
      data: {
        user_id: input.user_id,
        phone: input.phone,
        purpose: input.purpose,
        code_hash,
        expires_at,
        max_attempts: OTP_MAX_ATTEMPTS,
        last_sent_at: now,
        ip_address: input.ip_address,
      },
    });
  }

  await sendSms(input.phone, code, input.purpose);
}

async function verifyOtpCode(phone: string, code: string, purpose?: OtpPurpose) {
  const now = new Date();
  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose, verified_at: null },
    orderBy: { created_at: 'desc' },
  });

  if (!otp || otp.expires_at <= now) {
    throw Errors.unauthorized('Invalid or expired OTP.', 'INVALID_OTP');
  }

  if (otp.blocked_until && otp.blocked_until > now) {
    throw Errors.tooMany('Too many failed OTP attempts. Please try again later.', 'OTP_BLOCKED', {
      retry_after_seconds: secondsUntil(otp.blocked_until),
    });
  }

  const expected = otpHash(phone, otp.purpose, code);
  if (!safeCompareHex(expected, otp.code_hash)) {
    await handleFailedOtp(otp);
    throw Errors.unauthorized('Invalid or expired OTP.', 'INVALID_OTP');
  }

  return prisma.otpCode.update({
    where: { id: otp.id },
    data: { verified_at: now },
  });
}

async function handleFailedOtp(otp: {
  id: string;
  user_id: string | null;
  phone: string;
  purpose: OtpPurpose;
  attempts: number;
  max_attempts: number;
}) {
  const attempts = otp.attempts + 1;
  const shouldBlock = attempts >= otp.max_attempts;

  await recordAudit({
    actor_id: otp.user_id,
    actor_role: roleForOtpPurpose(otp.purpose),
    action: 'login_failed',
    entity_type: 'phone',
    entity_id: otp.phone,
    metadata: { purpose: otp.purpose, attempts },
  });

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: {
      attempts,
      blocked_until: shouldBlock ? new Date(Date.now() + OTP_BLOCK_MS) : null,
    },
  });

  if (shouldBlock) {
    await recordAudit({
      actor_id: otp.user_id,
      actor_role: roleForOtpPurpose(otp.purpose),
      action: 'otp_blocked',
      entity_type: 'phone',
      entity_id: otp.phone,
      metadata: { purpose: otp.purpose, attempts },
    });
  }
}

async function buildTokenResponse(userId: string, role: string, ip?: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { worker: true, company: true },
  });

  if (!user.is_active || user.deleted_at) {
    throw Errors.forbidden('Account is inactive.', 'ACCOUNT_INACTIVE');
  }

  if (role === 'worker') assertWorkerCanLogin(user.worker?.status);
  if (role === 'company') assertCompanyCanLogin(user.company?.status);

  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken({ sub: userId, role });

  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      user_id: userId,
      token_hash: sha256(refreshToken),
      expires_at: refreshExpiresAt,
      created_by_ip: ip,
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
      worker: user.worker ? { id: user.worker.id, status: user.worker.status } : null,
      company: user.company ? { id: user.company.id, status: user.company.status } : null,
      created_at: user.created_at,
    },
  };
}

function assertWorkerCanLogin(status?: WorkerStatus): void {
  if (status === 'approved') return;
  throw Errors.forbidden('Worker is not approved for login.', 'WORKER_NOT_APPROVED', {
    status: status ?? 'unknown',
  });
}

function assertCompanyCanLogin(status?: CompanyStatus): void {
  if (status === 'approved') return;
  throw Errors.forbidden('Company is not approved for login.', 'COMPANY_NOT_APPROVED', {
    status: status ?? 'unknown',
  });
}

function roleForOtpPurpose(purpose: OtpPurpose): Role {
  if (purpose === 'admin_login') return 'super_admin';
  if (purpose === 'company_login' || purpose === 'company_registration') return 'company';
  return 'worker';
}

function secondsUntil(date: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}

function genericOtpResponse() {
  return {
    otp_sent: true,
    message: 'If an eligible account exists, an OTP will be sent.',
    retry_after_seconds: 60,
  };
}
