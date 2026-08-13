import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const forbiddenFilePatterns = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)key\.properties$/i,
  /(^|\/)(google-services\.json|GoogleService-Info\.plist)$/i,
  /(^|\/).*(service.?account|firebase-adminsdk|private.?key|credentials).*\.json$/i,
  /\.(jks|keystore|p8|p12|pfx|pem|key|cer|crt|mobileprovision|provisionprofile)$/i,
  /\.(hprof|heap|dmp|dump|log)(?:\.\d+)?$/i,
];

const contentRules = [
  { name: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: 'github-token', pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{36,}\b/ },
  { name: 'r2-account-endpoint', pattern: /https:\/\/[a-f0-9]{24,}\.r2\.cloudflarestorage\.com/i },
  {
    name: 'android-signing-secret',
    pattern: /\b(?:storePassword|keyPassword)\s*(?:=|\s)\s*["'][^"'$<]{4,}["']/,
  },
];

const secretAssignment =
  /^\s*(?:-\s*)?(?:export\s+)?([A-Z][A-Z0-9_]*(?:SECRET|PASSWORD|API_KEY|PRIVATE_KEY|PUBLIC_KEY|SECRET_ACCESS_KEY|ACCESS_KEY_ID|TOKEN|PEPPER|KEYSTORE_BASE64|CERTIFICATE_BASE64)|DATABASE_URL|DIRECT_URL|REDIS_URL|SENTRY_DSN|OTP_TEST_CODE)\s*[:=]\s*(.+?)\s*$/;

const historyGrepPattern = [
  'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY',
  '(AKIA|ASIA)[A-Z0-9]{16}',
  'gh(p|o|u|s|r)_[A-Za-z0-9]{36,}',
  'https://[a-f0-9]{24,}\\.r2\\.cloudflarestorage\\.com',
  "(storePassword|keyPassword)[[:space:]]*(=|[[:space:]])[[:space:]]*[\"'][^\"'$<]{4,}[\"']",
  '^[[:space:]]*(-[[:space:]]*)?(export[[:space:]]+)?[A-Z][A-Z0-9_]*(SECRET|PASSWORD|API_KEY|PRIVATE_KEY|PUBLIC_KEY|SECRET_ACCESS_KEY|ACCESS_KEY_ID|TOKEN|PEPPER|KEYSTORE_BASE64|CERTIFICATE_BASE64)[[:space:]]*[:=]',
  '^[[:space:]]*(-[[:space:]]*)?(export[[:space:]]+)?(DATABASE_URL|DIRECT_URL|REDIS_URL|SENTRY_DSN|OTP_TEST_CODE)[[:space:]]*[:=]',
].join('|');

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  scanRepository();
}

function scanRepository() {
  const currentOnly = process.argv.includes('--current-only');
  const trackedFiles = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith('node_modules/') && !file.startsWith('dist/'));
  const findings = [];

  for (const file of trackedFiles) {
    const normalized = file.replaceAll('\\', '/');
    if (!isSafeEnvTemplate(normalized) && forbiddenFilePatterns.some((pattern) => pattern.test(normalized))) {
      findings.push({ file: normalized, line: 1, rule: 'forbidden-secret-file' });
      continue;
    }

    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (content.includes('\0')) continue;

    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of contentRules) {
        if (rule.pattern.test(line)) {
          findings.push({ file: normalized, line: index + 1, rule: rule.name });
        }
      }

      if (literalSecretAssignment(line, normalized)) {
        findings.push({ file: normalized, line: index + 1, rule: 'literal-secret-assignment' });
      }
    });
  }

  const historyCommitCount = currentOnly ? 0 : scanGitHistory(findings);

  if (findings.length > 0) {
    console.error('Potential secret material detected:');
    for (const finding of findings) {
      const prefix = finding.commit ? `${finding.commit}:` : '';
      console.error(`- ${prefix}${finding.file}:${finding.line} (${finding.rule})`);
    }
    process.exit(1);
  }

  console.log(currentOnly
    ? `Secret scan passed (${trackedFiles.length} current files checked; history intentionally skipped).`
    : `Secret scan passed (${trackedFiles.length} current files and ${historyCommitCount} reachable commits checked).`);
}

