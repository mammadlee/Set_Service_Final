import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.PUSH_NOTIFICATIONS_ENABLED = 'false';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/worker_approval_regression';

const { prisma } = require('../src/lib/prisma') as typeof import('../src/lib/prisma');
const WorkersService = require('../src/modules/workers/workers.service') as typeof import('../src/modules/workers/workers.service');
const { ApproveWorkerSchema } = require('../src/modules/workers/workers.router') as typeof import('../src/modules/workers/workers.router');

type AsyncMethod = (...args: any[]) => Promise<any>;

async function withMethod<T>(
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

const now = new Date('2026-10-06T08:00:00.000Z');

function workerRecord(status = 'pending_approval', workerClass: 'A' | 'B' | 'C' | null = null) {
  const suffix = status === 'pending_approval'
    ? '000000000001'
    : status === 'approved'
      ? '000000000002'
      : '000000000003';
  const id = `10000000-0000-4000-8000-${suffix}`;
  return {
    id,
    user_id: `20000000-0000-4000-8000-${suffix}`,
    position: 'Ofisiant',
    profile_photo_url: null,
    skills: [],
    languages: [],
    documents: [
      {
        type: 'health_certificate',
        name: 'health.pdf',
        key: `workers/${id}/documents/health_certificate/health.pdf`,
        mime_type: 'application/pdf',
        size_bytes: 100,
        uploaded_at: now.toISOString(),
        status: 'ready',
        scan_status: 'clean',
      },
      {
        type: 'criminal_record',
        name: 'criminal.pdf',
        key: `workers/${id}/documents/criminal_record/criminal.pdf`,
        mime_type: 'application/pdf',
        size_bytes: 100,
        uploaded_at: now.toISOString(),
        status: 'ready',
        scan_status: 'clean',
      },
    ],
    work_history_summary: null,
    work_history: [],
    gender: null,
    whatsapp_available: false,
    status,
    reject_reason: null,
    approved_at: status === 'approved' ? now : null,
    approved_by_id: status === 'approved' ? '30000000-0000-4000-8000-000000000001' : null,
    rejected_at: null,
    rejected_by_id: null,
    suspended_at: null,
    worker_class: workerClass,
    is_foc_training: false,
    foc_training_note: null,
    foc_training_updated_at: null,
    foc_training_updated_by_id: null,
    rating_avg: 0,
    rating_count: 0,
    availability: true,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    user: {
      name: 'Approval Regression Worker',
      phone: '+994501234567',
      email: null,
      email_verified_at: null,
      pending_email: null,
      password_set_at: now,
      is_active: true,
      deleted_at: null,
      otp_codes: [{ id: '40000000-0000-4000-8000-000000000001' }],
    },
    positions: [],
  };
}

async function approve(
  workerClass?: 'A' | 'B' | 'C' | null,
  documentsOverride?: unknown[],
  registrationOtpCodesOverride?: unknown[],
) {
  const pending = workerRecord();
  if (documentsOverride !== undefined) pending.documents = documentsOverride as typeof pending.documents;
  if (registrationOtpCodesOverride !== undefined) {
    pending.user.otp_codes = registrationOtpCodesOverride as typeof pending.user.otp_codes;
  }
  let updateQuery: any;
  let auditQuery: any;
  let notificationQuery: any;
  let persisted: any = pending;
  const tx = {
    worker: {
      updateMany: async (query: any) => {
        updateQuery = query;
        assert.equal(query.where.id, pending.id);
        assert.equal(query.where.status, 'pending_approval');
        persisted = { ...pending, ...query.data, updated_at: now };
        return { count: 1 };
      },
      findUniqueOrThrow: async () => persisted,
      findFirst: async () => persisted,
    },
    auditLog: {
      create: async (query: any) => {
        auditQuery = query;
        return { id: 'audit-1' };
      },
    },
    notification: {
      create: async (query: any) => {
        notificationQuery = query;
        return { id: 'notification-1' };
      },
    },
  };

  const result = await withMethod(
    prisma.worker as unknown as Record<string, unknown>,
    'findFirst',
    async () => pending,
    () => withMethod(
      prisma as unknown as Record<string, unknown>,
      '$transaction',
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      () => withMethod(
        prisma.deviceToken as unknown as Record<string, unknown>,
        'findMany',
        async () => [],
        () => WorkersService.approveWorker(
          pending.id,
          { sub: '30000000-0000-4000-8000-000000000001', role: 'admin' },
          workerClass,
        ),
      ),
    ),
  );

  assert.equal(result.status, 'approved');
  assert.equal(updateQuery.data.status, 'approved');
  assert.equal(updateQuery.data.reject_reason, null);
  assert.equal(updateQuery.data.rejected_at, null);
  assert.equal(updateQuery.data.rejected_by_id, null);
  assert.ok(updateQuery.data.approved_at instanceof Date);
  assert.equal(updateQuery.data.approved_by_id, '30000000-0000-4000-8000-000000000001');
  assert.equal(auditQuery.data.metadata.new_status, 'approved');
  assert.equal(notificationQuery.data.type, 'worker_approved');
  return { result, updateQuery };
}

async function testApprovalWithOptionalClass(): Promise<void> {
  const withoutClass = await approve();
  assert.equal(
    Object.prototype.hasOwnProperty.call(withoutClass.updateQuery.data, 'worker_class'),
    false,
    'Omitted worker_class must not block approval or overwrite an existing value.',
  );
  assert.equal(withoutClass.result.worker_class, null);

  const withClass = await approve('B');
  assert.equal(withClass.updateQuery.data.worker_class, 'B');
  assert.equal(withClass.result.worker_class, 'B');

  const assignLater = await approve(null);
  assert.equal(assignLater.updateQuery.data.worker_class, null);
  assert.equal(assignLater.result.status, 'approved');
}

async function testApprovalDoesNotRequireDocuments(): Promise<void> {
  const withoutDocuments = await approve(undefined, []);
  assert.equal(withoutDocuments.result.status, 'approved');
}

async function testApprovalDoesNotDependOnRetainedOtpHistory(): Promise<void> {
  const afterOtpRetention = await approve(undefined, undefined, []);
  assert.equal(afterOtpRetention.result.status, 'approved');
}

async function testIncompleteProfileReturnsExactMissingRequirements(): Promise<void> {
  const incomplete: any = workerRecord();
  incomplete.position = null;
  incomplete.user.password_set_at = null;
  incomplete.user.is_active = false;
  incomplete.user.name = '   ';
  incomplete.user.phone = '   ';

  await withMethod(
    prisma.worker as unknown as Record<string, unknown>,
    'findFirst',
    async () => incomplete,
    () => assert.rejects(
      () => WorkersService.approveWorker(
        incomplete.id,
        { sub: '30000000-0000-4000-8000-000000000001', role: 'admin' },
      ),
      (error: any) => error?.statusCode === 409
        && error?.code === 'APPROVAL_PREREQUISITES_MISSING'
        && error?.message === 'İşçi qeydiyyatının təsdiq üçün tələb olunan məlumatları tamamlanmayıb.'
        && error?.details?.status === 'pending_approval'
        && JSON.stringify(error?.details?.missing) === JSON.stringify([
          'password_set',
          'active_account',
          'full_name',
          'phone',
          'position',
        ]),
    ),
  );
}

async function testOnlyPendingWorkersCanBeApproved(): Promise<void> {
  for (const status of ['pending_otp', 'approved', 'rejected'] as const) {
    const worker = workerRecord(status);
    await withMethod(
      prisma.worker as unknown as Record<string, unknown>,
      'findFirst',
      async () => worker,
      () => assert.rejects(
        () => WorkersService.approveWorker(
          worker.id,
          { sub: '30000000-0000-4000-8000-000000000001', role: 'admin' },
        ),
        (error: any) => error?.statusCode === 409
          && error?.code === 'WORKER_APPROVAL_NOT_PENDING'
          && error?.details?.status === status,
      ),
    );
  }
}

async function testPendingListUsesExactDatabaseFilter(): Promise<void> {
  const records = [workerRecord('pending_approval'), workerRecord('approved'), workerRecord('rejected')];
  let countWhere: any;
  let listWhere: any;

  const result = await withMethod(
    prisma.worker as unknown as Record<string, unknown>,
    'count',
    async ({ where }: any) => {
      countWhere = where;
      return records.filter((worker) => worker.status === where.status).length;
    },
    () => withMethod(
      prisma.worker as unknown as Record<string, unknown>,
      'findMany',
      async ({ where }: any) => {
        listWhere = where;
        return records.filter((worker) => worker.status === where.status);
      },
      () => withMethod(
        prisma as unknown as Record<string, unknown>,
        '$transaction',
        async (queries: Promise<unknown>[]) => Promise.all(queries),
        () => WorkersService.listWorkers({ status: 'pending_approval' }),
      ),
    ),
  );

  assert.equal(countWhere.status, 'pending_approval');
  assert.equal(listWhere.status, 'pending_approval');
  assert.equal(result.meta.total, 1);
  assert.deepEqual(result.data.map((worker) => worker.status), ['pending_approval']);
}

async function testClassRemainsEditableAfterApproval(): Promise<void> {
  const approved = workerRecord('approved');
  let updateQuery: any;
  const tx = {
    worker: {
      update: async (query: any) => {
        updateQuery = query;
        return { ...approved, worker_class: query.data.worker_class };
      },
    },
    auditLog: { create: async () => ({ id: 'audit-class-1' }) },
  };

  const result = await withMethod(
    prisma.worker as unknown as Record<string, unknown>,
    'findFirst',
    async () => approved,
    () => withMethod(
      prisma as unknown as Record<string, unknown>,
      '$transaction',
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      () => WorkersService.updateWorkerClass(
        approved.id,
        'C',
        { sub: '30000000-0000-4000-8000-000000000001', role: 'admin' },
      ),
    ),
  );

  assert.equal(updateQuery.data.worker_class, 'C');
  assert.equal(result.worker_class, 'C');
  assert.equal(result.status, 'approved');
}

function testStrictApprovalPayload(): void {
  assert.equal(ApproveWorkerSchema.safeParse(undefined).success, true);
  assert.equal(ApproveWorkerSchema.safeParse({}).success, true);
  assert.equal(ApproveWorkerSchema.safeParse({ worker_class: null }).success, true);
  assert.equal(ApproveWorkerSchema.safeParse({ worker_class: 'A' }).success, true);
  assert.equal(ApproveWorkerSchema.safeParse({ worker_class: 'D' }).success, false);
  assert.equal(ApproveWorkerSchema.safeParse({ status: 'approved' }).success, false);
}

async function main(): Promise<void> {
  testStrictApprovalPayload();
  await testApprovalWithOptionalClass();
  await testApprovalDoesNotRequireDocuments();
  await testApprovalDoesNotDependOnRetainedOtpHistory();
  await testIncompleteProfileReturnsExactMissingRequirements();
  await testOnlyPendingWorkersCanBeApproved();
  await testPendingListUsesExactDatabaseFilter();
  await testClassRemainsEditableAfterApproval();
  console.log('worker-approval-regression: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
