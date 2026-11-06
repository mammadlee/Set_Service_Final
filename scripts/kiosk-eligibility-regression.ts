import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isKioskCurrentOrder,
  isKioskEligibleOrder,
  isWithinAttendanceCheckoutGrace,
  kioskCurrentOrderWhere,
  kioskEligibleOrderWhere,
} from '../src/modules/attendance/attendance.kiosk-eligibility';
import { ORDER_ATTENDANCE_STATUSES } from '../src/modules/orders/orders.lifecycle';
import { ListAttendanceQuerySchema } from '../src/modules/attendance/attendance.schema';
import type { OrderStatus } from '../src/types/prisma';

const now = new Date('2030-01-15T12:00:00.000Z');
const base = {
  deleted_at: null,
  shift_end: new Date('2030-01-15T13:00:00.000Z'),
};

for (const status of ORDER_ATTENDANCE_STATUSES) {
  assert.equal(isKioskEligibleOrder({ ...base, status }, now), true, `${status} should be QR-eligible`);
}

for (const status of ['draft', 'completed', 'cancelled'] satisfies OrderStatus[]) {
  assert.equal(isKioskEligibleOrder({ ...base, status }, now), false, `${status} must not be QR-eligible`);
}

assert.equal(isKioskEligibleOrder({ ...base, status: 'active' }, now), true, 'No assignment is needed to prepare venue QR');
assert.equal(isKioskEligibleOrder({ ...base, status: 'active', shift_end: now }, now), false);
assert.equal(isKioskEligibleOrder({ ...base, status: 'active', deleted_at: now }, now), false);

const where = kioskEligibleOrderWhere({ now, companyId: 'company-id', orderId: 'order-id' });
assert.deepEqual(where.status, { in: ORDER_ATTENDANCE_STATUSES });
assert.deepEqual(where.shift_end, { gt: now });
assert.equal(where.assignments, undefined);
assert.deepEqual(where.company, { status: 'approved', deleted_at: null, user: { is_active: true, deleted_at: null } });
assert.equal(where.company_id, 'company-id');
assert.equal(where.id, 'order-id');

const currentWhere = kioskCurrentOrderWhere({ now, companyId: 'company-id' });
assert.deepEqual(currentWhere.shift_start, { lte: now });
assert.equal(isKioskCurrentOrder({ ...base, shift_start: new Date(now.getTime() - 1), status: 'active' }, now), true);
assert.equal(isKioskCurrentOrder({ ...base, shift_start: new Date(now.getTime() + 1), status: 'active' }, now), false);
assert.equal(ListAttendanceQuerySchema.parse({ open_only: 'false' }).open_only, false);
assert.equal(ListAttendanceQuerySchema.parse({ open_only: 'true' }).open_only, true);
assert.throws(() => ListAttendanceQuerySchema.parse({ open_only: 'not-a-boolean' }));

const previousGrace = process.env.ATTENDANCE_CHECKOUT_GRACE_MINUTES;
process.env.ATTENDANCE_CHECKOUT_GRACE_MINUTES = '60';
try {
  assert.equal(isWithinAttendanceCheckoutGrace({
    ...base,
    status: 'in_progress',
    shift_end: new Date(now.getTime() - 59 * 60_000),
  }, now), true);
  assert.equal(isWithinAttendanceCheckoutGrace({
    ...base,
    status: 'in_progress',
    shift_end: new Date(now.getTime() - 61 * 60_000),
  }, now), false);
} finally {
  if (previousGrace === undefined) delete process.env.ATTENDANCE_CHECKOUT_GRACE_MINUTES;
  else process.env.ATTENDANCE_CHECKOUT_GRACE_MINUTES = previousGrace;
}

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const service = read('src/modules/attendance/attendance.service.ts');
const repository = read('src/modules/attendance/attendance.repository.ts');
const router = read('src/modules/attendance/attendance.router.ts');
const page = read('apps/admin_panel/src/features/attendance/QrDisplayPage.tsx');
const adminAttendanceService = read('apps/admin_panel/src/features/attendance/attendance.service.ts');
const createVenueKioskImplementation = service.slice(
  service.indexOf('export async function createVenueKiosk'),
  service.indexOf('export async function listVenueKiosks'),
);
const companyListImplementation = service.slice(
  service.indexOf('export async function listVenueKioskCompanies'),
  service.indexOf('export async function listKioskEligibleOrders'),
);

assert.match(service, /assertKioskEligibleOrder\(order\)/);
assert.match(service, /listSelectableKioskOrders\(kiosk\.company_id/);
assert.match(service, /activationSource: 'automatic'/);
assert.match(service, /allowCheckoutOnly: true/);
assert.match(service, /listVenueKioskCompanies/);
assert.match(
  service,
  /findKioskManageableCompanyById\(\s*requestedCompanyId,\s*actorIsReviewAccount,\s*\)/,
);
assert.doesNotMatch(createVenueKioskImplementation, /listKioskEligibleOrders|assertKioskEligibleOrder/);
assert.match(companyListImplementation, /role !== 'super_admin' && role !== 'admin'/);
assert.doesNotMatch(companyListImplementation, /role !== 'company'/);
assert.match(repository, /listKioskManageableCompanies/);
assert.match(repository, /status: 'approved',[\s\S]*?user: \{ is_active: true, deleted_at: null \}/);
assert.match(
  router,
  /'\/venue-kiosks\/companies',[\s\S]*?requireRoleOrPermission\('manage_kiosks'\)/,
);
assert.match(router, /venue-kiosks\/eligible-orders/);
assert.match(router, /venue-kiosks\/select-order/);
assert.match(adminAttendanceService, /'\/attendance\/venue-kiosks\/companies'/);
assert.match(page, /listVenueKioskCompanies\(\)/);
assert.match(page, /listKioskEligibleOrders\(companyId\)/);
assert.match(page, /Kiosk linki saxlanılır/);
assert.doesNotMatch(page, /!selectedCompany \|\| companyOrders\.length === 0 \|\| !kioskName/);
assert.doesNotMatch(page, /disabled=\{loading \|\| !selectedCompany \|\| companyOrders\.length === 0/);
assert.doesNotMatch(page, /ordersService\.list/);

console.log('kiosk eligibility regression: OK');
