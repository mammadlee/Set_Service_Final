import { assertAcceptableSeedPassword } from './seed-safety';

type Environment = NodeJS.ProcessEnv;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export const STORE_REVIEW_IDENTIFIER_ENV = {
  workerPhone: 'STORE_REVIEW_WORKER_PHONE',
  companyPhone: 'STORE_REVIEW_COMPANY_PHONE',
  companyEmail: 'STORE_REVIEW_COMPANY_EMAIL',
  adminPhone: 'STORE_REVIEW_ADMIN_PHONE',
  adminEmail: 'STORE_REVIEW_ADMIN_EMAIL',
} as const;

export const STORE_REVIEW_PASSWORD_ENV = {
  worker: 'STORE_REVIEW_WORKER_PASSWORD',
  company: 'STORE_REVIEW_COMPANY_PASSWORD',
  admin: 'STORE_REVIEW_ADMIN_PASSWORD',
} as const;

const OTHER_ACCOUNT_PASSWORD_ENVS = [
  'SEED_ADMIN_PASSWORD',
  'SEED_RESTRICTED_ADMIN_PASSWORD',
  'SEED_COMPANY_PASSWORD',
  'SEED_WORKER_PASSWORD',
  'SMOKE_ADMIN_PASSWORD',
  'SMOKE_AUDIT_ADMIN_PASSWORD',
  'SMOKE_RESTRICTED_ADMIN_PASSWORD',
  'SMOKE_COMPANY_PASSWORD',
  'SMOKE_WORKER_PASSWORD',
] as const;

export const STORE_REVIEW_ADMIN_PERMISSIONS = [
  'view_dashboard',
  'view_workers',
  'view_companies',
  'view_orders',
  'view_assignments',
  'view_attendance',
  'view_notifications',
] as const;

export type StoreReviewIdentifiers = {
  workerPhone: string;
  companyPhone: string;
  companyEmail: string;
  adminPhone: string;
  adminEmail: string;
};

export type StoreReviewPasswords = {
  worker: string;
  company: string;
  admin: string;
};

export type StoreReviewAccountConfig = {
  identifiers: StoreReviewIdentifiers;
  passwords: StoreReviewPasswords;
  adminPermissions: readonly string[];
};

function requiredValue(envName: string, env: Environment): string {
  const value = env[envName]?.trim();
  if (!value || /^<[^>]+>$/.test(value)) {
    throw new Error(`STORE_REVIEW_ENV_REQUIRED:${envName}`);
  }
  return value;
}

function requiredPhone(envName: string, env: Environment): string {
  const phone = requiredValue(envName, env).replace(/[\s().-]/g, '');
  if (!E164_PATTERN.test(phone)) {
    throw new Error(`STORE_REVIEW_PHONE_INVALID:${envName}`);
  }
  return phone;
}

function requiredEmail(envName: string, env: Environment): string {
  const email = requiredValue(envName, env).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error(`STORE_REVIEW_EMAIL_INVALID:${envName}`);
  }
  return email;
}

function requiredPassword(envName: string, env: Environment): string {
  const password = requiredValue(envName, env);
  assertAcceptableSeedPassword(envName, password);
  return password;
}

export function resolveStoreReviewIdentifiers(
  env: Environment = process.env,
): StoreReviewIdentifiers {
  const identifiers = {
    workerPhone: requiredPhone(STORE_REVIEW_IDENTIFIER_ENV.workerPhone, env),
    companyPhone: requiredPhone(STORE_REVIEW_IDENTIFIER_ENV.companyPhone, env),
    companyEmail: requiredEmail(STORE_REVIEW_IDENTIFIER_ENV.companyEmail, env),
    adminPhone: requiredPhone(STORE_REVIEW_IDENTIFIER_ENV.adminPhone, env),
    adminEmail: requiredEmail(STORE_REVIEW_IDENTIFIER_ENV.adminEmail, env),
  };

  const phoneValues = [
    identifiers.workerPhone,
    identifiers.companyPhone,
    identifiers.adminPhone,
  ];
  if (new Set(phoneValues).size !== phoneValues.length) {
    throw new Error('STORE_REVIEW_PHONE_REUSE');
  }
  if (identifiers.companyEmail === identifiers.adminEmail) {
    throw new Error('STORE_REVIEW_EMAIL_REUSE');
  }

  return identifiers;
}

export function assertStoreReviewPasswordsUnique(
  reviewPasswords: StoreReviewPasswords,
  otherPasswords: Record<string, string> = {},
): void {
  const seen = new Map<string, string>();
  const allPasswords = {
    [STORE_REVIEW_PASSWORD_ENV.worker]: reviewPasswords.worker,
    [STORE_REVIEW_PASSWORD_ENV.company]: reviewPasswords.company,
    [STORE_REVIEW_PASSWORD_ENV.admin]: reviewPasswords.admin,
    ...otherPasswords,
  };

  for (const [name, password] of Object.entries(allPasswords)) {
    const previous = seen.get(password);
    if (previous) {
      throw new Error(`STORE_REVIEW_PASSWORD_REUSE:${name}:${previous}`);
    }
    seen.set(password, name);
  }
}

export function resolveStoreReviewPasswords(
  env: Environment = process.env,
): StoreReviewPasswords {
  const passwords = {
    worker: requiredPassword(STORE_REVIEW_PASSWORD_ENV.worker, env),
    company: requiredPassword(STORE_REVIEW_PASSWORD_ENV.company, env),
    admin: requiredPassword(STORE_REVIEW_PASSWORD_ENV.admin, env),
  };
  const otherConfiguredPasswords = Object.fromEntries(
    OTHER_ACCOUNT_PASSWORD_ENVS.flatMap((name) => {
      const value = env[name]?.trim();
      return value ? [[name, value]] : [];
    }),
  );
  assertStoreReviewPasswordsUnique(passwords, otherConfiguredPasswords);
  return passwords;
}

export function resolveStoreReviewAccountConfig(
  env: Environment = process.env,
): StoreReviewAccountConfig {
  return {
    identifiers: resolveStoreReviewIdentifiers(env),
    passwords: resolveStoreReviewPasswords(env),
    adminPermissions: STORE_REVIEW_ADMIN_PERMISSIONS,
  };
}

// Backward-compatible names for release tooling while it moves from the
// platform-specific Apple label to shared Apple/Google store review accounts.
export const APPLE_REVIEW_PASSWORD_ENV = STORE_REVIEW_PASSWORD_ENV;
export const APPLE_REVIEW_ADMIN_PERMISSIONS = STORE_REVIEW_ADMIN_PERMISSIONS;
export type AppleReviewPasswords = StoreReviewPasswords;
export const resolveAppleReviewPasswords = resolveStoreReviewPasswords;
export const resolveAppleReviewPasswordsForSeed = resolveStoreReviewPasswords;
export const assertAppleReviewPasswordsUnique = assertStoreReviewPasswordsUnique;
