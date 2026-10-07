import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertAcceptableSeedPassword,
  assertSeedAllowed,
  resolveSeedPassword,
  safeSeedErrorName,
} from '../src/lib/seed-safety';

function expectErrorCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => error instanceof Error && error.message === code);
}

function testProductionGuard(): void {
  expectErrorCode(
    () => assertSeedAllowed({ NODE_ENV: 'production' }),
    'PRODUCTION_SEED_DISABLED'
  );
  assert.doesNotThrow(() => assertSeedAllowed({
    NODE_ENV: 'production',
    ALLOW_PRODUCTION_SEED: 'true',
  }));
  assert.doesNotThrow(() => assertSeedAllowed({ NODE_ENV: 'development' }));
}

function testPasswordPolicy(): void {
  expectErrorCode(
    () => resolveSeedPassword('SEED_ADMIN_PASSWORD', {
      NODE_ENV: 'production',
      ALLOW_PRODUCTION_SEED: 'true',
    }),
    'PRODUCTION_SEED_PASSWORD_REQUIRED:SEED_ADMIN_PASSWORD'
  );
  expectErrorCode(
    () => assertAcceptableSeedPassword('SEED_ADMIN_PASSWORD', '<secret-reference>'),
    'UNSAFE_SEED_PASSWORD:SEED_ADMIN_PASSWORD'
  );
  expectErrorCode(
    () => assertAcceptableSeedPassword('SEED_ADMIN_PASSWORD', 'short'),
    'UNSAFE_SEED_PASSWORD:SEED_ADMIN_PASSWORD'
  );

  const explicit = 'Long-Production-Seed-Password-42!';
  assert.equal(resolveSeedPassword('SEED_ADMIN_PASSWORD', {
    NODE_ENV: 'production',
    ALLOW_PRODUCTION_SEED: 'true',
    SEED_ADMIN_PASSWORD: explicit,
  }), explicit);

  const generated = resolveSeedPassword('SEED_ADMIN_PASSWORD', {
    NODE_ENV: 'development',
  });
  assert.ok(generated.length >= 16);
  assert.notEqual(generated, resolveSeedPassword('SEED_ADMIN_PASSWORD', {
    NODE_ENV: 'development',
  }));
}

function testSeedSourceSafety(): void {
  const source = fs.readFileSync(path.resolve('scripts/seed.ts'), 'utf8');
  const readinessSource = fs.readFileSync(
    path.resolve('scripts/review-account-readiness.ts'),
    'utf8',
  );
  assert.ok(source.includes('assertSeedAllowed();'));
  assert.ok(source.includes('resolveAppleReviewPasswordsForSeed()'));
  assert.ok(source.includes('assertAppleReviewPasswordsUnique(APPLE_REVIEW_PASSWORDS'));
  assert.ok(source.includes('APPLE_REVIEW_WORKER_PHONE'));
  assert.ok(source.includes('APPLE_REVIEW_COMPANY_EMAIL'));
  assert.ok(source.includes('APPLE_REVIEW_ADMIN_EMAIL'));
  assert.ok(source.includes("resolveSeedPassword('SEED_RESTRICTED_ADMIN_PASSWORD')"));
  assert.ok(source.includes("resolveSeedPassword('SEED_COMPANY_PASSWORD')"));
  assert.ok(source.includes("resolveSeedPassword('SEED_WORKER_PASSWORD')"));
  assert.ok(source.includes('password_hash: appleReviewWorkerPasswordHash'));
  assert.ok(source.includes('password_hash: appleReviewCompanyPasswordHash'));
  assert.ok(source.includes('password_hash: appleReviewAdminPasswordHash'));
  assert.ok(source.includes('password_hash: restrictedAdminPasswordHash'));
  assert.ok(source.includes('password_hash: workerPasswordHash'));
  assert.ok(source.includes('reconcile_password: true'));
  assert.ok(source.includes('reconcile_password?: boolean'));
  assert.ok(source.includes("status: 'approved'"));
  assert.ok(source.includes('permissions: APPLE_REVIEW_ADMIN_PERMISSIONS'));
  assert.ok(source.includes('prisma.order.findFirst'));
  assert.ok(!source.includes("console.log('OTP"));
  assert.ok(!source.includes('passwordSource('));
  assert.ok(!source.includes("console.log('Worker:', input.phone"));
  assert.ok(!source.includes("console.log('Super admin:', admin.phone"));
  assert.ok(readinessSource.includes('bcrypt.compare'));
  assert.ok(readinessSource.includes('APPLE_REVIEW_WORKER_PHONE'));
  assert.ok(readinessSource.includes('APPLE_REVIEW_COMPANY_PHONE'));
  assert.ok(readinessSource.includes('APPLE_REVIEW_ADMIN_PHONE'));
  assert.ok(readinessSource.includes('REVIEW_ADMIN_PERMISSION_ALLOWLIST_MISMATCH'));
  assert.ok(readinessSource.includes('REVIEW_PASSWORD_REUSED_BY_SEED_ACCOUNT'));
  assert.ok(!readinessSource.includes('seedIdentifier'));
}

function testSafeErrorName(): void {
  assert.equal(safeSeedErrorName(new TypeError('contains sensitive material')), 'TypeError');
  assert.equal(safeSeedErrorName('contains sensitive material'), 'UnknownError');
}

testProductionGuard();
testPasswordPolicy();
testSeedSourceSafety();
testSafeErrorName();
console.log('seed security regression tests passed');
