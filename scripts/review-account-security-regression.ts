import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {
  APPLE_REVIEW_ADMIN_EMAIL,
  APPLE_REVIEW_ADMIN_PERMISSIONS,
  APPLE_REVIEW_ADMIN_PHONE,
  APPLE_REVIEW_COMPANY_EMAIL,
  APPLE_REVIEW_COMPANY_PHONE,
  APPLE_REVIEW_WORKER_PHONE,
  AppleReviewPasswords,
  assertAppleReviewPasswordsUnique,
  resolveAppleReviewPasswords,
  resolveAppleReviewPasswordsForSeed,
} from '../src/lib/apple-review-accounts';
import {
  ReviewAccountSnapshot,
  ReviewAccountRecord,
  validateAppleReviewAccounts,
} from './review-account-readiness';

const passwords: AppleReviewPasswords = {
  worker: 'Apple-Worker-Review-Password-42!',
  company: 'Apple-Company-Review-Password-43!',
  admin: 'Apple-Admin-Review-Password-44!',
};

const legacyPasswords = {
  worker: 'Legacy-Worker-Seed-Password-52!',
  company: 'Legacy-Company-Seed-Password-53!',
  admin: 'Legacy-Admin-Seed-Password-54!',
  superAdmin: 'Legacy-Super-Admin-Password-55!',
};

async function hash(value: string): Promise<string> {
  return bcrypt.hash(value, 4);
}

async function makeRecord(
  input: Partial<ReviewAccountRecord> & Pick<ReviewAccountRecord, 'phone' | 'role'>,
): Promise<ReviewAccountRecord> {
  return {
    email: null,
    is_active: true,
    deleted_at: null,
    password_hash: await hash(passwords.worker),
    password_set_at: new Date(),
    ...input,
  };
}

async function makeValidSnapshot(): Promise<ReviewAccountSnapshot> {
  return {
    worker: await makeRecord({
      phone: APPLE_REVIEW_WORKER_PHONE,
      role: 'worker',
      password_hash: await hash(passwords.worker),
      worker: { status: 'approved', deleted_at: null },
    }),
    company: await makeRecord({
      phone: APPLE_REVIEW_COMPANY_PHONE,
      email: APPLE_REVIEW_COMPANY_EMAIL,
      role: 'company',
      password_hash: await hash(passwords.company),
      company: { status: 'approved', deleted_at: null },
    }),
    admin: await makeRecord({
      phone: APPLE_REVIEW_ADMIN_PHONE,
      email: APPLE_REVIEW_ADMIN_EMAIL,
      role: 'admin',
      password_hash: await hash(passwords.admin),
      admin: { permissions: [...APPLE_REVIEW_ADMIN_PERMISSIONS] },
    }),
    otherSeedUsers: [
      {
        phone: '+994700000001',
        email: 'admin@setservice.az',
        role: 'super_admin',
        password_hash: await hash(legacyPasswords.superAdmin),
      },
      {
        phone: '+994700000004',
        email: null,
        role: 'worker',
        password_hash: await hash(legacyPasswords.worker),
      },
      {
        phone: '+994700000005',
        email: null,
        role: 'worker',
        password_hash: await hash(legacyPasswords.worker),
      },
      {
        phone: '+994700000102',
        email: 'reports@setservice.az',
        role: 'admin',
        password_hash: await hash(legacyPasswords.admin),
      },
      {
        phone: '+994700000099',
        email: 'other-company@setservice.az',
        role: 'company',
        password_hash: await hash(legacyPasswords.company),
      },
    ],
  };
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof Error && error.message === code);
}

function cloneSnapshot(snapshot: ReviewAccountSnapshot): ReviewAccountSnapshot {
  return {
    worker: snapshot.worker && {
      ...snapshot.worker,
      worker: snapshot.worker.worker && { ...snapshot.worker.worker },
    },
    company: snapshot.company && {
      ...snapshot.company,
      company: snapshot.company.company && { ...snapshot.company.company },
    },
    admin: snapshot.admin && {
      ...snapshot.admin,
      admin: snapshot.admin.admin && {
        permissions: Array.isArray(snapshot.admin.admin.permissions)
          ? [...snapshot.admin.admin.permissions]
          : snapshot.admin.admin.permissions,
      },
    },
    otherSeedUsers: snapshot.otherSeedUsers?.map((user) => ({ ...user })),
  };
}

