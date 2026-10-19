import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { StoreReviewAccountConfig } from '../src/lib/store-review-accounts';
import {
  ReviewUserRecord,
  STORE_REVIEW_ACTIVE_ORDER_WINDOW_DAYS,
  STORE_REVIEW_MIN_ACTIVE_WINDOW_DAYS,
  StoreReviewWorkerAdoptionState,
  StoreReviewProvisionOptions,
  assertStoreReviewAdoptionSafe,
  assertStoreReviewPlanCanApply,
  assertStoreReviewProvisionAllowed,
  buildStoreReviewProvisionPlan,
  classifyReviewAccounts,
  isPristineWorkerAdoptionProfile,
  parseStoreReviewProvisionArgs,
  storeReviewSessionResetReason,
} from './provision-store-review';

const config: StoreReviewAccountConfig = {
  identifiers: {
    workerPhone: '+994501110001',
    companyPhone: '+994501110002',
    companyEmail: 'review-company@example.invalid',
    adminPhone: '+994501110003',
    adminEmail: 'review-admin@example.invalid',
  },
  passwords: {
    worker: 'Worker-Provision-Password-42!',
    company: 'Company-Provision-Password-43!',
    admin: 'Admin-Provision-Password-44!',
  },
  adminPermissions: ['view_dashboard'],
};

const dryRun: StoreReviewProvisionOptions = {
  apply: false,
  adoptExisting: false,
  rotatePasswords: false,
};

function expectCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => error instanceof Error && error.message === code);
}

function pristineWorkerAdoptionState(): StoreReviewWorkerAdoptionState {
  return {
    position: null,
    profile_photo_url: null,
    skills: [],
    languages: [],
    documents: [],
    work_history_summary: null,
    work_history: [],
    gender: null,
    whatsapp_available: false,
    status: 'pending_otp',
    reject_reason: null,
    approved_at: null,
    approved_by_id: null,
    rejected_at: null,
    rejected_by_id: null,
    suspended_at: null,
    worker_class: null,
    is_foc_training: false,
    foc_training_note: null,
    foc_training_updated_at: null,
    foc_training_updated_by_id: null,
    rating_avg: 0,
    rating_count: 0,
    availability: true,
    deleted_at: null,
  };
}

function testWorkerAdoptionProfileSafety(): void {
  assert.equal(isPristineWorkerAdoptionProfile(pristineWorkerAdoptionState()), true);

  const unsafeChanges: Array<Partial<StoreReviewWorkerAdoptionState>> = [
    { gender: 'synthetic' },
    { worker_class: 'A' },
    { is_foc_training: true },
    { foc_training_note: 'pre-existing note' },
    { foc_training_updated_at: new Date() },
    { foc_training_updated_by_id: 'pre-existing-actor' },
    { rating_avg: 4.5 },
    { rating_count: 1 },
    { status: 'approved' },
    { approved_at: new Date() },
    { approved_by_id: 'pre-existing-approver' },
    { rejected_at: new Date() },
    { rejected_by_id: 'pre-existing-rejector' },
    { suspended_at: new Date() },
    { reject_reason: 'pre-existing decision' },
  ];
  for (const change of unsafeChanges) {
    assert.equal(
      isPristineWorkerAdoptionProfile({ ...pristineWorkerAdoptionState(), ...change }),
      false,
      `worker adoption must reject pre-existing state: ${Object.keys(change).join(',')}`,
    );
  }
}

