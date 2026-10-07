import {
  assertAcceptableSeedPassword,
  resolveSeedPassword,
} from './seed-safety';

export const APPLE_REVIEW_WORKER_PHONE = '+994700000003';
export const APPLE_REVIEW_COMPANY_PHONE = '+994700000002';
export const APPLE_REVIEW_COMPANY_EMAIL = 'company@setservice.az';
export const APPLE_REVIEW_ADMIN_PHONE = '+994700000101';
export const APPLE_REVIEW_ADMIN_EMAIL = 'ops@setservice.az';

export const APPLE_REVIEW_PASSWORD_ENV = {
  worker: 'APPLE_REVIEW_WORKER_PASSWORD',
  company: 'APPLE_REVIEW_COMPANY_PASSWORD',
  admin: 'APPLE_REVIEW_ADMIN_PASSWORD',
} as const;

export const APPLE_REVIEW_ADMIN_PERMISSIONS = [
  'view_dashboard',
  'view_workers',
  'view_companies',
  'view_orders',
  'view_assignments',
  'view_attendance',
  'view_notifications',
] as const;

export type AppleReviewPasswords = {
  worker: string;
  company: string;
  admin: string;
};

type Environment = NodeJS.ProcessEnv;

function requiredPassword(envName: string, env: Environment): string {
  const value = env[envName]?.trim();
  if (!value) {
    throw new Error(`APPLE_REVIEW_PASSWORD_REQUIRED:${envName}`);
  }
  assertAcceptableSeedPassword(envName, value);
  return value;
}

export function resolveAppleReviewPasswords(env: Environment = process.env): AppleReviewPasswords {
  const passwords = {
    worker: requiredPassword(APPLE_REVIEW_PASSWORD_ENV.worker, env),
    company: requiredPassword(APPLE_REVIEW_PASSWORD_ENV.company, env),
    admin: requiredPassword(APPLE_REVIEW_PASSWORD_ENV.admin, env),
  };

  assertAppleReviewPasswordsUnique(passwords);
  return passwords;
}

export function resolveAppleReviewPasswordsForSeed(
  env: Environment = process.env,
): AppleReviewPasswords {
  const passwords = {
    worker: resolveSeedPassword(APPLE_REVIEW_PASSWORD_ENV.worker, env),
    company: resolveSeedPassword(APPLE_REVIEW_PASSWORD_ENV.company, env),
    admin: resolveSeedPassword(APPLE_REVIEW_PASSWORD_ENV.admin, env),
  };

  assertAppleReviewPasswordsUnique(passwords);
  return passwords;
}

export function assertAppleReviewPasswordsUnique(
  reviewPasswords: AppleReviewPasswords,
  otherSeedPasswords: Record<string, string> = {},
): void {
  const seen = new Map<string, string>();
  const allPasswords = {
    APPLE_REVIEW_WORKER_PASSWORD: reviewPasswords.worker,
    APPLE_REVIEW_COMPANY_PASSWORD: reviewPasswords.company,
    APPLE_REVIEW_ADMIN_PASSWORD: reviewPasswords.admin,
    ...otherSeedPasswords,
  };

  for (const [name, password] of Object.entries(allPasswords)) {
    const previous = seen.get(password);
    if (previous) {
      throw new Error(`APPLE_REVIEW_PASSWORD_REUSE:${name}:${previous}`);
    }
    seen.set(password, name);
  }
}
