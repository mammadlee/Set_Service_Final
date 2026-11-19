const assert = require('node:assert/strict');
const jsonwebtoken = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'access-secret-for-regression-tests-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'refresh-secret-for-regression-tests-0123456789abcdef';
process.env.JWT_ISSUER = 'set-service-regression';
process.env.JWT_AUDIENCE = 'set-service-regression-clients';
process.env.OTP_PEPPER = 'otp-pepper-for-regression-tests-0123456789abcdef';
process.env.OTP_TEST_MODE = 'true';
process.env.OTP_TEST_CODE = '123456';

const {
  getTokenExpiration,
  signAccessToken,
  signRefreshToken,
  signRegistrationToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyRegistrationToken,
} = require('../src/lib/jwt') as typeof import('../src/lib/jwt');
const { requireAuth } = require('../src/middleware/auth') as typeof import('../src/middleware/auth');
const AuthService = require('../src/modules/auth/auth.service') as typeof import('../src/modules/auth/auth.service');
const { CompanyRegisterSchema, WorkerRegisterSchema } = require('../src/modules/auth/auth.schema') as typeof import('../src/modules/auth/auth.schema');

const authTestRedisUrl = process.env.AUTH_SECURITY_TEST_REDIS_URL?.trim();
if (authTestRedisUrl) {
  const parsedRedisUrl = new URL(authTestRedisUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsedRedisUrl.hostname)) {
    throw new Error('AUTH_SECURITY_TEST_REDIS_URL must target a local Redis instance.');
  }
  process.env.REDIS_URL = authTestRedisUrl;
} else {
  // Never inherit a remote Redis endpoint from a developer .env during regression tests.
  delete process.env.REDIS_URL;
}

