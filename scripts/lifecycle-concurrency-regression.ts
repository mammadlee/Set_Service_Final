import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../src/lib/errors';
import { prisma } from '../src/lib/prisma';
import * as AssignmentsRepository from '../src/modules/assignments/assignments.repository';
import * as AttendanceRepository from '../src/modules/attendance/attendance.repository';
import * as CompaniesService from '../src/modules/companies/companies.service';
import * as OrdersRepository from '../src/modules/orders/orders.repository';
import * as WorkersService from '../src/modules/workers/workers.service';

const CONFIRM_ENV = 'LIFECYCLE_CONCURRENCY_TEST_CONFIRM';
const RUN_ID = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const trackedUserIds = new Set<string>();
const trackedOrderIds = new Set<string>();
const trackedEntityIds = new Set<string>();
let fixtureCounter = 0;
let scenarioGroups = 0;

type CoreActors = {
  adminUserId: string;
  companyUserId: string;
  companyId: string;
  workerUserId: string;
  workerId: string;
};

type AssignmentFixture = {
  orderId: string;
  assignmentId: string;
  qrTokenId: string;
  qr: AttendanceRepository.AttendanceQrContext;
};

function nextPhone(prefix: string): string {
  fixtureCounter += 1;
  const suffix = String(Date.now() + fixtureCounter).slice(-7);
  return `+994${prefix}${suffix}`;
}