function testArgumentsAndProductionGates(): void {
  assert.deepEqual(parseStoreReviewProvisionArgs([]), dryRun);
  assert.deepEqual(parseStoreReviewProvisionArgs(['--apply']), {
    apply: true,
    adoptExisting: false,
    rotatePasswords: false,
  });
  expectCode(
    () => parseStoreReviewProvisionArgs(['--rotate-passwords']),
    'STORE_REVIEW_APPLY_FLAG_REQUIRED',
  );
  expectCode(
    () => parseStoreReviewProvisionArgs(['--unknown']),
    'STORE_REVIEW_ARGUMENT_INVALID',
  );

  const apply = parseStoreReviewProvisionArgs(['--apply']);
  expectCode(
    () => assertStoreReviewProvisionAllowed(apply, { NODE_ENV: 'test' }),
    'PRODUCTION_REVIEW_PROVISION_DISABLED',
  );
  expectCode(
    () => assertStoreReviewProvisionAllowed(apply, {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://local.invalid/setservice',
    }),
    'PRODUCTION_REVIEW_PROVISION_DISABLED',
  );
  assert.doesNotThrow(() => assertStoreReviewProvisionAllowed(apply, {
    NODE_ENV: 'test',
    ALLOW_PRODUCTION_REVIEW_PROVISION: 'true',
    STORE_REVIEW_OUTBOX_QUIESCED: 'true',
  }));
  expectCode(
    () => assertStoreReviewProvisionAllowed(apply, {
      NODE_ENV: 'test',
      ALLOW_PRODUCTION_REVIEW_PROVISION: 'true',
    }),
    'STORE_REVIEW_OUTBOX_NOT_QUIESCED',
  );

  const adopt = parseStoreReviewProvisionArgs(['--apply', '--adopt-existing']);
  expectCode(
    () => assertStoreReviewProvisionAllowed(adopt, {
      NODE_ENV: 'test',
      ALLOW_PRODUCTION_REVIEW_PROVISION: 'true',
      STORE_REVIEW_OUTBOX_QUIESCED: 'true',
    }),
    'PRODUCTION_REVIEW_ADOPTION_DISABLED',
  );
  assert.doesNotThrow(() => assertStoreReviewProvisionAllowed(adopt, {
    NODE_ENV: 'test',
    ALLOW_PRODUCTION_REVIEW_PROVISION: 'true',
    STORE_REVIEW_OUTBOX_QUIESCED: 'true',
    ALLOW_PRODUCTION_REVIEW_ADOPTION: 'true',
  }));
}

async function candidate(
  role: 'worker' | 'company' | 'admin',
  reviewAccount: boolean,
): Promise<ReviewUserRecord> {
  const phone = role === 'worker'
    ? config.identifiers.workerPhone
    : role === 'company'
      ? config.identifiers.companyPhone
      : config.identifiers.adminPhone;
  const email = role === 'worker'
    ? null
    : role === 'company'
      ? config.identifiers.companyEmail
      : config.identifiers.adminEmail;
  return {
    id: `${role}-id`,
    phone,
    email,
    pending_email: null,
    password_hash: await bcrypt.hash(config.passwords[role], 4),
    role,
    is_active: true,
    is_review_account: reviewAccount,
    deleted_at: null,
    worker: role === 'worker' ? {
      id: 'worker-profile',
      status: 'approved',
      suspended_at: null,
      deleted_at: null,
    } : null,
    company: role === 'company' ? {
      id: 'company-profile',
      status: 'approved',
      suspended_at: null,
      deleted_at: null,
    } : null,
    admin: role === 'admin' ? { id: 'admin-profile' } : null,
  };
}

