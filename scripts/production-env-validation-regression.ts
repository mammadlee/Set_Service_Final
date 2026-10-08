import assert from 'node:assert/strict';
import { checkEnv } from '../src/lib/check-env';
import { buildKioskPublicUrl, kioskPublicUrlIssue, resolveKioskPublicBaseUrl } from '../src/lib/kiosk-public-url';

const originalEnvironment = { ...process.env };
const originalExit = process.exit;
const originalError = console.error;
const originalWarn = console.warn;

const credential = (purpose: string): string => [
  `regression-${purpose}`,
  'Ax7mQ2vL9pR4tW8yK3nD6sF1hJ5cB0uZ',
].join('-');

const productionEnvironment = environment([
  ['NODE_ENV', 'production'],
  [
    'DATABASE_URL',
    ['postgresql://postgres:', 'regression-password', '@localhost:5432/setservice'].join(''),
  ],
  [
    'DIRECT_URL',
    ['postgresql://postgres:', 'regression-password', '@localhost:5432/setservice'].join(''),
  ],
  ['REDIS_URL', 'redis://localhost:6379'],
  ['JWT_ACCESS_SECRET', credential('jwt-access')],
  ['JWT_REFRESH_SECRET', credential('jwt-refresh')],
  ['JWT_ISSUER', 'set-service-regression'],
  ['JWT_AUDIENCE', 'set-service-regression-clients'],
  ['QR_HMAC_SECRET', credential('qr-hmac')],
  ['KIOSK_TOKEN_ENCRYPTION_SECRET', credential('kiosk-encryption')],
  ['KIOSK_PUBLIC_BASE_URL', 'https://qr.setservice.az'],
  ['OTP_PEPPER', credential('otp-pepper')],
  ['PROVIDER_OUTBOX_ENCRYPTION_SECRET', credential('outbox-encryption')],
  ['OUTBOX_WORKER_ENABLED', 'false'],
  ['OUTBOX_HEARTBEAT_TTL_SECONDS', '30'],
  ['OUTBOX_MAX_CONSECUTIVE_FAILURES', '5'],
  ['SWAGGER_DOCS_ENABLED', 'false'],
  ['CORS_ORIGINS', 'https://admin.example.com,https://company.example.com'],
  ['SMS_PROVIDER', 'pg365'],
  ['PG365_API_URL', 'https://pg365.example.test'],
  ['PG365_PUBLIC_KEY', credential('pg365-public')],
  ['PG365_PRIVATE_KEY', credential('pg365-private')],
  ['PG365_ORIGINATOR', 'SET'],
  ['PG365_TIMEOUT_MS', '8000'],
  ['OTP_TEST_MODE', 'false'],
  ['OTP_LOG_CODES', 'false'],
  ['STORAGE_PROVIDER', 's3'],
  ['S3_BUCKET', 'setservice-regression-documents'],
  ['S3_REGION', 'eu-central-1'],
  ['S3_ACCESS_KEY_ID', credential('s3-access')],
  ['S3_SECRET_ACCESS_KEY', credential('s3-secret')],
  ['STORAGE_PUBLIC_BASE_URL', 'https://cdn.example.com'],
  ['STORAGE_SIGNED_URL_TTL_SECONDS', '300'],
  ['MALWARE_SCANNER_PROVIDER', 'http'],
  ['MALWARE_SCAN_REQUIRED', 'true'],
  ['MALWARE_SCANNER_URL', 'http://malware-scanner:8080/scan'],
  ['MALWARE_SCANNER_API_KEY', credential('malware-scanner')],
  ['PUSH_NOTIFICATIONS_ENABLED', 'false'],
]);

interface ValidationResult {
  ok: boolean;
  output: string;
}

class ValidationExit extends Error {
  constructor(readonly code: number) {
    super(`Environment validation exited with code ${code}.`);
  }
}

