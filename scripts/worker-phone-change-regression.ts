process.env.NODE_ENV = 'test';
process.env.OTP_PEPPER = 'worker-phone-change-regression-pepper-0123456789';
delete process.env.REDIS_URL;

const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const { readFileSync } = require('node:fs') as typeof import('node:fs');
const { join } = require('node:path') as typeof import('node:path');
const { hmacSha256 } = require('../src/lib/crypto') as typeof import('../src/lib/crypto');
const { hashPassword } = require('../src/lib/password') as typeof import('../src/lib/password');
const { setOtpCooldown } = require('../src/lib/otp-state') as typeof import('../src/lib/otp-state');
const { prisma } = require('../src/lib/prisma') as typeof import('../src/lib/prisma');
const {
  WorkerPhoneChangeConfirmSchema,
  WorkerPhoneChangeRequestSchema,
  WorkerPhoneChangeV2RequestSchema,
} = require('../src/modules/auth/auth.schema') as typeof import('../src/modules/auth/auth.schema');
const AuthService = require('../src/modules/auth/auth.service') as typeof import('../src/modules/auth/auth.service');
const { Prisma } = require('@prisma/client') as typeof import('@prisma/client');

// Prisma loads the repository .env as part of client initialization. Ensure this
// isolated regression never connects to a configured remote OTP state store.
delete process.env.REDIS_URL;

type AsyncMethod = (...args: any[]) => Promise<any>;

async function withMethods<T>(
  replacements: Array<{
    target: Record<string, unknown>;
    method: string;
    replacement: AsyncMethod;
  }>,
  operation: () => Promise<T>,
): Promise<T> {
  const originals = replacements.map(({ target, method }) => target[method]);
  replacements.forEach(({ target, method, replacement }) => {
    target[method] = replacement;
  });
  try {
    return await operation();
  } finally {
    replacements.forEach(({ target, method }, index) => {
      target[method] = originals[index];
    });
  }
}

const userId = '10000000-0000-4000-8000-000000000001';
const oldPhone = '+994501112233';
const newPhone = '+994501112244';
const throttledPhone = '+994501112255';
const legacyThrottledPhone = '+994501112266';
const otpCode = '123456';
const otpId = '20000000-0000-4000-8000-000000000001';
const currentPassword = 'CurrentWorkerPass123!';

const userRecord = (phone = oldPhone) => ({
  id: userId,
  phone,
  session_version: 7,
});

const otpRecord = {
  id: otpId,
  user_id: userId,
  phone: newPhone,
  purpose: 'worker_phone_change' as const,
  code_hash: hmacSha256(
    `${newPhone}:worker_phone_change:${otpCode}`,
    process.env.OTP_PEPPER!,
  ),
  expires_at: new Date(Date.now() + 60_000),
  blocked_until: null,
  consumed_at: new Date(),
  attempts: 0,
  max_attempts: 5,
};

async function testBuild14LegacyRequestPreservesConflictAndAudit(): Promise<void> {
  let auditWrite: any;
  let availabilityReads = 0;

  await assert.rejects(
    () => withMethods(
      [
        {
          target: prisma.user as unknown as Record<string, unknown>,
          method: 'findFirst',
          replacement: async () => ({
            ...userRecord(),
            password_hash: 'legacy-route-must-not-read-password',
            is_review_account: false,
            worker: { id: 'worker-1', deleted_at: null },
          }),
        },
        {
          target: prisma.auditLog as unknown as Record<string, unknown>,
          method: 'create',
          replacement: async (query: any) => {
            auditWrite = query;
            return { id: 'legacy-audit-1' };
          },
        },
        {
          target: prisma.user as unknown as Record<string, unknown>,
          method: 'findUnique',
          replacement: async () => {
            availabilityReads += 1;
            return { id: 'another-user' };
          },
        },
      ],
      () => AuthService.requestWorkerPhoneChangeLegacy(userId, { phone: newPhone }),
    ),
    (error: any) => error?.statusCode === 409 && error?.code === 'PHONE_ALREADY_REGISTERED',
  );
  assert.equal(availabilityReads, 1);
  assert.equal(auditWrite.data.actor_id, userId);
  assert.equal(auditWrite.data.entity_id, userId);
  assert.deepEqual(auditWrite.data.metadata, {
    event: 'worker_phone_change_requested',
    contract: 'legacy_v1',
    password_step_up: false,
  });
  assert.doesNotMatch(JSON.stringify(auditWrite), new RegExp(newPhone.replace('+', '\\+')));
}

