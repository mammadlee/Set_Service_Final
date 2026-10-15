import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BulkCreateAssignmentsSchema,
  CreateAssignmentsSchema,
  ListAssignmentsQuerySchema,
} from '../src/modules/assignments/assignments.schema';
import {
  assignmentDurationMinutes,
  assignmentStatusesForScope,
  buildPositionMismatchWarnings,
} from '../src/modules/assignments/assignments.rules';
import { zonedDateOnlyBoundary } from '../src/lib/date-filters';

const orderId = '10000000-0000-4000-8000-000000000001';
const workerId = '20000000-0000-4000-8000-000000000001';
const otherWorkerId = '20000000-0000-4000-8000-000000000002';
const requestedPositionId = '30000000-0000-4000-8000-000000000001';
const registeredPositionId = '30000000-0000-4000-8000-000000000002';
const invalidWorkerId = '20000000-0000-4000-8000-000000000003';
const capacityWorkerId = '20000000-0000-4000-8000-000000000004';
const conflictWorkerId = '20000000-0000-4000-8000-000000000005';

function testCreateContracts(): void {
  assert.equal(CreateAssignmentsSchema.safeParse({ order_id: orderId, worker_ids: [workerId] }).success, true);
  assert.equal(
    CreateAssignmentsSchema.safeParse({ order_id: orderId, worker_ids: [workerId, workerId] }).success,
    true,
    'atomic duplicate detection remains a business-rule error with its established error code',
  );

  const bulk = BulkCreateAssignmentsSchema.parse({
    order_id: orderId,
    assignments: [
      { worker_id: workerId, position_id: requestedPositionId },
      { worker_id: workerId, position_id: requestedPositionId },
      { worker_id: otherWorkerId, position_id: requestedPositionId },
    ],
  });
  assert.equal(bulk.assignments?.length, 3, 'bulk validation preserves repeated rows for per-worker results');
}

function testHistoryFilters(): void {
  const parsed = ListAssignmentsQuerySchema.parse({
    scope: 'history',
    start_date: '2026-10-01',
    end_date: '2026-10-14',
    worker_search: 'Aysel',
  });
  assert.deepEqual(assignmentStatusesForScope(parsed.scope), ['rejected', 'completed', 'cancelled']);
  assert.equal(parsed.start_date?.toISOString(), '2026-09-30T20:00:00.000Z');
  assert.equal(parsed.end_date?.toISOString(), '2026-10-14T19:59:59.999Z');
  assert.equal(
    zonedDateOnlyBoundary('2026-03-08', 'start', 'America/New_York').toISOString(),
    '2026-03-08T05:00:00.000Z',
    'date-only conversion must respect the configured zone before a DST transition',
  );
  assert.equal(
    zonedDateOnlyBoundary('2026-03-08', 'end', 'America/New_York').toISOString(),
    '2026-03-09T03:59:59.999Z',
    'date-only conversion must respect the configured zone after a DST transition',
  );
  assert.equal(
    ListAssignmentsQuerySchema.safeParse({ scope: 'active', status: 'completed' }).success,
    false,
  );
  assert.equal(
    ListAssignmentsQuerySchema.safeParse({ start_date: '2026-10-15', end_date: '2026-10-14' }).success,
    false,
  );
}

function testMismatchWarningsAndDuration(): void {
  const warnings = buildPositionMismatchWarnings(
    [
      { workerId, positionId: requestedPositionId },
      { workerId: otherWorkerId, positionId: requestedPositionId },
    ],
    [
      { id: workerId, positions: [{ position_id: registeredPositionId }] },
      { id: otherWorkerId, positions: [{ position_id: requestedPositionId }] },
    ],
  );
  assert.deepEqual(warnings, [{
    code: 'WORKER_POSITION_MISMATCH',
    message: 'Worker profile position differs from the assigned order position.',
    worker_id: workerId,
    position_id: requestedPositionId,
  }]);

  assert.equal(
    assignmentDurationMinutes(
      new Date('2026-10-14T08:00:00.000Z'),
      new Date('2026-10-14T16:30:00.000Z'),
    ),
    510,
  );
  assert.equal(assignmentDurationMinutes(new Date(), null), null);
}