async function testCollisionAndAdoptionPlanning(): Promise<void> {
  const empty = await classifyReviewAccounts([], config);
  const emptyPlan = buildStoreReviewProvisionPlan(empty, dryRun);
  assert.equal(emptyPlan.createCount, 3);
  assert.equal(emptyPlan.adoptionRequiredCount, 0);

  const legacyWorker = await candidate('worker', false);
  const classified = await classifyReviewAccounts([legacyWorker], config);
  const applyOptions: StoreReviewProvisionOptions = {
    apply: true,
    adoptExisting: false,
    rotatePasswords: false,
  };
  const adoptionPlan = buildStoreReviewProvisionPlan(classified, applyOptions);
  assert.equal(adoptionPlan.adoptionRequiredCount, 1);
  expectCode(
    () => assertStoreReviewPlanCanApply(adoptionPlan, applyOptions),
    'STORE_REVIEW_ADOPTION_REQUIRED',
  );
  assert.doesNotThrow(() => assertStoreReviewPlanCanApply(adoptionPlan, {
    ...applyOptions,
    adoptExisting: true,
  }));
  assert.equal(
    storeReviewSessionResetReason(classified[0], { ...applyOptions, adoptExisting: true }),
    'store_review_adoption',
  );

  const activeReviewWorker = await candidate('worker', true);
  assert.equal(
    storeReviewSessionResetReason(
      { spec: classified[0].spec, existing: activeReviewWorker, passwordMatches: true },
      applyOptions,
    ),
    null,
  );
  assert.equal(
    storeReviewSessionResetReason(
      {
        spec: classified[0].spec,
        existing: { ...activeReviewWorker, is_active: false },
        passwordMatches: true,
      },
      applyOptions,
    ),
    'store_review_reactivation',
  );
  for (const workerProfile of [
    { ...activeReviewWorker.worker!, status: 'pending_approval' as const },
    { ...activeReviewWorker.worker!, status: 'suspended' as const, suspended_at: new Date() },
    { ...activeReviewWorker.worker!, status: 'inactive' as const },
    { ...activeReviewWorker.worker!, deleted_at: new Date() },
  ]) {
    assert.equal(
      storeReviewSessionResetReason(
        {
          spec: classified[0].spec,
          existing: { ...activeReviewWorker, worker: workerProfile },
          passwordMatches: true,
        },
        applyOptions,
      ),
      'store_review_reactivation',
      `worker profile state ${workerProfile.status} must reset sessions`,
    );
  }

  const activeReviewCompany = await candidate('company', true);
  for (const companyProfile of [
    { ...activeReviewCompany.company!, status: 'pending_approval' as const },
    { ...activeReviewCompany.company!, status: 'suspended' as const, suspended_at: new Date() },
    { ...activeReviewCompany.company!, status: 'inactive' as const },
    { ...activeReviewCompany.company!, deleted_at: new Date() },
  ]) {
    assert.equal(
      storeReviewSessionResetReason(
        {
          spec: {
            role: 'company',
            phone: config.identifiers.companyPhone,
            email: config.identifiers.companyEmail,
          },
          existing: { ...activeReviewCompany, company: companyProfile },
          passwordMatches: true,
        },
        applyOptions,
      ),
      'store_review_reactivation',
      `company profile state ${companyProfile.status} must reset sessions`,
    );
  }
  assert.equal(
    storeReviewSessionResetReason(
      {
        spec: classified[0].spec,
        existing: {
          ...activeReviewWorker,
          worker: { ...activeReviewWorker.worker!, status: 'suspended', suspended_at: new Date() },
        },
        passwordMatches: true,
      },
      { ...applyOptions, rotatePasswords: true },
    ),
    'store_review_reactivation',
    'profile reactivation must remain the primary reset reason when a password also rotates',
  );
  assert.equal(
    storeReviewSessionResetReason(
      { spec: classified[0].spec, existing: activeReviewWorker, passwordMatches: true },
      { ...applyOptions, rotatePasswords: true },
    ),
    'store_review_password_rotation',
  );

  const passwordMismatch = { ...legacyWorker, is_review_account: true, password_hash: await bcrypt.hash('Different-Password-99!', 4) };
  const mismatchClassified = await classifyReviewAccounts([passwordMismatch], config);
  const mismatchPlan = buildStoreReviewProvisionPlan(mismatchClassified, applyOptions);
  assert.equal(mismatchPlan.passwordRotationRequiredCount, 1);
  expectCode(
    () => assertStoreReviewPlanCanApply(mismatchPlan, applyOptions),
    'STORE_REVIEW_PASSWORD_ROTATION_REQUIRED',
  );

  const mismatchedEmail = { ...await candidate('company', false), email: 'collision@example.invalid' };
  await assert.rejects(
    () => classifyReviewAccounts([mismatchedEmail], config),
    (error: unknown) => error instanceof Error
      && error.message === 'STORE_REVIEW_IDENTIFIER_COLLISION:company',
  );

  const crossRole = {
    ...await candidate('worker', false),
    company: {
      id: 'unexpected',
      status: 'approved' as const,
      suspended_at: null,
      deleted_at: null,
    },
  };
  await assert.rejects(
    () => classifyReviewAccounts([crossRole], config),
    (error: unknown) => error instanceof Error
      && error.message === 'STORE_REVIEW_ROLE_PROFILE_COLLISION:worker',
  );

  const pendingEmailCollision = {
    ...await candidate('worker', false),
    phone: '+994501119999',
    pending_email: config.identifiers.companyEmail,
  };
  await assert.rejects(
    () => classifyReviewAccounts([pendingEmailCollision], config),
    (error: unknown) => error instanceof Error
      && error.message === 'STORE_REVIEW_PENDING_EMAIL_IDENTIFIER_COLLISION',
  );

  assert.doesNotThrow(() => assertStoreReviewAdoptionSafe('worker', {
    relationshipCount: 0,
    profileDataPresent: false,
  }));
  expectCode(
    () => assertStoreReviewAdoptionSafe('worker', {
      relationshipCount: 1,
      profileDataPresent: false,
    }),
    'STORE_REVIEW_ADOPTION_DOMAIN_DATA_FORBIDDEN:worker',
  );
  expectCode(
    () => assertStoreReviewAdoptionSafe('admin', {
      relationshipCount: 0,
      profileDataPresent: true,
    }),
    'STORE_REVIEW_ADOPTION_DOMAIN_DATA_FORBIDDEN:admin',
  );
}

