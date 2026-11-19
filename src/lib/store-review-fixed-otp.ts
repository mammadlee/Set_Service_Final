import { AppError, Errors } from './errors';
import { hmacSha256, safeCompareHex } from './crypto';
import { recordAudit } from './audit';
import { assertOtpNotBlocked, blockOtp, consumeOtpRateLimit } from './otp-state';
import { resolveStoreReviewIdentifiers } from './store-review-accounts';
import { Role } from '../types/prisma';

export const STORE_REVIEW_FIXED_OTP_ENV = {
  enabled: 'STORE_REVIEW_FIXED_OTP_ENABLED',
  hash: 'STORE_REVIEW_FIXED_OTP_HASH',
  expiresAt: 'STORE_REVIEW_FIXED_OTP_EXPIRES_AT',
} as const;

const STORE_REVIEW_OTP_PURPOSE = 'store_review_login';
const STORE_REVIEW_OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
const STORE_REVIEW_OTP_BLOCK_MS = 15 * 60 * 1000;
const STORE_REVIEW_OTP_MAX_FAILED_ATTEMPTS = 5;
const STORE_REVIEW_OTP_MAX_ACCOUNT_ATTEMPTS = 12;
const STORE_REVIEW_OTP_MAX_IP_ATTEMPTS = 30;
const STORE_REVIEW_OTP_MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export type StoreReviewLoginRole = 'worker' | 'company' | 'admin';
export type StoreReviewAuthenticationMethod = 'password' | 'password_reviewer_fixed_otp';

type StoreReviewFixedOtpConfig = {
  enabled: boolean;
  expectedHash?: string;
  expiresAt?: Date;
  pepper?: string;
};

type StoreReviewLoginAccount = {
  id: string;
  role: Role;
  is_review_account: boolean;
};

type StoreReviewOtpAudit = Parameters<typeof recordAudit>[0];

export type StoreReviewFixedOtpDependencies = {
  assertNotBlocked: (accountId: string, purpose: string) => Promise<void>;
  consumeRateLimit: (keyParts: string[], max: number, windowMs: number) => Promise<void>;
  block: (accountId: string, purpose: string, ttlMs: number) => Promise<void>;
  audit: (input: StoreReviewOtpAudit) => Promise<void>;
};

const defaultDependencies: StoreReviewFixedOtpDependencies = {
  assertNotBlocked: assertOtpNotBlocked,
  consumeRateLimit: consumeOtpRateLimit,
  block: blockOtp,
  audit: recordAudit,
};

export function deriveStoreReviewFixedOtpHash(code: string, pepper: string): string {
  if (!/^\d{6}$/.test(code)) throw new Error('STORE_REVIEW_FIXED_OTP_CODE_INVALID');
  if (!pepper) throw new Error('STORE_REVIEW_FIXED_OTP_PEPPER_REQUIRED');
  return hmacSha256(`store_review_login:v1:${code}`, pepper);
}

export function storeReviewFixedOtpConfigurationIssues(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
  requireFutureExpiry = true,
): string[] {
  const issues: string[] = [];
  if (env.STORE_REVIEW_FIXED_OTP_CODE !== undefined) {
    issues.push('STORE_REVIEW_FIXED_OTP_CODE is forbidden; configure only the HMAC hash');
  }
  const rawEnabled = env[STORE_REVIEW_FIXED_OTP_ENV.enabled]?.trim();
  if (rawEnabled && rawEnabled !== 'true' && rawEnabled !== 'false') {
    issues.push(`${STORE_REVIEW_FIXED_OTP_ENV.enabled} must be true or false`);
    return issues;
  }
  if (rawEnabled !== 'true') return issues;

  const expectedHash = env[STORE_REVIEW_FIXED_OTP_ENV.hash]?.trim();
  if (!expectedHash || !SHA256_HEX_PATTERN.test(expectedHash)) {
    issues.push(`${STORE_REVIEW_FIXED_OTP_ENV.hash} must be a 64-character lowercase HMAC-SHA256 hex value`);
  }

  const pepper = env.OTP_PEPPER?.trim();
  if (!pepper) issues.push('OTP_PEPPER is required when reviewer fixed OTP is enabled');

  const rawExpiry = env[STORE_REVIEW_FIXED_OTP_ENV.expiresAt]?.trim();
  const expiryMs = rawExpiry ? Date.parse(rawExpiry) : Number.NaN;
  if (!rawExpiry || !UTC_TIMESTAMP_PATTERN.test(rawExpiry) || !Number.isFinite(expiryMs)) {
    issues.push(`${STORE_REVIEW_FIXED_OTP_ENV.expiresAt} must be an ISO-8601 UTC timestamp ending in Z`);
  } else if (requireFutureExpiry && expiryMs <= now.getTime()) {
    issues.push(`${STORE_REVIEW_FIXED_OTP_ENV.expiresAt} must be in the future`);
  } else if (expiryMs - now.getTime() > STORE_REVIEW_OTP_MAX_WINDOW_MS) {
    issues.push(`${STORE_REVIEW_FIXED_OTP_ENV.expiresAt} must not be more than 90 days in the future`);
  }

  try {
    resolveStoreReviewIdentifiers(env);
  } catch {
    issues.push('all STORE_REVIEW_* reviewer identifiers must be valid when reviewer fixed OTP is enabled');
  }

  return issues;
}