function assignmentRecord(id: string, requestedWorkerId: string) {
  const now = new Date('2026-10-14T08:00:00.000Z');
  return {
    id,
    order_id: orderId,
    worker_id: requestedWorkerId,
    order_category_item_id: null,
    position_id: requestedPositionId,
    assigned_category: 'Ofisiant',
    status: 'assigned' as const,
    assigned_at: now,
    updated_at: now,
    order_category_item: null,
    position: null,
    attendance_logs: [],
    order: {
      id: orderId,
      title: 'Axşam növbəsi',
      category: 'Ofisiant',
      status: 'published' as const,
      required_count: 5,
      shift_start: now,
      shift_end: new Date('2026-10-14T16:00:00.000Z'),
      location: 'Bakı',
      company_id: '40000000-0000-4000-8000-000000000001',
      deleted_at: null,
      category_items: [],
      company: {
        id: '40000000-0000-4000-8000-000000000001',
        name: 'SET Test',
        status: 'approved' as const,
        user: { id: '50000000-0000-4000-8000-000000000001', name: 'Şirkət', phone: '+994501111111' },
      },
    },
    worker: {
      id: requestedWorkerId,
      status: 'approved' as const,
      availability: true,
      position: 'Barista',
      profile_photo_url: null,
      positions: [{
        position_id: registeredPositionId,
        position: {
          id: registeredPositionId,
          slug: 'barista',
          subdepartment_id: '60000000-0000-4000-8000-000000000001',
          name_az: 'Barista',
          name_en: 'Barista',
          status: 'active' as const,
          subdepartment: {
            id: '60000000-0000-4000-8000-000000000001',
            slug: 'service',
            department_id: '70000000-0000-4000-8000-000000000001',
            name_az: 'Xidmət',
            name_en: 'Service',
            status: 'active' as const,
            department: {
              id: '70000000-0000-4000-8000-000000000001',
              slug: 'hospitality',
              name_az: 'Qonaqpərvərlik',
              name_en: 'Hospitality',
              status: 'active' as const,
            },
          },
        },
      }],
      user: { id: `user-${requestedWorkerId}`, name: `Worker ${requestedWorkerId.slice(-1)}`, phone: '+994502222222' },
    },
  };
}

