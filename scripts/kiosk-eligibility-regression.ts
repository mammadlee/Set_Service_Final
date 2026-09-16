import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isKioskEligibleOrder,
  kioskEligibleOrderWhere,
} from '../src/modules/attendance/attendance.kiosk-eligibility';
import { ORDER_ATTENDANCE_STATUSES } from '../src/modules/orders/orders.lifecycle';
import type { OrderStatus } from '../src/types/prisma';

const now = new Date('2030-01-15T12:00:00.000Z');
const base = {
  deleted_at: null,
  shift_end: new Date('2030-01-15T13:00:00.000Z'),
  acceptedAssignmentCount: 1,
};

for (const status of ORDER_ATTENDANCE_STATUSES) {
  assert.equal(isKioskEligibleOrder({ ...base, status }, now), true, `${status} should be QR-eligible`);
}

for (const status of ['draft', 'completed', 'cancelled'] satisfies OrderStatus[]) {
  assert.equal(isKioskEligibleOrder({ ...base, status }, now), false, `${status} must not be QR-eligible`);
}

assert.equal(isKioskEligibleOrder({ ...base, status: 'active', acceptedAssignmentCount: 0 }, now), false);
assert.equal(isKioskEligibleOrder({ ...base, status: 'active', shift_end: now }, now), false);
assert.equal(isKioskEligibleOrder({ ...base, status: 'active', deleted_at: now }, now), false);

const where = kioskEligibleOrderWhere({ now, companyId: 'company-id', orderId: 'order-id' });
assert.deepEqual(where.status, { in: ORDER_ATTENDANCE_STATUSES });
assert.deepEqual(where.shift_end, { gt: now });
assert.deepEqual(where.assignments, { some: { status: 'accepted', deleted_at: null } });
assert.equal(where.company_id, 'company-id');
assert.equal(where.id, 'order-id');

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const service = read('src/modules/attendance/attendance.service.ts');
const router = read('src/modules/attendance/attendance.router.ts');
const page = read('apps/admin_panel/src/features/attendance/QrDisplayPage.tsx');

assert.match(service, /countKioskEligibleOrders\(companyId\)/);
assert.match(service, /assertKioskEligibleOrder\(order\)/);
assert.match(router, /venue-kiosks\/eligible-orders/);
assert.match(page, /listKioskEligibleOrders\(\)/);
assert.match(page, /QR yaratmaq üçün aktiv sifariş yoxdur\./);
assert.doesNotMatch(page, /ordersService\.list/);

console.log('kiosk eligibility regression: OK');
