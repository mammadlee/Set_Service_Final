import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  getTokenExpiration,
  signAccessToken,
  signRefreshToken,
  signRegistrationToken,
  verifyRefreshToken,
} from '../../lib/jwt';
import { Errors } from '../../lib/errors';
import { generateOtpCode, hmacSha256, safeCompareHex, sha256 } from '../../lib/crypto';
import { normalizePhone } from '../../lib/phone';
import { hashPassword, normalizeEmail, verifyPassword } from '../../lib/password';
import { recordAudit } from '../../lib/audit';
import {
  assertOtpCooldown,
  assertOtpNotBlocked,
  blockOtp,
  consumeOtpRateLimit,
  setOtpCooldown,
} from '../../lib/otp-state';
import {
  buildOtpProviderOutboxEvent,
  ProviderOutboxEventData,
} from '../../lib/provider-outbox';
import {
  AdminLoginInput,
  AdminForgotPasswordInput,
  CompanyCompleteRegistrationInput,
  CompanyForgotPasswordInput,
  CompanyLoginInput,
  CompanyRegisterInput,
  CompanyResetPasswordInput,
  EmailVerificationConfirmInput,
  EmailVerificationRequestInput,
  FcmTokenInput,
  RegisterInput,
  VerifyOtpInput,
  WorkerCompleteRegistrationInput,
  WorkerForgotPasswordInput,
  WorkerLoginInput,
  WorkerPhoneChangeConfirmInput,
  WorkerPhoneChangeRequestInput,
  WorkerRegisterInput,
  WorkerRequestOtpInput,
  WorkerResetPasswordInput,
} from './auth.schema';
import { CompanyStatus, OtpPurpose, Role, WorkerStatus } from '../../types/prisma';
import { ADMIN_PERMISSIONS, normalizePermissions } from '../admins/admins.permissions';
import * as TaxonomyService from '../taxonomy/taxonomy.service';

const OTP_EXPIRES_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_BLOCK_MS = 15 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
const OTP_RATE_MAX_BY_PHONE = 5;
const OTP_RATE_MAX_BY_IP = 20;
const EMAIL_VERIFICATION_EXPIRES_MS = 5 * 60 * 1000;
const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;
const EMAIL_VERIFICATION_BLOCK_MS = 15 * 60 * 1000;
const OTP_CHALLENGE_EXPIRES_MS = 5 * 60 * 1000;

type VerifiedOtpCode = {
  id: string;
  user_id: string | null;
  phone: string;
  purpose: OtpPurpose;
};

type OtpChallengePayload = {
  otp_id: string;
  user_id: string | null;
  target: string;
  purpose: OtpPurpose;
  exp: number;
};

type AuthUser = Prisma.UserGetPayload<{
  include: {
    worker: true;
    company: true;
    admin: true;
  };
}>;

function otpHash(phone: string, purpose: OtpPurpose, code: string): string {
  return hmacSha256(`${phone}:${purpose}:${code}`, process.env.OTP_PEPPER ?? process.env.JWT_ACCESS_SECRET ?? 'dev-otp-pepper');
}

function emailOtpKey(email: string): string {
  return `email:${normalizeEmail(email)}`;
}

function emailVerificationHash(email: string, code: string): string {
  return hmacSha256(
    `email_verification:${normalizeEmail(email)}:${code}`,
    process.env.OTP_PEPPER ?? process.env.JWT_ACCESS_SECRET ?? 'dev-otp-pepper'
  );
}

function otpChallengeSecret(): string {
  return process.env.OTP_PEPPER ?? process.env.JWT_ACCESS_SECRET ?? 'dev-otp-pepper';
}

