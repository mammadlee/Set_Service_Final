import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Request } from 'express';
import { AppError } from '../src/lib/errors';
import {
  assertStoreReviewPasswordsUnique,
  resolveStoreReviewAccountConfig,
  resolveStoreReviewIdentifiers,
  resolveStoreReviewPasswords,
  STORE_REVIEW_ADMIN_PERMISSIONS,
} from '../src/lib/store-review-accounts';
import {
  assertStoreReviewAccountMutationAllowed,
  assertStoreReviewAuthenticationScope,
  buildStoreReviewLoginAudit,
} from '../src/lib/store-review-account-guard';
import {
  assertStoreReviewFixedOtpReady,
  deriveStoreReviewFixedOtpHash,
  enforceStoreReviewFixedOtp,
  storeReviewFixedOtpConfigurationIssues,
  StoreReviewFixedOtpDependencies,
} from '../src/lib/store-review-fixed-otp';
import { authTarget } from '../src/middleware/rate-limit';
import { prisma } from '../src/lib/prisma';
import * as AuthService from '../src/modules/auth/auth.service';

const identifiers = {
  STORE_REVIEW_WORKER_PHONE: '+12025550101',
  STORE_REVIEW_COMPANY_PHONE: '+12025550102',
  STORE_REVIEW_COMPANY_EMAIL: 'store-review-company@example.invalid',
  STORE_REVIEW_ADMIN_PHONE: '+12025550103',
  STORE_REVIEW_ADMIN_EMAIL: 'store-review-admin@example.invalid',
};

const passwords = {
  STORE_REVIEW_WORKER_PASSWORD: 'Store-Review-Worker-42!',
  STORE_REVIEW_COMPANY_PASSWORD: 'Store-Review-Company-43!',
  STORE_REVIEW_ADMIN_PASSWORD: 'Store-Review-Admin-44!',
};

function request(body: Record<string, unknown>): Request {
  return { body } as Request;
}

