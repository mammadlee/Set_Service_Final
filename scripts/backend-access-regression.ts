const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const { prisma } = require('../src/lib/prisma') as typeof import('../src/lib/prisma');
const {
  NotificationListQuerySchema,
} = require('../src/modules/notifications/notifications.schema') as typeof import('../src/modules/notifications/notifications.schema');
const {
  CompanyListQuerySchema,
  CompanyRejectSchema,
  CompanyUpdateSchema,
} = require('../src/modules/companies/companies.router') as typeof import('../src/modules/companies/companies.router');
const CompaniesService = require('../src/modules/companies/companies.service') as typeof import('../src/modules/companies/companies.service');
const NotificationsService = require('../src/modules/notifications/notifications.service') as typeof import('../src/modules/notifications/notifications.service');
const ReportsService = require('../src/modules/reports/reports.service') as typeof import('../src/modules/reports/reports.service');

type AsyncMethod = (...args: any[]) => Promise<any>;

async function withPrismaMethod<T>(
  target: Record<string, unknown>,
  method: string,
  replacement: AsyncMethod,
  operation: () => Promise<T>,
): Promise<T> {
  const original = target[method];
  target[method] = replacement;
  try {
    return await operation();
  } finally {
    target[method] = original;
  }
}

async function testNotificationPaginationValidationAndStableSort(): Promise<void> {
  assert.equal(NotificationListQuerySchema.safeParse({ page: '1', limit: '100' }).success, true);
  for (const query of [
    { page: '0' },
    { page: 'NaN' },
    { page: 'Infinity' },
    { limit: '0' },
    { limit: '101' },
    { limit: 'Infinity' },
    { unread_only: 'yes' },
    { unknown: 'field' },
  ]) {
    assert.equal(NotificationListQuerySchema.safeParse(query).success, false);
  }

  let findManyQuery: any;
  await withPrismaMethod(
    prisma.notification as unknown as Record<string, unknown>,
    'count',
    async () => 1,
    async () => withPrismaMethod(
      prisma.notification as unknown as Record<string, unknown>,
      'findMany',
      async (query: any) => {
        findManyQuery = query;
        return [{ id: 'notification-1' }];
      },
      async () => withPrismaMethod(
        prisma as unknown as Record<string, unknown>,
        '$transaction',
        async (operations: Promise<unknown>[]) => Promise.all(operations),
        async () => {
          const result = await NotificationsService.listNotifications(
            'user-1',
            NotificationListQuerySchema.parse({ page: '2', limit: '10', unread_only: 'true' }),
          );
          assert.equal(result.meta.page, 2);
          assert.equal(result.meta.limit, 10);
        },
      ),
    ),
  );

  assert.deepEqual(findManyQuery.orderBy, [
    { created_at: 'desc' },
    { id: 'desc' },
  ]);
  assert.equal(findManyQuery.where.recipient_id, 'user-1');
  assert.equal(findManyQuery.where.read_at, null);
  assert.equal(findManyQuery.skip, 10);
  assert.equal(findManyQuery.take, 10);
}