function signOtpChallenge(otp: VerifiedOtpCode): string {
  const payload: OtpChallengePayload = {
    otp_id: otp.id,
    user_id: otp.user_id,
    target: otp.phone,
    purpose: otp.purpose,
    exp: Date.now() + OTP_CHALLENGE_EXPIRES_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = hmacSha256(`otp_challenge:${body}`, otpChallengeSecret());
  return `${body}.${signature}`;
}

function parseOtpChallenge(token: string): OtpChallengePayload {
  const [body, signature] = token.split('.');
  if (!body || !signature) {
    throw Errors.unauthorized('Təsdiq sessiyası etibarsızdır və ya vaxtı bitib.', 'OTP_CHALLENGE_INVALID');
  }

  const expected = hmacSha256(`otp_challenge:${body}`, otpChallengeSecret());
  if (!safeCompareHex(expected, signature)) {
    throw Errors.unauthorized('Təsdiq sessiyası etibarsızdır və ya vaxtı bitib.', 'OTP_CHALLENGE_INVALID');
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OtpChallengePayload;
    if (!payload.otp_id || !payload.target || !payload.purpose || payload.exp <= Date.now()) {
      throw new Error('invalid challenge payload');
    }
    return payload;
  } catch {
    throw Errors.unauthorized('Təsdiq sessiyası etibarsızdır və ya vaxtı bitib.', 'OTP_CHALLENGE_INVALID');
  }
}

export async function register(input: RegisterInput, ip?: string) {
  if (input.role === 'company') {
    return registerCompany({
      name: input.name,
      contact_name: input.contact_name ?? input.name,
      email: input.email,
      phone: input.phone,
    }, ip);
  }

  return registerWorker({
    full_name: input.full_name ?? input.name ?? '',
    phone: input.phone,
    position: input.position,
    position_ids: input.position_ids,
    skills: input.skills ?? [],
    languages: input.languages ?? [],
  }, ip);
}

export async function registerWorker(input: WorkerRegisterInput, ip?: string) {
  const phone = normalizePhone(input.phone);
  const existing = await prisma.user.findUnique({ where: { phone }, include: { worker: true } });

  if (existing) {
    const canResumeRegistration = existing.role === 'worker'
      && existing.worker
      && !existing.password_set_at
      && ['pending_otp', 'pending_approval'].includes(existing.worker.status);

    if (canResumeRegistration && existing.worker) {
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

    throw Errors.conflict('Bu telefon nömrəsindən istifadə etmək mümkün deyil.', 'PHONE_ALREADY_REGISTERED');
  }

  const selectedPositions = await resolveWorkerPositions(input.position_ids ?? []);
  const displayPosition = input.position?.trim() || selectedPositions.map((position) => position.name_az).join(', ');

  const user = await prisma.user.create({
    data: {
      phone,
      role: 'worker' as Role,
      name: input.full_name,
      worker: {
        create: {
          position: displayPosition,
          skills: input.skills,
          languages: input.languages,
          status: 'pending_otp' as WorkerStatus,
          positions: selectedPositions.length
            ? {
                create: selectedPositions.map((position) => ({
                  position_id: position.id,
                })),
              }
            : undefined,
        },
      },
    },
    include: { worker: true },
  });

  await requestOtp({ phone, purpose: 'worker_registration', user_id: user.id, ip_address: ip });
  if (!user.worker) {
    throw new Error('Worker profile creation did not return the related worker record.');
  }

  return {
    user_id: user.id,
    worker_id: user.worker.id,
    status: user.worker.status,
    otp_sent: true,
  };
}

async function resolveWorkerPositions(positionIds: string[]) {
  const uniqueIds = [...new Set(positionIds)];
  if (uniqueIds.length === 0) return [];

  const positions = await TaxonomyService.findActivePositionsByIds(uniqueIds);
  if (positions.length !== uniqueIds.length) {
    throw Errors.badRequest('Seçilmiş vəzifələrdən biri aktiv deyil və ya tapılmadı.', 'POSITION_NOT_FOUND', {
      position_ids: uniqueIds,
    });
  }

  return positions;
}

export async function requestWorkerOtp(input: WorkerRequestOtpInput, ip?: string) {
  const phone = normalizePhone(input.phone);
  const purpose = input.purpose ?? 'worker_registration';
  const user = await prisma.user.findUnique({ where: { phone }, include: { worker: true } });

  if (!user || user.role !== 'worker' || !user.worker) {
    return genericOtpResponse();
  }

  if (purpose === 'worker_registration') {
    const canResumeRegistration = !user.password_set_at
      && ['pending_otp', 'pending_approval'].includes(user.worker.status);

    if (!canResumeRegistration) {
      throw Errors.forbidden('İşçi qeydiyyatı OTP təsdiqi mərhələsində deyil.', 'WORKER_REGISTRATION_ALREADY_VERIFIED', {
        status: user.worker.status,
      });
    }
  } else if (purpose !== 'worker_password_reset') {
    throw Errors.badRequest('Bu işçi OTP əməliyyatı dəstəklənmir.', 'UNSUPPORTED_OTP_PURPOSE');
  }

  await requestOtp({ phone, purpose, user_id: user.id, ip_address: ip });
  return { otp_sent: true, purpose, retry_after_seconds: 60 };
}

export async function loginWorker(input: WorkerLoginInput, ip?: string) {
  const phone = normalizePhone(input.phone);
  const user = await prisma.user.findUnique({ where: { phone }, include: { worker: true } });
  if (!user || user.role !== 'worker' || !user.worker || !(await verifyPassword(input.password, user.password_hash))) {
    await recordLoginFailed(null, 'worker', 'worker', phone, { reason: 'invalid_credentials' });
    throw Errors.unauthorized('Telefon nömrəsi və ya şifrə yanlışdır.', 'INVALID_CREDENTIALS');
  }

  if (user.worker.status !== 'approved') {
    await recordLoginFailed(user.id, 'worker', 'worker', user.worker.id, {
      reason: 'worker_not_approved',
      status: user.worker.status,
    });
    assertWorkerCanLogin(user.worker.status);
  }

  return buildTokenResponse(user.id, user.role, ip);
}

export async function completeWorkerRegistration(input: WorkerCompleteRegistrationInput) {
  const phone = normalizePhone(input.phone);
  const otp = await verifyOtpProof({
    target: phone,
    purpose: 'worker_registration',
    otp_code: input.otp_code,
    otp_challenge: input.otp_challenge,
  });
  const user = await prisma.user.findFirst({
    where: { id: otp.user_id ?? undefined, phone, role: 'worker' },
    include: { worker: true },
  });
  if (!user || !user.worker) throw Errors.notFound('İşçi profili tapılmadı.', 'WORKER_NOT_FOUND');

  const password_hash = await hashPassword(input.password);
  const now = new Date();
  const worker = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await consumeVerifiedOtp(tx, otp.id, now);
    return tx.worker.update({
      where: { id: user.worker!.id },
      data: {
        status: user.worker!.status === 'pending_otp' ? 'pending_approval' : user.worker!.status,
        user: { update: { password_hash, password_set_at: now } },
      },
    });
  });

  return {
    user_id: user.id,
    worker_id: worker.id,
    status: worker.status,
    password_set: true,
    registration_access_token: signRegistrationToken({
      sub: user.id,
      role: user.role,
      session_version: user.session_version,
    }),
    required_document_types: ['health_certificate', 'criminal_record'],
    message: 'OTP təsdiqləndi. İşçi admin təsdiqini gözləyir.',
  };
}

export async function forgotWorkerPassword(input: WorkerForgotPasswordInput, ip?: string) {
  const identity = await findPasswordResetUser('worker', input);
  if (!identity.user || !identity.worker) return genericOtpResponse();

  if (identity.email) {
    await requestEmailOtp({
      email: identity.email,
      purpose: 'worker_password_reset',
      user_id: identity.user.id,
      ip_address: ip,
    });
  } else {
    await requestOtp({
      phone: identity.phone!,
      purpose: 'worker_password_reset',
      user_id: identity.user.id,
      ip_address: ip,
    });
  }
  return { otp_sent: true, purpose: 'worker_password_reset', retry_after_seconds: 60 };
}