function main(): void {
  const token = Buffer.alloc(32, 7).toString('base64url');
  const expectedUrl = `https://qr.setservice.az/kiosk#capability=${token}`;
  for (const base of [
    'https://qr.setservice.az', 'https://qr.setservice.az/',
    'https://qr.setservice.az/kiosk', 'https://qr.setservice.az/kiosk/',
    ' https://qr.setservice.az/ ',
  ]) {
    const environment = { NODE_ENV: 'production', KIOSK_PUBLIC_BASE_URL: base };
    assert.equal(kioskPublicUrlIssue(environment), null);
    assert.equal(buildKioskPublicUrl(token, resolveKioskPublicBaseUrl(environment)), expectedUrl);
  }
  for (const base of [
    undefined, '', 'https://kiosk.setservice.az', 'https://external.example',
    'http://qr.setservice.az', 'https://qr.setservice.az:444',
    'https://qr.setservice.az.evil.example', 'https://qr.setservice.az/other',
    'https://qr.setservice.az/kiosk/kiosk', 'https://qr.setservice.az/kiosk/../',
    'https://qr.setservice.az/%6biosk', 'https://user@qr.setservice.az',
    'https://@qr.setservice.az', 'https://qr.setservice.az?next=external',
    `https://qr.setservice.az#capability=${token}`, 'https://qr.setservice.az?',
    'https://qr.setservice.az#', 'https://qr.setservice.az\\kiosk',
    'https://qr.setservice.az/\nkiosk',
  ]) {
    const environment = {
      NODE_ENV: 'production', KIOSK_PUBLIC_BASE_URL: base,
      PUBLIC_APP_URL: 'https://qr.setservice.az',
    };
    assert.ok(kioskPublicUrlIssue(environment), `must reject unsafe or missing kiosk base`);
    assert.throws(() => resolveKioskPublicBaseUrl(environment), (error: any) =>
      error.code === 'KIOSK_URL_CONFIG_INVALID' && !error.message.includes(token));
    const validation = validate({
      KIOSK_PUBLIC_BASE_URL: base,
      PUBLIC_APP_URL: 'https://qr.setservice.az',
    });
    assert.equal(validation.ok, false);
    assert.match(validation.output, /KIOSK_PUBLIC_BASE_URL/);
    assert.equal(validation.output.includes(token), false);
  }
  assert.equal(buildKioskPublicUrl(token, resolveKioskPublicBaseUrl({ NODE_ENV: 'test' })),
    `/kiosk#capability=${token}`);
  assert.equal(buildKioskPublicUrl(token, resolveKioskPublicBaseUrl({
    NODE_ENV: 'development', KIOSK_PUBLIC_BASE_URL: 'http://localhost:5174/kiosk/',
  })), `http://localhost:5174/kiosk#capability=${token}`);

  const resend = validate(environment([
    ['EMAIL_PROVIDER', 'resend'],
    ['RESEND_API_KEY', credential('resend-api')],
    ['EMAIL_FROM', 'SET Service <no-reply@example.test>'],
  ]));
  assert.equal(resend.ok, true, resend.output);

  const missingResendApiKey = validate(environment([
    ['EMAIL_PROVIDER', 'resend'],
    ['EMAIL_FROM', 'SET Service <no-reply@example.test>'],
  ]));
  assert.equal(missingResendApiKey.ok, false);
  assert.match(missingResendApiKey.output, /RESEND_API_KEY is required.*EMAIL_PROVIDER=resend/);

  const missingFrom = validate(environment([
    ['EMAIL_PROVIDER', 'resend'],
    ['RESEND_API_KEY', credential('resend-api')],
  ]));
  assert.equal(missingFrom.ok, false);
  assert.match(missingFrom.output, /EMAIL_FROM is required.*EMAIL_PROVIDER=resend/);

  const genericHttp = validate(environment([
    ['EMAIL_PROVIDER', 'generic_http'],
    ['EMAIL_API_URL', 'https://email.example.test/send'],
    ['EMAIL_API_KEY', credential('email-api')],
    ['EMAIL_FROM', 'no-reply@example.test'],
  ]));
  assert.equal(genericHttp.ok, true, genericHttp.output);

  const consoleProvider = validate(environment([['EMAIL_PROVIDER', 'console']]));
  assert.equal(consoleProvider.ok, false);
  assert.match(consoleProvider.output, /EMAIL_PROVIDER=console is not allowed in production/);

  console.log('production-env-validation-regression: OK');
}

function validate(overrides: NodeJS.ProcessEnv): ValidationResult {
  process.env = { ...productionEnvironment };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const output: string[] = [];
  console.error = (...values: unknown[]) => output.push(values.map(String).join(' '));
  console.warn = (...values: unknown[]) => output.push(values.map(String).join(' '));
  process.exit = ((code?: string | number | null) => {
    throw new ValidationExit(Number(code ?? 0));
  }) as typeof process.exit;

  try {
    checkEnv();
    return { ok: true, output: output.join('\n') };
  } catch (error) {
    if (error instanceof ValidationExit) {
      return { ok: error.code === 0, output: output.join('\n') };
    }
    throw error;
  } finally {
    process.exit = originalExit;
    console.error = originalError;
    console.warn = originalWarn;
  }
}

function environment(entries: Array<[string, string]>): NodeJS.ProcessEnv {
  return Object.fromEntries(entries);
}

try {
  main();
} finally {
  process.env = originalEnvironment;
  process.exit = originalExit;
  console.error = originalError;
  console.warn = originalWarn;
}
