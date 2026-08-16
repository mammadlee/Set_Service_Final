import { JWT_TTL_SPECS, JwtTtlKey, jwtTtlIssue } from './jwt-ttl';

interface EnvVar {
  key: string;
  required: boolean | 'production';
  minLength?: number;
  positiveInt?: boolean;
  hint?: string;
}

const ENV_VARS: EnvVar[] = [
  { key: 'DATABASE_URL', required: true, hint: 'postgresql://user:pass@localhost:5432/setservice' },
  { key: 'DIRECT_URL', required: 'production', hint: 'direct PostgreSQL URL for Prisma migrations; for local development it can match DATABASE_URL' },
  { key: 'REDIS_URL', required: 'production', hint: 'redis://default:password@host:6379' },
  { key: 'TRUST_PROXY_CIDRS', required: false, hint: 'comma-separated trusted reverse-proxy CIDRs; empty means do not trust X-Forwarded-For' },
  { key: 'RATE_LIMIT_ACTOR_WINDOW_MS', required: false, positiveInt: true, hint: 'default: 900000' },
  { key: 'RATE_LIMIT_ACTOR_MAX', required: false, positiveInt: true, hint: 'default: 600' },
  { key: 'JWT_ACCESS_SECRET', required: true, minLength: 32, hint: '32+ chars, random, used only for access tokens' },
  { key: 'JWT_REFRESH_SECRET', required: true, minLength: 32, hint: '32+ chars, random, different from JWT_ACCESS_SECRET' },
  { key: 'JWT_ISSUER', required: 'production', hint: 'stable issuer identifier, for example set-service-api' },
  { key: 'JWT_AUDIENCE', required: 'production', hint: 'stable client audience, for example set-service-clients' },
  { key: 'QR_HMAC_SECRET', required: true, minLength: 32, hint: '32+ chars, random, different from JWT/OTP secrets' },
  { key: 'KIOSK_TOKEN_ENCRYPTION_SECRET', required: 'production', minLength: 32, hint: '32+ chars, random, dedicated to kiosk token encryption' },
  { key: 'OTP_PEPPER', required: 'production', minLength: 32, hint: '32+ chars, random, different from JWT/QR secrets' },
  { key: 'JWT_ACCESS_EXPIRES_IN', required: false, hint: 'default: 15m' },
  { key: 'JWT_REFRESH_EXPIRES_IN', required: false, hint: 'default: 30d' },
  { key: 'JWT_REGISTRATION_EXPIRES_IN', required: false, hint: 'default: 30m' },
  { key: 'QR_TOKEN_TTL_SECONDS', required: false, positiveInt: true, hint: 'default: 300' },
  { key: 'KIOSK_SESSION_TTL_HOURS', required: false, positiveInt: true, hint: 'default: 12' },
  { key: 'OTP_TEST_MODE', required: false, hint: 'test only: true | false' },
  { key: 'OTP_TEST_CODE', required: false, hint: 'test only; exactly 6 digits' },
  { key: 'OTP_LOG_CODES', required: false, hint: 'development only: true | false' },
  { key: 'CORS_ORIGINS', required: 'production', hint: 'comma-separated allowed origins' },
  { key: 'AUTH_COOKIE_SAME_SITE', required: false, hint: 'strict | lax | none; default: lax' },
  { key: 'PORT', required: false, positiveInt: true, hint: 'default: 3000' },
  { key: 'NODE_ENV', required: false, hint: 'development | test | production' },
  { key: 'SWAGGER_DOCS_ENABLED', required: false, hint: 'true | false; production must be false' },
  { key: 'SENTRY_DSN', required: false, hint: 'optional error monitoring' },
  { key: 'OUTBOX_WORKER_ENABLED', required: 'production', hint: 'false for the API when a separate outbox worker is deployed; true only for an intentional in-process topology' },
  { key: 'OUTBOX_HEALTH_PORT', required: false, positiveInt: true, hint: 'worker health/metrics port, default: 3001' },
  { key: 'OUTBOX_MAX_CONSECUTIVE_FAILURES', required: false, positiveInt: true, hint: 'worker exits after this many failed batches, default: 5' },
  { key: 'OUTBOX_HEARTBEAT_TTL_SECONDS', required: false, positiveInt: true, hint: 'Redis worker heartbeat TTL, 10-300 seconds, default: 30' },
  { key: 'OUTBOX_PROCESSED_RETENTION_DAYS', required: false, positiveInt: true, hint: '1-3650, default: 30' },
  { key: 'OUTBOX_DEAD_RETENTION_DAYS', required: false, positiveInt: true, hint: '1-3650, default: 90' },
  { key: 'OTP_RETENTION_DAYS', required: false, positiveInt: true, hint: '1-3650, default: 30' },
  { key: 'REFRESH_TOKEN_RETENTION_DAYS', required: false, positiveInt: true, hint: '1-3650, default: 90' },
  { key: 'AUDIT_LOG_RETENTION_DAYS', required: false, positiveInt: true, hint: '1-3650, default: 365' },
  { key: 'SMS_PROVIDER', required: false, hint: 'console | generic_http | pg365' },
  { key: 'SMS_API_URL', required: false, hint: 'required for generic_http' },
  { key: 'SMS_API_KEY', required: false, hint: 'required for generic_http' },
  { key: 'SMS_FROM', required: false, hint: 'required for generic_http' },
  { key: 'PG365_API_URL', required: false, hint: 'required for pg365; https://api.poctgoyercini.com' },
  { key: 'PG365_PUBLIC_KEY', required: false, hint: 'required for pg365' },
  { key: 'PG365_PRIVATE_KEY', required: false, hint: 'required for pg365' },
  { key: 'PG365_ORIGINATOR', required: false, hint: 'required for pg365; default deployment value: SET' },
  { key: 'PG365_TIMEOUT_MS', required: false, positiveInt: true, hint: 'required for pg365; 1-120000' },
  { key: 'EMAIL_PROVIDER', required: false, hint: 'console | generic_http' },
  { key: 'EMAIL_API_URL', required: false, hint: 'required for generic_http' },
  { key: 'EMAIL_API_KEY', required: false, hint: 'required for generic_http' },
  { key: 'EMAIL_FROM', required: false, hint: 'required for generic_http' },
  { key: 'PROVIDER_OUTBOX_ENCRYPTION_SECRET', required: 'production', minLength: 32, hint: '32+ chars, dedicated to encrypted provider outbox payloads' },
  { key: 'PROVIDER_HTTP_TIMEOUT_MS', required: false, positiveInt: true, hint: '100-120000, default: 8000' },
  { key: 'PROVIDER_HTTP_MAX_ATTEMPTS', required: false, positiveInt: true, hint: '1-5, default: 2' },
  { key: 'PROVIDER_HTTP_RETRY_BASE_MS', required: false, positiveInt: true, hint: '1-60000, default: 250' },
  { key: 'PROVIDER_CIRCUIT_FAILURE_THRESHOLD', required: false, positiveInt: true, hint: '1-50, default: 5' },
  { key: 'PROVIDER_CIRCUIT_RESET_MS', required: false, positiveInt: true, hint: '1000-3600000, default: 60000' },
  { key: 'STORAGE_PROVIDER', required: false, hint: 'local | s3 | r2' },
  { key: 'LOCAL_UPLOAD_DIR', required: false, hint: 'default: uploads' },
  { key: 'PRIVATE_DOWNLOAD_SIGNING_SECRET', required: false, minLength: 32, hint: 'development-only local private-download signing secret' },
  { key: 'STORAGE_SIGNED_URL_TTL_SECONDS', required: false, positiveInt: true, hint: '1-900 seconds, default: 300' },
  { key: 'STORAGE_PUBLIC_BASE_URL', required: false, hint: 'public URL base for explicitly public profile assets only' },
  { key: 'S3_BUCKET', required: false, hint: 'required for s3/r2' },
  { key: 'S3_REGION', required: false, hint: 'required for s3' },
  { key: 'S3_ENDPOINT', required: false, hint: 'required for r2 or custom s3' },
  { key: 'S3_ACCESS_KEY_ID', required: false, hint: 'required for s3/r2' },
  { key: 'S3_SECRET_ACCESS_KEY', required: false, hint: 'required for s3/r2' },
  { key: 'MALWARE_SCANNER_PROVIDER', required: false, hint: 'disabled | http' },
  { key: 'MALWARE_SCAN_REQUIRED', required: false, hint: 'true | false; production must be true' },
  { key: 'MALWARE_SCANNER_URL', required: false, hint: 'required for MALWARE_SCANNER_PROVIDER=http' },
  { key: 'MALWARE_SCANNER_API_KEY', required: false, minLength: 32, hint: 'required injected bearer credential in production' },
  { key: 'MALWARE_SCANNER_TIMEOUT_MS', required: false, positiveInt: true, hint: '1000-60000, default: 10000' },
  { key: 'MALWARE_SCANNER_MAX_ATTEMPTS', required: false, positiveInt: true, hint: '1-3, default: 2' },
  { key: 'PUSH_NOTIFICATIONS_ENABLED', required: false, hint: 'true | false, default false' },
  { key: 'FIREBASE_PROJECT_ID', required: false, hint: 'optional push notifications' },
  { key: 'FIREBASE_CLIENT_EMAIL', required: false },
  { key: 'FIREBASE_PRIVATE_KEY', required: false },
];

