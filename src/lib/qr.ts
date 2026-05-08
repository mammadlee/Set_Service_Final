import crypto from 'crypto';

const SECRET = process.env.QR_HMAC_SECRET!;
const WINDOW_SECONDS = 30;

/**
 * Generates an HMAC-SHA256 QR token for a company.
 * Token = base64( company_id + ":" + window + ":" + hmac )
 * Window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS)
 * Stateless — no DB hit on verification.
 */
export function generateQrToken(companyId: string): { token: string; expiresAt: Date } {
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const message = `${companyId}:${window}`;
  const hmac = crypto.createHmac('sha256', SECRET).update(message).digest('hex');
  const token = Buffer.from(`${message}:${hmac}`).toString('base64url');

  const expiresAt = new Date((window + 1) * WINDOW_SECONDS * 1000);
  return { token, expiresAt };
}

/**
 * Verifies token and returns companyId.
 * Accepts current window AND previous window (to handle edge-case timing).
 */
export function verifyQrToken(token: string): { valid: boolean; companyId?: string; expired?: boolean } {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return { valid: false };

    const [companyId, windowStr, receivedHmac] = parts;
    const receivedWindow = parseInt(windowStr, 10);
    const currentWindow = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);

    // Accept current and previous window (max ~60s grace)
    if (receivedWindow < currentWindow - 1) {
      return { valid: false, expired: true };
    }

    const message = `${companyId}:${windowStr}`;
    const expectedHmac = crypto.createHmac('sha256', SECRET).update(message).digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(receivedHmac, 'hex'),
      Buffer.from(expectedHmac, 'hex')
    );

    return isValid ? { valid: true, companyId } : { valid: false };
  } catch {
    return { valid: false };
  }
}