async function testExactConfiguration(): Promise<void> {
  const snapshot = await makeValidSnapshot();
  await validateAppleReviewAccounts(snapshot, passwords);

  assert.equal(
    await bcrypt.compare(passwords.worker, snapshot.otherSeedUsers![1].password_hash!),
    false,
  );
  assert.equal(
    await bcrypt.compare(passwords.company, snapshot.otherSeedUsers![4].password_hash!),
    false,
  );
  assert.equal(
    await bcrypt.compare(passwords.admin, snapshot.otherSeedUsers![3].password_hash!),
    false,
  );
}

async function testPasswordAndIdentifierFailures(): Promise<void> {
  const workerPassword = await makeValidSnapshot();
  await expectCode(
    () => validateAppleReviewAccounts(workerPassword, { ...passwords, worker: 'Wrong-Worker-Password-42!' }),
    'REVIEW_WORKER_PASSWORD_MISMATCH',
  );

  const companyPassword = await makeValidSnapshot();
  await expectCode(
    () => validateAppleReviewAccounts(companyPassword, { ...passwords, company: 'Wrong-Company-Password-43!' }),
    'REVIEW_COMPANY_PASSWORD_MISMATCH',
  );

  const adminPassword = await makeValidSnapshot();
  await expectCode(
    () => validateAppleReviewAccounts(adminPassword, { ...passwords, admin: 'Wrong-Admin-Password-44!' }),
    'REVIEW_ADMIN_PASSWORD_MISMATCH',
  );

  const workerPhone = await makeValidSnapshot();
  workerPhone.worker!.phone = '+994700000099';
  await expectCode(() => validateAppleReviewAccounts(workerPhone, passwords), 'REVIEW_WORKER_PHONE_INVALID');

  const companyPhone = await makeValidSnapshot();
  companyPhone.company!.phone = '+994700000099';
  await expectCode(() => validateAppleReviewAccounts(companyPhone, passwords), 'REVIEW_COMPANY_PHONE_INVALID');

  const companyEmail = await makeValidSnapshot();
  companyEmail.company!.email = 'wrong@setservice.az';
  await expectCode(() => validateAppleReviewAccounts(companyEmail, passwords), 'REVIEW_COMPANY_EMAIL_INVALID');

  const adminPhone = await makeValidSnapshot();
  adminPhone.admin!.phone = '+994700000099';
  await expectCode(() => validateAppleReviewAccounts(adminPhone, passwords), 'REVIEW_ADMIN_PHONE_INVALID');

  const adminEmail = await makeValidSnapshot();
  adminEmail.admin!.email = 'wrong-admin@setservice.az';
  await expectCode(() => validateAppleReviewAccounts(adminEmail, passwords), 'REVIEW_ADMIN_EMAIL_INVALID');
}

async function testStateAndPermissionFailures(): Promise<void> {
  const inactive = await makeValidSnapshot();
  inactive.worker!.is_active = false;
  await expectCode(() => validateAppleReviewAccounts(inactive, passwords), 'REVIEW_WORKER_INACTIVE');

  const unapproved = await makeValidSnapshot();
  unapproved.worker!.worker!.status = 'pending_approval';
  await expectCode(() => validateAppleReviewAccounts(unapproved, passwords), 'REVIEW_WORKER_NOT_APPROVED');

  const companyUnapproved = await makeValidSnapshot();
  companyUnapproved.company!.company!.status = 'pending_approval';
  await expectCode(() => validateAppleReviewAccounts(companyUnapproved, passwords), 'REVIEW_COMPANY_NOT_APPROVED');

  for (const permission of ['manage_companies', '*', 'manage_admins']) {
    const snapshot = await makeValidSnapshot();
    snapshot.admin!.admin!.permissions = [...APPLE_REVIEW_ADMIN_PERMISSIONS, permission];
    await expectCode(
      () => validateAppleReviewAccounts(snapshot, passwords),
      permission === '*' ? 'REVIEW_ADMIN_WILDCARD_FORBIDDEN' :
        permission === 'manage_admins' ? 'REVIEW_ADMIN_MANAGEMENT_FORBIDDEN' :
          'REVIEW_ADMIN_PERMISSION_ALLOWLIST_MISMATCH',
    );
  }

  const missingPermission = await makeValidSnapshot();
  missingPermission.admin!.admin!.permissions = [...APPLE_REVIEW_ADMIN_PERMISSIONS].slice(1);
  await expectCode(
    () => validateAppleReviewAccounts(missingPermission, passwords),
    'REVIEW_ADMIN_PERMISSION_ALLOWLIST_MISMATCH',
  );

  const duplicatePermission = await makeValidSnapshot();
  duplicatePermission.admin!.admin!.permissions = [
    ...APPLE_REVIEW_ADMIN_PERMISSIONS,
    'view_dashboard',
  ];
  await expectCode(
    () => validateAppleReviewAccounts(duplicatePermission, passwords),
    'REVIEW_ADMIN_PERMISSIONS_DUPLICATE',
  );

  const superAdmin = await makeValidSnapshot();
  superAdmin.admin!.role = 'super_admin';
  await expectCode(() => validateAppleReviewAccounts(superAdmin, passwords), 'REVIEW_ADMIN_ROLE_INVALID');
}

