import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prisma } from '../src/lib/prisma';

process.env.OTP_PEPPER = process.env.OTP_PEPPER || 'email-attempt-regression-pepper';

async function main(): Promise<void> {
  const { confirmEmailVerification } = await import('../src/modules/auth/auth.service');
  const user = {
    id: 'email-attempt-user',
    pending_email: 'worker@example.test',
    email_verification_code_hash: createHash('sha256')
      .update(`worker@example.test:654321:${process.env.OTP_PEPPER}`)
      .digest('hex'),
    email_verification_expires_at: new Date(Date.now() + 60_000),
    email_verification_attempts: 4,
    email_verification_blocked_until: null as Date | null,
  };

  let updateData: Record<string, unknown> | undefined;
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = (async (callback: (tx: unknown) => unknown) => callback({
    $queryRaw: async () => [{ id: user.id }],
    user: {
      findFirst: async () => user,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData = data;
        return { email: user.pending_email, email_verified_at: new Date() };
      },
    },
  })) as typeof prisma.$transaction;

  try {
    await assert.rejects(
      () => confirmEmailVerification(user.id, { otp_code: '111111' }),
      (error: unknown) => {
        const candidate = error as { code?: string; statusCode?: number };
        assert.equal(candidate.code, 'EMAIL_VERIFICATION_BLOCKED');
        assert.equal(candidate.statusCode, 429);
        return true;
      },
    );
    assert.deepEqual(updateData?.email_verification_attempts, { increment: 1 });
    assert.ok(updateData?.email_verification_blocked_until instanceof Date);
  } finally {
    prisma.$transaction = originalTransaction;
    await prisma.$disconnect();
  }

  console.log('email-verification-attempt-regression: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
