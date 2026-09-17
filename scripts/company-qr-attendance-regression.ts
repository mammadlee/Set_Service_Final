import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Execute the real service, repository, signed QR and lifecycle code against an
// in-memory Prisma adapter. No database, Redis, delivery provider or VPS is used.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/qr_regression';
process.env.QR_HMAC_SECRET = 'local-regression-only-qr-secret-32-characters';
process.env.PUSH_NOTIFICATIONS_ENABLED = 'false';

type Row = Record<string, any>;
const rows: Record<string, Row[]> = Object.fromEntries([
  'company', 'worker', 'order', 'assignment', 'venueKiosk', 'kioskActiveSession',
  'kioskSession', 'attendanceQrToken', 'attendanceQrUse', 'attendanceLog',
  'notification', 'deviceToken', 'auditLog', 'orderStatusHistory', 'user', 'outboxEvent',
].map((name) => [name, []]));

function matches(row: any, where: any): boolean {
  if (where === undefined) return true;
  if (where === null || typeof where !== 'object' || where instanceof Date) {
    return row instanceof Date && where instanceof Date ? row.getTime() === where.getTime() : row === where;
  }
  if ('in' in where && !where.in.includes(row)) return false;
  if ('not' in where && matches(row, where.not)) return false;
  if ('gt' in where && !(row > where.gt)) return false;
  if ('OR' in where && !where.OR.some((part: any) => matches(row, part))) return false;
  if ('AND' in where && !where.AND.every((part: any) => matches(row, part))) return false;
  return Object.entries(where).every(([key, value]) =>
    ['in', 'not', 'gt', 'OR', 'AND'].includes(key) || matches(row?.[key], value));
}

function attach(name: string, row: Row): Row {
  if (name === 'order') {
    row.company = rows.company.find((item) => item.id === row.company_id);
    row.assignments = rows.assignment.filter((item) => item.order_id === row.id);
    row._count = { assignments: rows.assignment.filter((item) => item.order_id === row.id && item.status === 'accepted').length };
  }
  if (name === 'assignment') {
    row.order = attach('order', rows.order.find((item) => item.id === row.order_id)!);
    row.worker = rows.worker.find((item) => item.id === row.worker_id);
  }
  if (name === 'kioskActiveSession') row.order = attach('order', rows.order.find((item) => item.id === row.order_id)!);
  if (name === 'venueKiosk') {
    row.company = rows.company.find((item) => item.id === row.company_id);
    row.active_sessions = rows.kioskActiveSession
      .filter((item) => item.kiosk_id === row.id && item.status === 'active' && item.revoked_at === null && item.deleted_at === null)
      .map((item) => attach('kioskActiveSession', item));
  }
  if (name === 'attendanceLog') row.assignment = attach('assignment', rows.assignment.find((item) => item.id === row.assignment_id)!);
  return row;
}

function apply(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
  }
}