export async function resetWorkerPassword(input: WorkerResetPasswordInput) {
  const identity = await findPasswordResetUser('worker', input);
  if (!identity.user || !identity.worker) return genericPasswordResetResponse();

  const otpTarget = identity.email ? emailOtpKey(identity.email) : identity.phone!;
  const otp = await verifyOtpProof({
    target: otpTarget,
    purpose: 'worker_password_reset',
    otp_code: input.otp_code,
    otp_challenge: input.otp_challenge,
  });
  if (otp.user_id !== identity.user.id) return genericPasswordResetResponse();

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await consumeVerifiedOtp(tx, otp.id, now);
    await tx.user.update({
      where: { id: identity.user!.id },
      data: { password_hash: passwordHash, password_set_at: now },
    });
    await revokeUserSessions(tx, identity.user!.id, now);
  });
  return { password_reset: true };
}

export async function requestWorkerPhoneChange(
  userId: string,
  input: WorkerPhoneChangeRequestInput,
  ip?: string
) {
  const phone = normalizePhone(input.phone);
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'worker', deleted_at: null },
    include: { worker: true },
  });
  if (!user || !user.worker) throw Errors.notFound('İşçi profili tapılmadı.', 'WORKER_NOT_FOUND');
  if (user.phone === phone) {
    throw Errors.badRequest('Yeni telefon nömrəsi mövcud nömrədən fərqli olmalıdır.', 'PHONE_UNCHANGED');
  }

  const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (existing && existing.id !== user.id) {
    throw Errors.conflict('Bu telefon nömrəsindən istifadə etmək mümkün deyil.', 'PHONE_ALREADY_REGISTERED');
  }

  await requestOtp({ phone, purpose: 'worker_phone_change', user_id: user.id, ip_address: ip });
  return { otp_sent: true, purpose: 'worker_phone_change', retry_after_seconds: 60 };
}

export async function confirmWorkerPhoneChange(
  userId: string,
  input: WorkerPhoneChangeConfirmInput
) {
  const phone = normalizePhone(input.phone);
  const otp = await verifyOtpCode(phone, input.otp_code, 'worker_phone_change');
  if (otp.user_id !== userId) {
    throw Errors.unauthorized('OTP bu işçi hesabı ilə uyğun gəlmir.', 'OTP_ACCOUNT_NOT_FOUND');
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { phone },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw Errors.conflict('Bu telefon nömrəsindən istifadə etmək mümkün deyil.', 'PHONE_ALREADY_REGISTERED');
    }
    throw error;
  }

  return { phone_changed: true, phone };
}

export async function requestEmailVerification(
  userId: string,
  input: EmailVerificationRequestInput
) {
  return startEmailVerification(userId, input.email);
}

export async function startEmailVerification(userId: string, email: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findFirst({
    where: { id: userId, deleted_at: null, is_active: true },
    select: {
      id: true,
      email: true,
      email_verified_at: true,
      pending_email: true,
      email_verification_sent_at: true,
    },
  });
  if (!user) throw Errors.unauthorized('Giriş tələb olunur.', 'UNAUTHORIZED');

  if (user.email === normalizedEmail && user.email_verified_at) {
    return {
      email: normalizedEmail,
      pending_email: null,
      email_verified: true,
      email_verification_sent: false,
    };
  }

  const existing = await prisma.user.findFirst({
    where: {
      id: { not: userId },
      deleted_at: null,
      OR: [{ email: normalizedEmail }, { pending_email: normalizedEmail }],
    },
    select: { id: true },
  });
  if (existing) {
    throw Errors.conflict('Bu email ünvanından istifadə etmək mümkün deyil.', 'EMAIL_ALREADY_REGISTERED');
  }

  const now = new Date();
  if (
    user.pending_email === normalizedEmail &&
    user.email_verification_sent_at &&
    user.email_verification_sent_at.getTime() + OTP_COOLDOWN_MS > now.getTime()
  ) {
    throw Errors.tooMany('Yeni email təsdiq kodu istəmək üçün bir az gözləyin.', 'EMAIL_VERIFICATION_COOLDOWN', {
      retry_after_seconds: Math.ceil(
        (user.email_verification_sent_at.getTime() + OTP_COOLDOWN_MS - now.getTime()) / 1000
      ),
    });
  }

  const code = generateOtpCode();
  const codeHash = emailVerificationHash(normalizedEmail, code);
  const deliveryEvent = buildOtpProviderOutboxEvent({
    channel: 'email',
    to: normalizedEmail,
    purpose: 'email_verification',
    code,
    dedupeKey: `${userId}:${now.toISOString()}:${codeHash}`,
  });
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        pending_email: normalizedEmail,
        email_verification_code_hash: codeHash,
        email_verification_expires_at: new Date(now.getTime() + EMAIL_VERIFICATION_EXPIRES_MS),
        email_verification_sent_at: now,
        email_verification_attempts: 0,
        email_verification_blocked_until: null,
      },
    });
    await queueProviderDelivery(tx, deliveryEvent, now);
  });

  return {
    email: user.email,
    pending_email: normalizedEmail,
    email_verified: false,
    email_verification_sent: true,
    retry_after_seconds: 60,
  };
}

