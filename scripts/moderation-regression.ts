const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://placeholder:placeholder@127.0.0.1:1/local_test';
process.env.DIRECT_URL = process.env.DATABASE_URL;

const { prisma } = require('../src/lib/prisma') as typeof import('../src/lib/prisma');
const Service = require('../src/modules/moderation/moderation.service') as typeof import('../src/modules/moderation/moderation.service');
const Schema = require('../src/modules/moderation/moderation.schema') as typeof import('../src/modules/moderation/moderation.schema');
require('../src/middleware/auth');
const { requirePermission } = require('../src/middleware/rbac') as typeof import('../src/middleware/rbac');

const workerUserId = '10000000-0000-4000-8000-000000000001';
const companyUserId = '20000000-0000-4000-8000-000000000002';
const orderId = '30000000-0000-4000-8000-000000000003';
const companyId = '40000000-0000-4000-8000-000000000004';
const workerId = '50000000-0000-4000-8000-000000000005';
const ratingId = '60000000-0000-4000-8000-000000000006';
const reportId = '70000000-0000-4000-8000-000000000007';

const restorers: Array<() => void> = [];
function mockMethod(object: any, method: string, replacement: (...args: any[]) => any) {
  const original = object[method];
  object[method] = replacement;
  restorers.push(() => { object[method] = original; });
}
function restoreMocks() {
  while (restorers.length) restorers.pop()!();
}

async function rejected(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: any) => error?.code === code);
}

async function testTargetVisibility() {
  let assignmentQuery: any;
  mockMethod(prisma.assignment, 'findFirst', async (query: any) => {
    assignmentQuery = query;
    if (query.where.order?.id === orderId && query.where.worker?.user_id === workerUserId) {
      return { id: 'assignment-visible' };
    }
    if (query.where.order?.company_id === companyId && query.where.worker?.user_id === workerUserId) {
      return { id: 'assignment-visible' };
    }
    if (query.where.worker_id === workerId && query.where.order?.company?.user_id === companyUserId) {
      return { id: 'assignment-visible' };
    }
    return null;
  });
  mockMethod(prisma.rating, 'findFirst', async (query: any) =>
    query.where.id === ratingId && query.where.worker?.user_id === workerUserId
      ? { id: ratingId }
      : null);

  await Service.assertTargetVisible(workerUserId, 'worker', {
    target_type: 'order', target_id: orderId, reason: 'other',
  });
  assert.deepEqual(assignmentQuery.where.status.in, ['assigned', 'accepted', 'completed']);
  assert.equal(assignmentQuery.where.deleted_at, null);
  await rejected(() => Service.assertTargetVisible(workerUserId, 'worker', {
    target_type: 'order', target_id: companyId, reason: 'other',
  }), 'REPORT_TARGET_FORBIDDEN');

  await Service.assertTargetVisible(workerUserId, 'worker', {
    target_type: 'company_profile', target_id: companyId, reason: 'other',
  });
  await rejected(() => Service.assertTargetVisible(workerUserId, 'worker', {
    target_type: 'company_profile', target_id: workerId, reason: 'other',
  }), 'REPORT_TARGET_FORBIDDEN');
  await Service.assertTargetVisible(workerUserId, 'worker', {
    target_type: 'rating', target_id: ratingId, reason: 'other',
  });
  await rejected(() => Service.assertTargetVisible(workerUserId, 'worker', {
    target_type: 'rating', target_id: orderId, reason: 'other',
  }), 'REPORT_TARGET_FORBIDDEN');

  await Service.assertTargetVisible(companyUserId, 'company', {
    target_type: 'worker_profile', target_id: workerId, reason: 'other',
  });
  assert.equal(assignmentQuery.where.order.company.status, 'approved');
  await rejected(() => Service.assertTargetVisible(companyUserId, 'company', {
    target_type: 'worker_profile', target_id: orderId, reason: 'other',
  }), 'REPORT_TARGET_FORBIDDEN');
  await rejected(() => Service.assertTargetVisible(companyUserId, 'company', {
    target_type: 'order', target_id: orderId, reason: 'other',
  }), 'REPORT_TARGET_FORBIDDEN');
  restoreMocks();
}

async function testPersistenceAndAuthorizedAdminNotification() {
  let created: any;
  let notifications: any[] = [];
  let audit: any;
  mockMethod(prisma.assignment, 'findFirst', async () => ({ id: 'assignment-visible' }));
  mockMethod(prisma, '$transaction', async (callback: (tx: any) => Promise<any>) => callback({
    moderationReport: {
      create: async (query: any) => {
        created = query.data;
        return { id: reportId, status: 'open' };
      },
    },
    user: {
      findMany: async () => [
        { id: 'super', role: 'super_admin', admin: { permissions: [] } },
        { id: 'moderator', role: 'admin', admin: { permissions: ['view_moderation'] } },
        { id: 'restricted', role: 'admin', admin: { permissions: ['view_workers'] } },
      ],
    },
    notification: {
      createMany: async (query: any) => { notifications = query.data; return { count: notifications.length }; },
    },
    auditLog: {
      create: async (query: any) => { audit = query.data; return { id: 'audit-id' }; },
    },
  }));

  const result = await Service.createReport(workerUserId, 'worker', {
    target_type: 'order', target_id: orderId, reason: 'privacy', details: 'Şəxsi məlumat açıqlanıb',
  });
  assert.deepEqual(result, { id: reportId, status: 'open' });
  assert.equal(created.reporter_user_id, workerUserId);
  assert.equal(created.target_id, orderId);
  assert.equal(created.reason, 'privacy');
  assert.deepEqual(notifications.map((item) => item.recipient_id).sort(), ['moderator', 'super']);
  assert.deepEqual(notifications[0].metadata, { report_id: reportId });
  assert.equal(audit.entity_type, 'moderation_report');
  assert.equal(JSON.stringify(audit).includes('Şəxsi məlumat'), false);
  restoreMocks();
}