let cases = 0;
async function rejectsCode(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: any) => error.code === code, code);
  cases += 1;
}

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const { Prisma } = await import('@prisma/client');
  const db = prisma as any;
  for (const [name, table] of Object.entries(rows)) {
    const select = (where: any) => table.map((row) => attach(name, row)).filter((row) => matches(row, where));
    db[name].findUnique = async ({ where }: any) => select(where)[0] ?? null;
    db[name].findFirst = async ({ where }: any = {}) => select(where)[0] ?? null;
    db[name].findFirstOrThrow = async ({ where }: any) => {
      const row = select(where)[0];
      assert.ok(row, `Missing ${name}`);
      return row;
    };
    db[name].findMany = async ({ where }: any = {}) => select(where);
    db[name].count = async ({ where }: any) => select(where).length;
    db[name].create = async ({ data }: any) => {
      data = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
      if (name === 'attendanceQrUse' && table.some((row) => row.qr_token_id === data.qr_token_id && row.worker_id === data.worker_id && row.action === data.action)) {
        throw new Prisma.PrismaClientKnownRequestError('Duplicate QR use', { code: 'P2002', clientVersion: 'test' });
      }
      const row = {
        id: crypto.randomUUID(), status: 'active', version: 1, created_at: new Date(), updated_at: new Date(),
        deleted_at: null, revoked_at: null, expires_at: null, assignment_id: null,
        kiosk_id: null, kiosk_session_id: null, checkin_time: null, checkout_time: null,
        ...data,
      };
      if (name === 'order' && row.category_items?.create) {
        row.category_items = row.category_items.create.map((item: Row) => ({ id: crypto.randomUUID(), notes: null, ...item }));
      }
      table.push(row);
      return attach(name, row);
    };
    db[name].updateMany = async ({ where, data }: any) => {
      const selected = select(where);
      selected.forEach((row) => apply(row, data));
      return { count: selected.length };
    };
  }
  db.$transaction = async (callback: any) => typeof callback === 'function' ? callback(db) : Promise.all(callback);
  db.$queryRaw = async (strings: TemplateStringsArray, ...values: any[]) => {
    const sql = strings.join('?');
    const tableName = sql.match(/FROM "(\w+)"/)?.[1];
    const tableMap: Record<string, string> = {
      orders: 'order', assignments: 'assignment', venue_kiosks: 'venueKiosk',
      kiosk_active_sessions: 'kioskActiveSession', kiosk_sessions: 'kioskSession',
      attendance_qr_tokens: 'attendanceQrToken',
    };
    assert.ok(tableName && tableMap[tableName], `Unexpected SQL ${sql}`);
    const key = sql.includes('token_hash =') ? 'token_hash' : 'id';
    const row = rows[tableMap[tableName!]].find((item) => item[key] === values[0]);
    if (!row || (sql.includes("status = 'active'") && row.status !== 'active') ||
      (sql.includes('revoked_at IS NULL') && row.revoked_at !== null) ||
      (sql.includes('deleted_at IS NULL') && row.deleted_at !== null) ||
      (sql.includes('company_id =') && row.company_id !== values[1])) return [];
    return [{ id: row.id }];
  };
  const service = await import('../src/modules/attendance/attendance.service');
  const repository = await import('../src/modules/attendance/attendance.repository');
  const qrLib = await import('../src/lib/qr');
  const companyA = { id: 'company-a', user_id: 'company-user-a', name: 'Müəssisə A', status: 'approved', deleted_at: null,
    user: { id: 'company-user-a', name: 'Əlaqədar şəxs', phone: '+994501111111', is_active: true, deleted_at: null } };
  const companyB = { ...companyA, id: 'company-b', user_id: 'company-user-b', name: 'Müəssisə B', user: { ...companyA.user, id: 'company-user-b' } };
  rows.company.push(companyA, companyB);
  const ordersService = await import('../src/modules/orders/orders.service');
  const { CreateOrderSchema } = await import('../src/modules/orders/orders.schema');
  const created = await ordersService.createOrder(companyA.user_id, 'company', CreateOrderSchema.parse({
    title: 'Şöbə sifarişi', description: 'İş yeri üzrə ofisiant xidməti',
    category: 'Ofisiant', required_count: 1,
    start_datetime: new Date(Date.now() + 60_000), end_datetime: new Date(Date.now() + 3_600_000),
    location: 'Bakı, iş yeri',
  }));
  const createdId = (created.response as Row).id;
  const order = rows.order.find((item) => item.id === createdId)!;
  assert.equal(order.status, 'published');
  assert.equal(order.company_id, companyA.id);
  assert.equal(rows.outboxEvent[0].aggregate_id, order.id);
  cases += 1;
  const otherOrder = { ...order, id: 'order-b', company_id: companyB.id };
  rows.order.push(otherOrder);
  const worker = { id: 'worker-a', user_id: 'worker-user-a', status: 'approved', deleted_at: null,
    user: { id: 'worker-user-a', name: 'İşçi A', phone: '+994502222222', is_active: true, deleted_at: null } };
  rows.worker.push(worker, { ...worker, id: 'worker-b', user_id: 'worker-user-b' });

  // A/B: a just-published own order with no assignment is eligible and gets a live QR.
  const eligible = await service.listKioskEligibleOrders(companyA.user_id, 'company', {});
  assert.deepEqual(eligible.data.map((item) => [item.id, item.accepted_assignment_count]), [[order.id, 0]]);
  const kiosk = await service.createVenueKiosk(companyA.user_id, 'company', { name: 'Əsas giriş' });
  const active = await service.activateVenueKiosk(companyA.user_id, 'company', kiosk.id, { order_id: order.id });
  assert.equal(active.active_session?.order_id, order.id);
  const initialQr = await service.generateKioskQrToken(kiosk.kiosk_token);
  assert.equal(qrLib.verifyAttendanceQrToken(initialQr.token).valid, true);
  cases += 2;

  // Retrying activation preserves the activation and previously issued grants.
  const retry = await service.activateVenueKiosk(companyA.user_id, 'company', kiosk.id, { order_id: order.id });
  assert.equal(retry.active_session?.id, active.active_session?.id);
  assert.equal(rows.kioskActiveSession.length, 1);
  assert.equal(rows.attendanceQrToken[0].revoked_at, null);
  cases += 1;

  // C and role isolation: no cross-company list, creation or activation.
  await rejectsCode(() => service.listVenueKiosks(companyB.user_id, 'company', { company_id: companyA.id }), 'FORBIDDEN');
  assert.equal((await service.listVenueKiosks(companyB.user_id, 'company', {})).data.length, 0);
  await rejectsCode(() => service.createVenueKiosk(companyB.user_id, 'company', { name: 'Səhv giriş', company_id: companyA.id }), 'FORBIDDEN');
  await rejectsCode(() => service.activateVenueKiosk(companyB.user_id, 'company', kiosk.id, { order_id: order.id }), 'FORBIDDEN');
  await rejectsCode(() => service.activateVenueKiosk(companyA.user_id, 'company', kiosk.id, { order_id: otherOrder.id }), 'FORBIDDEN');
  await rejectsCode(() => service.createVenueKiosk(worker.user_id, 'worker', { name: 'Səhv giriş' }), 'FORBIDDEN');

  // D/E/F: current lifecycle is enforced even when a UI/request is manipulated.
  for (const status of ['draft', 'cancelled', 'completed']) {
    order.status = status;
    await rejectsCode(() => service.activateVenueKiosk(companyA.user_id, 'company', kiosk.id, { order_id: order.id }), 'ORDER_NOT_ACTIVE');
    await rejectsCode(() => service.generateKioskQrToken(kiosk.kiosk_token), 'KIOSK_ORDER_INACTIVE');
    assert.equal((await service.listKioskEligibleOrders(companyA.user_id, 'company', {})).data.length, 0);
  }
  order.status = 'published';
  const futureEnd = order.shift_end;
  order.shift_end = new Date(Date.now() - 1);
  await rejectsCode(() => service.activateVenueKiosk(companyA.user_id, 'company', kiosk.id, { order_id: order.id }), 'ORDER_EXPIRED');
  await rejectsCode(() => service.generateKioskQrToken(kiosk.kiosk_token), 'KIOSK_ORDER_INACTIVE');
  await rejectsCode(() => repository.activateVenueKiosk({ kioskId: kiosk.id, companyId: companyA.id, orderId: order.id, activatedById: companyA.user_id }), 'ORDER_NOT_QR_ELIGIBLE');
  order.shift_end = futureEnd;
  order.deleted_at = new Date();
  await rejectsCode(() => service.activateVenueKiosk(companyA.user_id, 'company', kiosk.id, { order_id: order.id }), 'ORDER_NOT_FOUND');
  await rejectsCode(() => service.generateKioskQrToken(kiosk.kiosk_token), 'KIOSK_ORDER_INACTIVE');
  await rejectsCode(() => repository.activateVenueKiosk({ kioskId: kiosk.id, companyId: companyA.id, orderId: order.id, activatedById: companyA.user_id }), 'ORDER_NOT_QR_ELIGIBLE');
  order.deleted_at = null;

  // G: pending/rejected company cannot create, read or activate QR.
  for (const status of ['pending_approval', 'rejected']) {
    companyA.status = status;
    await rejectsCode(() => service.createVenueKiosk(companyA.user_id, 'company', { name: 'Giriş' }), 'ACCOUNT_NOT_APPROVED');
    await rejectsCode(() => service.listVenueKiosks(companyA.user_id, 'company', {}), 'ACCOUNT_NOT_APPROVED');
    await rejectsCode(() => service.activateVenueKiosk(companyA.user_id, 'company', kiosk.id, { order_id: order.id }), 'ACCOUNT_NOT_APPROVED');
    await rejectsCode(() => service.generateKioskQrToken(kiosk.kiosk_token), 'VENUE_KIOSK_DISABLED');
  }
  companyA.status = 'approved';
  companyA.user.is_active = false;
  await rejectsCode(() => service.createVenueKiosk(companyA.user_id, 'company', { name: 'Giriş' }), 'ACCOUNT_INACTIVE');
  await rejectsCode(() => service.listVenueKiosks(companyA.user_id, 'company', {}), 'ACCOUNT_INACTIVE');
  await rejectsCode(() => service.getKioskSession(kiosk.kiosk_token), 'VENUE_KIOSK_DISABLED');
  await rejectsCode(() => service.generateKioskQrToken(kiosk.kiosk_token), 'VENUE_KIOSK_DISABLED');
  await rejectsCode(() => repository.activateVenueKiosk({ kioskId: kiosk.id, companyId: companyA.id, orderId: order.id, activatedById: companyA.user_id }), 'ORDER_NOT_QR_ELIGIBLE');
  companyA.user.is_active = true;

  // I: a valid company QR conveys no worker/assignment permission.
  await rejectsCode(() => service.checkIn(worker.user_id, 'worker', { qr_token: initialQr.token }), 'KIOSK_ASSIGNMENT_NOT_FOUND');
  rows.assignment.push({ id: 'assignment-a', worker_id: worker.id, order_id: order.id, status: 'accepted', deleted_at: null });
  const { reconcileOrderStaffingStatus } = await import('../src/modules/orders/orders.lifecycle');
  await reconcileOrderStaffingStatus(db, order.id, {
    actorId: 'admin-user', actorRole: 'admin', reason: 'Regression assignment accepted',
  });
  await rejectsCode(() => service.checkIn('worker-user-b', 'worker', { qr_token: initialQr.token, assignment_id: 'assignment-a' }), 'KIOSK_ASSIGNMENT_NOT_FOUND');
  worker.status = 'pending_approval';
  await rejectsCode(() => service.checkIn(worker.user_id, 'worker', { qr_token: initialQr.token }), 'ACCOUNT_NOT_APPROVED');
  worker.status = 'approved';

  // Lifecycle/ownership are revalidated for consumption, not just QR issuance.
  const assignmentStatus = order.status;
  for (const status of ['cancelled', 'completed']) {
    order.status = status;
    await rejectsCode(() => service.checkIn(worker.user_id, 'worker', { qr_token: initialQr.token }), 'ASSIGNMENT_NOT_ACCEPTED');
  }
  order.status = assignmentStatus;
  order.shift_end = new Date(Date.now() - 1);
  await rejectsCode(() => service.checkIn(worker.user_id, 'worker', { qr_token: initialQr.token }), 'ASSIGNMENT_NOT_ACCEPTED');
  order.shift_end = futureEnd;
  order.deleted_at = new Date();
  await rejectsCode(() => service.checkIn(worker.user_id, 'worker', { qr_token: initialQr.token }), 'ASSIGNMENT_NOT_ACCEPTED');
  order.deleted_at = null;
  const verifiedInitial = qrLib.verifyAttendanceQrToken(initialQr.token);
  assert.equal(verifiedInitial.valid, true);
  if (!verifiedInitial.valid) throw new Error('Expected valid test QR');
  companyA.user.is_active = false;
  const inactiveCompanyCheckin = await repository.createCheckInWithAudit({
    assignmentId: 'assignment-a', workerId: worker.id, actorId: worker.user_id, actorRole: 'worker',
    qr: {
      tokenHash: qrLib.hashQrToken(initialQr.token), nonce: verifiedInitial.payload.nonce,
      orderId: order.id, companyId: companyA.id, kioskId: kiosk.id, kioskSessionId: active.active_session!.id,
    },
  });
  assert.equal(inactiveCompanyCheckin.kind, 'assignment_not_accepted');
  cases += 1;
  companyA.user.is_active = true;

  // Persisted revocation is checked during consumption even for a correctly signed token.
  const revokedQr = await service.generateKioskQrToken(kiosk.kiosk_token);
  rows.attendanceQrToken.find((item) => item.token_hash === qrLib.hashQrToken(revokedQr.token))!.revoked_at = new Date();
  await rejectsCode(() => service.checkIn(worker.user_id, 'worker', { qr_token: revokedQr.token }), 'QR_TOKEN_REVOKED');
  await rejectsCode(() => service.checkIn(worker.user_id, 'worker', { qr_token: `${initialQr.token}tampered` }), 'QR_TOKEN_INVALID');
  const actualNow = Date.now;
  const expiredQr = qrLib.generateAttendanceQrToken({ orderId: order.id, companyId: companyA.id, ttlSeconds: 1 });
  Date.now = () => actualNow() + 2_000;
  try { await rejectsCode(() => service.checkIn(worker.user_id, 'worker', { qr_token: expiredQr.token }), 'QR_TOKEN_EXPIRED'); }
  finally { Date.now = actualNow; }

  // H: company-created order QR works after acceptance, then prevents duplicate scans.
  const checkin = await service.checkIn(worker.user_id, 'worker', { qr_token: initialQr.token });
  assert.equal(checkin.assignment_id, 'assignment-a');
  assert.equal(order.status, 'in_progress');
  assert.equal(rows.attendanceQrUse.length, 1);
  await rejectsCode(() => service.checkIn(worker.user_id, 'worker', { qr_token: initialQr.token }), 'ATTENDANCE_ALREADY_CHECKED_IN');
  const checkoutQr = await service.generateKioskQrToken(kiosk.kiosk_token);
  const checkout = await service.checkOut(worker.user_id, 'worker', { qr_token: checkoutQr.token });
  assert.ok(checkout.checkout_time);
  assert.equal(order.status, 'completed');
  assert.equal(rows.attendanceQrUse.length, 2);
  assert.equal((await service.listAttendance(companyA.user_id, 'company', { page: 1, limit: 20, sort: 'desc' })).data.length, 1);
  assert.equal((await service.listAttendance(companyB.user_id, 'company', { page: 1, limit: 20, sort: 'desc' })).data.length, 0);
  cases += 1;
  await rejectsCode(() => service.generateKioskQrToken(kiosk.kiosk_token), 'KIOSK_ORDER_INACTIVE');

  // J: admin management still works; physical displays remain independently supported.
  const adminKiosk = await service.createVenueKiosk('admin-user', 'admin', { company_id: companyB.id, name: 'İkinci giriş' });
  const adminActive = await service.activateVenueKiosk('admin-user', 'admin', adminKiosk.id, { order_id: otherOrder.id });
  assert.equal(adminActive.active_session?.order_id, otherOrder.id);
  assert.ok((await service.generateKioskQrToken(adminKiosk.kiosk_token)).token);
  await service.disableVenueKiosk('admin-user', 'admin', adminKiosk.id);
  await rejectsCode(() => service.getKioskSession(adminKiosk.kiosk_token), 'VENUE_KIOSK_DISABLED');
  await rejectsCode(() => service.generateKioskQrToken(adminKiosk.kiosk_token), 'VENUE_KIOSK_DISABLED');
  cases += 1;

  console.log(`company QR/attendance behavioral regression: OK (${cases} cases; real service/repository, in-memory Prisma; no live DB)`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
