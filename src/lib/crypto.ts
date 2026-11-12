import crypto from 'crypto';

type RandomIntGenerator = (minimum: number, maximum: number) => number;

export function generateNumericCode(
  length = 6,
  randomInt: RandomIntGenerator = (minimum, maximum) => crypto.randomInt(minimum, maximum)
): string {
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, '0');
}

export function generateOtpCode(
  env: NodeJS.ProcessEnv = process.env,
  randomInt?: RandomIntGenerator
): string {
  if (env.NODE_ENV === 'test' && env.OTP_TEST_MODE === 'true') {
    const testCode = env.OTP_TEST_CODE?.trim();
    if (!testCode || !/^\d{6}$/.test(testCode)) {
      throw new Error(
        'OTP_TEST_CODE must be an explicitly configured 6-digit value when OTP_TEST_MODE=true.'
      );
    }
    return testCode;
  }

  return generateNumericCode(6, randomInt);
}

export function hmacSha256(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function safeCompareHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
