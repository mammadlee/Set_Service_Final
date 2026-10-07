import 'dotenv/config';

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  APPLE_REVIEW_ADMIN_EMAIL,
  APPLE_REVIEW_ADMIN_PERMISSIONS,
  APPLE_REVIEW_ADMIN_PHONE,
  APPLE_REVIEW_COMPANY_EMAIL,
  APPLE_REVIEW_COMPANY_PHONE,
  APPLE_REVIEW_PASSWORD_ENV,
  APPLE_REVIEW_WORKER_PHONE,
  AppleReviewPasswords,
  assertAppleReviewPasswordsUnique,
  resolveAppleReviewPasswords,
} from '../src/lib/apple-review-accounts';

type Environment = NodeJS.ProcessEnv;

export type ReviewAccountRecord = {
  phone: string;
  email: string | null;
  role: string;
  is_active: boolean;
  deleted_at: Date | null;
  password_hash: string | null;
  password_set_at: Date | null;
  worker?: {
    status: string;
    deleted_at: Date | null;
  } | null;
  company?: {
    status: string;
    deleted_at: Date | null;
  } | null;
  admin?: {
    permissions: unknown;
  } | null;
};

export type ReviewAccountSnapshot = {
  worker: ReviewAccountRecord | null;
  company: ReviewAccountRecord | null;
  admin: ReviewAccountRecord | null;
  otherSeedUsers?: Array<Pick<ReviewAccountRecord, 'phone' | 'email' | 'role' | 'password_hash'>>;
};

export function requireReady(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

async function verifyPassword(
  account: ReviewAccountRecord,
  password: string,
  missingCode: string,
  mismatchCode: string,
): Promise<void> {
  requireReady(account.password_hash, missingCode);
  requireReady(account.password_set_at, `${missingCode}_SET_AT`);
  requireReady(await bcrypt.compare(password, account.password_hash), mismatchCode);
}

function verifyAdminAllowlist(account: ReviewAccountRecord): void {
  const permissions = account.admin?.permissions;
  requireReady(Array.isArray(permissions), 'REVIEW_ADMIN_PERMISSIONS_INVALID');
  requireReady(
    permissions.every((permission): permission is string => typeof permission === 'string'),
    'REVIEW_ADMIN_PERMISSIONS_INVALID',
  );

  const actual = permissions as string[];
  requireReady(!actual.includes('*'), 'REVIEW_ADMIN_WILDCARD_FORBIDDEN');
  requireReady(!actual.includes('manage_admins'), 'REVIEW_ADMIN_MANAGEMENT_FORBIDDEN');

  const expected = [...APPLE_REVIEW_ADMIN_PERMISSIONS];
  const actualSet = new Set(actual);
  requireReady(actualSet.size === actual.length, 'REVIEW_ADMIN_PERMISSIONS_DUPLICATE');
  requireReady(
    actual.length === expected.length && expected.every((permission) => actualSet.has(permission)),
    'REVIEW_ADMIN_PERMISSION_ALLOWLIST_MISMATCH',
  );
}

export async function validateAppleReviewAccounts(
  snapshot: ReviewAccountSnapshot,
  passwords: AppleReviewPasswords,
): Promise<void> {
  assertAppleReviewPasswordsUnique(passwords);

  const worker = snapshot.worker;
  requireReady(worker, 'REVIEW_WORKER_NOT_FOUND');
  requireReady(worker.phone === APPLE_REVIEW_WORKER_PHONE, 'REVIEW_WORKER_PHONE_INVALID');
  requireReady(worker.role === 'worker', 'REVIEW_WORKER_ROLE_INVALID');
  requireReady(worker.is_active && !worker.deleted_at, 'REVIEW_WORKER_INACTIVE');
  await verifyPassword(
    worker,
    passwords.worker,
    'REVIEW_WORKER_PASSWORD_MISSING',
    'REVIEW_WORKER_PASSWORD_MISMATCH',
  );
  requireReady(worker.worker && !worker.worker.deleted_at, 'REVIEW_WORKER_PROFILE_INVALID');
  requireReady(worker.worker.status === 'approved', 'REVIEW_WORKER_NOT_APPROVED');

  const company = snapshot.company;
  requireReady(company, 'REVIEW_COMPANY_NOT_FOUND');
  requireReady(company.phone === APPLE_REVIEW_COMPANY_PHONE, 'REVIEW_COMPANY_PHONE_INVALID');
  requireReady(company.email === APPLE_REVIEW_COMPANY_EMAIL, 'REVIEW_COMPANY_EMAIL_INVALID');
  requireReady(company.role === 'company', 'REVIEW_COMPANY_ROLE_INVALID');
  requireReady(company.is_active && !company.deleted_at, 'REVIEW_COMPANY_INACTIVE');
  await verifyPassword(
    company,
    passwords.company,
    'REVIEW_COMPANY_PASSWORD_MISSING',
    'REVIEW_COMPANY_PASSWORD_MISMATCH',
  );
  requireReady(company.company && !company.company.deleted_at, 'REVIEW_COMPANY_PROFILE_INVALID');
  requireReady(company.company.status === 'approved', 'REVIEW_COMPANY_NOT_APPROVED');

  const admin = snapshot.admin;
  requireReady(admin, 'REVIEW_ADMIN_NOT_FOUND');
  requireReady(admin.phone === APPLE_REVIEW_ADMIN_PHONE, 'REVIEW_ADMIN_PHONE_INVALID');
  requireReady(admin.email === APPLE_REVIEW_ADMIN_EMAIL, 'REVIEW_ADMIN_EMAIL_INVALID');
  requireReady(admin.role === 'admin', 'REVIEW_ADMIN_ROLE_INVALID');
  requireReady(admin.is_active && !admin.deleted_at, 'REVIEW_ADMIN_INACTIVE');
  await verifyPassword(
    admin,
    passwords.admin,
    'REVIEW_ADMIN_PASSWORD_MISSING',
    'REVIEW_ADMIN_PASSWORD_MISMATCH',
  );
  requireReady(admin.admin, 'REVIEW_ADMIN_PROFILE_MISSING');
  verifyAdminAllowlist(admin);

  for (const other of snapshot.otherSeedUsers ?? []) {
    if (!other.password_hash) continue;
    for (const [account, password] of Object.entries(passwords)) {
      requireReady(
        !(await bcrypt.compare(password, other.password_hash)),
        `REVIEW_PASSWORD_REUSED_BY_SEED_ACCOUNT:${account}:${other.phone}`,
      );
    }
  }
}

export async function loadReviewAccountSnapshot(
  prisma: PrismaClient,
): Promise<ReviewAccountSnapshot> {
  const [worker, company, admin, otherSeedUsers] = await Promise.all([
    prisma.user.findUnique({
      where: { phone: APPLE_REVIEW_WORKER_PHONE },
      include: { worker: true },
    }),
    prisma.user.findUnique({
      where: { phone: APPLE_REVIEW_COMPANY_PHONE },
      include: { company: true },
    }),
    prisma.user.findUnique({
      where: { phone: APPLE_REVIEW_ADMIN_PHONE },
      include: { admin: true },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          {
            phone: {
              in: ['+994700000001', '+994700000004', '+994700000005', '+994700000102'],
            },
          },
          { email: 'reports@setservice.az' },
        ],
      },
      select: {
        phone: true,
        email: true,
        role: true,
        password_hash: true,
      },
    }),
  ]);

  return {
    worker: worker as unknown as ReviewAccountRecord | null,
    company: company as unknown as ReviewAccountRecord | null,
    admin: admin as unknown as ReviewAccountRecord | null,
    otherSeedUsers,
  };
}