function testPasswordConfiguration(): void {
  const env = {
    APPLE_REVIEW_WORKER_PASSWORD: passwords.worker,
    APPLE_REVIEW_COMPANY_PASSWORD: passwords.company,
    APPLE_REVIEW_ADMIN_PASSWORD: passwords.admin,
  };
  assert.deepEqual(resolveAppleReviewPasswords(env), passwords);
  assert.deepEqual(resolveAppleReviewPasswordsForSeed(env), passwords);

  for (const missing of Object.keys(env)) {
    const incomplete = { ...env };
    delete incomplete[missing as keyof typeof incomplete];
    assert.throws(
      () => resolveAppleReviewPasswords(incomplete),
      (error: unknown) => error instanceof Error && error.message.endsWith(missing),
    );
  }

  assertAppleReviewPasswordsUnique(passwords, {
    SEED_WORKER_PASSWORD: legacyPasswords.worker,
    SEED_COMPANY_PASSWORD: legacyPasswords.company,
    SEED_RESTRICTED_ADMIN_PASSWORD: legacyPasswords.admin,
    SEED_ADMIN_PASSWORD: legacyPasswords.superAdmin,
  });
  assert.throws(
    () => assertAppleReviewPasswordsUnique(passwords, { SEED_WORKER_PASSWORD: passwords.worker }),
    /APPLE_REVIEW_PASSWORD_REUSE/,
  );
}

function testSeedWiring(): void {
  const source = fs.readFileSync(path.resolve('scripts/seed.ts'), 'utf8');
  assert.ok(source.includes('resolveAppleReviewPasswordsForSeed()'));
  assert.ok(source.includes('assertAppleReviewPasswordsUnique(APPLE_REVIEW_PASSWORDS'));
  assert.ok(source.includes('password_hash: appleReviewWorkerPasswordHash'));
  assert.ok(source.includes('password_hash: appleReviewCompanyPasswordHash'));
  assert.ok(source.includes('password_hash: appleReviewAdminPasswordHash'));
  assert.ok(source.includes("phone: '+994700000004'"));
  assert.ok(source.includes("phone: '+994700000005'"));
  assert.ok(source.includes('password_hash: workerPasswordHash'));
  assert.ok(source.includes("phone: '+994700000102'"));
  assert.ok(source.includes('password_hash: restrictedAdminPasswordHash'));
  assert.ok(source.includes('reconcile_password: true'));
  assert.ok(source.includes('password_set_at: new Date()'));
  assert.ok(!source.includes('SEED_WORKER_PHONE'));
  assert.ok(!source.includes('SEED_COMPANY_PHONE'));
  assert.ok(!source.includes('SEED_OPS_ADMIN_PHONE'));
  assert.ok(!source.includes('SEED_OPS_ADMIN_EMAIL'));
}

async function main(): Promise<void> {
  testPasswordConfiguration();
  testSeedWiring();
  await testExactConfiguration();
  await testPasswordAndIdentifierFailures();
  await testStateAndPermissionFailures();
  console.log('review-account-security-regression: OK');
}

void main();
