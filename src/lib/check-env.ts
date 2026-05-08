/**
 * Environment variable yoxlaması
 * app.ts-dən əvvəl çağırılır, əskik dəyişən varsa aydın xəta verir.
 */

interface EnvVar {
  key: string;
  required: boolean;
  minLength?: number;
  hint?: string;
}

const ENV_VARS: EnvVar[] = [
  { key: 'DATABASE_URL', required: true, hint: 'postgresql://user:pass@localhost:5432/hireapp' },
  { key: 'JWT_SECRET', required: true, minLength: 32, hint: 'min 32 simvol random string' },
  { key: 'QR_HMAC_SECRET', required: true, minLength: 32, hint: 'min 32 simvol, JWT_SECRET-dən fərqli' },
  { key: 'PORT', required: false, hint: 'default: 3000' },
  { key: 'NODE_ENV', required: false, hint: 'development | production' },
  { key: 'SENTRY_DSN', required: false, hint: 'boş olarsa Sentry disabled' },
  { key: 'FIREBASE_PROJECT_ID', required: false, hint: 'push notification üçün' },
  { key: 'FIREBASE_CLIENT_EMAIL', required: false },
  { key: 'FIREBASE_PRIVATE_KEY', required: false },
];

export function checkEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const v of ENV_VARS) {
    const val = process.env[v.key];

    if (v.required && !val) {
      errors.push(`  ✗ ${v.key} — tələb olunur${v.hint ? ` (${v.hint})` : ''}`);
      continue;
    }

    if (val && v.minLength && val.length < v.minLength) {
      errors.push(`  ✗ ${v.key} — minimum ${v.minLength} simvol olmalıdır (mövcud: ${val.length})`);
      continue;
    }

    if (!v.required && !val) {
      warnings.push(`  ⚠ ${v.key} — təyin edilməyib${v.hint ? ` (${v.hint})` : ''}`);
    }
  }

  if (warnings.length) {
    console.warn('[Env] Xəbərdarlıqlar:');
    warnings.forEach((w) => console.warn(w));
  }

  if (errors.length) {
    console.error('\n[Env] Tələb olunan dəyişənlər əskikdir:');
    errors.forEach((e) => console.error(e));
    console.error('\n.env.example faylına baxın.\n');
    process.exit(1);
  }
}