async function testCompanyInputAllowlistAndPagination(): Promise<void> {
  assert.equal(
    CompanyUpdateSchema.safeParse({
      name: 'Updated Company',
      email: 'operations@example.invalid',
    }).success,
    true,
  );

  for (const payload of [
    { role: 'admin' },
    { status: 'approved' },
    { company_id: 'attacker-company' },
    { docs_url: 'https://attacker.invalid/license.pdf' },
    { documents: [{ type: 'license', url: 'https://attacker.invalid/license.pdf' }] },
    { documents: [{ type: 'license', url: 'https://example.invalid/a.pdf', internal: true }] },
    { unknown: 'field' },
  ]) {
    assert.equal(
      CompanyUpdateSchema.safeParse(payload).success,
      false,
      `Company profile update must reject unknown or privileged fields: ${JSON.stringify(payload)}`,
    );
  }

  assert.equal(CompanyRejectSchema.safeParse({ reason: 'Invalid evidence' }).success, true);
  assert.equal(
    CompanyRejectSchema.safeParse({ reason: 'Invalid evidence', status: 'rejected' }).success,
    false,
  );

  assert.deepEqual(
    CompanyListQuerySchema.parse({ page: '2', limit: '10', sort: 'asc' }),
    { page: 2, limit: 10, sort: 'asc' },
  );
  for (const query of [
    { page: '0' },
    { page: 'NaN' },
    { page: 'Infinity' },
    { limit: '0' },
    { limit: '101' },
    { status: 'super-approved' },
    { unknown: 'field' },
  ]) {
    assert.equal(CompanyListQuerySchema.safeParse(query).success, false);
  }

  let findManyQuery: any;
  await withPrismaMethod(
    prisma.company as unknown as Record<string, unknown>,
    'count',
    async () => 1,
    async () => withPrismaMethod(
      prisma.company as unknown as Record<string, unknown>,
      'findMany',
      async (query: any) => {
        findManyQuery = query;
        return [];
      },
      async () => withPrismaMethod(
        prisma as unknown as Record<string, unknown>,
        '$transaction',
        async (operations: Promise<unknown>[]) => Promise.all(operations),
        async () => {
          await CompaniesService.listCompanies(
            CompanyListQuerySchema.parse({ page: '2', limit: '10', sort: 'asc' }),
          );
        },
      ),
    ),
  );

  assert.deepEqual(findManyQuery.orderBy, [
    { created_at: 'asc' },
    { id: 'asc' },
  ]);
  assert.equal(findManyQuery.skip, 10);
  assert.equal(findManyQuery.take, 10);
}

async function testCompanyWorkerReportBolaIsBlockedBeforeMetadataLookup(): Promise<void> {
  const companyId = '40000000-0000-4000-8000-000000000001';
  const workerId = '10000000-0000-4000-8000-000000000001';
  let relationshipQuery: any;

  await withPrismaMethod(
    prisma.company as unknown as Record<string, unknown>,
    'findFirst',
    async () => ({ id: companyId }),
    async () => withPrismaMethod(
      prisma.assignment as unknown as Record<string, unknown>,
      'findFirst',
      async (query: any) => {
        relationshipQuery = query;
        return null;
      },
      async () => {
        await assert.rejects(
          () => ReportsService.getCompanyReportSummary(
            'company-user-1',
            { worker_id: workerId },
          ),
          (error: any) =>
            error?.statusCode === 404 &&
            error?.code === 'REPORT_WORKER_NOT_FOUND',
        );
      },
    ),
  );

  assert.equal(relationshipQuery.where.worker_id, workerId);
  assert.equal(relationshipQuery.where.order.company_id, companyId);
  assert.equal(relationshipQuery.where.deleted_at, null);
  assert.equal(relationshipQuery.where.order.deleted_at, null);
}

async function testNotificationOwnershipDoesNotLeakExistence(): Promise<void> {
  await withPrismaMethod(
    prisma.notification as unknown as Record<string, unknown>,
    'updateMany',
    async () => ({ count: 0 }),
    async () => withPrismaMethod(
      prisma.notification as unknown as Record<string, unknown>,
      'findFirst',
      async () => null,
      async () => {
        await assert.rejects(
          () => NotificationsService.markNotificationRead(
            'attacker-user',
            '50000000-0000-4000-8000-000000000001',
          ),
          (error: any) =>
            error?.statusCode === 404 &&
            error?.code === 'NOTIFICATION_NOT_FOUND',
        );
      },
    ),
  );
}

async function main(): Promise<void> {
  await testNotificationPaginationValidationAndStableSort();
  await testCompanyInputAllowlistAndPagination();
  await testCompanyWorkerReportBolaIsBlockedBeforeMetadataLookup();
  await testNotificationOwnershipDoesNotLeakExistence();
  console.log('backend-access-regression: OK');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
