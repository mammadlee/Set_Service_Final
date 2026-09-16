import crypto from 'crypto';
import { Errors } from './errors';
import { getRedisClient } from './redis';

const COMPANY_ENROLLMENT_TTL_MS = 30 * 60 * 1000;
const KEY_PREFIX = 'hireapp:company-enrollment:';

export type CompanyEnrollmentDraft = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  stage: 'phone_otp_pending';
};

type LocalEnrollment = {
  draft: CompanyEnrollmentDraft;
  expiresAt: number;
};

const localEnrollments = new Map<string, LocalEnrollment>();

function enrollmentKey(token: string): string {
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) {
    throw Errors.unauthorized(
      'Qeydiyyat sessiyası etibarsızdır və ya vaxtı bitib.',
      'COMPANY_ENROLLMENT_EXPIRED',
    );
  }
  return `${KEY_PREFIX}${crypto.createHash('sha256').update(token).digest('hex')}`;
}

function ensureLocalFallbackAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw Errors.internal(
      'Company enrollment state store is unavailable.',
      'COMPANY_ENROLLMENT_STATE_UNAVAILABLE',
    );
  }
}

export async function createCompanyEnrollment(
  draft: CompanyEnrollmentDraft,
): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await writeCompanyEnrollment(token, draft);
  return token;
}

export async function readCompanyEnrollment(
  token: string,
): Promise<CompanyEnrollmentDraft> {
  const key = enrollmentKey(token);
  const redis = getRedisClient();
  let value: string | null;

  if (redis) {
    try {
      value = await redis.get(key);
    } catch {
      throw Errors.internal(
        'Company enrollment state store is unavailable.',
        'COMPANY_ENROLLMENT_STATE_UNAVAILABLE',
      );
    }
  } else {
    ensureLocalFallbackAllowed();
    const enrollment = localEnrollments.get(key);
    if (!enrollment || enrollment.expiresAt <= Date.now()) {
      localEnrollments.delete(key);
      value = null;
    } else {
      value = JSON.stringify(enrollment.draft);
    }
  }

  if (!value) {
    throw Errors.unauthorized(
      'Qeydiyyat sessiyası etibarsızdır və ya vaxtı bitib.',
      'COMPANY_ENROLLMENT_EXPIRED',
    );
  }

  try {
    return JSON.parse(value) as CompanyEnrollmentDraft;
  } catch {
    throw Errors.internal(
      'Company enrollment state is invalid.',
      'COMPANY_ENROLLMENT_STATE_INVALID',
    );
  }
}

export async function writeCompanyEnrollment(
  token: string,
  draft: CompanyEnrollmentDraft,
): Promise<void> {
  const key = enrollmentKey(token);
  const redis = getRedisClient();

  if (redis) {
    try {
      await redis.psetex(key, COMPANY_ENROLLMENT_TTL_MS, JSON.stringify(draft));
      return;
    } catch {
      throw Errors.internal(
        'Company enrollment state store is unavailable.',
        'COMPANY_ENROLLMENT_STATE_UNAVAILABLE',
      );
    }
  }

  ensureLocalFallbackAllowed();
  localEnrollments.set(key, {
    draft,
    expiresAt: Date.now() + COMPANY_ENROLLMENT_TTL_MS,
  });
}

export async function deleteCompanyEnrollment(token: string): Promise<void> {
  const key = enrollmentKey(token);
  const redis = getRedisClient();

  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch {
      throw Errors.internal(
        'Company enrollment state store is unavailable.',
        'COMPANY_ENROLLMENT_STATE_UNAVAILABLE',
      );
    }
  }

  ensureLocalFallbackAllowed();
  localEnrollments.delete(key);
}