export function checkEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';

  for (const variable of ENV_VARS) {
    const value = process.env[variable.key];
    const required = variable.required === true || (variable.required === 'production' && isProduction);

    if (required && !value) {
      errors.push(`- ${variable.key} is required${variable.hint ? ` (${variable.hint})` : ''}`);
      continue;
    }

    if (value && variable.minLength && value.length < variable.minLength) {
      errors.push(`- ${variable.key} must be at least ${variable.minLength} characters (current: ${value.length})`);
      continue;
    }

    if (value && variable.positiveInt && (!Number.isInteger(Number(value)) || Number(value) <= 0)) {
      const message = `- ${variable.key} must be a positive integer`;
      (isProduction ? errors : warnings).push(message);
    }

    if (!required && !value && !isProduction) {
      warnings.push(`- ${variable.key} is not set${variable.hint ? ` (${variable.hint})` : ''}`);
    }
  }

  validateProductionSafety(errors, warnings, isProduction);
  for (const key of Object.keys(JWT_TTL_SPECS) as JwtTtlKey[]) {
    const issue = jwtTtlIssue(key, process.env[key]);
    if (issue) errors.push(`- ${issue}`);
  }

  if (warnings.length) {
    console.warn('[Env] Warnings:');
    warnings.forEach((warning) => console.warn(warning));
  }

  if (errors.length) {
    console.error('\n[Env] Invalid environment configuration:');
    errors.forEach((error) => console.error(error));
    console.error('\nReview .env.example and ENV_SETUP.md.\n');
    process.exit(1);
  }
}