export async function confirmEmailVerification(
  userId: string,
  input: EmailVerificationConfirmInput
) {
  const now = new Date();
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: { id: userId, deleted_at: null, is_active: true },
        select: {
          id: true,
          pending_email: true,
          email_verification_code_hash: true,
          email_verification_expires_at: true,
          email_verification_attempts: true,
          email_verification_blocked_until: true,
        },
      });
      if (!user) throw Errors.unauthorized('Giriş tələb olunur.', 'UNAUTHORIZED');
      if (user.email_verification_blocked_until && user.email_verification_blocked_until > now) {
        return {
          status: 'blocked' as const,
          retryAfterSeconds: Math.ceil((user.email_verification_blocked_until.getTime() - now.getTime()) / 1000),
        };
      }
      if (
        !user.pending_email
        || !user.email_verification_code_hash
        || !user.email_verification_expires_at
        || user.email_verification_expires_at <= now
      ) {
        return { status: 'invalid' as const };
      }

      const expected = emailVerificationHash(user.pending_email, input.otp_code);
      if (!safeCompareHex(expected, user.email_verification_code_hash)) {
        const attempts = user.email_verification_attempts + 1;
        const blockedUntil = attempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS
          ? new Date(now.getTime() + EMAIL_VERIFICATION_BLOCK_MS)
          : null;
        await tx.user.update({
          where: { id: user.id },
          data: {
            email_verification_attempts: { increment: 1 },
            email_verification_blocked_until: blockedUntil,
          },
        });
        return blockedUntil
          ? { status: 'blocked' as const, retryAfterSeconds: Math.ceil(EMAIL_VERIFICATION_BLOCK_MS / 1000) }
          : { status: 'invalid' as const };
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          email: user.pending_email,
          email_verified_at: now,
          pending_email: null,
          email_verification_code_hash: null,
          email_verification_expires_at: null,
          email_verification_sent_at: null,
          email_verification_attempts: 0,
          email_verification_blocked_until: null,
        },
        select: { email: true, email_verified_at: true },
      });
      return { status: 'verified' as const, updated };
    });

    if (result.status === 'blocked') {
      throw Errors.tooMany('Email təsdiqi müvəqqəti bloklanıb.', 'EMAIL_VERIFICATION_BLOCKED', {
        retry_after_seconds: result.retryAfterSeconds,
      });
    }
    if (result.status === 'invalid') {
      throw Errors.unauthorized('Təsdiq kodu yanlışdır və ya vaxtı bitib.', 'INVALID_EMAIL_VERIFICATION_CODE');
    }
    return {
      email: result.updated.email,
      email_verified_at: result.updated.email_verified_at,
      email_verified: true,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw Errors.conflict('Bu email ünvanından istifadə etmək mümkün deyil.', 'EMAIL_ALREADY_REGISTERED');
    }
    throw error;
  }
}

export async function registerCompany(input: CompanyRegisterInput, ip?: string) {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone }, { email }] },
    include: { company: true },
  });
  const canResumeRegistration = existing?.role === 'company'
    && existing.phone === phone
    && existing.email === email
    && existing.company?.status === 'pending_approval'
    && !existing.password_set_at;

  if (canResumeRegistration && existing.company) {
    await requestOtp({ phone, purpose: 'company_registration', user_id: existing.id, ip_address: ip });
    return {
      user_id: existing.id,
      company_id: existing.company.id,
      status: existing.company.status,
      otp_sent: true,
    };
  }

  if (existing?.phone === phone) throw Errors.conflict('Bu telefon nömrəsindən istifadə etmək mümkün deyil.', 'PHONE_ALREADY_REGISTERED');
  if (existing?.email === email) throw Errors.conflict('Bu email ünvanından istifadə etmək mümkün deyil.', 'EMAIL_ALREADY_REGISTERED');

  const user = await prisma.user.create({
    data: {
      phone,
      email,
      role: 'company' as Role,
      name: input.contact_name,
      company: {
        create: {
          name: input.name,
          status: 'pending_approval' as CompanyStatus,
        },
      },
    },
    include: { company: true },
  });

  await requestOtp({ phone, purpose: 'company_registration', user_id: user.id, ip_address: ip });
  if (!user.company) {
    throw new Error('Company profile creation did not return the related company record.');
  }

  return {
    user_id: user.id,
    company_id: user.company.id,
    status: user.company.status,
    otp_sent: true,
  };
}

export async function completeCompanyRegistration(input: CompanyCompleteRegistrationInput) {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });
  if (!user || user.role !== 'company' || !user.company) throw Errors.notFound('Müəssisə profili tapılmadı.', 'COMPANY_NOT_FOUND');

  const otp = await verifyOtpProof({
    target: user.phone,
    purpose: 'company_registration',
    otp_code: input.otp_code,
    otp_challenge: input.otp_challenge,
  });
  if (otp.user_id !== user.id) {
    throw Errors.unauthorized('OTP bu müəssisə hesabı ilə uyğun gəlmir.', 'OTP_ACCOUNT_NOT_FOUND');
  }

  const now = new Date();
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await consumeVerifiedOtp(tx, otp.id, now);
    await tx.user.update({
      where: { id: user.id },
      data: { password_hash: await hashPassword(input.password), password_set_at: now },
    });
  });

  return {
    user_id: user.id,
    company_id: user.company.id,
    status: user.company.status,
    password_set: true,
    registration_access_token: signRegistrationToken({
      sub: user.id,
      role: user.role,
      session_version: user.session_version,
    }),
    email_verified: Boolean(user.email_verified_at),
    required_document_types: ['registration_certificate'],
    message: 'OTP təsdiqləndi. Müəssisə admin təsdiqini gözləyir.',
  };
}

export async function loginCompany(input: CompanyLoginInput, ip?: string) {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });

  if (!user || user.role !== 'company' || !user.company || !(await verifyPassword(input.password, user.password_hash))) {
    await recordLoginFailed(null, 'company', 'company', email, { reason: 'invalid_credentials' });
    throw Errors.unauthorized('Email və ya şifrə yanlışdır.', 'INVALID_CREDENTIALS');
  }
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

  return buildTokenResponse(user.id, user.role, ip);
}

export async function forgotCompanyPassword(input: CompanyForgotPasswordInput, ip?: string) {
  const identity = await findPasswordResetUser('company', input);
  if (!identity.user || !identity.company) return genericOtpResponse();

  if (identity.email) {
    await requestEmailOtp({
      email: identity.email,
      purpose: 'company_password_reset',
      user_id: identity.user.id,
      ip_address: ip,
    });
  } else {
    await requestOtp({
      phone: identity.phone!,
      purpose: 'company_password_reset',
      user_id: identity.user.id,
      ip_address: ip,
    });
  }
  return { otp_sent: true, purpose: 'company_password_reset', retry_after_seconds: 60 };
}

export async function resetCompanyPassword(input: CompanyResetPasswordInput) {
  const identity = await findPasswordResetUser('company', input);
  if (!identity.user || !identity.company) return genericPasswordResetResponse();

  const otpTarget = identity.email ? emailOtpKey(identity.email) : identity.phone!;
  const otp = await verifyOtpProof({
    target: otpTarget,
    purpose: 'company_password_reset',
    otp_code: input.otp_code,
    otp_challenge: input.otp_challenge,
  });
  if (otp.user_id !== identity.user.id) return genericPasswordResetResponse();
  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await consumeVerifiedOtp(tx, otp.id, now);
    await tx.user.update({
      where: { id: identity.user!.id },
      data: { password_hash: passwordHash, password_set_at: now },
    });
    await revokeUserSessions(tx, identity.user!.id, now);
  });
  return { password_reset: true };
}

