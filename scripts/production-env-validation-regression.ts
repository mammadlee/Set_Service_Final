import assert from 'node:assert/strict';
import { checkEnv } from '../src/lib/check-env';

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
