import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';

// Real HTTP auth/RBAC, router, service and repository; only Prisma persistence
// is replaced. This does not connect to a database, Redis or delivery provider.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/assignment_regression';
process.env.REDIS_URL = '';
process.env.PUSH_NOTIFICATIONS_ENABLED = 'false';
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(32).toString('hex');

type Row = Record<string, any>;
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const ORDER = id(1), CATEGORY = id(2), REQUIRED_POSITION = id(3), OTHER_POSITION = id(4);
const WORKER = id(5), SECOND_WORKER = id(6), ADMIN = id(7);
const tables = ['order', 'worker', 'assignment', 'user', 'notification', 'auditLog', 'orderStatusHistory', 'deviceToken'];
let rows: Record<string, Row[]>;
let locks: string[];
let cases = 0;

function matches(row: any, where: any): boolean {
  if (where === undefined) return true;
  if (where === null || typeof where !== 'object' || where instanceof Date) {
    return row instanceof Date && where instanceof Date ? row.getTime() === where.getTime() : row === where;
  }
  if ('in' in where && !where.in.includes(row)) return false;
  if ('gt' in where && !(row > where.gt)) return false;
  if ('some' in where && !row?.some((item: any) => matches(item, where.some))) return false;
  if ('OR' in where && !where.OR.some((part: any) => matches(row, part))) return false;
  return Object.entries(where).every(([key, value]) =>
    ['in', 'gt', 'some', 'OR'].includes(key) || matches(row?.[key], value));
}

function attach(table: string, row: Row): Row {
  if (table !== 'assignment') return row;
  const order = rows.order.find((item) => item.id === row.order_id)!;
  return {
    ...row, order, worker: rows.worker.find((item) => item.id === row.worker_id),
    order_category_item: order.category_items.find((item: Row) => item.id === row.order_category_item_id),
    position: { id: row.position_id, name_az: 'Ofisiant' },
  };
}

function reset(positionId: string | null = OTHER_POSITION, role = 'admin', permissions = ['manage_assignments']): void {
  rows = Object.fromEntries(tables.map((table) => [table, []]));
  locks = [];
  const user = { id: ADMIN, role, is_active: true, deleted_at: null, session_version: 0,
    admin: { permissions }, worker: { status: 'approved', deleted_at: null },
    company: { id: id(10), status: 'approved', deleted_at: null } };
  rows.user.push(user);
  rows.order.push({ id: ORDER, title: 'Admin vəzifə seçimi', category: 'Ofisiant', status: 'published',
    deleted_at: null, version: 1, required_count: 1, location: 'Bakı',
    shift_start: new Date(Date.now() + 60_000), shift_end: new Date(Date.now() + 3_600_000),
    company_id: id(10), company: { id: id(10), name: 'Müəssisə', status: 'approved', deleted_at: null,
      user: { id: id(11), name: 'Əlaqədar şəxs', is_active: true, deleted_at: null } },
    category_items: [{ id: CATEGORY, category: 'Ofisiant', position_id: REQUIRED_POSITION,
      department_id: null, subdepartment_id: null, required_count: 1 }],
  });
  rows.worker.push({ id: WORKER, user_id: id(12), position: 'Barmen', status: 'approved', availability: true,
    deleted_at: null, worker_class: null, documents: [], skills: [], rating_avg: 0, rating_count: 0,
    created_at: new Date(), updated_at: new Date(),
    user: { id: id(12), name: 'Təsdiqlənmiş işçi', phone: '+994700000999', is_active: true, deleted_at: null },
    positions: positionId ? [{ position_id: positionId, position: { id: positionId, name_az: 'Vəzifə' } }] : [],
  });
}

