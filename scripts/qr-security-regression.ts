import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.QR_HMAC_SECRET = crypto.randomBytes(32).toString('hex');
process.env.QR_TOKEN_TTL_SECONDS = '999';

type UnsignedPayload = Record<string, unknown>;

function signPayload(payload: UnsignedPayload, secret = process.env.QR_HMAC_SECRET!): string {
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadPart).digest('base64url');
  return `${payloadPart}.${signature}`;
}

async function main(): Promise<void> {
  const qr = await import('../src/lib/qr');
  const originalNow = Date.now;
  const issuedAtMs = Date.parse('2026-11-10T08:00:00.000Z');
  let nowMs = issuedAtMs;
  Date.now = () => nowMs;

  try {
    const baseInput = { orderId: 'synthetic-order', companyId: 'synthetic-company' };
    const defaultQr = qr.generateAttendanceQrToken(baseInput);
    const defaultResult = qr.verifyAttendanceQrToken(defaultQr.token);
    assert.equal(defaultResult.valid, true, 'a correctly signed token must be accepted');
    assert.equal(defaultQr.expiresAt.getTime(), issuedAtMs + 300_000,
      'an invalid configured TTL must fail closed to the 300-second default');
    assert.equal(defaultResult.valid && defaultResult.payload.iat, Math.floor(issuedAtMs / 1000));

    const [payloadPart, signature] = defaultQr.token.split('.');
    assert.ok(payloadPart && signature);
    const badSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    assert.equal(qr.verifyAttendanceQrToken(`${payloadPart}.${badSignature}`).valid, false);
    assert.equal(qr.verifyAttendanceQrToken(`${payloadPart}.${signature.slice(1)}`).valid, false);
    assert.equal(qr.verifyAttendanceQrToken(`${payloadPart}.`).valid, false);
    assert.equal(qr.verifyAttendanceQrToken(`.${signature}`).valid, false);
    assert.equal(qr.verifyAttendanceQrToken(payloadPart).valid, false);
    assert.equal(qr.verifyAttendanceQrToken(`${defaultQr.token}.extra`).valid, false,
      'a token with an extra segment must be rejected');
    assert.equal(qr.verifyAttendanceQrToken(`${payloadPart}!.${signature}`).valid, false);

    const parsed = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as UnsignedPayload;
    const otherSecretToken = signPayload(parsed, crypto.randomBytes(32).toString('hex'));
    assert.equal(qr.verifyAttendanceQrToken(otherSecretToken).valid, false,
      'a token signed with another key must be rejected');

    nowMs = issuedAtMs + 299_000;
    assert.equal(qr.verifyAttendanceQrToken(defaultQr.token).valid, true);
    nowMs = issuedAtMs + 300_000;
    assert.deepEqual(qr.verifyAttendanceQrToken(defaultQr.token), { valid: false, expired: true });
    nowMs = issuedAtMs + 301_000;
    assert.deepEqual(qr.verifyAttendanceQrToken(defaultQr.token), { valid: false, expired: true });

    nowMs = issuedAtMs;
    assert.equal(qr.generateAttendanceQrToken({ ...baseInput, ttlSeconds: 299 }).expiresAt.getTime(), issuedAtMs + 299_000);
    assert.equal(qr.generateAttendanceQrToken({ ...baseInput, ttlSeconds: 300 }).expiresAt.getTime(), issuedAtMs + 300_000);
    assert.throws(() => qr.generateAttendanceQrToken({ ...baseInput, ttlSeconds: 299.5 }), RangeError);
    assert.throws(() => qr.generateAttendanceQrToken({ ...baseInput, ttlSeconds: 301 }), RangeError);
    assert.throws(() => qr.generateAttendanceQrToken({ ...baseInput, ttlSeconds: 901 }), RangeError);

    const farFuture = signPayload({
      ...parsed,
      iat: Math.floor(issuedAtMs / 1000),
      exp: Math.floor(issuedAtMs / 1000) + 3_600,
    });
    assert.equal(qr.verifyAttendanceQrToken(farFuture).valid, false,
      'a correctly signed far-future expiry must be rejected');

    const futureIssued = signPayload({
      ...parsed,
      iat: Math.floor(issuedAtMs / 1000) + qr.QR_TOKEN_CLOCK_SKEW_SECONDS + 1,
      exp: Math.floor(issuedAtMs / 1000) + qr.QR_TOKEN_CLOCK_SKEW_SECONDS + 31,
    });
    assert.equal(qr.verifyAttendanceQrToken(futureIssued).valid, false,
      'issued-at beyond the bounded clock skew must be rejected');

    const skewBoundaryIssuedAt = Math.floor(issuedAtMs / 1000) + qr.QR_TOKEN_CLOCK_SKEW_SECONDS;
    const withinClockSkew = signPayload({
      ...parsed,
      iat: skewBoundaryIssuedAt,
      exp: skewBoundaryIssuedAt + 30,
    });
    assert.equal(qr.verifyAttendanceQrToken(withinClockSkew).valid, true,
      'issued-at exactly at the bounded clock skew must be accepted');

    const nonPositiveLifetime = signPayload({
      ...parsed,
      iat: Math.floor(issuedAtMs / 1000) + 30,
      exp: Math.floor(issuedAtMs / 1000) + 30,
    });
    assert.equal(qr.verifyAttendanceQrToken(nonPositiveLifetime).valid, false,
      'expiry must be later than issued-at');

    const missingIssuedAt = { ...parsed };
    delete missingIssuedAt.iat;
    assert.equal(qr.verifyAttendanceQrToken(signPayload(missingIssuedAt)).valid, false,
      'pre-remediation tokens without issued-at must be rejected');

    const legacy = qr.generateAttendanceQrToken({ ...baseInput, kioskSessionId: 'synthetic-session' });
    assert.equal(qr.verifyAttendanceQrToken(legacy.token).valid, true,
      'legacy assignment-bound kiosk payload shape must remain supported');
    const orphanKiosk = qr.generateAttendanceQrToken({ ...baseInput, kioskId: 'synthetic-kiosk' });
    assert.equal(qr.verifyAttendanceQrToken(orphanKiosk.token).valid, false);

    const mutatedReplay = `${defaultQr.token}.replay-mutation`;
    assert.equal(qr.verifyAttendanceQrToken(mutatedReplay).valid, false);
    assert.notEqual(qr.hashQrToken(mutatedReplay), qr.hashQrToken(defaultQr.token));

    console.log('QR security regression: OK (strict format, bounded TTL/clock skew, legacy shape; synthetic keys only)');
  } finally {
    Date.now = originalNow;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
