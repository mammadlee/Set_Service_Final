import crypto from 'crypto';

const SECRET = process.env.QR_HMAC_SECRET;
const FALLBACK_TTL_SECONDS = 5 * 60;
export const MAX_QR_TOKEN_TTL_SECONDS = 5 * 60;
export const QR_TOKEN_CLOCK_SKEW_SECONDS = 30;
const DEFAULT_TTL_SECONDS = parsePositiveTtl(process.env.QR_TOKEN_TTL_SECONDS, FALLBACK_TTL_SECONDS);

export type AttendanceQrPayload = {
  assignment_id?: string;
  order_id: string;
  company_id: string;
  kiosk_id?: string;
  kiosk_session_id?: string;
  iat: number;
  exp: number;
  nonce: string;
};

export type QrVerificationResult =
  | { valid: true; payload: AttendanceQrPayload }
  | { valid: false; expired?: boolean };

export function generateAttendanceQrToken(input: {
  assignmentId?: string;
  orderId: string;
  companyId: string;
  kioskId?: string;
  kioskSessionId?: string;
  ttlSeconds?: number;
}): { token: string; expiresAt: Date; nonce: string } {
  const ttlSeconds = input.ttlSeconds === undefined
    ? DEFAULT_TTL_SECONDS
    : requireValidTtl(input.ttlSeconds);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const payload: AttendanceQrPayload = {
    order_id: input.orderId,
    company_id: input.companyId,
    iat,
    exp,
    nonce: crypto.randomBytes(12).toString('hex'),
  };
  if (input.assignmentId) payload.assignment_id = input.assignmentId;
  if (input.kioskId) payload.kiosk_id = input.kioskId;
  if (input.kioskSessionId) payload.kiosk_session_id = input.kioskSessionId;

  const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(payloadPart);

  return {
    token: `${payloadPart}.${signature}`,
    expiresAt: new Date(exp * 1000),
    nonce: payload.nonce,
  };
}

export function verifyAttendanceQrToken(token: string): QrVerificationResult {
  try {
    if (typeof token !== 'string') return { valid: false };
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };
    const [payloadPart, signature] = parts;
    if (!isCanonicalBase64Url(payloadPart) || !isCanonicalBase64Url(signature)) {
      return { valid: false };
    }

    const expectedSignature = sign(payloadPart);
    if (!safeEqual(signature, expectedSignature)) return { valid: false };

    const parsed = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as unknown;
    if (!isAttendanceQrPayload(parsed)) {
      return { valid: false };
    }
    const payload = parsed;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds) {
      return { valid: false, expired: true };
    }
    if (
      payload.iat > nowSeconds + QR_TOKEN_CLOCK_SKEW_SECONDS ||
      payload.exp - payload.iat < 1 ||
      payload.exp - payload.iat > MAX_QR_TOKEN_TTL_SECONDS ||
      payload.exp > nowSeconds + MAX_QR_TOKEN_TTL_SECONDS + QR_TOKEN_CLOCK_SKEW_SECONDS
    ) {
      return { valid: false };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

function isAttendanceQrPayload(value: unknown): value is AttendanceQrPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.order_id !== 'string' || payload.order_id.length === 0 ||
    typeof payload.company_id !== 'string' || payload.company_id.length === 0 ||
    typeof payload.nonce !== 'string' || payload.nonce.length < 16 ||
    typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat) || payload.iat <= 0 ||
    typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || payload.exp <= 0
  ) {
    return false;
  }

  for (const key of ['assignment_id', 'kiosk_id', 'kiosk_session_id'] as const) {
    const optionalValue = payload[key];
    if (optionalValue !== undefined && (typeof optionalValue !== 'string' || optionalValue.length === 0)) {
      return false;
    }
  }

  // A venue payload binds both the physical kiosk and its active activation.
  // Legacy assignment-bound kiosk payloads intentionally carry only a
  // kiosk_session_id, so only an orphaned physical kiosk id is invalid.
  if (payload.kiosk_id !== undefined && payload.kiosk_session_id === undefined) return false;
  return true;
}

export function hashQrToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sign(payloadPart: string): string {
  if (!SECRET) throw new Error('QR_HMAC_SECRET is required for attendance QR tokens.');
  return crypto.createHmac('sha256', SECRET).update(payloadPart).digest('base64url');
}

function parsePositiveTtl(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  return normalizeTtl(Number(value)) ?? fallback;
}

function requireValidTtl(value: number): number {
  const normalized = normalizeTtl(value);
  if (normalized === null) {
    throw new RangeError(`Attendance QR TTL must be an integer from 1 through ${MAX_QR_TOKEN_TTL_SECONDS} seconds.`);
  }
  return normalized;
}

function normalizeTtl(value: number): number | null {
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_QR_TOKEN_TTL_SECONDS) return null;
  return value;
}

function isCanonicalBase64Url(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return Buffer.from(value, 'base64url').toString('base64url') === value;
  } catch {
    return false;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