export async function loginAdmin(input: AdminLoginInput, ip?: string) {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email }, include: { admin: true } });

  if (
    !user ||
    (user.role !== 'super_admin' && user.role !== 'admin') ||
    !user.admin ||
    !(await verifyPassword(input.password, user.password_hash))
  ) {
    await recordLoginFailed(null, 'super_admin', 'admin', email, { reason: 'invalid_credentials' });
    throw Errors.unauthorized('Email və ya şifrə yanlışdır.', 'INVALID_CREDENTIALS');
  }

  return buildTokenResponse(user.id, user.role, ip);
}

export async function forgotAdminPassword(_input: AdminForgotPasswordInput) {
  throw Errors.gone(
    'Admin password reset is disabled. Contact the security administrator.',
    'ADMIN_PASSWORD_RESET_DISABLED'
  );
}

export async function verifyOtp(input: VerifyOtpInput, ip?: string) {
  const target = input.method === 'email' || input.email
    ? emailOtpKey(input.email!)
    : normalizePhone(input.phone ?? '');
  const otp = await verifyOtpCode(target, input.otp_code, input.purpose);
  if (!otp.user_id) {
    throw Errors.unauthorized('OTP hesabla uyğun gəlmir.', 'OTP_ACCOUNT_NOT_FOUND');
  }
  const user = await prisma.user.findFirst({
    where: otp.purpose === 'worker_phone_change'
      ? { id: otp.user_id, role: 'worker' }
      : { id: otp.user_id },
    include: { worker: true, company: true, admin: true },
  });

  if (!user) throw Errors.unauthorized('OTP hesabla uyğun gəlmir.', 'OTP_ACCOUNT_NOT_FOUND');

  const otpChallenge = signOtpChallenge(otp);

  if (otp.purpose === 'worker_registration') {
    if (!user.worker) throw Errors.notFound('İşçi profili tapılmadı.', 'WORKER_NOT_FOUND');
    return {
      user_id: user.id,
      worker_id: user.worker.id,
      status: user.worker.status,
      password_required: true,
      otp_challenge: otpChallenge,
      message: 'OTP təsdiqləndi. Qeydiyyatı tamamlamaq üçün şifrə yaradın.',
    };
  }

  if (otp.purpose === 'company_registration') {
    return {
      user_id: user.id,
      company_id: user.company?.id,
      status: user.company?.status,
      password_required: true,
      otp_challenge: otpChallenge,
      message: 'OTP təsdiqləndi. Müəssisə admin təsdiqini gözləyir.',
    };
  }

  if (otp.purpose === 'worker_login') {
    throw Errors.badRequest('İşçi OTP girişi artıq aktiv deyil. Telefon və şifrə ilə daxil olun.', 'OTP_LOGIN_DEPRECATED');
  }

  if (otp.purpose === 'company_login') {
    throw Errors.badRequest('Müəssisə OTP girişi artıq aktiv deyil. Email və şifrə ilə daxil olun.', 'OTP_LOGIN_DEPRECATED');
  }

  if (otp.purpose === 'admin_login') {
    throw Errors.badRequest('Admin OTP girişi artıq aktiv deyil. Email və şifrə ilə daxil olun.', 'OTP_LOGIN_DEPRECATED');
  }

  if (otp.purpose === 'worker_password_reset' || otp.purpose === 'company_password_reset') {
    return {
      otp_verified: true,
      purpose: otp.purpose,
      otp_challenge: otpChallenge,
      message: 'OTP təsdiqləndi. Şifrə yeniləməyə davam edin.',
    };
  }

  if (otp.purpose === 'worker_phone_change') {
    return {
      otp_verified: true,
      purpose: otp.purpose,
      message: 'OTP təsdiqləndi. Telefon nömrəsi dəyişikliyinə davam edin.',
    };
  }

  throw Errors.unauthorized('Bu OTP əməliyyatı dəstəklənmir.', 'UNSUPPORTED_OTP_PURPOSE');
}

export async function refresh(refreshToken: string, ip?: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw Errors.unauthorized('Sessiya yeniləmə tokeni etibarsızdır.', 'INVALID_REFRESH_TOKEN');
  }

  const now = new Date();
  const tokenHash = sha256(refreshToken);
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const stored = await tx.refreshToken.findUnique({
      where: { token_hash: tokenHash },
      include: {
        user: {
          include: {
            worker: true,
            company: true,
            admin: true,
          },
        },
      },
    });

    if (
      !stored
      || stored.user_id !== payload.sub
      || stored.jti !== payload.jti
      || stored.family_id !== payload.family_id
      || stored.expires_at <= now
    ) {
      return { kind: 'invalid' as const };
    }

    if (stored.revoked_at) {
      if (stored.revoked_reason === 'rotated') {
        await revokeTokenFamily(tx, stored.user_id, stored.family_id, now, 'reuse_detected');
        return { kind: 'reuse' as const };
      }
      return { kind: 'invalid' as const };
    }

    assertUserCanAuthenticate(stored.user, payload.role, payload.session_version);

    const nextRefreshToken = signRefreshToken({
      sub: stored.user_id,
      role: stored.user.role,
      session_version: stored.user.session_version,
      family_id: stored.family_id,
    });
    const nextRefreshPayload = verifyRefreshToken(nextRefreshToken);
    const nextAccessToken = signAccessToken({
      sub: stored.user_id,
      role: stored.user.role,
      session_version: stored.user.session_version,
    });

    const rotation = await tx.refreshToken.updateMany({
      where: {
        id: stored.id,
        revoked_at: null,
        expires_at: { gt: now },
      },
      data: {
        revoked_at: now,
        revoked_reason: 'rotated',
        replaced_by_jti: nextRefreshPayload.jti,
      },
    });

    if (rotation.count !== 1) {
      await revokeTokenFamily(tx, stored.user_id, stored.family_id, now, 'reuse_detected');
      return { kind: 'reuse' as const };
    }

    await tx.refreshToken.create({
      data: {
        user_id: stored.user_id,
        token_hash: sha256(nextRefreshToken),
        jti: nextRefreshPayload.jti,
        family_id: stored.family_id,
        expires_at: getTokenExpiration(nextRefreshToken),
        created_by_ip: ip,
      },
    });

    return {
      kind: 'ok' as const,
      response: tokenResponse(stored.user, nextAccessToken, nextRefreshToken),
    };
  });

  if (result.kind === 'reuse') {
    throw Errors.unauthorized(
      'Sessiya yeniləmə tokeninin təkrar istifadəsi aşkarlandı.',
      'REFRESH_TOKEN_REUSE'
    );
  }
  if (result.kind === 'invalid') {
    throw Errors.unauthorized(
      'Sessiya yeniləmə tokeni etibarsızdır və ya vaxtı bitib.',
      'INVALID_REFRESH_TOKEN'
    );
  }

  return result.response;
}