function validateProductionSafety(errors: string[], warnings: string[], isProduction: boolean): void {
  const jwtAccessSecret = process.env.JWT_ACCESS_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const qrSecret = process.env.QR_HMAC_SECRET;
  const kioskEncryptionSecret = process.env.KIOSK_TOKEN_ENCRYPTION_SECRET;
  const otpPepper = process.env.OTP_PEPPER;
  const providerOutboxSecret = process.env.PROVIDER_OUTBOX_ENCRYPTION_SECRET;
  const privateDownloadSecret = process.env.PRIVATE_DOWNLOAD_SIGNING_SECRET;

  const securitySecrets: Array<[string, string | undefined]> = [
    ['JWT_ACCESS_SECRET', jwtAccessSecret],
    ['JWT_REFRESH_SECRET', jwtRefreshSecret],
    ['QR_HMAC_SECRET', qrSecret],
    ['KIOSK_TOKEN_ENCRYPTION_SECRET', kioskEncryptionSecret],
    ['OTP_PEPPER', otpPepper],
    ['PROVIDER_OUTBOX_ENCRYPTION_SECRET', providerOutboxSecret],
    ['PRIVATE_DOWNLOAD_SIGNING_SECRET', privateDownloadSecret],
  ];
  securitySecrets.forEach(([key, secret]) => {
    if (!secret) return;
    if (/change-this|development|dev-secret|example|local-placeholder|placeholder|sample|test-secret|copied|default|dummy/i.test(secret)) {
      const message = `- ${key} must not use placeholder, sample, copied, default, dummy, or development text`;
      if (isProduction) errors.push(message);
      else warnings.push(message);
    }
    const strengthIssue = secretStrengthIssue(secret);
    if (strengthIssue) {
      const message = `- ${key} is predictable or low entropy (${strengthIssue})`;
      if (isProduction) errors.push(message);
      else warnings.push(message);
    }
  });

  if (jwtAccessSecret && jwtRefreshSecret && jwtAccessSecret === jwtRefreshSecret) {
    errors.push('- JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (jwtAccessSecret && qrSecret && jwtAccessSecret === qrSecret) {
    errors.push('- JWT_ACCESS_SECRET and QR_HMAC_SECRET must be different');
  }
  if (jwtRefreshSecret && qrSecret && jwtRefreshSecret === qrSecret) {
    errors.push('- JWT_REFRESH_SECRET and QR_HMAC_SECRET must be different');
  }
  if (jwtAccessSecret && otpPepper && jwtAccessSecret === otpPepper) {
    errors.push('- JWT_ACCESS_SECRET and OTP_PEPPER must be different');
  }
  if (jwtRefreshSecret && otpPepper && jwtRefreshSecret === otpPepper) {
    errors.push('- JWT_REFRESH_SECRET and OTP_PEPPER must be different');
  }
  if (qrSecret && otpPepper && qrSecret === otpPepper) {
    errors.push('- QR_HMAC_SECRET and OTP_PEPPER must be different');
  }
  if (kioskEncryptionSecret && [jwtAccessSecret, jwtRefreshSecret, qrSecret, otpPepper].includes(kioskEncryptionSecret)) {
    errors.push('- KIOSK_TOKEN_ENCRYPTION_SECRET must be dedicated and different from JWT/QR/OTP secrets');
  }
  if (privateDownloadSecret && [jwtAccessSecret, jwtRefreshSecret, qrSecret, kioskEncryptionSecret, otpPepper].includes(privateDownloadSecret)) {
    errors.push('- PRIVATE_DOWNLOAD_SIGNING_SECRET must be dedicated and different from JWT/QR/kiosk/OTP secrets');
  }
  if (
    providerOutboxSecret
    && [
      jwtAccessSecret,
      jwtRefreshSecret,
      qrSecret,
      kioskEncryptionSecret,
      otpPepper,
      privateDownloadSecret,
    ].includes(providerOutboxSecret)
  ) {
    errors.push(
      '- PROVIDER_OUTBOX_ENCRYPTION_SECRET must be dedicated and different from JWT/QR/kiosk/OTP/private-download secrets'
    );
  }

  validateUrl(errors, 'DATABASE_URL', ['postgres:', 'postgresql:']);
  validateUrl(errors, 'DIRECT_URL', ['postgres:', 'postgresql:']);
  validateUrl(errors, 'REDIS_URL', ['redis:', 'rediss:']);
  validateUrl(errors, 'SMS_API_URL', ['http:', 'https:']);
  validateUrl(errors, 'PG365_API_URL', ['http:', 'https:']);
  validateUrl(errors, 'EMAIL_API_URL', ['http:', 'https:']);
  validateUrl(errors, 'S3_ENDPOINT', ['http:', 'https:']);
  validateUrl(errors, 'STORAGE_PUBLIC_BASE_URL', ['http:', 'https:'], true);
  validateUrl(errors, 'MALWARE_SCANNER_URL', ['http:', 'https:']);
  validateTrustedProxyCidrs(errors);
  validateCorsOrigins(errors, isProduction);

  const authCookieSameSite = (process.env.AUTH_COOKIE_SAME_SITE ?? 'lax').trim().toLowerCase();
  if (!['strict', 'lax', 'none'].includes(authCookieSameSite)) {
    errors.push('- AUTH_COOKIE_SAME_SITE must be one of: strict, lax, none');
  }

  if (process.env.OTP_TEST_MODE && !['true', 'false'].includes(process.env.OTP_TEST_MODE)) {
    errors.push('- OTP_TEST_MODE must be true or false');
  }
  if (process.env.OTP_TEST_MODE === 'true') {
    if (process.env.NODE_ENV !== 'test') {
      errors.push('- OTP_TEST_MODE=true is allowed only when NODE_ENV=test');
    }
    if (!/^\d{6}$/.test(process.env.OTP_TEST_CODE?.trim() ?? '')) {
      errors.push('- OTP_TEST_CODE must contain exactly 6 digits when OTP_TEST_MODE=true');
    }
  }

  const signedUrlTtl = Number(process.env.STORAGE_SIGNED_URL_TTL_SECONDS ?? 300);
  if (!Number.isInteger(signedUrlTtl) || signedUrlTtl < 1 || signedUrlTtl > 900) {
    errors.push('- STORAGE_SIGNED_URL_TTL_SECONDS must be an integer between 1 and 900');
  }

  const smsProvider = process.env.SMS_PROVIDER ?? (isProduction ? 'pg365' : 'console');
  if (!['console', 'generic_http', 'pg365'].includes(smsProvider)) {
    errors.push('- SMS_PROVIDER must be one of: console, generic_http, pg365');
  }

  if (smsProvider === 'generic_http') {
    requireWhen(errors, 'SMS_API_URL', 'SMS_PROVIDER=generic_http');
    requireWhen(errors, 'SMS_API_KEY', 'SMS_PROVIDER=generic_http');
    requireWhen(errors, 'SMS_FROM', 'SMS_PROVIDER=generic_http');
  }

  if (smsProvider === 'pg365') {
    requireWhen(errors, 'PG365_API_URL', 'SMS_PROVIDER=pg365');
    requireWhen(errors, 'PG365_PUBLIC_KEY', 'SMS_PROVIDER=pg365');
    requireWhen(errors, 'PG365_PRIVATE_KEY', 'SMS_PROVIDER=pg365');
    requireWhen(errors, 'PG365_ORIGINATOR', 'SMS_PROVIDER=pg365');
    requireWhen(errors, 'PG365_TIMEOUT_MS', 'SMS_PROVIDER=pg365');
    validateRuntimeCredential(errors, 'PG365_PUBLIC_KEY');
    validateRuntimeCredential(errors, 'PG365_PRIVATE_KEY');
  }

  const emailProvider = process.env.EMAIL_PROVIDER ?? 'console';
  if (emailProvider !== 'console' && emailProvider !== 'generic_http') {
    errors.push('- EMAIL_PROVIDER must be one of: console, generic_http');
  }

  if (emailProvider === 'generic_http') {
    requireWhen(errors, 'EMAIL_API_URL', 'EMAIL_PROVIDER=generic_http');
    requireWhen(errors, 'EMAIL_API_KEY', 'EMAIL_PROVIDER=generic_http');
    requireWhen(errors, 'EMAIL_FROM', 'EMAIL_PROVIDER=generic_http');
  }
  validateIntegerRange(errors, 'PROVIDER_HTTP_TIMEOUT_MS', 100, 120_000);
  validateIntegerRange(errors, 'PG365_TIMEOUT_MS', 1, 120_000);
  validateIntegerRange(errors, 'PROVIDER_HTTP_MAX_ATTEMPTS', 1, 5);
  validateIntegerRange(errors, 'PROVIDER_HTTP_RETRY_BASE_MS', 1, 60_000);
  validateIntegerRange(errors, 'PROVIDER_CIRCUIT_FAILURE_THRESHOLD', 1, 50);
  validateIntegerRange(errors, 'PROVIDER_CIRCUIT_RESET_MS', 1_000, 3_600_000);
  validateIntegerRange(errors, 'OUTBOX_HEARTBEAT_TTL_SECONDS', 10, 300);
  validateIntegerRange(errors, 'OUTBOX_MAX_CONSECUTIVE_FAILURES', 1, 100);
  validateIntegerRange(errors, 'OUTBOX_PROCESSED_RETENTION_DAYS', 1, 3_650);
  validateIntegerRange(errors, 'OUTBOX_DEAD_RETENTION_DAYS', 1, 3_650);
  validateIntegerRange(errors, 'OTP_RETENTION_DAYS', 1, 3_650);
  validateIntegerRange(errors, 'REFRESH_TOKEN_RETENTION_DAYS', 1, 3_650);
  validateIntegerRange(errors, 'AUDIT_LOG_RETENTION_DAYS', 1, 3_650);
  if (
    process.env.OUTBOX_WORKER_ENABLED
    && !['true', 'false'].includes(process.env.OUTBOX_WORKER_ENABLED)
  ) {
    errors.push('- OUTBOX_WORKER_ENABLED must be true or false');
  }

  const storageProvider = process.env.STORAGE_PROVIDER ?? 'local';
  if (!['local', 's3', 'r2'].includes(storageProvider)) {
    errors.push('- STORAGE_PROVIDER must be one of: local, s3, r2');
  }
  if (storageProvider === 's3' || storageProvider === 'r2') {
    requireWhen(errors, 'S3_BUCKET', `STORAGE_PROVIDER=${storageProvider}`);
    requireWhen(errors, 'S3_ACCESS_KEY_ID', `STORAGE_PROVIDER=${storageProvider}`);
    requireWhen(errors, 'S3_SECRET_ACCESS_KEY', `STORAGE_PROVIDER=${storageProvider}`);
    requireWhen(errors, 'STORAGE_PUBLIC_BASE_URL', `STORAGE_PROVIDER=${storageProvider}`);
    validateRuntimeCredential(errors, 'S3_ACCESS_KEY_ID');
    validateRuntimeCredential(errors, 'S3_SECRET_ACCESS_KEY');
  }
  if (storageProvider === 's3') requireWhen(errors, 'S3_REGION', 'STORAGE_PROVIDER=s3');
  if (storageProvider === 'r2') requireWhen(errors, 'S3_ENDPOINT', 'STORAGE_PROVIDER=r2');

  const malwareProvider = process.env.MALWARE_SCANNER_PROVIDER ?? 'disabled';
  if (!['disabled', 'http'].includes(malwareProvider)) {
    errors.push('- MALWARE_SCANNER_PROVIDER must be one of: disabled, http');
  }
  if (process.env.MALWARE_SCAN_REQUIRED && !['true', 'false'].includes(process.env.MALWARE_SCAN_REQUIRED)) {
    errors.push('- MALWARE_SCAN_REQUIRED must be true or false');
  }
  if (malwareProvider === 'http') {
    requireWhen(errors, 'MALWARE_SCANNER_URL', 'MALWARE_SCANNER_PROVIDER=http');
  }
  validateIntegerRange(errors, 'MALWARE_SCANNER_TIMEOUT_MS', 1_000, 60_000);
  validateIntegerRange(errors, 'MALWARE_SCANNER_MAX_ATTEMPTS', 1, 3);

  const pushEnabled = process.env.PUSH_NOTIFICATIONS_ENABLED === 'true';
  if (process.env.PUSH_NOTIFICATIONS_ENABLED && !['true', 'false'].includes(process.env.PUSH_NOTIFICATIONS_ENABLED)) {
    errors.push('- PUSH_NOTIFICATIONS_ENABLED must be true or false');
  }
  if (pushEnabled) {
    requireWhen(isProduction ? errors : warnings, 'FIREBASE_PROJECT_ID', 'PUSH_NOTIFICATIONS_ENABLED=true');
    requireWhen(isProduction ? errors : warnings, 'FIREBASE_CLIENT_EMAIL', 'PUSH_NOTIFICATIONS_ENABLED=true');
    requireWhen(isProduction ? errors : warnings, 'FIREBASE_PRIVATE_KEY', 'PUSH_NOTIFICATIONS_ENABLED=true');
  }

  if (!isProduction) return;

  errors.push(...productionMalwareScannerIssues());

  if (process.env.JWT_SECRET) {
    errors.push('- JWT_SECRET is legacy and forbidden; configure distinct JWT_ACCESS_SECRET and JWT_REFRESH_SECRET');
  }
  if (process.env.SWAGGER_DOCS_ENABLED !== 'false') {
    errors.push('- SWAGGER_DOCS_ENABLED must be false in production');
  }
  if (process.env.SMS_API_URL?.startsWith('http:')) {
    errors.push('- SMS_API_URL must use https in production');
  }
  if (process.env.PG365_API_URL?.startsWith('http:')) {
    errors.push('- PG365_API_URL must use https in production');
  }
  if (process.env.EMAIL_API_URL?.startsWith('http:')) {
    errors.push('- EMAIL_API_URL must use https in production');
  }
  if (process.env.S3_ENDPOINT?.startsWith('http:')) {
    errors.push('- S3_ENDPOINT must use https in production');
  }
  if (process.env.OTP_TEST_MODE !== 'false') {
    errors.push('- OTP_TEST_MODE must be false in production');
  }
  if (process.env.OTP_LOG_CODES !== 'false') {
    errors.push('- OTP_LOG_CODES must be false in production');
  }
  if (smsProvider !== 'pg365') {
    errors.push('- SMS_PROVIDER=pg365 is required in production');
  }
  if (emailProvider === 'console') {
    errors.push('- EMAIL_PROVIDER=console is not allowed in production');
  }
  if (storageProvider === 'local') {
    errors.push('- STORAGE_PROVIDER=local is not allowed in production; use s3 or r2 for document uploads');
  }
}

export function productionMalwareScannerIssues(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const errors: string[] = [];
  if (environment.MALWARE_SCANNER_PROVIDER !== 'http') {
    errors.push('- MALWARE_SCANNER_PROVIDER=http is required in production for sensitive document uploads');
  }
  if (environment.MALWARE_SCAN_REQUIRED !== 'true') {
    errors.push('- MALWARE_SCAN_REQUIRED must be true in production');
  }

  const scannerUrl = environment.MALWARE_SCANNER_URL?.trim();
  if (!scannerUrl) {
    errors.push('- MALWARE_SCANNER_URL is required in production');
  } else {
    try {
      const parsed = new URL(scannerUrl);
      if (
        parsed.protocol !== 'http:'
        || parsed.hostname !== 'malware-scanner'
        || parsed.port !== '8080'
        || parsed.pathname !== '/scan'
        || parsed.username
        || parsed.password
        || parsed.search
        || parsed.hash
      ) {
        errors.push('- MALWARE_SCANNER_URL must be the internal http://malware-scanner:8080/scan endpoint in production');
      }
    } catch {
      errors.push('- MALWARE_SCANNER_URL must be a valid internal scanner URL in production');
    }
  }

  const apiKey = environment.MALWARE_SCANNER_API_KEY?.trim();
  if (!apiKey) {
    errors.push('- MALWARE_SCANNER_API_KEY is required in production');
  } else {
    if (apiKey.length < 32) {
      errors.push('- MALWARE_SCANNER_API_KEY must be at least 32 characters in production');
    }
    const issue = credentialReferenceIssue(apiKey);
    if (issue) errors.push(`- MALWARE_SCANNER_API_KEY ${issue}`);
  }
  return errors;
}

function validateCorsOrigins(errors: string[], isProduction: boolean): void {
  const rawOrigins = process.env.CORS_ORIGINS;
  const origins = parseCorsOrigins(rawOrigins);
  const listIssue = corsOriginListIssue(rawOrigins, isProduction);
  if (listIssue) {
    errors.push(`- CORS_ORIGINS ${listIssue}`);
    return;
  }
  const seen = new Set<string>();

  for (const origin of origins) {
    const issue = corsOriginIssue(origin, isProduction);
    if (issue) {
      errors.push(`- CORS_ORIGINS entry "${origin}" ${issue}`);
      continue;
    }
    if (seen.has(origin)) {
      errors.push(`- CORS_ORIGINS contains a duplicate origin: ${origin}`);
      continue;
    }
    seen.add(origin);
  }
}

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsOriginListIssue(
  value: string | undefined,
  isProduction: boolean,
): string | null {
  if (isProduction && parseCorsOrigins(value).length === 0) {
    return 'must contain at least one explicit origin in production';
  }
  return null;
}

export function corsOriginIssue(origin: string, isProduction: boolean): string | null {
  if (!origin || origin === 'null' || origin.includes('*')) {
    return 'must be an explicit HTTP(S) origin and must not be null or contain wildcards';
  }

  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'must use the http or https protocol';
    }
    if (parsed.username || parsed.password) {
      return 'must not contain embedded credentials';
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || origin !== parsed.origin) {
      return 'must contain only scheme, host, and optional port in canonical origin form';
    }
    if (isProduction && parsed.protocol !== 'https:') {
      return 'must use https in production';
    }
    return null;
  } catch {
    return 'must be a valid URL origin';
  }
}