function testSourceSafety(): void {
  const source = fs.readFileSync(path.resolve('scripts/provision-store-review.ts'), 'utf8');
  const seed = fs.readFileSync(path.resolve('scripts/seed.ts'), 'utf8');
  const migration = fs.readFileSync(
    path.resolve('prisma/migrations/20261017120000_store_review_account_scope/migration.sql'),
    'utf8',
  );
  const indexMigration = fs.readFileSync(
    path.resolve('prisma/migrations/20261017121000_store_review_account_index/migration.sql'),
    'utf8',
  );
  const prismaSchema = fs.readFileSync(path.resolve('prisma/schema.prisma'), 'utf8');
  const runbook = fs.readFileSync(path.resolve('docs/store-review-provisioning.md'), 'utf8');
  assert.ok(STORE_REVIEW_ACTIVE_ORDER_WINDOW_DAYS >= 30);
  assert.ok(STORE_REVIEW_MIN_ACTIVE_WINDOW_DAYS >= 14);
  assert.ok(STORE_REVIEW_ACTIVE_ORDER_WINDOW_DAYS > STORE_REVIEW_MIN_ACTIVE_WINDOW_DAYS);
  assert.ok(source.includes('pg_advisory_xact_lock'));
  assert.ok(source.includes('SELECT TRUE AS "acquired"'));
  assert.ok(source.includes('Prisma.TransactionIsolationLevel.Serializable'));
  assert.ok(source.includes("error.code === 'P2034'"));
  assert.ok(source.includes('session_version: { increment: 1 }'));
  assert.ok(source.includes('refreshToken.updateMany'));
  assert.ok(source.includes('deviceToken.updateMany'));
  assert.ok(source.includes('store_review_reactivation'));
  assert.ok(source.includes('idempotencyKey.count'));
  assert.ok(source.includes('quarantineReviewProviderEvents'));
  assert.ok(source.includes('{ pending_email: { in: emails } }'));
  assert.ok(source.includes('STORE_REVIEW_PENDING_EMAIL_IDENTIFIER_COLLISION'));
  assert.ok(source.includes('StoreReviewExternalDeliverySuppressed'));
  assert.ok(source.includes('email_verified_at: account.spec.email ? now : null'));
  assert.ok(source.includes("channel: 'in_app'"));
  assert.ok(!source.includes('Hilton'));
  assert.ok(!source.includes('Four Seasons'));
  assert.ok(!source.includes('console.log(config'));
  assert.ok(!seed.includes('STORE_REVIEW_'));
  assert.ok(!seed.includes('APPLE_REVIEW_'));
  assert.match(runbook, /normal authenticated mobile\s+flow/i);
  assert.match(runbook, /malware scanner and private-storage pipeline/i);
  assert.match(runbook, /deliberately fails until\s+the avatar and both owned private documents are ready/i);
  assert.match(migration, /is_review_account.*DEFAULT false/i);
  assert.doesNotMatch(migration, /CREATE INDEX/i);
  assert.match(indexMigration, /^--[^]*CREATE INDEX CONCURRENTLY "users_is_review_account_role_idx"[^;]+;\s*$/i);
  assert.equal((indexMigration.match(/;\s*(?:\r?\n|$)/g) ?? []).length, 1);
  assert.match(
    prismaSchema,
    /@@index\(\[account_user_id, created_at\], map: "external_account_deletion_requests_account_user_id_created_at_i"\)/,
  );
  assert.match(
    prismaSchema,
    /@@index\(\[identifier_hmac, created_at\], map: "external_account_deletion_requests_identifier_hmac_created_at_i"\)/,
  );
  assert.match(migration, /login_succeeded/i);
}

async function main(): Promise<void> {
  testArgumentsAndProductionGates();
  testWorkerAdoptionProfileSafety();
  await testCollisionAndAdoptionPlanning();
  testSourceSafety();
  console.log('store-review-provisioning-regression: OK');
}

void main();
