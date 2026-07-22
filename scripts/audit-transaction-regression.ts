const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';

const { prisma } = require('../src/lib/prisma') as typeof import('../src/lib/prisma');
const AdminService = require('../src/modules/admins/admins.service') as typeof import('../src/modules/admins/admins.service');
const AssignmentsRepository = require('../src/modules/assignments/assignments.repository') as typeof import('../src/modules/assignments/assignments.repository');
const CompaniesService = require('../src/modules/companies/companies.service') as typeof import('../src/modules/companies/companies.service');
const WorkersService = require('../src/modules/workers/workers.service') as typeof import('../src/modules/workers/workers.service');

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

async function expectAppError(
  operation: () => Promise<unknown>,
  statusCode: number,
  code: string,
): Promise<void> {
  await assert.rejects(
    operation,
    (error: any) => error?.statusCode === statusCode && error?.code === code,
  );
}

function adminRecord(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-16T00:00:00.000Z');
  return {
    id: '10000000-0000-4000-8000-000000000001',
    user_id: '20000000-0000-4000-8000-000000000001',
    permissions: ['manage_workers'],
    created_at: now,
    updated_at: now,
    user: {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Audit Admin',
      email: 'audit-admin@setservice.az',
      phone: 'admin:audit-admin@setservice.az',
      role: 'admin',
      is_active: true,
      deleted_at: null,
    },
    ...overrides,
  };
}

async function testAdminCreateAndAuditShareTransaction(): Promise<void> {
  const input = {
    name: 'Audit Admin',
    email: 'AUDIT-ADMIN@setservice.az',
    password: 'SafePassword-123!',
    is_active: true,
    permissions: ['manage_workers'] as const,
  };
  let transactionCount = 0;
  let createQuery: any;
  let auditQuery: any;
  const created = adminRecord();
  const tx = {
    admin: {
      create: async (query: any) => {
        createQuery = query;
        return created;
      },
    },
    auditLog: {
      create: async (query: any) => {
        auditQuery = query;
        return { id: 'audit-1' };
      },
    },
  };

  const result = await withMethod(
    prisma as unknown as Record<string, unknown>,
    '$transaction',
    async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactionCount += 1;
      return callback(tx);
    },
    () => AdminService.createAdmin(input as any, {
      sub: '30000000-0000-4000-8000-000000000001',
      role: 'super_admin',
    }),
  );

  assert.equal(transactionCount, 1);
  assert.equal(result.id, created.id);
  assert.equal(createQuery.data.user.create.email, 'audit-admin@setservice.az');
  assert.notEqual(createQuery.data.user.create.password_hash, input.password);
  assert.equal(auditQuery.data.entity_type, 'admin');
  assert.equal(auditQuery.data.entity_id, created.id);
  assert.equal(auditQuery.data.metadata.event, 'admin_created');
  assert.equal(auditQuery.data.metadata.target_user_id, created.user_id);
  assert.equal(JSON.stringify(auditQuery).includes(input.password), false);
  assert.equal(JSON.stringify(auditQuery).includes(createQuery.data.user.create.password_hash), false);
}