async function testAdminListAndTransitions() {
  const timestamp = new Date('2026-09-21T00:00:00.000Z');
  const report: any = {
    id: reportId,
    reporter_role: 'worker',
    reporter_user_id: workerUserId,
    target_type: 'order',
    target_id: orderId,
    reason: 'privacy',
    details: 'Sübut',
    status: 'open',
    reviewed_by_id: null,
    reviewed_at: null,
    resolution_note: null,
    created_at: timestamp,
    updated_at: timestamp,
    reporter: { id: workerUserId, name: 'İşçi', role: 'worker' },
  };
  let listQuery: any;
  let statusAuditCount = 0;
  mockMethod(prisma.moderationReport, 'count', async (query: any) => {
    assert.deepEqual(query.where, { status: 'open' });
    return 1;
  });
  mockMethod(prisma.moderationReport, 'findMany', async (query: any) => {
    listQuery = query;
    return [{ ...report }];
  });
  mockMethod(prisma.moderationReport, 'findUnique', async () => ({ ...report }));
  mockMethod(prisma.order, 'findUnique', async () => ({ title: 'Görünən sifariş' }));
  mockMethod(prisma, '$transaction', async (input: any) => {
    if (Array.isArray(input)) return Promise.all(input);
    return input({
      moderationReport: {
        updateMany: async (query: any) => {
          if (!query.where.status.in.includes(report.status)) return { count: 0 };
          Object.assign(report, query.data);
          return { count: 1 };
        },
        findUnique: async () => ({ status: report.status }),
      },
      auditLog: {
        create: async () => { statusAuditCount += 1; return { id: 'audit-id' }; },
      },
    });
  });

  const list = await Service.listModerationReports({ page: 1, limit: 20, status: 'open' });
  assert.equal(list.meta.total, 1);
  assert.equal(list.data[0].id, reportId);
  assert.equal(listQuery.take, 20);
  assert.equal(listQuery.skip, 0);

  const detail = await Service.getModerationReport(reportId);
  assert.deepEqual(detail.target, { id: orderId, type: 'order', label: 'Görünən sifariş' });
  assert.equal(detail.reporter?.name, 'İşçi');

  const actor = { sub: 'admin-id', role: 'admin' as const };
  const reviewing = await Service.updateModerationReport(reportId, actor, { status: 'reviewing' });
  assert.equal(reviewing.status, 'reviewing');
  assert.equal(report.reviewed_by_id, actor.sub);
  const resolved = await Service.updateModerationReport(reportId, actor, {
    status: 'resolved', resolution_note: 'Məzmun yoxlanıldı',
  });
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.resolution_note, 'Məzmun yoxlanıldı');
  assert.equal(statusAuditCount, 2);
  await rejected(() => Service.updateModerationReport(reportId, actor, { status: 'dismissed' }),
    'MODERATION_STATUS_CONFLICT');
  restoreMocks();
}

async function testPermissionGate() {
  mockMethod(prisma.user, 'findUnique', async () => ({
    role: 'admin', is_active: true, deleted_at: null,
    admin: { permissions: ['view_moderation'] },
  }));
  async function check(permission: 'view_moderation' | 'manage_moderation') {
    const middleware = requirePermission(permission);
    return new Promise<any>((resolve) => {
      middleware({ user: { sub: 'admin-id', role: 'admin' } } as any, {} as any, resolve);
    });
  }
  assert.equal(await check('view_moderation'), undefined);
  assert.equal((await check('manage_moderation')).code, 'PERMISSION_DENIED');
  restoreMocks();
}

function testPayloadValidation() {
  assert.equal(Schema.CreateReportSchema.safeParse({
    target_type: 'order', target_id: orderId, reason: 'privacy', details: 'x'.repeat(1001),
  }).success, false);
  assert.equal(Schema.CreateReportSchema.safeParse({
    target_type: 'order', target_id: orderId, reason: 'privacy', reporter_user_id: workerUserId,
  }).success, false);
  assert.equal(Schema.UpdateReportSchema.safeParse({ status: 'open' }).success, false);
  assert.equal(Schema.ListReportsSchema.safeParse({ status: 'unverified' }).success, false);
}

async function main() {
  try {
    await testTargetVisibility();
    await testPersistenceAndAuthorizedAdminNotification();
    await testAdminListAndTransitions();
    await testPermissionGate();
    testPayloadValidation();
    console.log('moderation-regression: OK');
  } finally {
    restoreMocks();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
