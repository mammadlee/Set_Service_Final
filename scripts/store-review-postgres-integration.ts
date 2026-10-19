import 'dotenv/config';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  buildOtpProviderOutboxEvent,
  deliverProviderOutboxEvent,
  resolveProviderRecipientOwners,
} from '../src/lib/provider-outbox';
import {
  getOutboxProcessorHealth,
  isOutboxDeliveryStateHealthy,
  processOutboxBatch,
  renderOutboxMetrics,
} from '../src/lib/outbox';
import { prisma as applicationPrisma } from '../src/lib/prisma';
import { StoreReviewAccountConfig } from '../src/lib/store-review-accounts';
import {
  STORE_REVIEW_ACTIVE_ORDER_TITLE,
  STORE_REVIEW_MIN_ACTIVE_WINDOW_DAYS,
  provisionStoreReviewAccounts,
} from './provision-store-review';

const TEST_DATABASE_PREFIX = 'setservice_review_provision_test_';

function requireIsolatedPostgres16Url(env: NodeJS.ProcessEnv): {
  databaseUrl: string;
  adminUrl: string;
  databaseName: string;
} {
  if (env.STORE_REVIEW_PG_INTEGRATION_CONFIRM !== '1') {
    throw new Error('STORE_REVIEW_PG_INTEGRATION_CONFIRM_REQUIRED');
  }
  const raw = env.STORE_REVIEW_PG_TEST_DATABASE_URL;
  if (!raw) throw new Error('STORE_REVIEW_PG_TEST_DATABASE_URL_REQUIRED');

  const parsed = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('STORE_REVIEW_PG_TEST_DATABASE_URL_INVALID');
  }
  const host = parsed.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('STORE_REVIEW_PG_TEST_DATABASE_MUST_BE_LOOPBACK');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!new RegExp(`^${TEST_DATABASE_PREFIX}[a-z0-9_]+$`).test(databaseName)) {
    throw new Error('STORE_REVIEW_PG_TEST_DATABASE_NAME_UNSAFE');
  }
  const schema = parsed.searchParams.get('schema') ?? 'public';
  if (schema !== 'public') {
    throw new Error('STORE_REVIEW_PG_TEST_SCHEMA_UNSAFE');
  }
  parsed.searchParams.set('schema', 'public');
  const admin = new URL(parsed.toString());
  admin.pathname = '/postgres';
  admin.searchParams.set('schema', 'public');
  return { databaseUrl: parsed.toString(), adminUrl: admin.toString(), databaseName };
}

function prismaFor(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

function migrate(databaseUrl: string): void {
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: 'pipe',
  });
}

async function recreateTestDatabase(adminUrl: string, databaseName: string): Promise<void> {
  const prisma = prismaFor(adminUrl);
  try {
    // databaseName has already passed the strict lowercase allowlist above.
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await prisma.$disconnect();
  }
}

async function dropTestDatabase(adminUrl: string, databaseName: string): Promise<void> {
  const prisma = prismaFor(adminUrl);
  try {
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await prisma.$disconnect();
  }
}

function testConfig(prefix: string): StoreReviewAccountConfig {
  const uniquePassword = (role: string) =>
    `${role}-${crypto.randomBytes(24).toString('base64url')}Aa1!`;
  return {
    identifiers: {
      workerPhone: `+99450111${prefix}01`,
      companyPhone: `+99450111${prefix}02`,
      companyEmail: `company-${prefix}@store-review.invalid`,
      adminPhone: `+99450111${prefix}03`,
      adminEmail: `admin-${prefix}@store-review.invalid`,
    },
    passwords: {
      worker: uniquePassword('worker'),
      company: uniquePassword('company'),
      admin: uniquePassword('admin'),
    },
    adminPermissions: ['view_dashboard'],
  };
}