async function testBuild15RequestRequiresPasswordBeforeAvailability(): Promise<void> {
  const passwordHash = await hashPassword(currentPassword);
  let availabilityRead = false;

  await assert.rejects(
    () => withMethods(
      [
        {
          target: prisma.user as unknown as Record<string, unknown>,
          method: 'findFirst',
          replacement: async () => ({
            ...userRecord(),
            password_hash: passwordHash,
            worker: { id: 'worker-1', deleted_at: null },
          }),
        },
        {
          target: prisma.user as unknown as Record<string, unknown>,
          method: 'findUnique',
          replacement: async () => {
            availabilityRead = true;
            return { id: 'another-user' };
          },
        },
      ],
      () => AuthService.requestWorkerPhoneChange(userId, {
        phone: newPhone,
        current_password: 'WrongPassword123!',
      }),
    ),
    (error: any) => error?.statusCode === 401 && error?.code === 'INVALID_CREDENTIALS',
  );

  assert.equal(availabilityRead, false, 'target availability must not be inspected before password step-up');
}

async function testDuplicateRequestIsNonEnumerating(): Promise<void> {
  const passwordHash = await hashPassword(currentPassword);
  const result = await withMethods(
    [
      {
        target: prisma.user as unknown as Record<string, unknown>,
        method: 'findFirst',
        replacement: async () => ({
          ...userRecord(),
          password_hash: passwordHash,
          worker: { id: 'worker-1', deleted_at: null },
        }),
      },
      {
        target: prisma.user as unknown as Record<string, unknown>,
        method: 'findUnique',
        replacement: async () => ({ id: 'another-user' }),
      },
    ],
    () => AuthService.requestWorkerPhoneChange(userId, {
      phone: newPhone,
      current_password: currentPassword,
    }),
  );

  assert.deepEqual(result, {
    otp_sent: true,
    purpose: 'worker_phone_change',
    retry_after_seconds: 60,
  });
}

async function testOtpCooldownDoesNotRevealAvailability(): Promise<void> {
  const passwordHash = await hashPassword(currentPassword);
  await setOtpCooldown(throttledPhone, 'worker_phone_change', 60_000);

  const result = await withMethods(
    [
      {
        target: prisma.user as unknown as Record<string, unknown>,
        method: 'findFirst',
        replacement: async () => ({
          ...userRecord(),
          password_hash: passwordHash,
          worker: { id: 'worker-1', deleted_at: null },
        }),
      },
      {
        target: prisma.user as unknown as Record<string, unknown>,
        method: 'findUnique',
        replacement: async () => null,
      },
    ],
    () => AuthService.requestWorkerPhoneChange(userId, {
      phone: throttledPhone,
      current_password: currentPassword,
    }),
  );

  assert.deepEqual(result, {
    otp_sent: true,
    purpose: 'worker_phone_change',
    retry_after_seconds: 60,
  });
}

async function testBuild14LegacyRequestPreservesOtpCooldownError(): Promise<void> {
  await setOtpCooldown(legacyThrottledPhone, 'worker_phone_change', 60_000);

  await assert.rejects(
    () => withMethods(
      [
        {
          target: prisma.user as unknown as Record<string, unknown>,
          method: 'findFirst',
          replacement: async () => ({
            ...userRecord(),
            password_hash: 'legacy-route-must-not-read-password',
            is_review_account: false,
            worker: { id: 'worker-1', deleted_at: null },
          }),
        },
        {
          target: prisma.auditLog as unknown as Record<string, unknown>,
          method: 'create',
          replacement: async () => ({ id: 'legacy-cooldown-audit' }),
        },
        {
          target: prisma.user as unknown as Record<string, unknown>,
          method: 'findUnique',
          replacement: async () => null,
        },
      ],
      () => AuthService.requestWorkerPhoneChangeLegacy(
        userId,
        { phone: legacyThrottledPhone },
      ),
    ),
    (error: any) => error?.statusCode === 429 && error?.code === 'OTP_COOLDOWN',
  );
}