async function testBulkResultsAndPermission(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/assignment_regression';
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'false';

  const repository = await import('../src/modules/assignments/assignments.repository');
  const { prisma } = await import('../src/lib/prisma');
  (prisma.deviceToken.findMany as unknown) = async () => [];
  let creatorLookupCount = 0;
  (repository.findAssignmentCreators as unknown) = async (ids: string[]) => {
    creatorLookupCount += 1;
    return ids.map((id) => ({
      entity_id: id,
      created_at: new Date(),
      actor: { id: 'admin-user', name: 'Admin User' },
    }));
  };
  (repository.listAssignments as unknown) = async () => ({
    data: [assignmentRecord('assignment-visible', workerId)],
    total: 1,
  });
  (repository.findCompanyByUserId as unknown) = async () => ({
    id: '40000000-0000-4000-8000-000000000001',
    status: 'approved',
    deleted_at: null,
  });
  (repository.createAssignmentsWithSideEffects as unknown) = async (input: {
    assignments: Array<{ workerId: string; positionId?: string }>;
  }) => {
    const requestedWorker = input.assignments[0];
    if (requestedWorker.workerId === invalidWorkerId) {
      return { kind: 'invalid_workers' as const, missingWorkerIds: [invalidWorkerId] };
    }
    if (requestedWorker.workerId === capacityWorkerId) {
      return {
        kind: 'capacity_exceeded' as const,
        requiredCount: 2,
        currentCount: 2,
        requestedCount: 1,
        category: 'Ofisiant',
      };
    }
    if (requestedWorker.workerId === conflictWorkerId) {
      return {
        kind: 'schedule_conflicts' as const,
        conflicts: [{
          worker_id: conflictWorkerId,
          assignment_id: 'conflicting-assignment',
          order_id: 'conflicting-order',
          order_title: 'Başqa növbə',
          shift_start: new Date('2026-10-14T09:00:00.000Z'),
          shift_end: new Date('2026-10-14T12:00:00.000Z'),
        }],
      };
    }
    return {
      kind: 'created' as const,
      assignments: [assignmentRecord(`assignment-${requestedWorker.workerId}`, requestedWorker.workerId)],
      warnings: buildPositionMismatchWarnings([requestedWorker], [{
        id: requestedWorker.workerId,
        positions: [{ position_id: registeredPositionId }],
      }]),
    };
  };

  // Import after replacing the repository exports so the service executes the
  // same orchestration used by the HTTP route without a live PostgreSQL server.
  const service = await import('../src/modules/assignments/assignments.service');
  await assert.rejects(
    () => service.createBulkAssignments('company-user', 'company', {
      order_id: orderId,
      worker_ids: [workerId],
      position_id: requestedPositionId,
    }),
    (error: any) => error.code === 'ROLE_FORBIDDEN',
  );

  const response = await service.createBulkAssignments('admin-user', 'admin', {
    order_id: orderId,
    assignments: [
      { worker_id: workerId, position_id: requestedPositionId },
      { worker_id: otherWorkerId, position_id: requestedPositionId },
      { worker_id: workerId, position_id: requestedPositionId },
      { worker_id: invalidWorkerId, position_id: requestedPositionId },
      { worker_id: capacityWorkerId, position_id: requestedPositionId },
      { worker_id: conflictWorkerId, position_id: requestedPositionId },
    ],
  });

  assert.equal(response.assigned_count, 2, 'valid workers are assigned independently');
  assert.equal(response.failed_count, 4, 'every invalid row returns a result without hiding successes');
  assert.deepEqual(response.results.map((result) => result.status), [
    'assigned', 'assigned', 'failed', 'failed', 'failed', 'failed',
  ]);
  assert.equal(response.results[0].warnings[0]?.code, 'WORKER_POSITION_MISMATCH');
  assert.equal(response.results[2].status === 'failed' && response.results[2].error.code, 'DUPLICATE_WORKER_ID');
  assert.equal(response.results[3].status === 'failed' && response.results[3].error.code, 'WORKERS_NOT_FOUND');
  assert.equal(response.results[4].status === 'failed' && response.results[4].error.code, 'ORDER_CAPACITY_EXCEEDED');
  assert.equal(response.results[5].status === 'failed' && response.results[5].error.code, 'WORKER_SCHEDULE_CONFLICT');

  const filters = ListAssignmentsQuerySchema.parse({});
  creatorLookupCount = 0;
  const adminList = await service.listAssignments('admin-user', 'admin', filters);
  assert.deepEqual(adminList.data[0].assigned_by, { id: 'admin-user', name: 'Admin User' });
  assert.equal(creatorLookupCount, 1, 'admins can load assignment creator identities');

  creatorLookupCount = 0;
  const companyList = await service.listAssignments('company-user', 'company', filters);
  assert.equal(
    Object.hasOwn(companyList.data[0], 'assigned_by'),
    false,
    'company responses must not expose the assigning administrator identity',
  );
  assert.equal(creatorLookupCount, 0, 'company requests must not query assignment creator identities');
}

function testConcurrencyGuards(): void {
  const repositorySource = fs.readFileSync(
    path.resolve('src/modules/assignments/assignments.repository.ts'),
    'utf8',
  );
  const routerSource = fs.readFileSync(
    path.resolve('src/modules/assignments/assignments.router.ts'),
    'utf8',
  );
  assert.match(repositorySource, /FROM "orders"[\s\S]*FOR UPDATE/);
  assert.match(repositorySource, /FROM "workers"[\s\S]*ORDER BY id[\s\S]*FOR UPDATE/);
  assert.match(repositorySource, /currentCount \+ group\.length > requiredCount/);
  assert.match(repositorySource, /shift_start: \{ lt: order\.shift_end \}[\s\S]*shift_end: \{ gt: order\.shift_start \}/);
  assert.match(routerSource, /'\/bulk'[\s\S]*requirePermission\('manage_assignments'\)/);
}

async function main(): Promise<void> {
  testCreateContracts();
  testHistoryFilters();
  testMismatchWarningsAndDuration();
  testConcurrencyGuards();
  await testBulkResultsAndPermission();
  console.log('assignment-management-regression: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
