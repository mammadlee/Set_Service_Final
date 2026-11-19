import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function load(relativePath, dependencies = {}) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => dependencies[name] ?? require(name),
  });
  return exports;
}

test('company login sends reviewer OTP only when the challenged form supplies it', async () => {
  const requests = [];
  const { authService } = load('../src/features/auth/auth.service.ts', {
    '../../shared/api/http': {
      apiRequest: async (path, options) => {
        requests.push({ path, options });
        return {
          access_token: 'synthetic-access-token',
          refresh_token: 'synthetic-refresh-token',
          user: {
            id: 'review-company-user',
            role: 'company',
            name: 'Review Company',
            company: { id: 'review-company', status: 'approved' },
          },
        };
      },
    },
    '../../shared/api/tokenStore': {
      tokenStore: { setAccessToken() {}, clear() {} },
    },
    '../../shared/i18n/appStrings': {
      appStrings: { auth: { onlyCompany: '', notApproved: '' } },
    },
  });

  await authService.loginCompany('review@example.test', 'SyntheticPassword1!');
  assert.deepEqual(
    JSON.parse(JSON.stringify(requests[0].options.body)),
    { email: 'review@example.test', password: 'SyntheticPassword1!' },
  );

  await authService.loginCompany(
    'review@example.test',
    'SyntheticPassword1!',
    '654321',
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(requests[1].options.body)),
    {
      email: 'review@example.test',
      password: 'SyntheticPassword1!',
      otp_code: '654321',
    },
  );
});

test('company reviewer OTP field is challenge-driven and resets on credential edits', () => {
  const source = readFileSync(
    new URL('../src/features/auth/LoginPage.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /err\.code === 'REVIEWER_OTP_REQUIRED'/);
  assert.match(source, /reviewerOtpRequired \? \(/);
  assert.match(source, /setReviewerOtpRequired\(false\)/);
  assert.doesNotMatch(source, /123456/);
});