export async function logout(refreshToken: string, userId: string): Promise<void> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw Errors.unauthorized('Sessiya yeniləmə tokeni etibarsızdır.', 'INVALID_REFRESH_TOKEN');
  }
  if (payload.sub !== userId) {
    throw Errors.unauthorized('Sessiya yeniləmə tokeni bu hesaba aid deyil.', 'INVALID_REFRESH_TOKEN');
  }

  const now = new Date();
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const stored = await tx.refreshToken.findUnique({
      where: { token_hash: sha256(refreshToken) },
      select: { user_id: true, family_id: true, jti: true },
    });
    if (!stored || stored.user_id !== userId || stored.jti !== payload.jti) {
      return;
    }
    await revokeTokenFamily(tx, userId, stored.family_id, now, 'logout');
  });
}

export async function logoutByRefreshToken(refreshToken: string): Promise<void> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw Errors.unauthorized('Sessiya yeniləmə tokeni etibarsızdır.', 'INVALID_REFRESH_TOKEN');
  }
  await logout(refreshToken, payload.sub);
}

export async function registerFcmToken(userId: string, input: FcmTokenInput) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deleted_at: null, is_active: true },
    select: { id: true, role: true },
  });
  if (!user) throw Errors.unauthorized('Giriş tələb olunur.', 'UNAUTHORIZED');

  const tokenHash = sha256(input.fcm_token);
  const now = new Date();
  const token = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const registered = await tx.deviceToken.upsert({
      where: { token_hash: tokenHash },
      create: {
        user_id: userId,
        token: input.fcm_token,
        token_hash: tokenHash,
        platform: input.platform,
        device_id: input.device_id,
        app_role: user.role,
        last_seen_at: now,
      },
      update: {
        user_id: userId,
        token: input.fcm_token,
        platform: input.platform,
        device_id: input.device_id,
        app_role: user.role,
        last_seen_at: now,
        revoked_at: null,
        deleted_at: null,
      },
      select: {
        id: true,
        platform: true,
        app_role: true,
        last_seen_at: true,
      },
    });

    if (input.device_id) {
      await tx.deviceToken.updateMany({
        where: {
          user_id: userId,
          device_id: input.device_id,
          token_hash: { not: tokenHash },
          revoked_at: null,
          deleted_at: null,
        },
        data: {
          revoked_at: now,
          deleted_at: now,
        },
      });
    }

    return registered;
  });

  return {
    id: token.id,
    platform: token.platform,
    app_role: token.app_role,
    registered: true,
    last_seen_at: token.last_seen_at,
  };
}

export async function deleteFcmToken(userId: string, fcmToken: string): Promise<void> {
  const tokenHash = sha256(fcmToken);
  const now = new Date();

  await prisma.deviceToken.updateMany({
    where: {
      user_id: userId,
      token_hash: tokenHash,
      revoked_at: null,
      deleted_at: null,
    },
    data: {
      revoked_at: now,
      deleted_at: now,
    },
  });
}

async function findPasswordResetUser(
  role: 'worker' | 'company',
  input: { method?: 'phone' | 'email'; phone?: string; email?: string }
) {
  const useEmail = input.method === 'email' || Boolean(input.email);
  if (useEmail && input.email) {
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({
      where: { email },
      include: { worker: true, company: true },
    });
    if (!user || user.role !== role || user.deleted_at || !user.is_active) {
      return { user: null, worker: null, company: null, email, phone: null };
    }
    return { user, worker: user.worker, company: user.company, email, phone: null };
  }

  const phone = normalizePhone(input.phone ?? '');
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { worker: true, company: true },
  });
  if (!user || user.role !== role || user.deleted_at || !user.is_active) {
    return { user: null, worker: null, company: null, email: null, phone };
  }
  return { user, worker: user.worker, company: user.company, email: null, phone };
}

async function requestOtp(input: {
  phone: string;
  purpose: OtpPurpose;
  user_id?: string;
  ip_address?: string;
}) {
  await createOtpCode({
    target: input.phone,
    purpose: input.purpose,
    user_id: input.user_id,
    ip_address: input.ip_address,
    delivery: { channel: 'sms', to: input.phone },
  });
}

async function requestEmailOtp(input: {
  email: string;
  purpose: OtpPurpose;
  user_id?: string;
  ip_address?: string;
}) {
  const email = normalizeEmail(input.email);
  await createOtpCode({
    target: emailOtpKey(email),
    purpose: input.purpose,
    user_id: input.user_id,
    ip_address: input.ip_address,
    delivery: { channel: 'email', to: email },
  });
}