function validateTrustedProxyCidrs(errors: string[]): void {
  const values = (process.env.TRUST_PROXY_CIDRS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const value of values) {
    if (
      !/^(?:\d{1,3}\.){3}\d{1,3}(?:\/(?:[0-9]|[12][0-9]|3[0-2]))?$/.test(value)
      && !/^[0-9a-f:]+(?:\/(?:\d|[1-9]\d|1[01]\d|12[0-8]))?$/i.test(value)
      && !['loopback', 'linklocal', 'uniquelocal'].includes(value)
    ) {
      errors.push(`- TRUST_PROXY_CIDRS contains an invalid IP/CIDR entry: ${value}`);
    }
  }
}

function requireWhen(errors: string[], key: string, condition: string): void {
  if (!process.env[key]) errors.push(`- ${key} is required when ${condition}`);
}

function validateRuntimeCredential(errors: string[], key: string): void {
  const value = process.env[key];
  if (!value) return;
  const issue = credentialReferenceIssue(value);
  if (issue) errors.push(`- ${key} ${issue}`);
}

function validateUrl(
  errors: string[],
  key: string,
  allowedProtocols: string[],
  allowRelative = false,
): void {
  const value = process.env[key]?.trim();
  if (!value || (allowRelative && value.startsWith('/'))) return;

  try {
    const parsed = new URL(value);
    if (!allowedProtocols.includes(parsed.protocol)) {
      errors.push(`- ${key} must use one of these protocols: ${allowedProtocols.join(', ')}`);
    }
  } catch {
    errors.push(`- ${key} must be a valid URL`);
  }
}

