import crypto from 'crypto';

const SECRET = process.env.QR_HMAC_SECRET;
const FALLBACK_TTL_SECONDS = 5 * 60;
const DEFAULT_TTL_SECONDS = parsePositiveTtl(process.env.QR_TOKEN_TTL_SECONDS, FALLBACK_TTL_SECONDS);

type QrPayload = {
  assignment_id?: string;
  order_id: string;
  company_id: string;
  kiosk_id?: string;
  kiosk_session_id?: string;
  exp: number;
  nonce: string;
};

export type QrVerificationResult =
  | { valid: true; payload: QrPayload }
  | { valid: false; expired?: boolean };

export function generateAttendanceQrToken(input: {
  assignmentId?: string;
  orderId: string;
  companyId: string;
  kioskId?: string;
  kioskSessionId?: string;
  ttlSeconds?: number;
}): { token: string; expiresAt: Date } {
  const ttlSeconds = sanitizeTtl(input.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: QrPayload = {
    order_id: input.orderId,
    company_id: input.companyId,
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
  };
}

export function verifyAttendanceQrToken(token: string): QrVerificationResult {
  try {
    const [payloadPart, signature] = token.split('.');
    if (!payloadPart || !signature) return { valid: false };

    const expectedSignature = sign(payloadPart);
    if (!safeEqual(signature, expectedSignature)) return { valid: false };

    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as QrPayload;
    if (!payload.order_id || !payload.company_id || !payload.exp || !payload.nonce) {
      return { valid: false };
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return { valid: false, expired: true };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
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
  return sanitizeTtl(Number(value), fallback);
}

function sanitizeTtl(value: number, fallback = FALLBACK_TTL_SECONDS): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