async function testAdminUpdateAndDeactivateAuditShareTransaction(): Promise<void> {
  const actor = {
    sub: '30000000-0000-4000-8000-000000000001',
    role: 'super_admin',
  };
  const existing = adminRecord();
  const auditQueries: any[] = [];
  const sessionRevocations: Array<{ source: string; query: any }> = [];
  let updateQuery: any;
  let nextRecord = {
    ...existing,
    user: { ...existing.user, name: 'Renamed Admin' },
  };
  const tx = {
    admin: {
      update: async (query: any) => {
        updateQuery = query;
        return nextRecord;
      },
    },
    refreshToken: {
      updateMany: async (query: any) => {
        sessionRevocations.push({ source: 'refreshToken', query });
        return { count: 1 };
      },
    },
    deviceToken: {
      updateMany: async (query: any) => {
        sessionRevocations.push({ source: 'deviceToken', query });
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (query: any) => {
        auditQueries.push(query);
        return { id: `audit-${auditQueries.length}` };
      },
    },
  };

  await withMethod(
    prisma.admin as unknown as Record<string, unknown>,
    'findUnique',
    async () => existing,
    () => withMethod(
      prisma as unknown as Record<string, unknown>,
      '$transaction',
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      () => AdminService.updateAdmin(existing.id, actor, { name: 'Renamed Admin' }),
    ),
  );

  assert.equal(updateQuery.data.user.update.name, 'Renamed Admin');
  assert.equal(auditQueries[0].data.metadata.event, 'admin_updated');
  assert.deepEqual(auditQueries[0].data.metadata.changed_fields, ['name']);
  assert.equal(sessionRevocations.length, 0);

  nextRecord = {
    ...existing,
    user: { ...existing.user, is_active: false },
  };
  await withMethod(
    prisma.admin as unknown as Record<string, unknown>,
    'findUnique',
    async () => existing,
    () => withMethod(
      prisma as unknown as Record<string, unknown>,
      '$transaction',
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      () => AdminService.deactivateAdmin(existing.id, actor),
    ),
  );

  assert.equal(auditQueries[1].data.metadata.event, 'admin_deactivated');
  assert.deepEqual(auditQueries[1].data.metadata.changed_fields, ['is_active']);
  assert.equal(auditQueries[1].data.metadata.sessions_revoked, true);
  assert.deepEqual(sessionRevocations.map((item) => item.source), ['refreshToken', 'deviceToken']);
  assert.equal(sessionRevocations[0].query.where.user_id, existing.user_id);
}

async function testAssignmentCancellationRejectsOpenAttendance(): Promise<void> {
  let assignmentUpdates = 0;
  let auditWrites = 0;
  const tx = {
    $queryRaw: async () => [{ id: 'assignment-1' }],
    assignment: {
      findFirst: async () => ({
        id: 'assignment-1',
        status: 'accepted',
      }),
      updateMany: async () => {
        assignmentUpdates += 1;
        return { count: 1 };
      },
    },
    attendanceLog: {
      findFirst: async () => ({ id: 'attendance-1' }),
    },
    auditLog: {
      create: async () => {
        auditWrites += 1;
        return { id: 'audit-1' };
      },
    },
  };

  const result = await withMethod(
    prisma as unknown as Record<string, unknown>,
    '$transaction',
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    () => AssignmentsRepository.cancelAssignmentWithAudit({
      assignmentId: 'assignment-1',
      actorId: 'admin-user-1',
      actorRole: 'admin',
      reason: 'Operational cancellation',
    }),
  );

  assert.deepEqual(result, {
    kind: 'open_attendance',
    attendanceId: 'attendance-1',
  });
  assert.equal(assignmentUpdates, 0, 'open attendance must block the assignment status update');
  assert.equal(auditWrites, 0, 'a rejected cancellation must not append a successful status audit');
}

async function testApprovalRejectionsRequirePendingState(): Promise<void> {
  let transactions = 0;
  const countTransaction = async () => {
    transactions += 1;
    throw new Error('transaction must not start for an invalid lifecycle state');
  };

  await withMethod(
    prisma.worker as unknown as Record<string, unknown>,
    'findFirst',
    async () => ({
      id: 'worker-1',
      user_id: 'worker-user-1',
      status: 'approved',
      user: {},
      positions: [],
    }),
    () => withMethod(
      prisma as unknown as Record<string, unknown>,
      '$transaction',
      countTransaction,
      () => expectAppError(
        () => WorkersService.rejectWorker(
          'worker-1',
          'Invalid registration evidence',
          { sub: 'admin-user-1', role: 'admin' },
        ),
        409,
        'WORKER_REJECTION_NOT_PENDING',
      ),
    ),
  );

  await withMethod(
    prisma.company as unknown as Record<string, unknown>,
    'findFirst',
    async () => ({
      id: 'company-1',
      user_id: 'company-user-1',
      status: 'suspended',
      user: {},
    }),
    () => withMethod(
      prisma as unknown as Record<string, unknown>,
      '$transaction',
      countTransaction,
      () => expectAppError(
        () => CompaniesService.rejectCompany(
          'company-1',
          'Invalid registration evidence',
          { sub: 'admin-user-1', role: 'admin' },
        ),
        409,
        'COMPANY_REJECTION_NOT_PENDING',
      ),
    ),
  );

  assert.equal(transactions, 0);
}

async function testApprovalRejectionsDetectConcurrentStateChanges(): Promise<void> {
  const actor = { sub: 'admin-user-1', role: 'admin' };
  const pendingWorker = {
    id: 'worker-1',
    user_id: 'worker-user-1',
    status: 'pending_approval',
    user: {},
    positions: [],
  };
  const workerTx = {
    worker: {
      updateMany: async (query: any) => {
        assert.equal(query.where.status, 'pending_approval');
        return { count: 0 };
      },
      findFirst: async () => ({ status: 'approved' }),
    },
  };

  await withMethod(
    prisma.worker as unknown as Record<string, unknown>,
    'findFirst',
    async () => pendingWorker,
    () => withMethod(
      prisma as unknown as Record<string, unknown>,
      '$transaction',
      async (callback: (client: typeof workerTx) => Promise<unknown>) => callback(workerTx),
      () => expectAppError(
        () => WorkersService.rejectWorker('worker-1', 'Evidence mismatch', actor),
        409,
        'WORKER_REJECTION_STATE_CHANGED',
      ),
    ),
  );

  const pendingCompany = {
    id: 'company-1',
    user_id: 'company-user-1',
    status: 'pending_approval',
    user: {},
  };
  const companyTx = {
    company: {
      updateMany: async (query: any) => {
        assert.equal(query.where.status, 'pending_approval');
        return { count: 0 };
      },
      findFirst: async () => ({ status: 'approved' }),
    },
  };

  await withMethod(
    prisma.company as unknown as Record<string, unknown>,
    'findFirst',
    async () => pendingCompany,
    () => withMethod(
      prisma as unknown as Record<string, unknown>,
      '$transaction',
      async (callback: (client: typeof companyTx) => Promise<unknown>) => callback(companyTx),
      () => expectAppError(
        () => CompaniesService.rejectCompany('company-1', 'Evidence mismatch', actor),
        409,
        'COMPANY_REJECTION_STATE_CHANGED',
      ),
    ),
  );
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function functionSection(source: string, functionName: string): string {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} must exist`);
  const nextExport = source.indexOf('\nexport ', start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

function assertTransactionContainsAudit(
  source: string,
  functionName: string,
  transactionMarker = 'prisma.$transaction',
): void {
  const section = functionSection(source, functionName);
  assert.ok(section.includes(transactionMarker), `${functionName} must use a transaction`);
  assert.ok(section.includes('tx.auditLog.create'), `${functionName} must append its audit in that transaction`);
}

function walkTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry: any) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkTypeScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.ts') ? [absolute] : [];
  });
}

function testExistingMutationAuditBoundariesAndAppendOnlyInvariant(): void {
  const companies = read('src/modules/companies/companies.service.ts');
  const workers = read('src/modules/workers/workers.service.ts');
  const orders = read('src/modules/orders/orders.repository.ts');
  const attendance = read('src/modules/attendance/attendance.repository.ts');
  const assignments = read('src/modules/assignments/assignments.repository.ts');
  const assignmentService = read('src/modules/assignments/assignments.service.ts');
  const attendanceRouter = read('src/modules/attendance/attendance.router.ts');
  const ordersRouter = read('src/modules/orders/orders.router.ts');
  const adminsRouter = read('src/modules/admins/admins.router.ts');

  assertTransactionContainsAudit(companies, 'approveCompany');
  assertTransactionContainsAudit(companies, 'rejectCompany');
  assertTransactionContainsAudit(workers, 'approveWorker');
  assertTransactionContainsAudit(workers, 'rejectWorker');
  assert.ok(workers.includes("event: 'document_download_authorized'"));
  assertTransactionContainsAudit(orders, 'cancelCompanyOrderWithAudit');
  assertTransactionContainsAudit(attendance, 'createCheckInWithAudit');
  assertTransactionContainsAudit(attendance, 'checkOutWithAudit');
  assertTransactionContainsAudit(assignments, 'cancelAssignmentWithAudit');

  const createCheckIn = functionSection(attendance, 'createCheckInWithAudit');
  assert.ok(
    createCheckIn.includes('FOR UPDATE'),
    'check-in and cancellation must serialize on the assignment row',
  );

  const cancelAssignment = functionSection(assignments, 'cancelAssignmentWithAudit');
  assert.ok(cancelAssignment.includes('FOR UPDATE'));
  assert.ok(cancelAssignment.includes('tx.attendanceLog.findFirst'));
  assert.ok(cancelAssignment.includes('checkout_time: null'));
  assert.ok(cancelAssignment.includes("kind: 'open_attendance'"));
  assert.ok(cancelAssignment.includes('status: current.status'));
  assert.ok(assignmentService.includes("'ASSIGNMENT_HAS_OPEN_ATTENDANCE'"));

  for (const [source, functionName] of [
    [companies, 'rejectCompany'],
    [workers, 'rejectWorker'],
  ] as const) {
    const section = functionSection(source, functionName);
    assert.ok(section.includes("status !== 'pending_approval'"));
    assert.ok(section.includes('updateMany'));
    assert.ok(section.includes("status: 'pending_approval'"));
    assert.ok(section.includes('transition.count !== 1'));
  }

  assert.match(attendanceRouter, /'\/check-in',[\s\S]*?requireRole\('worker'\)/);
  assert.match(attendanceRouter, /'\/check-out',[\s\S]*?requireRole\('worker'\)/);
  assert.equal(/override/i.test(ordersRouter), false, 'No unaudited admin order override route may be exposed');
  assert.match(adminsRouter, /router\.delete\('\/:id'[\s\S]*?deactivateAdmin/);

  const srcRoot = path.join(__dirname, '..', 'src');
  const forbiddenAuditMutation =
    /\bauditLog\s*\.\s*(?:update|updateMany|delete|deleteMany|upsert)\s*\(/;
  for (const file of walkTypeScriptFiles(srcRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(
      forbiddenAuditMutation.test(source),
      false,
      `Audit log must remain append-only: ${path.relative(srcRoot, file)}`,
    );
  }
}

async function main(): Promise<void> {
  await testAdminCreateAndAuditShareTransaction();
  await testAdminUpdateAndDeactivateAuditShareTransaction();
  await testAssignmentCancellationRejectsOpenAttendance();
  await testApprovalRejectionsRequirePendingState();
  await testApprovalRejectionsDetectConcurrentStateChanges();
  testExistingMutationAuditBoundariesAndAppendOnlyInvariant();
  console.log('audit-transaction-regression: OK');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