async function testAtomicConfirmedUpdate(): Promise<void> {
  let transactionCount = 0;
  let transactionRawCalls = 0;
  let userUpdate: any;
  let auditWrite: any;

  const tx = {
    $queryRaw: async () => {
      transactionRawCalls += 1;
      if (transactionRawCalls === 1) return [{ id: userId }];
      return [{
        id: otpId,
        user_id: userId,
        phone: newPhone,
        purpose: 'worker_phone_change',
      }];
    },
    user: {
      findFirst: async () => userRecord(),
      findUnique: async () => null,
      update: async (query: any) => {
        userUpdate = query;
        return userRecord(newPhone);
      },
    },
    auditLog: {
      create: async (query: any) => {
        auditWrite = query;
        return { id: 'audit-1' };
      },
    },
  };

  const result = await withMethods(
    [
      {
        target: prisma.user as unknown as Record<string, unknown>,
        method: 'findFirst',
        replacement: async () => userRecord(),
      },
      {
        target: prisma.user as unknown as Record<string, unknown>,
        method: 'findUnique',
        replacement: async () => null,
      },
      {
        target: prisma.otpCode as unknown as Record<string, unknown>,
        method: 'findFirst',
        replacement: async () => otpRecord,
      },
      {
        target: prisma as unknown as Record<string, unknown>,
        method: '$transaction',
        replacement: async (callback: (client: typeof tx) => Promise<unknown>) => {
          transactionCount += 1;
          return callback(tx);
        },
      },
    ],
    () => AuthService.confirmWorkerPhoneChange(userId, {
      phone: ' +994 (50) 111-22-44 ',
      otp_code: otpCode,
    }),
  );

  assert.equal(transactionCount, 1);
  assert.equal(transactionRawCalls, 2, 'the user lock and one-time OTP consume must share the transaction');
  assert.deepEqual(userUpdate.data, { phone: newPhone });
  assert.equal('session_version' in userUpdate.data, false, 'phone changes must preserve active sessions');
  assert.equal(auditWrite.data.metadata.event, 'worker_phone_changed');
  assert.equal(auditWrite.data.metadata.sessions_preserved, true);
  assert.deepEqual(result, {
    phone_changed: true,
    phone: newPhone,
    already_applied: false,
    session_preserved: true,
    user: { id: userId, phone: newPhone },
  });
}

async function testDuplicateRejectedTransactionallyBeforeOtpConsumption(): Promise<void> {
  let otpRead = false;
  let transactionStarted = false;
  let transactionRawCalls = 0;
  const tx = {
    $queryRaw: async () => {
      transactionRawCalls += 1;
      return [{ id: userId }];
    },
    user: {
      findFirst: async () => userRecord(),
      findUnique: async () => ({ id: 'another-user' }),
    },
  };

  await assert.rejects(
    () => withMethods(
      [
        {
          target: prisma.user as unknown as Record<string, unknown>,
          method: 'findFirst',
          replacement: async () => userRecord(),
        },
        {
          target: prisma.otpCode as unknown as Record<string, unknown>,
          method: 'findFirst',
          replacement: async () => {
            otpRead = true;
            return otpRecord;
          },
        },
        {
          target: prisma as unknown as Record<string, unknown>,
          method: '$transaction',
          replacement: async (callback: (client: typeof tx) => Promise<unknown>) => {
            transactionStarted = true;
            return callback(tx);
          },
        },
      ],
      () => AuthService.confirmWorkerPhoneChange(userId, {
        phone: newPhone,
        otp_code: otpCode,
      }),
    ),
    (error: any) => error?.statusCode === 409 && error?.code === 'PHONE_ALREADY_REGISTERED',
  );

  assert.equal(otpRead, true, 'OTP ownership must be validated before duplicate state is disclosed');
  assert.equal(transactionStarted, true);
  assert.equal(transactionRawCalls, 1, 'duplicate target must be rejected after the user lock and before OTP consumption');
}

async function testLostResponseRetryIsIdempotent(): Promise<void> {
  let otpRead = false;
  const result = await withMethods(
    [
      {
        target: prisma.user as unknown as Record<string, unknown>,
        method: 'findFirst',
        replacement: async () => userRecord(newPhone),
      },
      {
        target: prisma.otpCode as unknown as Record<string, unknown>,
        method: 'findFirst',
        replacement: async () => {
          otpRead = true;
          return otpRecord;
        },
      },
    ],
    () => AuthService.confirmWorkerPhoneChange(userId, {
      phone: newPhone,
      otp_code: otpCode,
    }),
  );

  assert.equal(otpRead, true);
  assert.equal(result.already_applied, true);
  assert.equal(result.phone, newPhone);
}

async function testAlreadyAppliedRetryStillRequiresMatchingOtp(): Promise<void> {
  await assert.rejects(
    () => withMethods(
      [
        {
          target: prisma.user as unknown as Record<string, unknown>,
          method: 'findFirst',
          replacement: async () => userRecord(newPhone),
        },
        {
          target: prisma.otpCode as unknown as Record<string, unknown>,
          method: 'findFirst',
          replacement: async () => otpRecord,
        },
      ],
      () => AuthService.confirmWorkerPhoneChange(userId, {
        phone: newPhone,
        otp_code: '654321',
      }),
    ),
    (error: any) => error?.statusCode === 401 && error?.code === 'INVALID_OTP',
  );
}