function assertSafeDatabaseUrl(label: string, rawValue: string | undefined): string {
  if (!rawValue) {
    throw new Error(`${label} is required for lifecycle concurrency regression tests.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL.`);
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use the PostgreSQL protocol.`);
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!localHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error(`${label} must target localhost; external databases are forbidden.`);
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!databaseName.toLowerCase().includes('test')) {
    throw new Error(`${label} database name must contain "test".`);
  }
  return databaseName;
}

async function assertSafeRuntime(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Lifecycle concurrency regression tests refuse NODE_ENV=production.');
  }
  if (process.env[CONFIRM_ENV] !== '1') {
    throw new Error(
      `${CONFIRM_ENV}=1 is required because this suite creates and deletes isolated fixtures.`,
    );
  }

  const expectedDatabase = assertSafeDatabaseUrl('DATABASE_URL', process.env.DATABASE_URL);
  if (process.env.DIRECT_URL) {
    const directDatabase = assertSafeDatabaseUrl('DIRECT_URL', process.env.DIRECT_URL);
    if (directDatabase !== expectedDatabase) {
      throw new Error('DATABASE_URL and DIRECT_URL must target the same local test database.');
    }
  }

  const rows = await prisma.$queryRaw<Array<{ database_name: string }>>`
    SELECT current_database() AS database_name
  `;
  const actualDatabase = rows[0]?.database_name ?? '';
  if (
    actualDatabase !== expectedDatabase
    || !actualDatabase.toLowerCase().includes('test')
  ) {
    throw new Error(
      `Connected database "${actualDatabase}" does not match the guarded local test target.`,
    );
  }
}

async function createCoreActors(): Promise<CoreActors> {
  const companyUser = await prisma.user.create({
    data: {
      phone: nextPhone('50'),
      email: `lifecycle-company-${RUN_ID}@example.test`,
      role: 'company',
      name: `Lifecycle company ${RUN_ID}`,
      company: {
        create: {
          name: `Lifecycle company ${RUN_ID}`,
          status: 'approved',
          approved_at: new Date(),
        },
      },
    },
    include: { company: true },
  });
  trackedUserIds.add(companyUser.id);
  assert.ok(companyUser.company);
  const company = companyUser.company;
  trackedEntityIds.add(company.id);

  const workerUser = await prisma.user.create({
    data: {
      phone: nextPhone('51'),
      email: `lifecycle-worker-${RUN_ID}@example.test`,
      role: 'worker',
      name: `Lifecycle worker ${RUN_ID}`,
      worker: {
        create: {
          position: 'Concurrency tester',
          status: 'approved',
          approved_at: new Date(),
        },
      },
    },
    include: { worker: true },
  });
  trackedUserIds.add(workerUser.id);
  assert.ok(workerUser.worker);
  const worker = workerUser.worker;
  trackedEntityIds.add(worker.id);

  const adminUser = await prisma.user.create({
    data: {
      phone: nextPhone('52'),
      email: `lifecycle-admin-${RUN_ID}@example.test`,
      role: 'super_admin',
      name: `Lifecycle admin ${RUN_ID}`,
    },
  });
  trackedUserIds.add(adminUser.id);

  return {
    adminUserId: adminUser.id,
    companyUserId: companyUser.id,
    companyId: company.id,
    workerUserId: workerUser.id,
    workerId: worker.id,
  };
}

async function createAcceptedAssignment(
  actors: CoreActors,
  label: string,
): Promise<AssignmentFixture> {
  const shiftStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const order = await prisma.order.create({
    data: {
      company_id: actors.companyId,
      title: `${label} ${RUN_ID}`,
      description: `Lifecycle concurrency fixture ${RUN_ID}`,
      category: 'Concurrency tester',
      shift_start: shiftStart,
      shift_end: new Date(shiftStart.getTime() + 8 * 60 * 60 * 1000),
      required_count: 1,
      required_skills: ['concurrency'],
      location: 'Local regression venue',
      notes: `fixture:${RUN_ID}`,
      status: 'assigned',
      version: 1,
    },
  });
  trackedOrderIds.add(order.id);
  trackedEntityIds.add(order.id);

  const assignment = await prisma.assignment.create({
    data: {
      order_id: order.id,
      worker_id: actors.workerId,
      assigned_category: 'Concurrency tester',
      status: 'accepted',
    },
  });
  trackedEntityIds.add(assignment.id);

  const qr: AttendanceRepository.AttendanceQrContext = {
    tokenHash: `qr-${randomUUID()}`,
    nonce: randomUUID(),
    assignmentId: assignment.id,
    orderId: order.id,
    companyId: actors.companyId,
  };
  const qrToken = await AttendanceRepository.registerAttendanceQrToken({
    ...qr,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  trackedEntityIds.add(qrToken.id);
  return { orderId: order.id, assignmentId: assignment.id, qrTokenId: qrToken.id, qr };
}

async function testCheckInVsAssignmentCancellation(actors: CoreActors): Promise<void> {
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const fixture = await createAcceptedAssignment(
      actors,
      `Direct cancellation race ${iteration}`,
    );

    const [checkIn, cancellation] = await Promise.all([
      AttendanceRepository.createCheckInWithAudit({
        assignmentId: fixture.assignmentId,
        workerId: actors.workerId,
        actorId: actors.workerUserId,
        actorRole: 'worker',
        qr: fixture.qr,
      }),
      AssignmentsRepository.cancelAssignmentWithAudit({
        assignmentId: fixture.assignmentId,
        actorId: actors.adminUserId,
        actorRole: 'super_admin',
        reason: 'parallel direct cancellation regression',
      }),
    ]);

    const [assignment, openAttendance] = await Promise.all([
      prisma.assignment.findUnique({ where: { id: fixture.assignmentId } }),
      prisma.attendanceLog.findFirst({
        where: {
          assignment_id: fixture.assignmentId,
          checkin_time: { not: null },
          checkout_time: null,
          deleted_at: null,
        },
      }),
    ]);

    assert.ok(assignment);
    assert.equal(
      assignment.status === 'cancelled' && Boolean(openAttendance),
      false,
      'a directly cancelled assignment must never retain an open attendance session',
    );

    if (assignment.status === 'cancelled') {
      assert.equal(checkIn.kind, 'assignment_not_accepted');
      assert.equal(cancellation.kind, 'cancelled');
    } else {
      assert.equal(assignment.status, 'accepted');
      assert.ok(openAttendance);
      assert.equal(checkIn.kind, 'checked_in');
      assert.equal(cancellation.kind, 'open_attendance');
    }
  }
  scenarioGroups += 1;
}

async function testCheckInVsWholeOrderCancellation(actors: CoreActors): Promise<void> {
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const fixture = await createAcceptedAssignment(
      actors,
      `Whole order cancellation race ${iteration}`,
    );

    const [checkInOutcome, cancellationOutcome] = await Promise.allSettled([
      AttendanceRepository.createCheckInWithAudit({
        assignmentId: fixture.assignmentId,
        workerId: actors.workerId,
        actorId: actors.workerUserId,
        actorRole: 'worker',
        qr: fixture.qr,
      }),
      OrdersRepository.cancelCompanyOrderWithAudit({
        orderId: fixture.orderId,
        companyId: actors.companyId,
        actorId: actors.companyUserId,
        actorRole: 'company',
        previousStatus: 'assigned',
        expectedVersion: 1,
        reason: 'parallel whole-order cancellation regression',
      }),
    ]);

    assert.equal(checkInOutcome.status, 'fulfilled');
    if (cancellationOutcome.status === 'rejected') {
      assert.ok(cancellationOutcome.reason instanceof AppError);
      assert.equal(cancellationOutcome.reason.statusCode, 409);
      assert.equal(cancellationOutcome.reason.code, 'ORDER_HAS_ACTIVE_ATTENDANCE');
    }

    const [order, assignment, openAttendance] = await Promise.all([
      prisma.order.findUnique({ where: { id: fixture.orderId } }),
      prisma.assignment.findUnique({ where: { id: fixture.assignmentId } }),
      prisma.attendanceLog.findFirst({
        where: {
          assignment_id: fixture.assignmentId,
          checkin_time: { not: null },
          checkout_time: null,
          deleted_at: null,
        },
      }),
    ]);

    assert.ok(order);
    assert.ok(assignment);
    assert.equal(
      order.status === 'cancelled' && Boolean(openAttendance),
      false,
      'a cancelled order must never retain an open attendance session',
    );

    if (order.status === 'cancelled') {
      assert.equal(assignment.status, 'cancelled');
      assert.equal(openAttendance, null);
      assert.equal(
        checkInOutcome.status === 'fulfilled' && checkInOutcome.value.kind,
        'assignment_not_accepted',
      );
    } else {
      assert.equal(order.status, 'in_progress');
      assert.equal(assignment.status, 'accepted');
      assert.ok(openAttendance);
    }
  }
  scenarioGroups += 1;
}

async function testSameQrSupportsOneCheckInAndOneCheckOut(actors: CoreActors): Promise<void> {
  const fixture = await createAcceptedAssignment(actors, 'Action-scoped QR lifecycle');

  const checkIn = await AttendanceRepository.createCheckInWithAudit({
    assignmentId: fixture.assignmentId,
    workerId: actors.workerId,
    actorId: actors.workerUserId,
    actorRole: 'worker',
    qr: fixture.qr,
  });
  assert.equal(checkIn.kind, 'checked_in');

  const checkOut = await AttendanceRepository.checkOutWithAudit({
    assignmentId: fixture.assignmentId,
    workerId: actors.workerId,
    actorId: actors.workerUserId,
    actorRole: 'worker',
    qr: fixture.qr,
  });
  assert.equal(checkOut.kind, 'checked_out');

  const [uses, assignment, order] = await Promise.all([
    prisma.attendanceQrUse.findMany({
      where: { qr_token_id: fixture.qrTokenId, worker_id: actors.workerId },
      select: { action: true },
    }),
    prisma.assignment.findUnique({ where: { id: fixture.assignmentId } }),
    prisma.order.findUnique({ where: { id: fixture.orderId } }),
  ]);
  assert.deepEqual(uses.map((use) => use.action).sort(), ['checkin', 'checkout']);
  assert.equal(assignment?.status, 'completed');
  assert.equal(order?.status, 'completed');
  assert.equal(order?.version, 3);

  await assert.rejects(
    () => prisma.attendanceQrUse.create({
      data: {
        qr_token_id: fixture.qrTokenId,
        worker_id: actors.workerId,
        assignment_id: fixture.assignmentId,
        action: 'checkin',
      },
    }),
    (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
  );
  scenarioGroups += 1;
}

async function testConcurrentQrCheckInIsSingleUse(actors: CoreActors): Promise<void> {
  const fixture = await createAcceptedAssignment(actors, 'Concurrent QR replay');
  const results = await Promise.all([
    AttendanceRepository.createCheckInWithAudit({
      assignmentId: fixture.assignmentId,
      workerId: actors.workerId,
      actorId: actors.workerUserId,
      actorRole: 'worker',
      qr: fixture.qr,
    }),
    AttendanceRepository.createCheckInWithAudit({
      assignmentId: fixture.assignmentId,
      workerId: actors.workerId,
      actorId: actors.workerUserId,
      actorRole: 'worker',
      qr: fixture.qr,
    }),
  ]);
  assert.deepEqual(results.map((result) => result.kind).sort(), ['already_checked_in', 'checked_in']);
  assert.equal(
    await prisma.attendanceQrUse.count({
      where: { qr_token_id: fixture.qrTokenId, worker_id: actors.workerId, action: 'checkin' },
    }),
    1,
  );
  assert.equal(
    await prisma.attendanceLog.count({
      where: { assignment_id: fixture.assignmentId, deleted_at: null },
    }),
    1,
  );
  scenarioGroups += 1;
}

async function testLegacyKioskRevocationInvalidatesQr(actors: CoreActors): Promise<void> {
  const fixture = await createAcceptedAssignment(actors, 'Revoked legacy kiosk QR');
  const kiosk = await AttendanceRepository.createKioskSession({
    tokenHash: `kiosk-${randomUUID()}`,
    companyId: actors.companyId,
    orderId: fixture.orderId,
    assignmentId: fixture.assignmentId,
    createdById: actors.companyUserId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const qr: AttendanceRepository.AttendanceQrContext = {
    tokenHash: `qr-${randomUUID()}`,
    nonce: randomUUID(),
    assignmentId: fixture.assignmentId,
    orderId: fixture.orderId,
    companyId: actors.companyId,
    kioskSessionId: kiosk.id,
  };
  const grant = await AttendanceRepository.registerAttendanceQrToken({
    ...qr,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  assert.equal(
    (await AttendanceRepository.revokeKioskSession({ id: kiosk.id, companyId: actors.companyId })).count,
    1,
  );
  const result = await AttendanceRepository.createCheckInWithAudit({
    assignmentId: fixture.assignmentId,
    workerId: actors.workerId,
    actorId: actors.workerUserId,
    actorRole: 'worker',
    qr,
  });
  assert.equal(result.kind, 'qr_revoked');
  assert.ok((await prisma.attendanceQrToken.findUnique({ where: { id: grant.id } }))?.revoked_at);
  scenarioGroups += 1;
}

async function testVenueActivationIsSerializedAndRevokesQr(actors: CoreActors): Promise<void> {
  const first = await createAcceptedAssignment(actors, 'Venue activation first');
  const second = await createAcceptedAssignment(actors, 'Venue activation second');
  const kiosk = await prisma.venueKiosk.create({
    data: {
      company_id: actors.companyId,
      name: `Lifecycle kiosk ${RUN_ID}`,
      token_hash: `venue-${randomUUID()}`,
      status: 'active',
      created_by_id: actors.companyUserId,
    },
  });

  const initial = await AttendanceRepository.activateVenueKiosk({
    kioskId: kiosk.id,
    companyId: actors.companyId,
    orderId: first.orderId,
    activatedById: actors.companyUserId,
  });
  assert.ok(initial);
  const initialSession = initial.active_sessions[0];
  assert.ok(initialSession);
  const oldGrant = await AttendanceRepository.registerAttendanceQrToken({
    tokenHash: `qr-${randomUUID()}`,
    nonce: randomUUID(),
    orderId: first.orderId,
    companyId: actors.companyId,
    kioskId: kiosk.id,
    kioskSessionId: initialSession.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const activations = await Promise.all([
    AttendanceRepository.activateVenueKiosk({
      kioskId: kiosk.id,
      companyId: actors.companyId,
      orderId: first.orderId,
      activatedById: actors.companyUserId,
    }),
    AttendanceRepository.activateVenueKiosk({
      kioskId: kiosk.id,
      companyId: actors.companyId,
      orderId: second.orderId,
      activatedById: actors.companyUserId,
    }),
  ]);
  assert.ok(activations.every(Boolean));
  assert.equal(
    await prisma.kioskActiveSession.count({
      where: { kiosk_id: kiosk.id, status: 'active', revoked_at: null, deleted_at: null },
    }),
    1,
  );
  assert.ok((await prisma.attendanceQrToken.findUnique({ where: { id: oldGrant.id } }))?.revoked_at);
  scenarioGroups += 1;
}

async function createPendingWorker() {
  const tokenHash = `worker-token-${randomUUID()}`;
  const user = await prisma.user.create({
    data: {
      phone: nextPhone('53'),
      email: `pending-worker-${fixtureCounter}-${RUN_ID}@example.test`,
      role: 'worker',
      name: `Pending worker ${RUN_ID}`,
      password_hash: 'local-regression-hash',
      password_set_at: new Date(),
      worker: { create: { status: 'pending_approval' } },
      device_tokens: {
        create: {
          token: `local-worker-device-${randomUUID()}`,
          token_hash: tokenHash,
          app_role: 'worker',
        },
      },
    },
    include: { worker: true },
  });
  trackedUserIds.add(user.id);
  assert.ok(user.worker);
  trackedEntityIds.add(user.worker.id);
  return { userId: user.id, entityId: user.worker.id, tokenHash };
}

async function createPendingCompany() {
  const tokenHash = `company-token-${randomUUID()}`;
  const user = await prisma.user.create({
    data: {
      phone: nextPhone('54'),
      email: `pending-company-${fixtureCounter}-${RUN_ID}@example.test`,
      role: 'company',
      name: `Pending company owner ${RUN_ID}`,
      password_hash: 'local-regression-hash',
      password_set_at: new Date(),
      company: {
        create: {
          name: `Pending company ${fixtureCounter} ${RUN_ID}`,
          status: 'pending_approval',
        },
      },
      device_tokens: {
        create: {
          token: `local-company-device-${randomUUID()}`,
          token_hash: tokenHash,
          app_role: 'company',
        },
      },
    },
    include: { company: true },
  });
  trackedUserIds.add(user.id);
  assert.ok(user.company);
  trackedEntityIds.add(user.company.id);
  return { userId: user.id, entityId: user.company.id, tokenHash };
}

function assertSingleRejectedOutcome(
  outcomes: PromiseSettledResult<unknown>[],
  label: string,
): void {
  const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
  const rejected = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  );
  assert.equal(fulfilled.length, 1, `${label}: exactly one transition may commit`);
  assert.equal(rejected.length, 1, `${label}: the stale transition must fail`);
  assert.ok(rejected[0].reason instanceof AppError);
  assert.equal(rejected[0].reason.statusCode, 409);
}

async function testWorkerApproveVsReject(actors: CoreActors): Promise<void> {
  const actor = { sub: actors.adminUserId, role: 'super_admin' };

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const fixture = await createPendingWorker();
    const outcomes = await Promise.allSettled([
      WorkersService.approveWorker(fixture.entityId, actor),
      WorkersService.rejectWorker(fixture.entityId, 'Parallel rejection regression', actor),
    ]);
    assertSingleRejectedOutcome(outcomes, 'worker approval race');

    const [worker, user, token, auditCount, notificationCount] = await Promise.all([
      prisma.worker.findUnique({ where: { id: fixture.entityId } }),
      prisma.user.findUnique({ where: { id: fixture.userId } }),
      prisma.deviceToken.findUnique({ where: { token_hash: fixture.tokenHash } }),
      prisma.auditLog.count({
        where: {
          entity_type: 'worker',
          entity_id: fixture.entityId,
          action: { in: ['worker_approved', 'worker_rejected'] },
        },
      }),
      prisma.notification.count({
        where: {
          recipient_id: fixture.userId,
          type: { in: ['worker_approved', 'worker_rejected'] },
        },
      }),
    ]);

    assert.ok(worker);
    assert.ok(user);
    assert.ok(token);
    assert.ok(['approved', 'rejected'].includes(worker.status));
    assert.equal(auditCount, 1);
    assert.equal(notificationCount, 1);
    if (worker.status === 'rejected') {
      assert.ok(token.revoked_at);
      assert.ok(token.deleted_at);
      assert.equal(user.session_version, 1);
    } else {
      assert.equal(token.revoked_at, null);
      assert.equal(token.deleted_at, null);
      assert.equal(user.session_version, 0);
    }
  }
  scenarioGroups += 1;
}

async function testCompanyApproveVsReject(actors: CoreActors): Promise<void> {
  const actor = { sub: actors.adminUserId, role: 'super_admin' };

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const fixture = await createPendingCompany();
    const outcomes = await Promise.allSettled([
      CompaniesService.approveCompany(fixture.entityId, actor),
      CompaniesService.rejectCompany(fixture.entityId, 'Parallel rejection regression', actor),
    ]);
    assertSingleRejectedOutcome(outcomes, 'company approval race');

    const [company, user, token, auditCount, notificationCount] = await Promise.all([
      prisma.company.findUnique({ where: { id: fixture.entityId } }),
      prisma.user.findUnique({ where: { id: fixture.userId } }),
      prisma.deviceToken.findUnique({ where: { token_hash: fixture.tokenHash } }),
      prisma.auditLog.count({
        where: {
          entity_type: 'company',
          entity_id: fixture.entityId,
          action: { in: ['company_approved', 'company_rejected'] },
        },
      }),
      prisma.notification.count({
        where: {
          recipient_id: fixture.userId,
          type: { in: ['company_approved', 'company_rejected'] },
        },
      }),
    ]);

    assert.ok(company);
    assert.ok(user);
    assert.ok(token);
    assert.ok(['approved', 'rejected'].includes(company.status));
    assert.equal(auditCount, 1);
    assert.equal(notificationCount, 1);
    if (company.status === 'rejected') {
      assert.ok(token.revoked_at);
      assert.ok(token.deleted_at);
      assert.equal(user.session_version, 1);
    } else {
      assert.equal(token.revoked_at, null);
      assert.equal(token.deleted_at, null);
      assert.equal(user.session_version, 0);
    }
  }
  scenarioGroups += 1;
}

async function cleanup(): Promise<void> {
  const userIds = [...trackedUserIds];
  const orderIds = [...trackedOrderIds];
  const entityIds = [...trackedEntityIds];

  if (orderIds.length > 0) {
    await prisma.attendanceQrToken.deleteMany({ where: { order_id: { in: orderIds } } });
    await prisma.outboxEvent.deleteMany({
      where: { aggregate: 'order', aggregate_id: { in: orderIds } },
    });
  }
  if (entityIds.length > 0 || userIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entity_id: { in: entityIds } },
          { actor_id: { in: userIds } },
        ],
      },
    });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function main(): Promise<void> {
  process.env.PUSH_NOTIFICATIONS_ENABLED = 'false';
  await assertSafeRuntime();

  try {
    const actors = await createCoreActors();
    await testCheckInVsAssignmentCancellation(actors);
    await testCheckInVsWholeOrderCancellation(actors);
    await testSameQrSupportsOneCheckInAndOneCheckOut(actors);
    await testConcurrentQrCheckInIsSingleUse(actors);
    await testLegacyKioskRevocationInvalidatesQr(actors);
    await testVenueActivationIsSerializedAndRevokesQr(actors);
    await testWorkerApproveVsReject(actors);
    await testCompanyApproveVsReject(actors);
    console.log(
      `Lifecycle concurrency regression PASS (${scenarioGroups} parallel scenario groups).`,
    );
  } finally {
    await cleanup();
  }
}

main()
  .catch((error) => {
    console.error(
      'Lifecycle concurrency regression FAIL:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