async function seedTaxonomy(prisma: PrismaClient): Promise<void> {
  const department = await prisma.department.create({
    data: { slug: 'store-review-test-department', name_az: 'Synthetic department' },
  });
  const subdepartment = await prisma.subdepartment.create({
    data: {
      department_id: department.id,
      slug: 'store-review-test-subdepartment',
      name_az: 'Synthetic subdepartment',
    },
  });
  await prisma.position.create({
    data: {
      subdepartment_id: subdepartment.id,
      slug: 'waiter-waitress',
      name_az: 'Synthetic service worker',
    },
  });
}

async function assertProvisionedState(prisma: PrismaClient): Promise<void> {
  const users = await prisma.user.findMany({
    where: { is_review_account: true },
    select: {
      id: true,
      role: true,
      email: true,
      email_verified_at: true,
      fcm_token: true,
    },
  });
  assert.equal(users.length, 3);
  for (const user of users) {
    assert.equal(user.fcm_token, null);
    if (user.email) assert.ok(user.email_verified_at);
  }
  assert.equal(await prisma.deviceToken.count({
    where: { user_id: { in: users.map((user) => user.id) }, revoked_at: null },
  }), 0);
  assert.equal(await prisma.order.count(), 2);
  const activeOrder = await prisma.order.findFirstOrThrow({
    where: { title: STORE_REVIEW_ACTIVE_ORDER_TITLE },
    select: { shift_end: true },
  });
  assert.ok(
    activeOrder.shift_end.getTime() - Date.now()
      >= (STORE_REVIEW_MIN_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000),
  );
  assert.equal(await prisma.assignment.count(), 2);
  assert.equal(await prisma.outboxEvent.count(), 0);
}