async function testUniqueConstraintRaceReturnsConflict(): Promise<void> {
  let rawCalls = 0;
  const tx = {
    $queryRaw: async () => {
      rawCalls += 1;
      if (rawCalls === 1) return [{ id: userId }];
      return [{
        id: otpId,
        user_id: userId,
        phone: newPhone,
        purpose: 'worker_phone_change',
      }];
    },
    user: {
      findFirst: async () => userRecord(),
      findUnique: async () => null,
      update: async () => {
        throw new Prisma.PrismaClientKnownRequestError('unique phone', {
          code: 'P2002',
          clientVersion: 'regression',
        });
      },
    },
    auditLog: {
      create: async () => ({ id: 'must-not-run' }),
    },
  };

  await assert.rejects(
    () => withMethods(
      [
        {
          target: prisma.user as unknown as Record<string, unknown>,
          method: 'findFirst',
          replacement: async () => userRecord(),
        },
        {
          target: prisma.user as unknown as Record<string, unknown>,
          method: 'findUnique',
          replacement: async () => null,
        },
        {
          target: prisma.otpCode as unknown as Record<string, unknown>,
          method: 'findFirst',
          replacement: async () => otpRecord,
        },
        {
          target: prisma as unknown as Record<string, unknown>,
          method: '$transaction',
          replacement: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
        },
      ],
      () => AuthService.confirmWorkerPhoneChange(userId, {
        phone: newPhone,
        otp_code: otpCode,
      }),
    ),
    (error: any) => error?.statusCode === 409 && error?.code === 'PHONE_ALREADY_REGISTERED',
  );
}

async function main(): Promise<void> {
  // Build 14 sends the legacy phone-only payload. Strict parsing prevents a
  // caller from smuggling the v2 password field into the deprecated contract.
  assert.equal(WorkerPhoneChangeRequestSchema.safeParse({ phone: newPhone }).success, true);
  assert.equal(WorkerPhoneChangeRequestSchema.safeParse({
    phone: newPhone,
    current_password: currentPassword,
  }).success, false);

  // Build 15 uses the versioned password-step-up payload.
  assert.equal(WorkerPhoneChangeV2RequestSchema.safeParse({ phone: newPhone }).success, false);
  assert.equal(WorkerPhoneChangeV2RequestSchema.safeParse({
    phone: '+994 (50) 111-22-44',
    current_password: currentPassword,
  }).success, true);
  assert.equal(WorkerPhoneChangeConfirmSchema.safeParse({ phone: newPhone, otp_code: '12345' }).success, false);

  const appSource = readFileSync(join(__dirname, '../src/app.ts'), 'utf8');
  assert.match(appSource, /app\.use\('\/v1\/auth\/worker\/phone-change\/request', authLimiter\)/);
  assert.match(appSource, /app\.use\('\/v1\/auth\/worker\/phone-change\/v2\/request', authLimiter\)/);
  assert.match(appSource, /app\.use\('\/v1\/auth\/worker\/phone-change\/confirm', authLimiter\)/);
  const routerSource = readFileSync(join(__dirname, '../src/modules/auth/auth.router.ts'), 'utf8');
  assert.match(routerSource, /scope:\s*'legacy_worker_phone_change'/);
  assert.match(routerSource, /dimensions:\s*\['actor', 'target'\]/);
  assert.match(
    routerSource,
    /router\.post\('\/worker\/phone-change\/request', requireAuth, legacyWorkerPhoneChangeLimiter/,
  );

  await testBuild14LegacyRequestPreservesConflictAndAudit();
  await testBuild14LegacyRequestPreservesOtpCooldownError();
  console.log('worker-phone-change Build 14 legacy regression: OK');
  await testBuild15RequestRequiresPasswordBeforeAvailability();
  await testDuplicateRequestIsNonEnumerating();
  await testOtpCooldownDoesNotRevealAvailability();
  console.log('worker-phone-change Build 15 password-step-up regression: OK');
  await testAtomicConfirmedUpdate();
  await testDuplicateRejectedTransactionallyBeforeOtpConsumption();
  await testLostResponseRetryIsIdempotent();
  await testAlreadyAppliedRetryStillRequiresMatchingOtp();
  await testUniqueConstraintRaceReturnsConflict();
  console.log('worker-phone-change-regression: OK');
}

void main();
