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
  { key: 'JWT_SECRET', required: true, minLength: 32, hint: '32+ chars, random, not reused' },
  { key: 'QR_HMAC_SECRET', required: true, minLength: 32, hint: '32+ chars, random, different from JWT_SECRET' },
  { key: 'OTP_PEPPER', required: 'production', minLength: 32, hint: '32+ chars, random, different from JWT/QR secrets' },
  { key: 'JWT_ACCESS_EXPIRES_IN', required: false, hint: 'default: 15m' },
  { key: 'JWT_REFRESH_EXPIRES_IN', required: false, hint: 'default: 30d' },
  { key: 'QR_TOKEN_TTL_SECONDS', required: false, positiveInt: true, hint: 'default: 300' },
  { key: 'OTP_TEST_MODE', required: false, hint: 'development only: true | false' },
  { key: 'OTP_TEST_CODE', required: false, hint: 'development only' },
  { key: 'OTP_LOG_CODES', required: false, hint: 'development only: true | false' },
  { key: 'CORS_ORIGINS', required: 'production', hint: 'comma-separated allowed origins' },
  { key: 'PORT', required: false, hint: 'default: 3000' },
  { key: 'NODE_ENV', required: false, hint: 'development | production' },
  { key: 'SENTRY_DSN', required: false, hint: 'optional error monitoring' },
  { key: 'SMS_PROVIDER', required: false, hint: 'console | generic_http' },
  { key: 'SMS_API_URL', required: false, hint: 'required for generic_http' },
  { key: 'SMS_API_KEY', required: false, hint: 'required for generic_http' },
  { key: 'SMS_FROM', required: false, hint: 'required for generic_http' },
  { key: 'EMAIL_PROVIDER', required: false, hint: 'console | generic_http' },
  { key: 'EMAIL_API_URL', required: false, hint: 'required for generic_http' },
  { key: 'EMAIL_API_KEY', required: false, hint: 'required for generic_http' },
  { key: 'EMAIL_FROM', required: false, hint: 'required for generic_http' },
  { key: 'STORAGE_PROVIDER', required: false, hint: 'local | s3 | r2' },
  { key: 'LOCAL_UPLOAD_DIR', required: false, hint: 'default: uploads' },
  { key: 'STORAGE_PUBLIC_BASE_URL', required: false, hint: 'public URL base for uploaded documents' },
  { key: 'S3_BUCKET', required: false, hint: 'required for s3/r2' },
  { key: 'S3_REGION', required: false, hint: 'required for s3' },
  { key: 'S3_ENDPOINT', required: false, hint: 'required for r2 or custom s3' },
  { key: 'S3_ACCESS_KEY_ID', required: false, hint: 'required for s3/r2' },
  { key: 'S3_SECRET_ACCESS_KEY', required: false, hint: 'required for s3/r2' },
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
      warnings.push(`- ${variable.key} must be a positive integer; safe default will be used`);
    }

    if (!required && !value && !isProduction) {
      warnings.push(`- ${variable.key} is not set${variable.hint ? ` (${variable.hint})` : ''}`);
    }
  }

  validateProductionSafety(errors, warnings, isProduction);

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
  const jwtSecret = process.env.JWT_SECRET;
  const qrSecret = process.env.QR_HMAC_SECRET;
  const otpPepper = process.env.OTP_PEPPER;

  [jwtSecret, qrSecret, otpPepper].forEach((secret, index) => {
    if (!secret) return;
    const key = ['JWT_SECRET', 'QR_HMAC_SECRET', 'OTP_PEPPER'][index];
    if (/change-this|development|dev-secret|example|local-placeholder|placeholder|sample|test-secret|copied|default|dummy/i.test(secret)) {
      const message = `- ${key} must not use placeholder, sample, copied, default, dummy, or development text`;
      if (isProduction) errors.push(message);
      else warnings.push(message);
    }
  });

  if (jwtSecret && qrSecret && jwtSecret === qrSecret) {
    errors.push('- JWT_SECRET and QR_HMAC_SECRET must be different');
  }
  if (jwtSecret && otpPepper && jwtSecret === otpPepper) {
    errors.push('- JWT_SECRET and OTP_PEPPER must be different');
  }
  if (qrSecret && otpPepper && qrSecret === otpPepper) {
    errors.push('- QR_HMAC_SECRET and OTP_PEPPER must be different');
  }

  const smsProvider = process.env.SMS_PROVIDER ?? 'console';
  if (smsProvider !== 'console' && smsProvider !== 'generic_http') {
    errors.push('- SMS_PROVIDER must be one of: console, generic_http');
  }

  if (smsProvider === 'generic_http') {
    requireWhen(errors, 'SMS_API_URL', 'SMS_PROVIDER=generic_http');
    requireWhen(errors, 'SMS_API_KEY', 'SMS_PROVIDER=generic_http');
    requireWhen(errors, 'SMS_FROM', 'SMS_PROVIDER=generic_http');
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

  const storageProvider = process.env.STORAGE_PROVIDER ?? 'local';
  if (!['local', 's3', 'r2'].includes(storageProvider)) {
    errors.push('- STORAGE_PROVIDER must be one of: local, s3, r2');
  }
  if (storageProvider === 's3' || storageProvider === 'r2') {
    requireWhen(errors, 'S3_BUCKET', `STORAGE_PROVIDER=${storageProvider}`);
    requireWhen(errors, 'S3_ACCESS_KEY_ID', `STORAGE_PROVIDER=${storageProvider}`);
    requireWhen(errors, 'S3_SECRET_ACCESS_KEY', `STORAGE_PROVIDER=${storageProvider}`);
    requireWhen(errors, 'STORAGE_PUBLIC_BASE_URL', `STORAGE_PROVIDER=${storageProvider}`);
  }
  if (storageProvider === 's3') requireWhen(errors, 'S3_REGION', 'STORAGE_PROVIDER=s3');
  if (storageProvider === 'r2') requireWhen(errors, 'S3_ENDPOINT', 'STORAGE_PROVIDER=r2');

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

  if (process.env.OTP_TEST_MODE !== 'false') {
    errors.push('- OTP_TEST_MODE must be false in production');
  }
  if (process.env.OTP_LOG_CODES !== 'false') {
    errors.push('- OTP_LOG_CODES must be false in production');
  }
  if (smsProvider === 'console') {
    errors.push('- SMS_PROVIDER=console is not allowed in production');
  }
  if (emailProvider === 'console') {
    errors.push('- EMAIL_PROVIDER=console is not allowed in production');
  }
  if (process.env.CORS_ORIGINS?.includes('*')) {
    errors.push('- CORS_ORIGINS must not contain * in production');
  }
  if (storageProvider === 'local') {
    errors.push('- STORAGE_PROVIDER=local is not allowed in production; use s3 or r2 for document uploads');
  }
}

function requireWhen(errors: string[], key: string, condition: string): void {
  if (!process.env[key]) errors.push(`- ${key} is required when ${condition}`);
}
