import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadAttendanceDisplay() {
  const source = readFileSync(new URL('../src/features/attendance/attendance.display.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (path) => path.includes('/i18n/') ? { appStrings: { notAvailable: 'Mövcud deyil' } } : {},
  });
  return exports;
}

const attendanceDisplay = loadAttendanceDisplay();

test('admin attendance list uses the assignment-backed monitor endpoint', async () => {
  const source = readFileSync(new URL('../src/features/attendance/attendance.service.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const calls = [];
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({ apiRequest: async (...args) => { calls.push(args); return { data: [], meta: {} }; } }),
  });

  await exports.attendanceService.list({ page: 1, limit: 20, status: 'not_checked_in' });
  assert.equal(calls[0][0], '/attendance/monitor');
  assert.equal(calls[0][1].query.status, 'not_checked_in');
});

test('persistent kiosk company selection does not depend on an eligible order', async () => {
  const serviceSource = readFileSync(new URL('../src/features/attendance/attendance.service.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(serviceSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const calls = [];
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({ apiRequest: async (...args) => { calls.push(args); return { data: [] }; } }),
  });

  await exports.attendanceService.listVenueKioskCompanies();
  assert.equal(calls[0][0], '/attendance/venue-kiosks/companies');

  const page = readFileSync(new URL('../src/features/attendance/QrDisplayPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /listVenueKioskCompanies\(\)/);
  assert.match(page, /Kiosk linki saxlanılır/);
  assert.doesNotMatch(page, /!selectedCompany \|\| companyOrders\.length === 0 \|\| !kioskName/);
});

function record(overrides = {}) {
  return {
    checkin_time: '2026-10-14T08:00:00.000Z',
    checkout_time: null,
    assignment: {
      status: 'accepted',
      category: 'Xidmət',
      position: null,
      category_item: null,
    },
    ...overrides,
  };
}

test('attendance status distinguishes working, checked out, completed and missing records', () => {
  assert.equal(attendanceDisplay.attendanceStatus(record()), 'currently_working');
  assert.equal(attendanceDisplay.attendanceStatus(record({ checkout_time: '2026-10-14T12:00:00.000Z' })), 'checked_out');
  assert.equal(attendanceDisplay.attendanceStatus(record({ checkout_time: '2026-10-14T12:00:00.000Z', assignment: { ...record().assignment, status: 'completed' } })), 'completed');
  assert.equal(attendanceDisplay.attendanceStatus(record({ checkin_time: null })), 'missing_incomplete');
  assert.equal(attendanceDisplay.attendanceStatus(record({ status: 'not_checked_in' })), 'not_checked_in');
});

test('attendance duration never invents time when checkout is missing', () => {
  assert.equal(attendanceDisplay.formatAttendanceDuration(null), 'Hesablanmayıb');
  assert.equal(attendanceDisplay.formatAttendanceDuration(0), '0 dəq');
  assert.equal(attendanceDisplay.formatAttendanceDuration(135), '2 saat 15 dəq');
});

test('attendance position prefers the assigned structured position', () => {
  assert.equal(attendanceDisplay.attendancePosition(record({ assignment: { ...record().assignment, position: { name_az: 'Aşpaz' } } })), 'Aşpaz');
  assert.equal(attendanceDisplay.attendancePosition(record()), 'Xidmət');
});

test('management pages wire bulk results, history tabs, polling and accessible image preview', () => {
  const assignments = readFileSync(new URL('../src/features/assignments/AssignmentsPage.tsx', import.meta.url), 'utf8');
  const attendance = readFileSync(new URL('../src/features/attendance/AttendancePage.tsx', import.meta.url), 'utf8');
  const attendanceService = readFileSync(new URL('../src/features/attendance/attendance.service.ts', import.meta.url), 'utf8');
  const companyReport = readFileSync(new URL('../src/features/companies/CompanyReportPage.tsx', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../src/features/workers/WorkerDetailPage.tsx', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../src/shared/components/ImagePreviewModal.tsx', import.meta.url), 'utf8');

  assert.match(assignments, /bulkCreate\(/);
  assert.match(assignments, /Aktiv təyinatlar/);
  assert.match(assignments, /Tamamlanmış \/ tarixçə/);
  assert.match(assignments, /Əməliyyat nəticəsi/);
  assert.match(attendance, /usePolling\(/);
  assert.match(attendance, /record\.assignment\.worker\.name/);
  assert.match(attendance, /record\.id \?/);
  assert.match(attendance, /sort_by: 'updated_at'/);
  assert.match(attendanceService, /'\/attendance\/monitor'/);
  assert.match(companyReport, /companiesService\.exportReport/);
  assert.match(companyReport, /first\.orders\.meta\.total_pages/);
  assert.match(companyReport, /setPrintOrders\(orders\)/);
  assert.match(companyReport, /MAX_PRINT_ORDERS/);
  assert.match(companyReport, /ReportAssignments/);
  assert.match(companyReport, /assignment\.assigned_by\?\.name/);
  assert.match(worker, /ImagePreviewModal/);
  assert.match(worker, /Təhlükəsiz baxış/);
  assert.match(worker, /health_certificate', 'criminal_record', 'cv/);
  assert.match(modal, /event\.key === 'Escape'/);
  assert.match(modal, /ZoomIn/);
  assert.match(modal, /state === 'error'/);
});