function assertLocalTestDatabaseUrl(label: string, rawValue: string | undefined): string {
  if (!rawValue) {
    throw new Error(`${label} is required for auth integration regression tests.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL.`);
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use the PostgreSQL protocol.`);
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname.toLowerCase())) {
    throw new Error(`${label} must target localhost; external databases are forbidden.`);
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!databaseName.toLowerCase().includes('test')) {
    throw new Error(`${label} database name must contain "test".`);
  }
  return databaseName;
}

async function main() {
  const identity = { sub: '00000000-0000-4000-8000-000000000001', role: 'worker' };
  const accessToken = signAccessToken(identity);
  const refreshToken = signRefreshToken(identity);
  const registrationToken = signRegistrationToken(identity);

  const accessPayload = verifyAccessToken(accessToken);
  const refreshPayload = verifyRefreshToken(refreshToken);
  const registrationPayload = verifyRegistrationToken(registrationToken);
  assert.equal(accessPayload.token_use, 'access');
  assert.equal(refreshPayload.token_use, 'refresh');
  assert.equal(registrationPayload.token_use, 'registration');
  assert.ok(accessPayload.jti.length >= 8);
  assert.ok(refreshPayload.jti.length >= 8);
  assert.ok(refreshPayload.family_id && refreshPayload.family_id.length >= 8);
  assert.equal(accessPayload.session_version, 0);
  assert.equal(refreshPayload.session_version, 0);
  assert.equal(accessPayload.iss, process.env.JWT_ISSUER);
  assert.equal(accessPayload.aud, process.env.JWT_AUDIENCE);
  assert.ok(getTokenExpiration(refreshToken).getTime() > Date.now());

  assert.throws(() => verifyRefreshToken(accessToken));
  assert.throws(() => verifyAccessToken(refreshToken));
  assert.throws(() => verifyAccessToken(registrationToken));
  assert.throws(() => verifyRefreshToken(registrationToken));
  assert.throws(() => verifyRegistrationToken(accessToken));

  const refreshSignedWithWrongUse = jsonwebtoken.sign(
    { ...identity, token_use: 'access' },
    process.env.JWT_REFRESH_SECRET,
    {
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      expiresIn: '5m',
    },
  );
  assert.throws(() => verifyRefreshToken(refreshSignedWithWrongUse));

  const expiredAccessToken = jsonwebtoken.sign(
    { ...identity, token_use: 'access' },
    process.env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      expiresIn: -1,
    },
  );
  assert.throws(() => verifyAccessToken(expiredAccessToken));

  let middlewareError: any;
  requireAuth(
    { headers: { authorization: `Bearer ${refreshToken}` } } as any,
    {} as any,
    (error?: any) => { middlewareError = error; },
  );
  assert.equal(middlewareError?.statusCode, 401);
  assert.equal(middlewareError?.code, 'UNAUTHORIZED');

  await assert.rejects(
    () => AuthService.refresh(accessToken),
    (error: any) => error?.statusCode === 401 && error?.code === 'INVALID_REFRESH_TOKEN',
  );

  const workerRegistration = WorkerRegisterSchema.parse({
    full_name: 'Security Test Worker',
    phone: '+994501234567',
    position: 'Waiter',
    documents: [{ type: 'passport', url: 'https://attacker.invalid/public-document.pdf' }],
  });
  assert.equal(Object.prototype.hasOwnProperty.call(workerRegistration, 'documents'), false);

  assert.equal(CompanyRegisterSchema.safeParse({
    name: 'Security Test Company',
    contact_name: 'Security Contact',
    phone: '+994501234568',
    email: 'security-company@example.invalid',
    docs_url: 'https://attacker.invalid/company.pdf',
  }).success, false);
  assert.equal(CompanyRegisterSchema.safeParse({
    name: 'Security Test Company',
    contact_name: 'Security Contact',
    phone: '+994501234568',
    email: 'security-company@example.invalid',
  }).success, true);

  if (process.env.AUTH_SECURITY_INTEGRATION_CONFIRM === '1') {
    await runDatabaseRegression();
  }

  console.log('auth-security-regression: OK');
}

async function runDatabaseRegression() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Auth security integration tests refuse to run in production.');
  }

  const { prisma } = require('../src/lib/prisma') as typeof import('../src/lib/prisma');
  const { hashPassword } = require('../src/lib/password') as typeof import('../src/lib/password');
  const { hmacSha256 } = require('../src/lib/crypto') as typeof import('../src/lib/crypto');

  const expectedDatabase = assertLocalTestDatabaseUrl('DATABASE_URL', process.env.DATABASE_URL);
  if (process.env.DIRECT_URL) {
    const directDatabase = assertLocalTestDatabaseUrl('DIRECT_URL', process.env.DIRECT_URL);
    if (directDatabase !== expectedDatabase) {
      throw new Error('DATABASE_URL and DIRECT_URL must target the same local test database.');
    }
  }
  const databaseRows = await prisma.$queryRaw<Array<{ database_name: string }>>`
    SELECT current_database() AS database_name
  `;
  const actualDatabase = databaseRows[0]?.database_name ?? '';
  if (actualDatabase !== expectedDatabase || !actualDatabase.toLowerCase().includes('test')) {
    throw new Error(
      `Connected database "${actualDatabase}" does not match the guarded local test target.`,
    );
  }

  const suffix = `${Date.now()}`.slice(-8);
  const primaryPhone = `+99450${suffix}`;
  const pendingPhone = `+99451${suffix}`;
  const rejectedPhone = `+99455${suffix}`;
  const correctOtpPhone = `+99470${suffix}`;
  const wrongOtpTarget = `+99477${suffix}`;
  const password = 'Regression123!';
  const changedPassword = 'ChangedRegression123!';
  const createdUserIds: string[] = [];
  const standaloneOtpIds: string[] = [];

  try {
    const passwordHash = await hashPassword(password);
    const primary = await prisma.user.create({
      data: {
        phone: primaryPhone,
        name: 'Auth Regression Worker',
        role: 'worker',
        password_hash: passwordHash,
        password_set_at: new Date(),
        worker: {
          create: {
            position: 'Waiter',
            status: 'approved',
          },
        },
      },
      include: { worker: true },
    });
    createdUserIds.push(primary.id);
    if (!primary.worker) {
      throw new Error('Primary regression user must include its worker profile.');
    }
    const primaryWorker = primary.worker;

    const pending = await prisma.user.create({
      data: {
        phone: pendingPhone,
        name: 'Pending Auth Regression Worker',
        role: 'worker',
        password_hash: passwordHash,
        password_set_at: new Date(),
        worker: { create: { position: 'Waiter', status: 'pending_approval' } },
      },
    });
    createdUserIds.push(pending.id);

    const rejected = await prisma.user.create({
      data: {
        phone: rejectedPhone,
        name: 'Rejected Auth Regression Worker',
        role: 'worker',
        password_hash: passwordHash,
        password_set_at: new Date(),
        worker: { create: { position: 'Waiter', status: 'rejected' } },
      },
    });
    createdUserIds.push(rejected.id);

    await assert.rejects(
      () => AuthService.loginWorker({ phone: pendingPhone, password }),
      (error: any) => error?.statusCode === 403 && error?.code === 'WORKER_NOT_APPROVED',
    );
    await assert.rejects(
      () => AuthService.loginWorker({ phone: rejectedPhone, password }),
      (error: any) => error?.statusCode === 403 && error?.code === 'WORKER_NOT_APPROVED',
    );

    const firstSession = await AuthService.loginWorker({ phone: primaryPhone, password }, '127.0.0.1');
    const firstRefresh = firstSession.refresh_token;
    const firstAccess = firstSession.access_token;
    assert.equal(await middlewareError(firstAccess), undefined);

    const rotated = await AuthService.refresh(firstRefresh, '127.0.0.1');
    await assert.rejects(
      () => AuthService.refresh(firstRefresh, '127.0.0.1'),
      (error: any) => error?.statusCode === 401 && error?.code === 'REFRESH_TOKEN_REUSE',
    );
    await assert.rejects(
      () => AuthService.refresh(rotated.refresh_token, '127.0.0.1'),
      (error: any) => error?.statusCode === 401 && error?.code === 'INVALID_REFRESH_TOKEN',
    );
    await assert.rejects(
      () => AuthService.refresh(firstRefresh, '127.0.0.1'),
      (error: any) => error?.statusCode === 401 && error?.code === 'REFRESH_TOKEN_REUSE',
    );

    const concurrentSession = await AuthService.loginWorker(
      { phone: primaryPhone, password },
      '127.0.0.1',
    );
    const concurrentRefreshes = await Promise.allSettled([
      AuthService.refresh(concurrentSession.refresh_token, '127.0.0.1'),
      AuthService.refresh(concurrentSession.refresh_token, '127.0.0.1'),
    ]);
    const concurrentSuccesses = concurrentRefreshes.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof AuthService.refresh>>> =>
        result.status === 'fulfilled',
    );
    const concurrentFailures = concurrentRefreshes.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    assert.equal(concurrentSuccesses.length, 1);
    assert.equal(concurrentFailures.length, 1);
    assert.equal(concurrentFailures[0].reason?.code, 'REFRESH_TOKEN_REUSE');
    await assert.rejects(
      () => AuthService.refresh(concurrentSuccesses[0].value.refresh_token, '127.0.0.1'),
      (error: any) => error?.statusCode === 401 && error?.code === 'INVALID_REFRESH_TOKEN',
    );

    const logoutSession = await AuthService.loginWorker({ phone: primaryPhone, password }, '127.0.0.1');
    await AuthService.logout(logoutSession.refresh_token, primary.id);
    await assert.rejects(
      () => AuthService.refresh(logoutSession.refresh_token, '127.0.0.1'),
      (error: any) => error?.statusCode === 401 && error?.code === 'INVALID_REFRESH_TOKEN',
    );

    const statusSession = await AuthService.loginWorker({ phone: primaryPhone, password }, '127.0.0.1');
    await prisma.user.update({ where: { id: primary.id }, data: { is_active: false } });
    assert.equal((await middlewareError(statusSession.access_token))?.code, 'ACCOUNT_INACTIVE');
    await prisma.user.update({ where: { id: primary.id }, data: { is_active: true } });
    await prisma.worker.update({ where: { id: primaryWorker.id }, data: { status: 'rejected' } });
    assert.equal((await middlewareError(statusSession.access_token))?.code, 'WORKER_NOT_APPROVED');
    await prisma.worker.update({ where: { id: primaryWorker.id }, data: { status: 'approved' } });
    await prisma.user.update({ where: { id: primary.id }, data: { deleted_at: new Date() } });
    assert.equal((await middlewareError(statusSession.access_token))?.code, 'ACCOUNT_INACTIVE');
    await prisma.user.update({ where: { id: primary.id }, data: { deleted_at: null } });

    const passwordSession = await AuthService.loginWorker({ phone: primaryPhone, password }, '127.0.0.1');
    const passwordOtp = await prisma.otpCode.create({
      data: {
        user_id: primary.id,
        phone: primaryPhone,
        purpose: 'worker_password_reset',
        code_hash: otpHashForTest(primaryPhone, 'worker_password_reset', '123456', hmacSha256),
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        max_attempts: 5,
      },
    });
    standaloneOtpIds.push(passwordOtp.id);
    const passwordOtpState = await prisma.otpCode.findUniqueOrThrow({
      where: { id: passwordOtp.id },
    });
    assert.equal(passwordOtpState.verified_at, null);
    assert.equal(passwordOtpState.attempts, 0);
    assert.equal(passwordOtpState.max_attempts, 5);
    assert.equal(passwordOtpState.blocked_until, null);
    assert.ok(passwordOtpState.expires_at.getTime() > Date.now());
    await AuthService.resetWorkerPassword({
      phone: primaryPhone,
      otp_code: '123456',
      password: changedPassword,
    });
    assert.equal((await middlewareError(passwordSession.access_token))?.code, 'SESSION_REVOKED');
    await assert.rejects(
      () => AuthService.refresh(passwordSession.refresh_token, '127.0.0.1'),
      (error: any) => error?.statusCode === 401 && error?.code === 'INVALID_REFRESH_TOKEN',
    );

    const wrongOtp = await prisma.otpCode.create({
      data: {
        phone: wrongOtpTarget,
        purpose: 'worker_registration',
        code_hash: otpHashForTest(wrongOtpTarget, 'worker_registration', '123456', hmacSha256),
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        max_attempts: 5,
      },
    });
    standaloneOtpIds.push(wrongOtp.id);
    const wrongResults = await Promise.allSettled(
      Array.from({ length: 50 }, () => AuthService.verifyOtp({
        phone: wrongOtpTarget,
        otp_code: '000000',
        purpose: 'worker_registration',
      })),
    );
    assert.equal(wrongResults.filter((result) => result.status === 'fulfilled').length, 0);
    const wrongOtpAfter = await prisma.otpCode.findUniqueOrThrow({ where: { id: wrongOtp.id } });
    assert.equal(wrongOtpAfter.attempts, 5);
    assert.ok(wrongOtpAfter.blocked_until instanceof Date);

    const correctOtpUser = await prisma.user.create({
      data: {
        phone: correctOtpPhone,
        name: 'OTP Concurrency Worker',
        role: 'worker',
        worker: { create: { position: 'Waiter', status: 'pending_otp' } },
      },
      include: { worker: true },
    });
    createdUserIds.push(correctOtpUser.id);
    const correctOtp = await prisma.otpCode.create({
      data: {
        user_id: correctOtpUser.id,
        phone: correctOtpPhone,
        purpose: 'worker_registration',
        code_hash: otpHashForTest(correctOtpPhone, 'worker_registration', '123456', hmacSha256),
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        max_attempts: 5,
      },
    });
    const correctResults = await Promise.allSettled(
      Array.from({ length: 10 }, () => AuthService.verifyOtp({
        phone: correctOtpPhone,
        otp_code: '123456',
        purpose: 'worker_registration',
      })),
    );
    assert.equal(correctResults.filter((result) => result.status === 'fulfilled').length, 1);
    const correctOtpAfter = await prisma.otpCode.findUniqueOrThrow({ where: { id: correctOtp.id } });
    assert.ok(correctOtpAfter.verified_at instanceof Date);
    await assert.rejects(
      () => AuthService.verifyOtp({
        phone: correctOtpPhone,
        otp_code: '123456',
        purpose: 'worker_registration',
      }),
      (error: any) => error?.statusCode === 401 && error?.code === 'INVALID_OTP',
    );
  } finally {
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (standaloneOtpIds.length) {
      await prisma.otpCode.deleteMany({ where: { id: { in: standaloneOtpIds } } });
    }
    const { disconnectRedis } = require('../src/lib/redis') as typeof import('../src/lib/redis');
    await disconnectRedis();
    await prisma.$disconnect();
  }
}

function otpHashForTest(
  target: string,
  purpose: string,
  code: string,
  hmacSha256: (value: string, secret: string) => string,
) {
  return hmacSha256(
    `${target}:${purpose}:${code}`,
    process.env.OTP_PEPPER!,
  );
}

function middlewareError(token: string): Promise<any | undefined> {
  return new Promise((resolve) => {
    const response = {
      setHeader: () => undefined,
    };
    requireAuth(
      { headers: { authorization: `Bearer ${token}` } } as any,
      response as any,
      (error?: any) => resolve(error),
    );
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