export async function runReviewAccountReadiness(env: Environment = process.env): Promise<void> {
  const passwords = resolveAppleReviewPasswords(env);
  const legacyPasswords = Object.fromEntries(
    [
      'SEED_ADMIN_PASSWORD',
      'SEED_COMPANY_PASSWORD',
      'SEED_WORKER_PASSWORD',
      'SEED_RESTRICTED_ADMIN_PASSWORD',
    ]
      .map((name) => [name, env[name]?.trim()])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  assertAppleReviewPasswordsUnique(passwords, legacyPasswords);

  const prisma = new PrismaClient();
  try {
    const snapshot = await loadReviewAccountSnapshot(prisma);
    await validateAppleReviewAccounts(snapshot, passwords);
  } finally {
    await prisma.$disconnect();
  }

  console.log('Apple review account readiness passed.', {
    worker: APPLE_REVIEW_WORKER_PHONE,
    company: `${APPLE_REVIEW_COMPANY_EMAIL}/${APPLE_REVIEW_COMPANY_PHONE}`,
    admin: `${APPLE_REVIEW_ADMIN_EMAIL}/${APPLE_REVIEW_ADMIN_PHONE}`,
    password_env: APPLE_REVIEW_PASSWORD_ENV,
    admin_permissions: APPLE_REVIEW_ADMIN_PERMISSIONS,
  });
}

if (require.main === module) {
  void runReviewAccountReadiness().catch((error: unknown) => {
    console.error('Apple review account readiness failed.', {
      error_code: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    });
    process.exitCode = 1;
  });
}