function literalSecretAssignment(line, sourcePath = '') {
  const assignment = line.match(secretAssignment);
  if (!assignment) return false;
  const key = assignment[1];
  const value = assignment[2].trim().replace(/^['"]|['"]$/g, '');
  if (!isSensitiveAssignmentKey(key)) return false;
  return !(
    value === '' ||
    value.startsWith('<') ||
    value.startsWith('$') ||
    value.startsWith('process.env') ||
    (sourcePath.startsWith('.github/workflows/') && value.startsWith('ci-')) ||
    value === '***' ||
    (key === 'OTP_TEST_CODE' && /^\d{6}$/.test(value)) ||
    /^[A-Za-z_$][\w.$]*,$/.test(value) ||
    isLocalCredentialUrl(key, value)
  );
}

function isSensitiveAssignmentKey(key) {
  if (['DATABASE_URL', 'DIRECT_URL', 'REDIS_URL', 'SENTRY_DSN'].includes(key)) return true;
  return /^(?:ANDROID|APP_STORE|APPLE|AWS|CLOUDFLARE|DATABASE|DIRECT|EMAIL|FASTLANE|FIREBASE|JWT|KIOSK|MALWARE|MATCH|OTP|PG365|PRIVATE|PROVIDER|QR|R2|REDIS|S3|SEED|SMOKE|SMS)_/.test(
    key,
  );
}

function runSelfTest() {
  if (!isSafeEnvTemplate('.env.example') || !isSafeEnvTemplate('.env.production.example')) {
    throw new Error('secret scanner self-test failed to recognize safe env template names');
  }
  if (isSafeEnvTemplate('.env.production')) {
    throw new Error('secret scanner self-test allowed a real production env file');
  }
  const detected = [
    'KIOSK_TOKEN_ENCRYPTION_SECRET="literal-value"',
    'PROVIDER_OUTBOX_ENCRYPTION_SECRET=literal-value',
    'MALWARE_SCANNER_API_KEY: literal-value',
    'S3_SECRET_ACCESS_KEY=literal-value',
    'R2_ACCESS_KEY_ID=literal-value',
    'AWS_SECRET_ACCESS_KEY=literal-value',
    'PG365_PRIVATE_KEY=literal-value',
    'PG365_PUBLIC_KEY=literal-value',
    'CLOUDFLARE_API_TOKEN=literal-value',
    'ANDROID_KEYSTORE_PASSWORD=literal-value',
    'APPLE_CERTIFICATE_PASSWORD=literal-value',
    'APP_STORE_CONNECT_PRIVATE_KEY=literal-value',
    'SMS_API_KEY=literal-value',
    'FIREBASE_PRIVATE_KEY=literal-value',
    'DATABASE_URL=postgresql://user:password@db.example.com/service',
  ];
  const allowed = [
    ['JWT_ACCESS_SECRET="<secret-reference>"', 'README.md'],
    ['PROVIDER_OUTBOX_ENCRYPTION_SECRET="${PROVIDER_OUTBOX_ENCRYPTION_SECRET}"', 'README.md'],
    ['DATABASE_URL=postgresql://postgres:local-only@localhost:5432/service', '.env.example'],
    ['JWT_REFRESH_SECRET=ci-strong-test-value', '.github/workflows/ci.yml'],
    ['const jwtSecret = process.env.JWT_ACCESS_SECRET;', 'src/config.ts'],
    ["INVALID_REFRESH_TOKEN: 'translated error message',", 'src/errors.ts'],
    ['SEED_ADMIN_PASSWORD: explicit,', 'scripts/seed.ts'],
    ['OTP_TEST_CODE=123456', '.env.example'],
  ];
  if (detected.some((line) => !literalSecretAssignment(line))) {
    throw new Error('secret scanner self-test failed to detect a sensitive assignment');
  }
  if (allowed.some(([line, sourcePath]) => literalSecretAssignment(line, sourcePath))) {
    throw new Error('secret scanner self-test rejected an allowed reference or local value');
  }
  if (!literalSecretAssignment('JWT_REFRESH_SECRET=ci-strong-test-value', 'README.md')) {
    throw new Error('secret scanner self-test allowed a CI literal outside a workflow');
  }
  const androidSigningFixture = ['store', 'Password "literal-release-password"'].join('');
  if (!contentRules.some((rule) => rule.pattern.test(androidSigningFixture))) {
    throw new Error('secret scanner self-test failed to detect an Android signing password');
  }

  const forbiddenFiles = [
    '.env.production',
    'android/key.properties',
    'ios/AuthKey_1234567890.p8',
    'ios/release.mobileprovision',
    'firebase/service-account.json',
    'crash/heap.hprof',
    'logs/server.log.1',
  ];
  if (forbiddenFiles.some((file) => !forbiddenFilePatterns.some((pattern) => pattern.test(file)))) {
    throw new Error('secret scanner self-test failed to block a forbidden credential or dump file');
  }
  console.log('check-secrets self-test: OK');
}

function scanGitHistory(findings) {
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
    encoding: 'utf8',
  }).trim();
  if (shallow === 'true') {
    findings.push({
      file: '[git-history]',
      line: 0,
      rule: 'history-scan-requires-full-clone',
    });
    return 0;
  }

  const commits = execFileSync('git', ['rev-list', '--all'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((commit) => commit.trim())
    .filter(Boolean);

  for (const commit of commits) {
    const shortCommit = commit.slice(0, 12);
    const treeFiles = execFileSync(
      'git',
      ['ls-tree', '-r', '--name-only', '-z', commit],
      { encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean);

    for (const file of treeFiles) {
      const normalized = file.replaceAll('\\', '/');
      if (!isSafeEnvTemplate(normalized) && forbiddenFilePatterns.some((pattern) => pattern.test(normalized))) {
        findings.push({
          commit: shortCommit,
          file: normalized,
          line: 1,
          rule: 'forbidden-secret-file',
        });
      }
    }

    const grep = spawnSync(
      'git',
      ['grep', '-I', '-n', '-E', historyGrepPattern, commit, '--'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    if (grep.error) throw grep.error;
    if (grep.status !== 0 && grep.status !== 1) {
      throw new Error(`git grep failed while scanning commit ${shortCommit}`);
    }

    for (const resultLine of (grep.stdout ?? '').split(/\r?\n/).filter(Boolean)) {
      const prefix = `${commit}:`;
      if (!resultLine.startsWith(prefix)) continue;
      const match = resultLine.slice(prefix.length).match(/^([^:]+):(\d+):(.*)$/);
      if (!match) continue;
      const [, file, lineNumber, line] = match;
      const normalized = file.replaceAll('\\', '/');

      for (const rule of contentRules) {
        if (rule.pattern.test(line)) {
          findings.push({
            commit: shortCommit,
            file: normalized,
            line: Number(lineNumber),
            rule: rule.name,
          });
        }
      }
      if (literalSecretAssignment(line, normalized)) {
        findings.push({
          commit: shortCommit,
          file: normalized,
          line: Number(lineNumber),
          rule: 'literal-secret-assignment',
        });
      }
    }
  }

  return commits.length;
}

function isLocalCredentialUrl(key, value) {
  if (!['DATABASE_URL', 'DIRECT_URL', 'REDIS_URL'].includes(key)) return false;
  try {
    const parsed = new URL(value);
    if (!parsed.username && !parsed.password) return true;
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isSafeEnvTemplate(normalizedPath) {
  return /(^|\/)\.env(?:\.[a-z0-9_-]+)?\.example$/i.test(normalizedPath);
}