async function createOtpCode(input: {
  target: string;
  purpose: OtpPurpose;
  user_id?: string;
  ip_address?: string;
  delivery: {
    channel: 'sms' | 'email';
    to: string;
  };
}) {
  await consumeOtpRateLimit(['target', input.target, input.purpose], OTP_RATE_MAX_BY_PHONE, OTP_RATE_WINDOW_MS);
  await consumeOtpRateLimit(['ip', input.ip_address ?? 'unknown', input.purpose], OTP_RATE_MAX_BY_IP, OTP_RATE_WINDOW_MS);
  await assertOtpNotBlocked(input.target, input.purpose);
  await assertOtpCooldown(input.target, input.purpose);

  const now = new Date();
  const latest = await prisma.otpCode.findFirst({
    where: { phone: input.target, purpose: input.purpose, verified_at: null },
    orderBy: { created_at: 'desc' },
  });

  if (latest?.blocked_until && latest.blocked_until > now) {
    throw Errors.tooMany('Çox sayda uğursuz OTP cəhdi edildi. Bir az sonra yenidən cəhd edin.', 'OTP_BLOCKED', {
      retry_after_seconds: secondsUntil(latest.blocked_until),
    });
  }

  if (latest && latest.last_sent_at.getTime() + OTP_COOLDOWN_MS > now.getTime()) {
    throw Errors.tooMany('Yeni OTP istəmək üçün bir az gözləyin.', 'OTP_COOLDOWN', {
      retry_after_seconds: Math.ceil((latest.last_sent_at.getTime() + OTP_COOLDOWN_MS - now.getTime()) / 1000),
    });
  }

  const code = generateOtpCode();
  const expires_at = new Date(now.getTime() + OTP_EXPIRES_MS);
  const code_hash = otpHash(input.target, input.purpose, code);
  const deliveryEvent = buildOtpProviderOutboxEvent({
    channel: input.delivery.channel,
    to: input.delivery.to,
    purpose: input.purpose,
    code,
    dedupeKey: `${latest?.id ?? 'new'}:${now.toISOString()}:${code_hash}`,
  });

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (latest) {
      await tx.otpCode.update({
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
      await tx.otpCode.create({
        data: {
          user_id: input.user_id,
          phone: input.target,
          purpose: input.purpose,
          code_hash,
          expires_at,
          max_attempts: OTP_MAX_ATTEMPTS,
          last_sent_at: now,
          ip_address: input.ip_address,
        },
      });
    }
    await queueProviderDelivery(tx, deliveryEvent, now);
  });

  await setOtpCooldown(input.target, input.purpose, OTP_COOLDOWN_MS);
  return code;
}

async function queueProviderDelivery(
  tx: Prisma.TransactionClient,
  event: ProviderOutboxEventData,
  availableAt: Date
): Promise<void> {
  await tx.outboxEvent.upsert({
    where: { id: event.id },
    create: {
      ...event,
      available_at: availableAt,
    },
    update: {
      aggregate: event.aggregate,
      aggregate_id: event.aggregate_id,
      event_type: event.event_type,
      payload: event.payload,
      status: 'pending',
      attempts: 0,
      available_at: availableAt,
      processed_at: null,
      last_error: null,
    },
  });
}

async function verifyOtpProof(input: {
  target: string;
  purpose: OtpPurpose;
  otp_code?: string;
  otp_challenge?: string;
}): Promise<VerifiedOtpCode> {
  if (input.otp_challenge) {
    return verifyOtpChallenge(input.otp_challenge, input.target, input.purpose);
  }

  if (input.otp_code) {
    return verifyOtpCode(input.target, input.otp_code, input.purpose);
  }

  throw Errors.unauthorized('OTP təsdiqi tələb olunur.', 'OTP_REQUIRED');
}

async function verifyOtpChallenge(
  token: string,
  target: string,
  purpose: OtpPurpose
): Promise<VerifiedOtpCode> {
  const payload = parseOtpChallenge(token);
  if (payload.target !== target || payload.purpose !== purpose) {
    throw Errors.unauthorized('Təsdiq sessiyası etibarsızdır və ya vaxtı bitib.', 'OTP_CHALLENGE_INVALID');
  }

  const now = new Date();
  const otp = await prisma.otpCode.findFirst({
    where: {
      id: payload.otp_id,
      phone: target,
      purpose,
      verified_at: { not: null },
      expires_at: { gt: now },
    },
    select: {
      id: true,
      user_id: true,
      phone: true,
      purpose: true,
    },
  });

  if (!otp || otp.user_id !== payload.user_id) {
    throw Errors.unauthorized('Təsdiq sessiyası etibarsızdır və ya vaxtı bitib.', 'OTP_CHALLENGE_INVALID');
  }

  return otp;
}

async function consumeVerifiedOtp(
  tx: Prisma.TransactionClient,
  otpId: string,
  now: Date
): Promise<void> {
  const consumed = await tx.otpCode.updateMany({
    where: { id: otpId, expires_at: { gt: now }, consumed_at: null },
    data: { expires_at: now, consumed_at: now },
  });
  if (consumed.count !== 1) {
    throw Errors.unauthorized('Təsdiq sessiyası etibarsızdır və ya vaxtı bitib.', 'OTP_CHALLENGE_INVALID');
  }
}

async function verifyOtpCode(phone: string, code: string, purpose?: OtpPurpose) {
  const now = new Date();
  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose, verified_at: null },
    orderBy: { created_at: 'desc' },
  });

  if (!otp || otp.expires_at <= now) {
    throw Errors.unauthorized('OTP kodu yanlışdır və ya vaxtı bitib.', 'INVALID_OTP');
  }

  if (otp.blocked_until && otp.blocked_until > now) {
    throw Errors.tooMany('Çox sayda uğursuz OTP cəhdi edildi. Bir az sonra yenidən cəhd edin.', 'OTP_BLOCKED', {
      retry_after_seconds: secondsUntil(otp.blocked_until),
    });
  }
  await assertOtpNotBlocked(phone, otp.purpose);

  const expected = otpHash(phone, otp.purpose, code);
  if (!safeCompareHex(expected, otp.code_hash)) {
    await handleFailedOtp(otp);
    throw Errors.unauthorized('OTP kodu yanlışdır və ya vaxtı bitib.', 'INVALID_OTP');
  }

  const verified = await prisma.$queryRaw<VerifiedOtpCode[]>`
    UPDATE "otp_codes"
    SET "verified_at" = timezone('UTC', ${now}::timestamptz)
    WHERE "id" = ${otp.id}
      AND "verified_at" IS NULL
      AND "expires_at" > timezone('UTC', ${now}::timestamptz)
      AND "attempts" < "max_attempts"
      AND (
        "blocked_until" IS NULL
        OR "blocked_until" <= timezone('UTC', ${now}::timestamptz)
      )
    RETURNING "id", "user_id", "phone", "purpose"
  `;

  if (!verified[0]) {
    throw Errors.unauthorized('OTP kodu yanlışdır və ya vaxtı bitib.', 'INVALID_OTP');
  }

  return verified[0];
}