function resolveStoreReviewFixedOtpConfig(
  env: NodeJS.ProcessEnv,
  now: Date,
  allowExpired = false,
): StoreReviewFixedOtpConfig {
  const issues = storeReviewFixedOtpConfigurationIssues(env, now, !allowExpired);
  if (issues.length > 0) throw new Error('STORE_REVIEW_FIXED_OTP_CONFIGURATION_INVALID');
  if (env[STORE_REVIEW_FIXED_OTP_ENV.enabled]?.trim() !== 'true') return { enabled: false };
  return {
    enabled: true,
    expectedHash: env[STORE_REVIEW_FIXED_OTP_ENV.hash]!.trim(),
    expiresAt: new Date(env[STORE_REVIEW_FIXED_OTP_ENV.expiresAt]!.trim()),
    pepper: env.OTP_PEPPER!.trim(),
  };
}

export function assertStoreReviewFixedOtpReady(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): { expiresAt: Date } {
  const config = resolveStoreReviewFixedOtpConfig(env, now);
  if (!config.enabled || !config.expiresAt) {
    throw new Error('STORE_REVIEW_FIXED_OTP_DISABLED');
  }
  return { expiresAt: config.expiresAt };
}

function expectedIdentifier(role: StoreReviewLoginRole, env: NodeJS.ProcessEnv): string {
  const identifiers = resolveStoreReviewIdentifiers(env);
  if (role === 'worker') return identifiers.workerPhone;
  if (role === 'company') return identifiers.companyEmail;
  return identifiers.adminEmail;
}

async function auditReviewerOtpFailure(
  account: StoreReviewLoginAccount,
  reason: string,
  dependencies: StoreReviewFixedOtpDependencies,
): Promise<void> {
  await dependencies.audit({
    actor_id: account.id,
    actor_role: account.role,
    action: 'login_failed',
    entity_type: 'store_review_account',
    entity_id: account.id,
    metadata: {
      authentication: 'password_reviewer_fixed_otp',
      reason,
      role: account.role,
    },
  });
}

