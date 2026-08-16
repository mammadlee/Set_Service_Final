import { checkEnv } from '../src/lib/check-env';

const credential = (purpose: string): string => [
  `regression-${purpose}`,
  'Ax7mQ2vL9pR4tW8yK3nD6sF1hJ5cB0uZ',
].join('-');

function setEnvironment(key: string, value: string): void {
  process.env[key] = value;
}

setEnvironment('NODE_ENV', 'production');
setEnvironment('DATABASE_URL', ['postgresql://postgres:', 'regression-password', '@localhost:5432/setservice'].join(''));
setEnvironment('DIRECT_URL', ['postgresql://postgres:', 'regression-password', '@localhost:5432/setservice'].join(''));
setEnvironment('REDIS_URL', 'redis://localhost:6379');
setEnvironment('JWT_ACCESS_SECRET', credential('jwt-access'));
setEnvironment('JWT_REFRESH_SECRET', credential('jwt-refresh'));
setEnvironment('JWT_ISSUER', 'set-service-regression');
setEnvironment('JWT_AUDIENCE', 'set-service-regression-clients');
setEnvironment('QR_HMAC_SECRET', credential('qr-hmac'));
setEnvironment('KIOSK_TOKEN_ENCRYPTION_SECRET', credential('kiosk-encryption'));
setEnvironment('OTP_PEPPER', credential('otp-pepper'));
setEnvironment('PROVIDER_OUTBOX_ENCRYPTION_SECRET', credential('outbox-encryption'));
setEnvironment('OUTBOX_WORKER_ENABLED', 'false');
setEnvironment('OUTBOX_HEARTBEAT_TTL_SECONDS', '30');
setEnvironment('OUTBOX_MAX_CONSECUTIVE_FAILURES', '5');
setEnvironment('SWAGGER_DOCS_ENABLED', 'false');
setEnvironment('CORS_ORIGINS', 'https://admin.example.com,https://company.example.com');
setEnvironment('SMS_PROVIDER', 'pg365');
setEnvironment('PG365_API_URL', 'https://pg365.example.test');
setEnvironment('PG365_PUBLIC_KEY', credential('pg365-public'));
setEnvironment('PG365_PRIVATE_KEY', credential('pg365-private'));
setEnvironment('PG365_ORIGINATOR', 'SET');
setEnvironment('PG365_TIMEOUT_MS', '8000');
setEnvironment('EMAIL_PROVIDER', 'generic_http');
setEnvironment('EMAIL_API_URL', 'https://email.example.test/send');
setEnvironment('EMAIL_API_KEY', credential('email-api'));
setEnvironment('EMAIL_FROM', 'no-reply@example.test');
setEnvironment('OTP_TEST_MODE', 'false');
setEnvironment('OTP_LOG_CODES', 'false');
setEnvironment('STORAGE_PROVIDER', 's3');
setEnvironment('S3_BUCKET', 'setservice-regression-documents');
setEnvironment('S3_REGION', 'eu-central-1');
setEnvironment('S3_ACCESS_KEY_ID', credential('s3-access'));
setEnvironment('S3_SECRET_ACCESS_KEY', credential('s3-secret'));
setEnvironment('STORAGE_PUBLIC_BASE_URL', 'https://cdn.example.com');
setEnvironment('STORAGE_SIGNED_URL_TTL_SECONDS', '300');
setEnvironment('MALWARE_SCANNER_PROVIDER', 'http');
setEnvironment('MALWARE_SCAN_REQUIRED', 'true');
setEnvironment('MALWARE_SCANNER_URL', 'http://malware-scanner:8080/scan');
setEnvironment('MALWARE_SCANNER_API_KEY', credential('malware-scanner'));

checkEnv();
console.log('production-env-validation-regression: OK');