function validateIntegerRange(errors: string[], key: string, minimum: number, maximum: number): void {
  const value = process.env[key];
  if (!value) return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    errors.push(`- ${key} must be an integer between ${minimum} and ${maximum}`);
  }
}

export function secretStrengthIssue(secret: string): string | null {
  const value = secret.trim();
  const uniqueCharacters = new Set(value).size;
  if (uniqueCharacters < 10) return 'fewer than 10 unique characters';
  if (/(.)\1{5,}/u.test(value)) return 'contains a long repeated character run';

  const lower = value.toLowerCase();
  if (/(?:qwerty|asdfgh|zxcvbn|password|letmein)/.test(lower)) {
    return 'contains a common keyboard or password pattern';
  }

  for (let unitLength = 1; unitLength <= Math.min(12, value.length / 2); unitLength += 1) {
    if (value.length % unitLength !== 0) continue;
    const unit = value.slice(0, unitLength);
    if (unit.repeat(value.length / unitLength) === value) {
      return 'is composed of a repeated short pattern';
    }
  }

  const sequences = [
    '0123456789',
    'abcdefghijklmnopqrstuvwxyz',
    '9876543210',
    'zyxwvutsrqponmlkjihgfedcba',
  ];
  if (sequences.some((sequence) =>
    Array.from({ length: sequence.length - 5 }, (_, index) =>
      sequence.slice(index, index + 6)
    ).some((part) => lower.includes(part))
  )) {
    return 'contains a sequential six-character pattern';
  }

  const frequencies = new Map<string, number>();
  for (const character of value) {
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  }
  const entropyPerCharacter = Array.from(frequencies.values()).reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
  if (entropyPerCharacter < 3) return 'estimated entropy per character is below 3 bits';

  return null;
}

export function credentialReferenceIssue(value: string): string | null {
  const normalized = value.trim();
  if (
    /^<[^>]+>$/.test(normalized)
    || /^\$\{[^}]+\}$/.test(normalized)
    || normalized.startsWith('process.env')
    || /change-this|replace-with|placeholder|secret-reference|sample-credential|dummy-credential|test-secret/i.test(
      normalized,
    )
  ) {
    return 'must be an injected runtime credential, not a placeholder or reference';
  }
  return null;
}