export async function enforceStoreReviewFixedOtp(
  input: {
    account: StoreReviewLoginAccount;
    expectedRole: StoreReviewLoginRole;
    normalizedIdentifier: string;
    otpCode?: string;
    ip?: string;
    env?: NodeJS.ProcessEnv;
    now?: Date;
  },
  dependencies: StoreReviewFixedOtpDependencies = defaultDependencies,
): Promise<StoreReviewAuthenticationMethod> {
  if (!input.account.is_review_account) return 'password';

  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  let config: StoreReviewFixedOtpConfig;
  let configuredIdentifier: string;
  try {
    config = resolveStoreReviewFixedOtpConfig(env, now, true);
    configuredIdentifier = expectedIdentifier(input.expectedRole, env);
  } catch {
    throw Errors.unavailable(
      'Store review sign-in is temporarily unavailable.',
      'REVIEWER_OTP_CONFIGURATION_INVALID',
    );
  }

  if (input.account.role !== input.expectedRole || input.normalizedIdentifier !== configuredIdentifier) {
    await auditReviewerOtpFailure(input.account, 'reviewer_identity_scope_mismatch', dependencies);
    throw Errors.unavailable(
      'Store review sign-in is temporarily unavailable.',
      'REVIEWER_OTP_SCOPE_INVALID',
    );
  }

  if (!config.enabled) {
    await auditReviewerOtpFailure(input.account, 'reviewer_fixed_otp_disabled', dependencies);
    throw Errors.forbidden(
      'Store review sign-in is disabled.',
      'REVIEWER_OTP_DISABLED',
    );
  }
  if (!config.expiresAt || config.expiresAt.getTime() <= now.getTime()) {
    await auditReviewerOtpFailure(input.account, 'reviewer_fixed_otp_expired', dependencies);
    throw Errors.forbidden(
      'The store review sign-in window has ended.',
      'REVIEWER_OTP_EXPIRED',
    );
  }

  if (!input.otpCode) {
    await auditReviewerOtpFailure(input.account, 'reviewer_fixed_otp_required', dependencies);
    throw Errors.unauthorized(
      'A reviewer verification code is required.',
      'REVIEWER_OTP_REQUIRED',
    );
  }

  try {
    await dependencies.assertNotBlocked(input.account.id, STORE_REVIEW_OTP_PURPOSE);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'OTP_BLOCKED') throw error;
    await auditReviewerOtpFailure(input.account, 'reviewer_fixed_otp_blocked', dependencies);
    throw Errors.tooMany(
      'Too many reviewer verification attempts. Please try again later.',
      'REVIEWER_OTP_BLOCKED',
      error.details,
    );
  }
  try {
    await dependencies.consumeRateLimit(
      ['store-review-login', 'account', input.account.id],
      STORE_REVIEW_OTP_MAX_ACCOUNT_ATTEMPTS,
      STORE_REVIEW_OTP_RATE_WINDOW_MS,
    );
    await dependencies.consumeRateLimit(
      ['store-review-login', 'ip', input.ip ?? 'unknown'],
      STORE_REVIEW_OTP_MAX_IP_ATTEMPTS,
      STORE_REVIEW_OTP_RATE_WINDOW_MS,
    );
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'OTP_RATE_LIMITED') throw error;
    await auditReviewerOtpFailure(input.account, 'reviewer_fixed_otp_rate_limited', dependencies);
    throw Errors.tooMany(
      'Too many reviewer verification attempts. Please try again later.',
      'REVIEWER_OTP_RATE_LIMITED',
      error.details,
    );
  }

  const candidateHash = deriveStoreReviewFixedOtpHash(input.otpCode, config.pepper!);
  if (!safeCompareHex(candidateHash, config.expectedHash!)) {
    try {
      await dependencies.consumeRateLimit(
        ['store-review-login', 'failure', input.account.id],
        STORE_REVIEW_OTP_MAX_FAILED_ATTEMPTS - 1,
        STORE_REVIEW_OTP_RATE_WINDOW_MS,
      );
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'OTP_RATE_LIMITED') throw error;
      await dependencies.block(input.account.id, STORE_REVIEW_OTP_PURPOSE, STORE_REVIEW_OTP_BLOCK_MS);
      await dependencies.audit({
        actor_id: input.account.id,
        actor_role: input.account.role,
        action: 'otp_blocked',
        entity_type: 'store_review_account',
        entity_id: input.account.id,
        metadata: {
          authentication: 'password_reviewer_fixed_otp',
          reason: 'reviewer_fixed_otp_attempt_limit',
          role: input.account.role,
        },
      });
      throw Errors.tooMany(
        'Too many reviewer verification attempts. Please try again later.',
        'REVIEWER_OTP_BLOCKED',
        { retry_after_seconds: Math.ceil(STORE_REVIEW_OTP_BLOCK_MS / 1000) },
      );
    }
    await auditReviewerOtpFailure(input.account, 'reviewer_fixed_otp_invalid', dependencies);
    throw Errors.unauthorized(
      'The reviewer verification code is invalid.',
      'REVIEWER_OTP_INVALID',
    );
  }

  return 'password_reviewer_fixed_otp';
}