async function main(): Promise<void> {
  const { prisma } = await import('../src/lib/prisma');
  const db = prisma as any;
  reset();
  for (const table of tables) {
    const select = (where: any) => rows[table].map((row) => attach(table, row)).filter((row) => matches(row, where));
    db[table].findUnique = async ({ where }: any) => select(where)[0] ?? null;
    db[table].findFirst = async ({ where }: any) => select(where)[0] ?? null;
    db[table].findMany = async ({ where, skip = 0, take }: any = {}) => select(where).slice(skip, take === undefined ? undefined : skip + take);
    db[table].count = async ({ where }: any) => select(where).length;
    db[table].create = async ({ data }: any) => {
      const row = { id: crypto.randomUUID(), deleted_at: null, assigned_at: new Date(), updated_at: new Date(), ...data };
      rows[table].push(row);
      return attach(table, row);
    };
    db[table].updateMany = async ({ where, data }: any) => {
      const selected = rows[table].filter((row) => matches(row, where));
      for (const row of selected) {
        for (const [key, value] of Object.entries(data) as Array<[string, any]>) {
          row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
        }
      }
      return { count: selected.length };
    };
  }
  db.$queryRaw = async (strings: TemplateStringsArray) => {
    locks.push(strings.join('?'));
    return [{ id: ORDER }];
  };
  db.$transaction = async (operation: any) => {
    if (typeof operation !== 'function') return Promise.all(operation);
    const before = structuredClone(rows);
    try { return await operation(db); } catch (error) { rows = before; throw error; }
  };

  const { default: router, assignCompatibilityRouter } = await import('../src/modules/assignments/assignments.router');
  const service = await import('../src/modules/assignments/assignments.service');
  const { signAccessToken } = await import('../src/lib/jwt');
  const app = express();
  app.use(express.json());
  app.use('/v1/assignments', router);
  app.use('/v1/orders', assignCompatibilityRouter);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 400).json({ code: error.code ?? 'VALIDATION_ERROR' });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const payload = () => ({ order_id: ORDER, worker_ids: [WORKER], order_category_item_id: CATEGORY });
  async function request(body: Row = payload(), path = '/v1/assignments', authenticated = true) {
    const token = signAccessToken({ sub: ADMIN, role: rows.user[0].role });
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: {
      'content-type': 'application/json', ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
    }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as Row };
  }
  async function reject(code: string, status: number, body: Row = payload()): Promise<void> {
    const result = await request(body);
    assert.deepEqual(result, { status, body: { code } });
    assert.equal(rows.notification.length, 0);
    assert.equal(rows.auditLog.length, 0);
    cases += 1;
  }

  try {
    for (const role of ['admin', 'super_admin']) {
      for (const position of [REQUIRED_POSITION, OTHER_POSITION, null]) {
        reset(position, role, role === 'super_admin' ? [] : ['manage_assignments']);
        const result = await request();
        assert.equal(result.status, 201, `${role} position=${position}: ${JSON.stringify(result.body)}`);
        assert.equal(result.body.assigned_count, 1);
        assert.equal(result.body.assignments[0].position_id, REQUIRED_POSITION, 'Assignment belongs to the order position, not the worker profile position.');
        assert.equal(rows.assignment[0].order_category_item_id, CATEGORY);
        assert.equal(rows.worker[0].positions[0]?.position_id ?? null, position, 'Do not rewrite worker taxonomy.');
        assert.equal(rows.order[0].status, 'assigned');
        assert.equal(rows.notification.length, 1);
        assert.ok(rows.auditLog.some((row) => row.action === 'assignment_created' && row.actor_role === role));
        assert.match(locks[0], /FROM "orders".*FOR UPDATE/);
        assert.match(locks[1], /FROM "order_category_items".*FOR UPDATE/);
        cases += 1;
      }
    }
    reset();
    assert.equal((await request({ worker_ids: [WORKER] }, `/v1/orders/${ORDER}/assign`)).status, 201);
    cases += 1;

    reset();
    assert.equal((await request(payload(), '/v1/assignments', false)).status, 401);
    assert.equal(rows.assignment.length, 0);
    cases += 1;
    for (const role of ['worker', 'company']) {
      reset(OTHER_POSITION, role);
      await reject('PERMISSION_DENIED', 403);
      await assert.rejects(() => service.createAssignments(ADMIN, role, payload()), (error: any) => error.code === 'ROLE_FORBIDDEN');
      cases += 1;
    }
    reset(OTHER_POSITION, 'admin', ['view_assignments']);
    await reject('PERMISSION_DENIED', 403);
    assert.equal((await request({ worker_ids: [WORKER] }, `/v1/orders/${ORDER}/assign`)).status, 403);
    cases += 1;
    reset();
    rows.user[0].is_active = false;
    await reject('ACCOUNT_INACTIVE', 403);

    for (const status of ['pending_approval', 'rejected', 'suspended', 'inactive']) {
      reset(); rows.worker[0].status = status;
      await reject('WORKERS_NOT_AVAILABLE', 400);
    }
    reset(); rows.worker[0].availability = false;
    await reject('WORKERS_NOT_AVAILABLE', 400);
    reset(); rows.worker[0].user.is_active = false;
    await reject('WORKERS_NOT_AVAILABLE', 400);
    reset(); rows.worker[0].user.deleted_at = new Date();
    await reject('WORKERS_NOT_AVAILABLE', 400);
    reset(); rows.worker[0].deleted_at = new Date();
    await reject('WORKERS_NOT_FOUND', 400);

    for (const status of ['draft', 'completed', 'cancelled', 'in_progress']) {
      reset(); rows.order[0].status = status;
      await reject('ORDER_NOT_ACTIVE', 409);
    }
    reset(); rows.order[0].shift_end = new Date(Date.now() - 1);
    await reject('ORDER_NOT_ACTIVE', 409);
    reset(); rows.order[0].company.status = 'pending_approval';
    await reject('ORDER_NOT_ACTIVE', 409);

    reset();
    await reject('INVALID_ORDER_CATEGORY', 400, { ...payload(), position_id: OTHER_POSITION });
    await reject('INVALID_ORDER_CATEGORY', 400, { ...payload(), order_category_item_id: id(99) });
    await reject('DUPLICATE_WORKER_IDS', 400, { ...payload(), worker_ids: [WORKER, WORKER] });
    for (const status of ['assigned', 'accepted', 'rejected', 'cancelled', 'completed']) {
      reset(); rows.assignment.push({ id: id(20), order_id: ORDER, worker_id: WORKER, status, deleted_at: null });
      await reject('DUPLICATE_ASSIGNMENT', 409);
    }
    reset(); rows.assignment.push({ id: id(20), order_id: ORDER, worker_id: WORKER, status: 'cancelled', deleted_at: new Date() });
    await reject('DUPLICATE_ASSIGNMENT', 409);
    for (const status of ['assigned', 'accepted', 'completed']) {
      reset(); rows.assignment.push({ id: id(20), order_id: ORDER, worker_id: SECOND_WORKER,
        order_category_item_id: CATEGORY, status, deleted_at: null });
      await reject('ORDER_CAPACITY_EXCEEDED', 409);
    }

    // Selector API keeps inactive accounts out of available results, without
    // hiding them from the normal administrative worker list.
    reset(null);
    rows.worker.push({ ...structuredClone(rows.worker[0]), id: SECOND_WORKER,
      user: { ...rows.worker[0].user, is_active: false } });
    rows.worker.push({ ...structuredClone(rows.worker[0]), id: id(30),
      user: { ...rows.worker[0].user, deleted_at: new Date() } });
    const workers = await import('../src/modules/workers/workers.service');
    const available = await workers.listWorkers({ status: 'approved', available: true });
    assert.deepEqual(available.data.map((worker) => worker.id), [WORKER]);
    assert.equal(available.meta.total, 1);
    assert.equal((await workers.listWorkers({ status: 'approved' })).meta.total, 3);
    cases += 1;
    console.log(`admin-assignment-position-regression: ${cases} cases PASS (local HTTP + in-memory Prisma; not a real DB test)`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