function testEnvironmentOnlyConfiguration(): void {
  const configSource = readFileSync(
    resolve(__dirname, '../src/lib/store-review-accounts.ts'),
    'utf8',
  );
  assert.doesNotMatch(configSource, /['"]\+[1-9]\d{7,14}['"]/);
  assert.doesNotMatch(configSource, /['"][^'"\s@]+@[^'"\s@]+\.[^'"\s@]+['"]/);

  const env = { ...identifiers, ...passwords };
  assert.deepEqual(resolveStoreReviewIdentifiers(env), {
    workerPhone: identifiers.STORE_REVIEW_WORKER_PHONE,
    companyPhone: identifiers.STORE_REVIEW_COMPANY_PHONE,
    companyEmail: identifiers.STORE_REVIEW_COMPANY_EMAIL,
    adminPhone: identifiers.STORE_REVIEW_ADMIN_PHONE,
    adminEmail: identifiers.STORE_REVIEW_ADMIN_EMAIL,
  });
  assert.deepEqual(resolveStoreReviewPasswords(env), {
    worker: passwords.STORE_REVIEW_WORKER_PASSWORD,
    company: passwords.STORE_REVIEW_COMPANY_PASSWORD,
    admin: passwords.STORE_REVIEW_ADMIN_PASSWORD,
  });
  assert.deepEqual(resolveStoreReviewAccountConfig(env).adminPermissions, STORE_REVIEW_ADMIN_PERMISSIONS);

  for (const name of Object.keys(env)) {
    const incomplete: NodeJS.ProcessEnv = { ...env };
    delete incomplete[name];
    assert.throws(
      () => resolveStoreReviewAccountConfig(incomplete),
      (error: unknown) => error instanceof Error && error.message.endsWith(name),
    );
  }

  assert.throws(
    () => resolveStoreReviewIdentifiers({
      ...env,
      STORE_REVIEW_ADMIN_PHONE: identifiers.STORE_REVIEW_WORKER_PHONE,
    }),
    /STORE_REVIEW_PHONE_REUSE/,
  );
  assert.throws(
    () => resolveStoreReviewIdentifiers({
      ...env,
      STORE_REVIEW_ADMIN_EMAIL: identifiers.STORE_REVIEW_COMPANY_EMAIL.toUpperCase(),
    }),
    /STORE_REVIEW_EMAIL_REUSE/,
  );
  assert.throws(
    () => resolveStoreReviewPasswords({
      ...env,
      STORE_REVIEW_ADMIN_PASSWORD: '<secret-reference>',
    }),
    /STORE_REVIEW_ENV_REQUIRED:STORE_REVIEW_ADMIN_PASSWORD/,
  );
  assert.throws(
    () => assertStoreReviewPasswordsUnique({
      worker: passwords.STORE_REVIEW_WORKER_PASSWORD,
      company: passwords.STORE_REVIEW_COMPANY_PASSWORD,
      admin: passwords.STORE_REVIEW_ADMIN_PASSWORD,
    }, { SEED_ADMIN_PASSWORD: passwords.STORE_REVIEW_WORKER_PASSWORD }),
    /STORE_REVIEW_PASSWORD_REUSE/,
  );
  assert.throws(
    () => resolveStoreReviewPasswords({
      ...env,
      SMOKE_ADMIN_PASSWORD: passwords.STORE_REVIEW_COMPANY_PASSWORD,
    }),
    /STORE_REVIEW_PASSWORD_REUSE:SMOKE_ADMIN_PASSWORD:STORE_REVIEW_COMPANY_PASSWORD/,
  );
}

function testReviewAccountMutationGuard(): void {
  assert.doesNotThrow(() => assertStoreReviewAccountMutationAllowed({ is_review_account: false }));
  assert.throws(
    () => assertStoreReviewAccountMutationAllowed({ is_review_account: true }),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 403
      && error.code === 'STORE_REVIEW_ACCOUNT_MUTATION_FORBIDDEN',
  );
}

function testReviewerAuthenticationScopeCannotChangeDuringLogin(): void {
  assert.doesNotThrow(() => assertStoreReviewAuthenticationScope(
    { is_review_account: false },
    'password',
  ));
  assert.doesNotThrow(() => assertStoreReviewAuthenticationScope(
    { is_review_account: true },
    'password_reviewer_fixed_otp',
  ));
  assert.throws(
    () => assertStoreReviewAuthenticationScope(
      { is_review_account: true },
      'password',
    ),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 409
      && error.code === 'AUTH_ACCOUNT_SCOPE_CHANGED',
  );
  assert.throws(
    () => assertStoreReviewAuthenticationScope(
      { is_review_account: false },
      'password_reviewer_fixed_otp',
    ),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 409
      && error.code === 'AUTH_ACCOUNT_SCOPE_CHANGED',
  );
}

function testSuccessfulLoginAuditPayload(): void {
  const audit = buildStoreReviewLoginAudit({
    id: '00000000-0000-4000-8000-000000000001',
    role: 'worker',
  });
  assert.deepEqual(audit, {
    actor_id: '00000000-0000-4000-8000-000000000001',
    actor_role: 'worker',
    action: 'login_succeeded',
    entity_type: 'store_review_account',
    entity_id: '00000000-0000-4000-8000-000000000001',
    metadata: { authentication: 'password', role: 'worker' },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(audit.metadata, 'phone'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(audit.metadata, 'email'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(audit.metadata, 'credential'), false);

  const otpAudit = buildStoreReviewLoginAudit({
    id: '00000000-0000-4000-8000-000000000001',
    role: 'worker',
  }, 'password_reviewer_fixed_otp');
  assert.equal(otpAudit.metadata.authentication, 'password_reviewer_fixed_otp');
}

async function testReviewerFixedOtp(): Promise<void> {
  const now = new Date('2030-01-01T00:00:00.000Z');
  const pepper = 'reviewer-fixed-otp-regression-pepper-0123456789abcdef';
  const code = '654321';
  const env: NodeJS.ProcessEnv = {
    ...identifiers,
    STORE_REVIEW_FIXED_OTP_ENABLED: 'true',
    STORE_REVIEW_FIXED_OTP_HASH: deriveStoreReviewFixedOtpHash(code, pepper),
    STORE_REVIEW_FIXED_OTP_EXPIRES_AT: '2030-01-08T00:00:00.000Z',
    OTP_PEPPER: pepper,
  };

  assert.deepEqual(storeReviewFixedOtpConfigurationIssues(env, now), []);
  assert.equal(assertStoreReviewFixedOtpReady(env, now).expiresAt.toISOString(), env.STORE_REVIEW_FIXED_OTP_EXPIRES_AT);
  assert.deepEqual(
    storeReviewFixedOtpConfigurationIssues({ ...env, STORE_REVIEW_FIXED_OTP_CODE: code }, now),
    ['STORE_REVIEW_FIXED_OTP_CODE is forbidden; configure only the HMAC hash'],
  );
  assert.throws(
    () => assertStoreReviewFixedOtpReady({ ...env, STORE_REVIEW_FIXED_OTP_ENABLED: 'false' }, now),
    /STORE_REVIEW_FIXED_OTP_DISABLED/,
  );
  assert.ok(storeReviewFixedOtpConfigurationIssues({
    ...env,
    STORE_REVIEW_FIXED_OTP_EXPIRES_AT: '2029-12-31T23:59:59.000Z',
  }, now).some((issue) => issue.includes('must be in the future')));
  assert.ok(storeReviewFixedOtpConfigurationIssues({
    ...env,
    STORE_REVIEW_FIXED_OTP_EXPIRES_AT: '2030-04-02T00:00:00.000Z',
  }, now).some((issue) => issue.includes('must not be more than 90 days')));

  const account = {
    id: '00000000-0000-4000-8000-000000000201',
    role: 'worker' as const,
    is_review_account: true,
  };
  const audits: any[] = [];
  const blocks: string[] = [];
  const rateCalls: string[][] = [];
  const dependencies: StoreReviewFixedOtpDependencies = {
    assertNotBlocked: async () => undefined,
    consumeRateLimit: async (parts) => { rateCalls.push(parts); },
    block: async (accountId) => { blocks.push(accountId); },
    audit: async (input) => { audits.push(input); },
  };

  assert.equal(await enforceStoreReviewFixedOtp({
    account: { ...account, is_review_account: false },
    expectedRole: 'worker',
    normalizedIdentifier: identifiers.STORE_REVIEW_WORKER_PHONE,
    env: {},
    now,
  }, {
    assertNotBlocked: async () => { throw new Error('normal account touched OTP state'); },
    consumeRateLimit: async () => { throw new Error('normal account touched rate limiter'); },
    block: async () => { throw new Error('normal account touched block state'); },
    audit: async () => { throw new Error('normal account created reviewer audit'); },
  }), 'password');

  await assert.rejects(
    () => enforceStoreReviewFixedOtp({
      account,
      expectedRole: 'worker',
      normalizedIdentifier: identifiers.STORE_REVIEW_WORKER_PHONE,
      env: { ...env, STORE_REVIEW_FIXED_OTP_ENABLED: 'false' },
      now,
    }, dependencies),
    (error: any) => error?.code === 'REVIEWER_OTP_DISABLED',
  );

  await assert.rejects(
    () => enforceStoreReviewFixedOtp({
      account,
      expectedRole: 'worker',
      normalizedIdentifier: identifiers.STORE_REVIEW_WORKER_PHONE,
      otpCode: code,
      env: { ...env, STORE_REVIEW_FIXED_OTP_EXPIRES_AT: '2029-12-31T23:59:59.000Z' },
      now,
    }, dependencies),
    (error: any) => error?.code === 'REVIEWER_OTP_EXPIRED',
  );

  await assert.rejects(
    () => enforceStoreReviewFixedOtp({
      account,
      expectedRole: 'worker',
      normalizedIdentifier: identifiers.STORE_REVIEW_WORKER_PHONE,
      env,
      now,
    }, dependencies),
    (error: any) => error?.code === 'REVIEWER_OTP_REQUIRED',
  );

  await assert.rejects(
    () => enforceStoreReviewFixedOtp({
      account,
      expectedRole: 'worker',
      normalizedIdentifier: identifiers.STORE_REVIEW_COMPANY_PHONE,
      otpCode: code,
      env,
      now,
    }, dependencies),
    (error: any) => error?.code === 'REVIEWER_OTP_SCOPE_INVALID',
  );

  await assert.rejects(
    () => enforceStoreReviewFixedOtp({
      account,
      expectedRole: 'worker',
      normalizedIdentifier: identifiers.STORE_REVIEW_WORKER_PHONE,
        otpCode: '111111',
      ip: '127.0.0.1',
      env,
      now,
    }, dependencies),
    (error: any) => error?.code === 'REVIEWER_OTP_INVALID',
  );

  assert.equal(await enforceStoreReviewFixedOtp({
    account,
    expectedRole: 'worker',
    normalizedIdentifier: identifiers.STORE_REVIEW_WORKER_PHONE,
    otpCode: code,
    ip: '127.0.0.1',
    env,
    now,
  }, dependencies), 'password_reviewer_fixed_otp');

  for (const exactAccount of [
    {
      account: { id: '00000000-0000-4000-8000-000000000202', role: 'company' as const, is_review_account: true },
      expectedRole: 'company' as const,
      normalizedIdentifier: identifiers.STORE_REVIEW_COMPANY_EMAIL,
    },
    {
      account: { id: '00000000-0000-4000-8000-000000000203', role: 'admin' as const, is_review_account: true },
      expectedRole: 'admin' as const,
      normalizedIdentifier: identifiers.STORE_REVIEW_ADMIN_EMAIL,
    },
  ]) {
    assert.equal(await enforceStoreReviewFixedOtp({
      ...exactAccount,
      otpCode: code,
      env,
      now,
    }, dependencies), 'password_reviewer_fixed_otp');
  }

  await assert.rejects(
    () => enforceStoreReviewFixedOtp({
      account: { id: account.id, role: 'super_admin', is_review_account: true },
      expectedRole: 'admin',
      normalizedIdentifier: identifiers.STORE_REVIEW_ADMIN_EMAIL,
      otpCode: code,
      env,
      now,
    }, dependencies),
    (error: any) => error?.code === 'REVIEWER_OTP_SCOPE_INVALID',
  );
  assert.equal(blocks.length, 0);
  assert.ok(rateCalls.some((parts) => parts.includes('account')));
  assert.ok(rateCalls.some((parts) => parts.includes('ip')));
  assert.equal(JSON.stringify(audits).includes(code), false);
  assert.equal(JSON.stringify(audits).includes(identifiers.STORE_REVIEW_WORKER_PHONE), false);

  const blockingDependencies: StoreReviewFixedOtpDependencies = {
    ...dependencies,
    consumeRateLimit: async (parts) => {
      if (parts.includes('failure')) throw new AppError(429, 'OTP_RATE_LIMITED', 'limited');
    },
  };
  await assert.rejects(
    () => enforceStoreReviewFixedOtp({
      account,
      expectedRole: 'worker',
      normalizedIdentifier: identifiers.STORE_REVIEW_WORKER_PHONE,
        otpCode: '111111',
      env,
      now,
    }, blockingDependencies),
    (error: any) => error?.code === 'REVIEWER_OTP_BLOCKED',
  );
  assert.ok(blocks.includes(account.id));
  assert.ok(audits.some((audit) => audit.action === 'otp_blocked'));
}

function testCanonicalRateLimitTargets(): void {
  assert.equal(authTarget(request({ phone: '+1 (202) 555-0101' })), '+12025550101');
  assert.equal(authTarget(request({ phone: '+1-202-555-0101' })), '+12025550101');
  assert.equal(authTarget(request({ email: ' Store-Review@Example.Invalid ' })), 'store-review@example.invalid');
}

async function withMethod<T>(
  target: Record<string, unknown>,
  method: string,
  replacement: (...args: any[]) => Promise<any>,
  operation: () => Promise<T>,
): Promise<T> {
  const original = target[method];
  target[method] = replacement;
  try {
    return await operation();
  } finally {
    target[method] = original;
  }
}

async function testFailedReviewerLoginAuditRedactsIdentifiers(): Promise<void> {
  const passwordHash = await bcrypt.hash('Correct-Reviewer-Password-42!', 4);
  const cases = [
    {
      id: '00000000-0000-4000-8000-000000000101',
      identifier: identifiers.STORE_REVIEW_WORKER_PHONE,
      entityType: 'worker',
      user: {
        id: '00000000-0000-4000-8000-000000000101',
        role: 'worker',
        is_review_account: true,
        password_hash: passwordHash,
        worker: { id: 'review-worker-id' },
      },
      login: () => AuthService.loginWorker({
        phone: identifiers.STORE_REVIEW_WORKER_PHONE,
        password: 'Wrong-Reviewer-Password-42!',
      }),
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      identifier: identifiers.STORE_REVIEW_COMPANY_EMAIL,
      entityType: 'company',
      user: {
        id: '00000000-0000-4000-8000-000000000102',
        role: 'company',
        is_review_account: true,
        password_hash: passwordHash,
        company: { id: 'review-company-id' },
      },
      login: () => AuthService.loginCompany({
        email: identifiers.STORE_REVIEW_COMPANY_EMAIL,
        password: 'Wrong-Reviewer-Password-42!',
      }),
    },
    {
      id: '00000000-0000-4000-8000-000000000103',
      identifier: identifiers.STORE_REVIEW_ADMIN_EMAIL,
      entityType: 'admin',
      user: {
        id: '00000000-0000-4000-8000-000000000103',
        role: 'admin',
        is_review_account: true,
        password_hash: passwordHash,
        admin: { id: 'review-admin-id' },
      },
      login: () => AuthService.loginAdmin({
        email: identifiers.STORE_REVIEW_ADMIN_EMAIL,
        password: 'Wrong-Reviewer-Password-42!',
      }),
    },
  ] as const;

  for (const testCase of cases) {
    let auditWrite: any;
    await assert.rejects(
      () => withMethod(
        prisma.user as unknown as Record<string, unknown>,
        'findUnique',
        async () => testCase.user,
        () => withMethod(
          prisma.auditLog as unknown as Record<string, unknown>,
          'create',
          async (query: any) => {
            auditWrite = query;
            return { id: 'review-login-failed-audit' };
          },
          testCase.login,
        ),
      ),
      (error: any) => error?.statusCode === 401 && error?.code === 'INVALID_CREDENTIALS',
    );
    assert.equal(auditWrite.data.entity_type, testCase.entityType);
    assert.equal(auditWrite.data.entity_id, testCase.id);
    assert.equal(JSON.stringify(auditWrite).includes(testCase.identifier), false);
  }
}

async function main(): Promise<void> {
  testEnvironmentOnlyConfiguration();
  testReviewAccountMutationGuard();
  testReviewerAuthenticationScopeCannotChangeDuringLogin();
  testSuccessfulLoginAuditPayload();
  await testReviewerFixedOtp();
  testCanonicalRateLimitTargets();
  await testFailedReviewerLoginAuditRedactsIdentifiers();
  console.log('store-review-auth-regression: OK');
}

void main();