async function createAdoptionCandidate(
  prisma: PrismaClient,
  config: StoreReviewAccountConfig,
  withDomainData: boolean,
) {
  const pendingEmail = `pending-${config.identifiers.workerPhone.slice(-4)}@store-review.invalid`;
  const user = await prisma.user.create({
    data: {
      phone: config.identifiers.workerPhone,
      password_hash: await bcrypt.hash(config.passwords.worker, 4),
      password_set_at: new Date(),
      role: 'worker',
      name: 'Synthetic adoption candidate',
      pending_email: pendingEmail,
      fcm_token: 'stale-adoption-fcm-token',
      session_version: 7,
      worker: { create: {} },
    },
  });
  const refreshToken = await prisma.refreshToken.create({
    data: {
      user_id: user.id,
      token_hash: crypto.randomBytes(32).toString('hex'),
      jti: crypto.randomUUID(),
      family_id: crypto.randomUUID(),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const deviceToken = await prisma.deviceToken.create({
    data: {
      user_id: user.id,
      token: `adoption-device-${crypto.randomUUID()}`,
      token_hash: crypto.randomBytes(32).toString('hex'),
    },
  });
  const otp = await prisma.otpCode.create({
    data: {
      user_id: user.id,
      phone: config.identifiers.workerPhone,
      code_hash: crypto.randomBytes(32).toString('hex'),
      purpose: 'worker_login',
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
  const pendingEmailOtp = await prisma.otpCode.create({
    data: {
      user_id: user.id,
      phone: `email:${pendingEmail}`,
      code_hash: crypto.randomBytes(32).toString('hex'),
      purpose: 'worker_login',
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
  const providerEvent = buildOtpProviderOutboxEvent({
    channel: 'sms',
    to: config.identifiers.workerPhone,
    purpose: 'worker_login',
    code: '413927',
    dedupeKey: `adoption-${user.id}`,
  });
  await prisma.outboxEvent.create({ data: providerEvent });
  const pendingEmailEvent = buildOtpProviderOutboxEvent({
    channel: 'email',
    to: pendingEmail,
    purpose: 'email_verification',
    code: '413927',
    dedupeKey: `adoption-pending-email-${user.id}`,
  });
  await prisma.outboxEvent.create({ data: pendingEmailEvent });
  if (withDomainData) {
    await prisma.notification.create({
      data: {
        recipient_id: user.id,
        type: 'system',
        channel: 'in_app',
        title: 'Pre-existing domain record',
        body: 'This makes adoption unsafe.',
      },
    });
  }
  return {
    user,
    refreshToken,
    deviceToken,
    otp,
    pendingEmailOtp,
    providerEvent,
    pendingEmailEvent,
    pendingEmail,
  };
}

async function run(): Promise<void> {
  const { databaseUrl, adminUrl, databaseName } = requireIsolatedPostgres16Url(process.env);
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousDirectUrl = process.env.DIRECT_URL;
  // The imported outbox worker uses the application Prisma singleton. Point
  // that singleton only at the already allowlisted loopback test database.
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;
  try {
    await recreateTestDatabase(adminUrl, databaseName);
    try {
      migrate(databaseUrl);
    const setup = prismaFor(databaseUrl);
    try {
      const version = await setup.$queryRaw<Array<{ version_num: number }>>`
        SELECT current_setting('server_version_num')::integer AS version_num
      `;
      assert.ok(version[0]?.version_num >= 160000 && version[0].version_num < 170000);
      await seedTaxonomy(setup);
    } finally {
      await setup.$disconnect();
    }

    const previousGate = process.env.ALLOW_PRODUCTION_REVIEW_PROVISION;
    const previousAdoptionGate = process.env.ALLOW_PRODUCTION_REVIEW_ADOPTION;
    const previousOutboxQuiescedGate = process.env.STORE_REVIEW_OUTBOX_QUIESCED;
    const previousOutboxSecret = process.env.PROVIDER_OUTBOX_ENCRYPTION_SECRET;
    process.env.ALLOW_PRODUCTION_REVIEW_PROVISION = 'true';
    process.env.ALLOW_PRODUCTION_REVIEW_ADOPTION = 'true';
    process.env.STORE_REVIEW_OUTBOX_QUIESCED = 'true';
    process.env.PROVIDER_OUTBOX_ENCRYPTION_SECRET =
      'store-review-postgres-integration-encryption-secret';
    try {
      const config = testConfig('71');
      const first = prismaFor(databaseUrl);
      const second = prismaFor(databaseUrl);
      let parallelPlans: Awaited<ReturnType<typeof provisionStoreReviewAccounts>>[];
      try {
        parallelPlans = await Promise.all([
          provisionStoreReviewAccounts(first, config, {
            apply: true,
            adoptExisting: false,
            rotatePasswords: false,
          }),
          provisionStoreReviewAccounts(second, config, {
            apply: true,
            adoptExisting: false,
            rotatePasswords: false,
          }),
        ]);
      } finally {
        await Promise.all([first.$disconnect(), second.$disconnect()]);
      }
      assert.deepEqual(parallelPlans.map((plan) => plan.createCount).sort(), [0, 3]);

      const verify = prismaFor(databaseUrl);
      try {
        await assertProvisionedState(verify);
        const reviewUser = await verify.user.findFirstOrThrow({ where: { is_review_account: true } });
        await verify.user.update({
          where: { id: reviewUser.id },
          data: { fcm_token: 'stale-integration-token' },
        });
        await verify.deviceToken.create({
          data: {
            user_id: reviewUser.id,
            token: 'stale-integration-device-token',
            token_hash: crypto.createHash('sha256').update('stale-integration-device-token').digest('hex'),
          },
        });

        const idempotentPlan = await provisionStoreReviewAccounts(verify, config, {
          apply: true,
          adoptExisting: false,
          rotatePasswords: false,
        });
        assert.equal(idempotentPlan.createCount, 0);
        assert.equal(idempotentPlan.existingReviewCount, 3);
        await assertProvisionedState(verify);

        const collision = testConfig('72');
        const collisionUser = await verify.user.create({
          data: {
            phone: collision.identifiers.workerPhone,
            email: collision.identifiers.companyEmail,
            email_verified_at: new Date(),
            password_hash: await bcrypt.hash(collision.passwords.worker, 4),
            role: 'worker',
            name: 'Synthetic collision user',
          },
        });
        await verify.worker.create({
          data: { user_id: collisionUser.id, status: 'approved' },
        });
        await assert.rejects(
          () => provisionStoreReviewAccounts(verify, collision, {
            apply: true,
            adoptExisting: false,
            rotatePasswords: false,
          }),
          (error: unknown) => error instanceof Error
            && error.message === 'STORE_REVIEW_CROSS_ROLE_IDENTIFIER_COLLISION',
        );

        const adoption = testConfig('73');
        const adoptedFixture = await createAdoptionCandidate(verify, adoption, false);
        const adoptionPlan = await provisionStoreReviewAccounts(verify, adoption, {
          apply: true,
          adoptExisting: true,
          rotatePasswords: false,
        });
        assert.equal(adoptionPlan.adoptionRequiredCount, 1);
        const adoptedUser = await verify.user.findUniqueOrThrow({
          where: { id: adoptedFixture.user.id },
        });
        assert.equal(adoptedUser.is_review_account, true);
        assert.equal(adoptedUser.session_version, 8);
        assert.equal(adoptedUser.fcm_token, null);
        assert.ok((await verify.refreshToken.findUniqueOrThrow({
          where: { id: adoptedFixture.refreshToken.id },
        })).revoked_at);
        assert.equal((await verify.refreshToken.findUniqueOrThrow({
          where: { id: adoptedFixture.refreshToken.id },
        })).revoked_reason, 'store_review_adoption');
        assert.ok((await verify.deviceToken.findUniqueOrThrow({
          where: { id: adoptedFixture.deviceToken.id },
        })).revoked_at);
        assert.ok((await verify.otpCode.findUniqueOrThrow({
          where: { id: adoptedFixture.otp.id },
        })).consumed_at);
        assert.ok((await verify.otpCode.findUniqueOrThrow({
          where: { id: adoptedFixture.pendingEmailOtp.id },
        })).consumed_at);
        const quarantined = await verify.outboxEvent.findUniqueOrThrow({
          where: { id: adoptedFixture.providerEvent.id },
        });
        assert.equal(quarantined.status, 'processed');
        assert.equal(quarantined.last_error, 'StoreReviewExternalDeliverySuppressed');
        const quarantinedEmail = await verify.outboxEvent.findUniqueOrThrow({
          where: { id: adoptedFixture.pendingEmailEvent.id },
        });
        assert.equal(quarantinedEmail.status, 'processed');
        assert.equal(quarantinedEmail.last_error, 'StoreReviewExternalDeliverySuppressed');
        const durableOwners = await resolveProviderRecipientOwners(
          'email',
          adoptedFixture.pendingEmail,
          verify,
        );
        assert.equal(
          durableOwners.some((owner) => owner.is_review_account === true),
          true,
          'OTP ownership must suppress delivery after pending_email is cleared',
        );
        let providerCalls = 0;
        await deliverProviderOutboxEvent(
          adoptedFixture.pendingEmailEvent.id,
          adoptedFixture.pendingEmailEvent.event_type,
          adoptedFixture.pendingEmailEvent.payload,
          {
            resolveRecipientOwners: (channel, recipient) =>
              resolveProviderRecipientOwners(channel, recipient, verify),
            deliverEmail: async () => { providerCalls += 1; },
          },
        );
        assert.equal(providerCalls, 0, 'reviewer delivery must stop before the provider call');

        const reactivationRefresh = await verify.refreshToken.create({
          data: {
            user_id: adoptedUser.id,
            token_hash: crypto.randomBytes(32).toString('hex'),
            jti: crypto.randomUUID(),
            family_id: crypto.randomUUID(),
            expires_at: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        const reactivationOtp = await verify.otpCode.create({
          data: {
            user_id: adoptedUser.id,
            phone: adoption.identifiers.workerPhone,
            code_hash: crypto.randomBytes(32).toString('hex'),
            purpose: 'worker_login',
            expires_at: new Date(Date.now() + 5 * 60 * 1000),
          },
        });
        await verify.user.update({
          where: { id: adoptedUser.id },
          data: { is_active: false, deleted_at: new Date() },
        });
        await provisionStoreReviewAccounts(verify, adoption, {
          apply: true,
          adoptExisting: false,
          rotatePasswords: false,
        });
        const reactivatedUser = await verify.user.findUniqueOrThrow({
          where: { id: adoptedUser.id },
        });
        assert.equal(reactivatedUser.is_active, true);
        assert.equal(reactivatedUser.deleted_at, null);
        assert.equal(reactivatedUser.session_version, 9);
        assert.equal((await verify.refreshToken.findUniqueOrThrow({
          where: { id: reactivationRefresh.id },
        })).revoked_reason, 'store_review_reactivation');
        assert.ok((await verify.otpCode.findUniqueOrThrow({
          where: { id: reactivationOtp.id },
        })).consumed_at);

        const profileReactivationRefresh = await verify.refreshToken.create({
          data: {
            user_id: adoptedUser.id,
            token_hash: crypto.randomBytes(32).toString('hex'),
            jti: crypto.randomUUID(),
            family_id: crypto.randomUUID(),
            expires_at: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        const profileReactivationOtp = await verify.otpCode.create({
          data: {
            user_id: adoptedUser.id,
            phone: adoption.identifiers.workerPhone,
            code_hash: crypto.randomBytes(32).toString('hex'),
            purpose: 'worker_login',
            expires_at: new Date(Date.now() + 5 * 60 * 1000),
          },
        });
        const targetOnlyProfileOtp = await verify.otpCode.create({
          data: {
            phone: adoption.identifiers.workerPhone,
            code_hash: crypto.randomBytes(32).toString('hex'),
            purpose: 'worker_login',
            expires_at: new Date(Date.now() + 5 * 60 * 1000),
          },
        });
        const profileReactivationDevice = await verify.deviceToken.create({
          data: {
            user_id: adoptedUser.id,
            token: `profile-reactivation-${crypto.randomUUID()}`,
            token_hash: crypto.randomBytes(32).toString('hex'),
          },
        });
        await verify.worker.update({
          where: { user_id: adoptedUser.id },
          data: {
            status: 'suspended',
            suspended_at: new Date(),
            deleted_at: new Date(),
          },
        });
        await provisionStoreReviewAccounts(verify, adoption, {
          apply: true,
          adoptExisting: false,
          rotatePasswords: false,
        });
        const profileReactivatedUser = await verify.user.findUniqueOrThrow({
          where: { id: adoptedUser.id },
          include: { worker: true },
        });
        assert.equal(profileReactivatedUser.is_active, true);
        assert.equal(profileReactivatedUser.deleted_at, null);
        assert.equal(profileReactivatedUser.session_version, 10);
        assert.equal(profileReactivatedUser.worker?.status, 'approved');
        assert.equal(profileReactivatedUser.worker?.suspended_at, null);
        assert.equal(profileReactivatedUser.worker?.deleted_at, null);
        assert.equal((await verify.refreshToken.findUniqueOrThrow({
          where: { id: profileReactivationRefresh.id },
        })).revoked_reason, 'store_review_reactivation');
        assert.ok((await verify.deviceToken.findUniqueOrThrow({
          where: { id: profileReactivationDevice.id },
        })).revoked_at);
        assert.ok((await verify.otpCode.findUniqueOrThrow({
          where: { id: profileReactivationOtp.id },
        })).consumed_at);
        assert.ok((await verify.otpCode.findUniqueOrThrow({
          where: { id: targetOnlyProfileOtp.id },
        })).consumed_at, 'identifier-bound OTPs without user_id must also be consumed');

        const reviewCompanyUser = await verify.user.findUniqueOrThrow({
          where: { phone: adoption.identifiers.companyPhone },
          include: { company: true },
        });
        const companyReactivationRefresh = await verify.refreshToken.create({
          data: {
            user_id: reviewCompanyUser.id,
            token_hash: crypto.randomBytes(32).toString('hex'),
            jti: crypto.randomUUID(),
            family_id: crypto.randomUUID(),
            expires_at: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        const companyReactivationOtp = await verify.otpCode.create({
          data: {
            phone: `email:${adoption.identifiers.companyEmail}`,
            code_hash: crypto.randomBytes(32).toString('hex'),
            purpose: 'company_login',
            expires_at: new Date(Date.now() + 5 * 60 * 1000),
          },
        });
        const companyReactivationDevice = await verify.deviceToken.create({
          data: {
            user_id: reviewCompanyUser.id,
            token: `company-reactivation-${crypto.randomUUID()}`,
            token_hash: crypto.randomBytes(32).toString('hex'),
          },
        });
        await verify.company.update({
          where: { user_id: reviewCompanyUser.id },
          data: { status: 'pending_approval' },
        });
        await provisionStoreReviewAccounts(verify, adoption, {
          apply: true,
          adoptExisting: false,
          rotatePasswords: false,
        });
        const profileReactivatedCompany = await verify.user.findUniqueOrThrow({
          where: { id: reviewCompanyUser.id },
          include: { company: true },
        });
        assert.equal(profileReactivatedCompany.session_version, 1);
        assert.equal(profileReactivatedCompany.company?.status, 'approved');
        assert.equal((await verify.refreshToken.findUniqueOrThrow({
          where: { id: companyReactivationRefresh.id },
        })).revoked_reason, 'store_review_reactivation');
        assert.ok((await verify.deviceToken.findUniqueOrThrow({
          where: { id: companyReactivationDevice.id },
        })).revoked_at);
        assert.ok((await verify.otpCode.findUniqueOrThrow({
          where: { id: companyReactivationOtp.id },
        })).consumed_at, 'company identifier-bound OTPs must be consumed during reactivation');

        const unsafeAdoption = testConfig('74');
        const unsafeFixture = await createAdoptionCandidate(verify, unsafeAdoption, true);
        await assert.rejects(
          () => provisionStoreReviewAccounts(verify, unsafeAdoption, {
            apply: true,
            adoptExisting: true,
            rotatePasswords: false,
          }),
          (error: unknown) => error instanceof Error
            && error.message === 'STORE_REVIEW_ADOPTION_DOMAIN_DATA_FORBIDDEN:worker',
        );
        assert.equal((await verify.user.findUniqueOrThrow({
          where: { id: unsafeFixture.user.id },
        })).is_review_account, false);
        await deliverProviderOutboxEvent(
          unsafeFixture.providerEvent.id,
          unsafeFixture.providerEvent.event_type,
          unsafeFixture.providerEvent.payload,
          {
            resolveRecipientOwners: (channel, recipient) =>
              resolveProviderRecipientOwners(channel, recipient, verify),
            deliverSms: async () => { providerCalls += 1; },
          },
        );
        assert.equal(providerCalls, 1, 'ordinary account delivery must remain enabled');

        const unsafeProfileAdoption = testConfig('75');
        const unsafeProfileFixture = await createAdoptionCandidate(
          verify,
          unsafeProfileAdoption,
          false,
        );
        await verify.worker.update({
          where: { user_id: unsafeProfileFixture.user.id },
          data: {
            gender: 'synthetic',
            worker_class: 'A',
            is_foc_training: true,
            foc_training_note: 'Pre-existing training record',
            rating_avg: 4.5,
            rating_count: 2,
            status: 'approved',
            approved_at: new Date(),
          },
        });
        await assert.rejects(
          () => provisionStoreReviewAccounts(verify, unsafeProfileAdoption, {
            apply: true,
            adoptExisting: true,
            rotatePasswords: false,
          }),
          (error: unknown) => error instanceof Error
            && error.message === 'STORE_REVIEW_ADOPTION_DOMAIN_DATA_FORBIDDEN:worker',
        );
        const rejectedProfileUser = await verify.user.findUniqueOrThrow({
          where: { id: unsafeProfileFixture.user.id },
        });
        assert.equal(rejectedProfileUser.is_review_account, false);
        assert.equal(rejectedProfileUser.session_version, 7);
        assert.equal((await verify.outboxEvent.findUniqueOrThrow({
          where: { id: unsafeProfileFixture.providerEvent.id },
        })).status, 'pending');

        const unsafeIdempotencyAdoption = testConfig('77');
        const unsafeIdempotencyFixture = await createAdoptionCandidate(
          verify,
          unsafeIdempotencyAdoption,
          false,
        );
        await verify.idempotencyKey.create({
          data: {
            actor_id: unsafeIdempotencyFixture.user.id,
            scope: 'order.create',
            key: crypto.randomUUID(),
            request_hash: crypto.randomBytes(32).toString('hex'),
            expires_at: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        await assert.rejects(
          () => provisionStoreReviewAccounts(verify, unsafeIdempotencyAdoption, {
            apply: true,
            adoptExisting: true,
            rotatePasswords: false,
          }),
          (error: unknown) => error instanceof Error
            && error.message === 'STORE_REVIEW_ADOPTION_DOMAIN_DATA_FORBIDDEN:worker',
        );
        assert.equal((await verify.user.findUniqueOrThrow({
          where: { id: unsafeIdempotencyFixture.user.id },
        })).is_review_account, false);

        const pendingEmailCollision = testConfig('76');
        const pendingEmailCollisionUser = await verify.user.create({
          data: {
            phone: '+994501117699',
            pending_email: pendingEmailCollision.identifiers.companyEmail,
            role: 'worker',
            name: 'Synthetic pending-email collision',
            worker: { create: {} },
          },
        });
        await assert.rejects(
          () => provisionStoreReviewAccounts(verify, pendingEmailCollision, {
            apply: true,
            adoptExisting: false,
            rotatePasswords: false,
          }),
          (error: unknown) => error instanceof Error
            && error.message === 'STORE_REVIEW_PENDING_EMAIL_IDENTIFIER_COLLISION',
        );
        assert.equal((await verify.user.findUniqueOrThrow({
          where: { id: pendingEmailCollisionUser.id },
        })).is_review_account, false);
        assert.equal(await verify.user.count({
          where: {
            phone: { in: [
              pendingEmailCollision.identifiers.workerPhone,
              pendingEmailCollision.identifiers.companyPhone,
              pendingEmailCollision.identifiers.adminPhone,
            ] },
          },
        }), 0);

        // Exercise the real batch dispatcher against PostgreSQL. The reviewer
        // event must be consumed without invoking a provider; if ownership
        // suppression regresses, missing provider configuration makes this
        // assertion fail closed instead of making a network call.
        await verify.outboxEvent.deleteMany();
        const reviewWorker = await verify.user.findUniqueOrThrow({
          where: { phone: config.identifiers.workerPhone },
        });
        assert.equal(reviewWorker.is_review_account, true, 'STORE_REVIEW_BATCH_OWNER_SCOPE_INVALID');
        const reviewerBatchEvent = buildOtpProviderOutboxEvent({
          channel: 'sms',
          to: config.identifiers.workerPhone,
          purpose: 'worker_login',
          code: '413927',
          dedupeKey: `reviewer-batch-${reviewWorker.id}`,
        });
        await verify.outboxEvent.create({ data: reviewerBatchEvent });
        assert.equal(await processOutboxBatch(20), 1, 'STORE_REVIEW_BATCH_SUPPRESSION_FAILED');
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal((await verify.outboxEvent.findUniqueOrThrow({
          where: { id: reviewerBatchEvent.id },
        })).status, 'processed', 'STORE_REVIEW_BATCH_EVENT_NOT_PROCESSED');

        // A terminal failure remains visible as a dead-letter metric. A later
        // empty batch clears only the transient delivery-failure state so the
        // worker can recover without hiding the retained dead letter.
        const deadEvent = await verify.outboxEvent.create({
          data: {
            aggregate: 'integration-test',
            aggregate_id: crypto.randomUUID(),
            event_type: 'integration.unsupported',
            payload: {},
            attempts: 9,
          },
        });
        assert.equal(await processOutboxBatch(20), 0, 'STORE_REVIEW_DEAD_BATCH_COUNT_INVALID');
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal((await verify.outboxEvent.findUniqueOrThrow({
          where: { id: deadEvent.id },
        })).status, 'dead', 'STORE_REVIEW_DEAD_EVENT_STATE_INVALID');
        let outboxHealth = getOutboxProcessorHealth();
        assert.equal(outboxHealth.lastBatchDeliveryFailures, 1,
          'STORE_REVIEW_CURRENT_FAILURE_METRIC_INVALID');
        assert.equal(outboxHealth.deadEvents, 1, 'STORE_REVIEW_DEAD_METRIC_INVALID');
        assert.equal(isOutboxDeliveryStateHealthy(outboxHealth), false,
          'STORE_REVIEW_FAILURE_HEALTH_INVALID');

        assert.equal(await processOutboxBatch(20), 0, 'STORE_REVIEW_RECOVERY_BATCH_COUNT_INVALID');
        await new Promise<void>((resolve) => setImmediate(resolve));
        outboxHealth = getOutboxProcessorHealth();
        assert.equal(outboxHealth.lastBatchDeliveryFailures, 0,
          'STORE_REVIEW_RECOVERY_FAILURE_METRIC_INVALID');
        assert.equal(outboxHealth.deadEvents, 1, 'STORE_REVIEW_RECOVERY_DEAD_METRIC_INVALID');
        assert.equal(isOutboxDeliveryStateHealthy(outboxHealth), true,
          'STORE_REVIEW_RECOVERY_HEALTH_INVALID');
        assert.match(
          renderOutboxMetrics(),
          /setservice_outbox_queue_events\{state="dead"\} 1/,
          'STORE_REVIEW_DEAD_METRIC_EXPORT_INVALID',
        );
      } finally {
        await verify.$disconnect();
      }
    } finally {
      if (previousGate === undefined) delete process.env.ALLOW_PRODUCTION_REVIEW_PROVISION;
      else process.env.ALLOW_PRODUCTION_REVIEW_PROVISION = previousGate;
      if (previousAdoptionGate === undefined) delete process.env.ALLOW_PRODUCTION_REVIEW_ADOPTION;
      else process.env.ALLOW_PRODUCTION_REVIEW_ADOPTION = previousAdoptionGate;
      if (previousOutboxQuiescedGate === undefined) delete process.env.STORE_REVIEW_OUTBOX_QUIESCED;
      else process.env.STORE_REVIEW_OUTBOX_QUIESCED = previousOutboxQuiescedGate;
      if (previousOutboxSecret === undefined) delete process.env.PROVIDER_OUTBOX_ENCRYPTION_SECRET;
      else process.env.PROVIDER_OUTBOX_ENCRYPTION_SECRET = previousOutboxSecret;
    }
    } finally {
      await applicationPrisma.$disconnect();
      await dropTestDatabase(adminUrl, databaseName);
    }
    console.log('store-review-postgres-integration: OK (PostgreSQL 16, isolated database)');
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousDirectUrl === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = previousDirectUrl;
  }
}

void run().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_:-]+$/.test(error.message)
    ? error.message
    : error instanceof Error ? error.name : 'UnknownError';
  const location = error instanceof Error
    ? error.stack?.match(/store-review-postgres-integration\.ts:(\d+):(\d+)/)?.slice(1).join(':')
    : undefined;
  console.error('store-review-postgres-integration: FAILED', {
    error_code: code,
    test_location: location ?? 'unknown',
  });
  process.exitCode = 1;
});