async function handleFailedOtp(otp: {
  id: string;
  user_id: string | null;
  phone: string;
  purpose: OtpPurpose;
}) {
  const blockedUntil = new Date(Date.now() + OTP_BLOCK_MS);
  const updated = await prisma.$queryRaw<Array<{
    attempts: number;
    max_attempts: number;
    blocked_until: Date | null;
  }>>`
    UPDATE "otp_codes"
    SET
      "attempts" = "attempts" + 1,
      "blocked_until" = CASE
        WHEN "attempts" + 1 >= "max_attempts"
          THEN timezone('UTC', ${blockedUntil}::timestamptz)
        ELSE "blocked_until"
      END
    WHERE "id" = ${otp.id}
      AND "verified_at" IS NULL
      AND "expires_at" > timezone('UTC', CURRENT_TIMESTAMP)
      AND "attempts" < "max_attempts"
    RETURNING "attempts", "max_attempts", "blocked_until"
  `;

  if (!updated[0]) return;

  const attempts = updated[0].attempts;
  const shouldBlock = attempts >= updated[0].max_attempts;

  await recordAudit({
    actor_id: otp.user_id,
    actor_role: roleForOtpPurpose(otp.purpose),
    action: 'login_failed',
    entity_type: 'phone',
    entity_id: otp.phone,
    metadata: { purpose: otp.purpose, attempts },
  });

  if (shouldBlock) {
    await blockOtp(otp.phone, otp.purpose, OTP_BLOCK_MS);
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
    include: { worker: true, company: true, admin: true },
  });

  assertUserCanAuthenticate(user, role, user.session_version);

  const accessToken = signAccessToken({
    sub: userId,
    role,
    session_version: user.session_version,
  });
  const refreshToken = signRefreshToken({
    sub: userId,
    role,
    session_version: user.session_version,
  });
  const refreshPayload = verifyRefreshToken(refreshToken);
  await prisma.refreshToken.create({
    data: {
      user_id: userId,
      token_hash: sha256(refreshToken),
      jti: refreshPayload.jti,
      family_id: refreshPayload.family_id!,
      expires_at: getTokenExpiration(refreshToken),
      created_by_ip: ip,
    },
  });

  return tokenResponse(user, accessToken, refreshToken);
}

function tokenResponse(user: AuthUser, accessToken: string, refreshToken: string) {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      name: user.name,
      worker: user.worker ? { id: user.worker.id, status: user.worker.status } : null,
      company: user.company ? { id: user.company.id, status: user.company.status } : null,
      admin: user.admin ? { id: user.admin.id } : null,
      permissions: user.role === 'super_admin'
        ? [...ADMIN_PERMISSIONS]
        : user.role === 'admin'
          ? normalizePermissions(user.admin?.permissions)
          : [],
      created_at: user.created_at,
    },
  };
}

async function revokeUserSessions(tx: Prisma.TransactionClient, userId: string, now: Date): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: { session_version: { increment: 1 } },
  });
  await tx.refreshToken.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: now, revoked_reason: 'password_change' },
  });
  await tx.deviceToken.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: now, deleted_at: now },
  });
}

async function revokeTokenFamily(
  tx: Prisma.TransactionClient,
  userId: string,
  familyId: string,
  now: Date,
  reason: 'reuse_detected' | 'logout'
): Promise<void> {
  await tx.refreshToken.updateMany({
    where: {
      user_id: userId,
      family_id: familyId,
      revoked_at: null,
    },
    data: {
      revoked_at: now,
      revoked_reason: reason,
    },
  });
}

function assertUserCanAuthenticate(
  user: AuthUser,
  role: string,
  expectedSessionVersion: number
): void {
  if (!user.is_active || user.deleted_at) {
    throw Errors.forbidden('Hesab aktiv deyil.', 'ACCOUNT_INACTIVE');
  }
  if (user.role !== role) {
    throw Errors.unauthorized('Sessiya yenilənməlidir.', 'SESSION_INVALID');
  }
  if (user.session_version !== expectedSessionVersion) {
    throw Errors.unauthorized('Sessiya ləğv edilib.', 'SESSION_REVOKED');
  }
  if (role === 'worker') assertWorkerCanLogin(user.worker?.status);
  if (role === 'company') assertCompanyCanLogin(user.company?.status);
}

function assertWorkerCanLogin(status?: WorkerStatus): void {
  if (status === 'approved') return;
  throw Errors.forbidden('İşçi hesabı giriş üçün təsdiqlənməyib.', 'WORKER_NOT_APPROVED', {
    status: status ?? 'unknown',
  });
}

function assertCompanyCanLogin(status?: CompanyStatus): void {
  if (status === 'approved') return;
  throw Errors.forbidden('Müəssisə hesabı giriş üçün təsdiqlənməyib.', 'COMPANY_NOT_APPROVED', {
    status: status ?? 'unknown',
  });
}

function roleForOtpPurpose(purpose: OtpPurpose): Role {
  if (purpose === 'admin_login') return 'super_admin';
  if (purpose === 'company_login' || purpose === 'company_registration' || purpose === 'company_password_reset') return 'company';
  return 'worker';
}

function secondsUntil(date: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}

function genericOtpResponse() {
  return {
    otp_sent: true,
    message: 'Əgər məlumat sistemdə mövcuddursa, təsdiq kodu göndərildi.',
    retry_after_seconds: 60,
  };
}

function genericPasswordResetResponse() {
  return {
    password_reset: true,
    message: 'Əgər uyğun hesab mövcuddursa, şifrə yeniləndi.',
  };
}

async function recordLoginFailed(
  actorId: string | null,
  actorRole: Role,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>
) {
  await recordAudit({
    actor_id: actorId,
    actor_role: actorRole,
    action: 'login_failed',
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}
