import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type StatusModule = {
  apiErrorMessage: (error: unknown) => string;
  statusLabel: (status: string) => string;
};

type OrdersModule = {
  orderDisplayStatus: (
    order: { status: string; end_datetime: string },
    now?: Date,
  ) => string;
};

function loadTypeScriptModule<T>(relativePath: string): T {
  const filename = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} as T };
  const execute = new Function('module', 'exports', 'require', output);
  execute(module, module.exports, () => {
    throw new Error(`Unexpected runtime import while loading ${relativePath}`);
  });
  return module.exports;
}

const { apiErrorMessage, statusLabel } = loadTypeScriptModule<StatusModule>(
  'apps/admin_panel/src/shared/i18n/appStrings.ts',
);
const { orderDisplayStatus } = loadTypeScriptModule<OrdersModule>(
  'apps/admin_panel/src/shared/utils/orders.ts',
);

const now = new Date('2026-09-16T12:00:00.000Z');

assert.equal(statusLabel('published'), 'Dərc olunub');
assert.equal(statusLabel('partially_assigned'), 'Qismən təyin olunub');
assert.equal(statusLabel('in_progress'), 'Davam edir');
assert.equal(statusLabel('expired'), 'Vaxtı bitib');

assert.equal(
  orderDisplayStatus({ status: 'published', end_datetime: '2026-06-17T03:20:00.000Z' }, now),
  'expired',
  'past schedulable orders must not appear active',
);
assert.equal(
  orderDisplayStatus({ status: 'partially_assigned', end_datetime: '2026-06-06T10:53:00.000Z' }, now),
  'expired',
  'past partially staffed orders must not appear active',
);
assert.equal(
  orderDisplayStatus({ status: 'published', end_datetime: '2026-10-17T03:20:00.000Z' }, now),
  'published',
  'future published orders must retain their lifecycle status',
);
assert.equal(
  orderDisplayStatus({ status: 'in_progress', end_datetime: '2026-06-17T03:20:00.000Z' }, now),
  'in_progress',
  'overdue live attendance must remain visible as in progress',
);

const approvalError = Object.assign(new Error('Company registration prerequisites are incomplete.'), {
  code: 'APPROVAL_PREREQUISITES_MISSING',
  status: 409,
  details: {
    missing: ['verified_email', 'document:registration_certificate'],
  },
});
const localizedApprovalError = apiErrorMessage(approvalError);
assert.match(localizedApprovalError, /e-poçt ünvanı təsdiqlənməlidir/);
assert.match(localizedApprovalError, /qeydiyyat şəhadətnaməsi/);
assert.doesNotMatch(localizedApprovalError, /prerequisites/i);

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
const companyPage = read('apps/admin_panel/src/features/companies/CompanyDetailPage.tsx');
const reportsService = read('src/modules/reports/reports.service.ts');

assert.ok(companyPage.includes('approvalBlockedByDocument'));
assert.ok(companyPage.includes("registrationCertificate.status === 'ready'"));
assert.ok(companyPage.includes("registrationCertificate.scan_status === 'clean'"));
assert.ok(reportsService.includes('status: { in: ORDER_ATTENDANCE_STATUSES }'));

console.log('admin-operations-regression: OK');
