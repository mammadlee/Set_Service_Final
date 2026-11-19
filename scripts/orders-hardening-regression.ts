import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../src/lib/errors';
import { prisma } from '../src/lib/prisma';
import { processOutboxBatch } from '../src/lib/outbox';
import { disconnectRedis } from '../src/lib/redis';
import * as OrdersRepository from '../src/modules/orders/orders.repository';
import * as OrdersService from '../src/modules/orders/orders.service';
import {
  assertOrderTransition,
  canTransitionOrder,
  isTerminalOrderStatus,
} from '../src/modules/orders/orders.state-machine';

const RUN_ID = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const TEST_CONFIRM_ENV = 'ORDER_HARDENING_TEST_CONFIRM';
const trackedOrderIds = new Set<string>();
const trackedUserIds = new Set<string>();
let assertions = 0;
let fixtureCounter = 0;

function assertLocalTestDatabaseUrl(label: string, rawValue: string | undefined): string {
  if (!rawValue) {
    throw new Error(`${label} is required for order hardening regression tests.`);
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
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname.toLowerCase())) {
    throw new Error(`${label} must target localhost; external databases are forbidden.`);
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!databaseName.toLowerCase().includes('test')) {
    throw new Error(`${label} database name must contain "test".`);
  }
  return databaseName;
}

async function assertSafeDatabaseRuntime(): Promise<void> {
  const expectedDatabase = assertLocalTestDatabaseUrl('DATABASE_URL', process.env.DATABASE_URL);
  if (process.env.DIRECT_URL) {
    const directDatabase = assertLocalTestDatabaseUrl('DIRECT_URL', process.env.DIRECT_URL);
    if (directDatabase !== expectedDatabase) {
      throw new Error('DATABASE_URL and DIRECT_URL must target the same local test database.');
    }
  }

  const rows = await prisma.$queryRaw<Array<{ database_name: string }>>`
    SELECT current_database() AS database_name
  `;
  const actualDatabase = rows[0]?.database_name ?? '';
  if (actualDatabase !== expectedDatabase || !actualDatabase.toLowerCase().includes('test')) {
    throw new Error(
      `Connected database "${actualDatabase}" does not match the guarded local test target.`,
    );
  }
}

type TestIdentity = {
  userId: string;
  companyId: string;
};

type TestWorker = {
  userId: string;
  workerId: string;
};

function orderInput(title: string): OrdersRepository.CreateOrderForPersistence {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);

  return {
    title,
    description: `Order hardening regression fixture ${RUN_ID}`,
    category: 'Regression test role',
    category_items: [
      {
        category: 'Regression test role',
        required_count: 1,
      },
    ],
    required_count: 1,
    start_datetime: start,
    end_datetime: end,
    location: 'Isolated regression venue',
    required_skills: ['regression'],
    notes: `fixture:${RUN_ID}`,
  };
}

function buildResponse(order: OrdersRepository.OrderDetailRecord): Prisma.InputJsonValue {
  return {
    id: order.id,
    title: order.title,
    status: order.status,
  };
}

async function createIdentity(): Promise<TestIdentity> {
  fixtureCounter += 1;
  const user = await prisma.user.create({
    data: {
      phone: `+99470${String(Date.now() + fixtureCounter).slice(-7)}`,
      email: `orders-hardening-${fixtureCounter}-${RUN_ID}@example.test`,
      role: 'company',
      name: `Orders hardening company ${RUN_ID}`,
      company: {
        create: {
          name: `Orders hardening company ${RUN_ID}`,
          status: 'approved',
          approved_at: new Date(),
        },
      },
    },
    include: { company: true },
  });

  trackedUserIds.add(user.id);
  assert.ok(user.company);
  return { userId: user.id, companyId: user.company.id };
}

async function createWorker(): Promise<TestWorker> {
  const user = await prisma.user.create({
    data: {
      phone: `+99471${String(Date.now() + 1).slice(-7)}`,
      email: `orders-hardening-worker-${RUN_ID}@example.test`,
      role: 'worker',
      name: `Orders hardening worker ${RUN_ID}`,
      worker: {
        create: {
          position: 'Regression tester',
          status: 'approved',
          approved_at: new Date(),
        },
      },
    },
    include: { worker: true },
  });

  trackedUserIds.add(user.id);
  assert.ok(user.worker);
  return { userId: user.id, workerId: user.worker.id };
}

async function createSuperAdmin(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      phone: `+99472${String(Date.now() + 2).slice(-7)}`,
      email: `orders-hardening-admin-${RUN_ID}@example.test`,
      role: 'super_admin',
      name: `Orders hardening admin ${RUN_ID}`,
    },
  });
  trackedUserIds.add(user.id);
  return user.id;
}

async function createPersistedOrder(
  identity: TestIdentity,
  title: string,
): Promise<OrdersRepository.CreateOrderResult> {
  const result = await OrdersRepository.createOrderWithSideEffects({
    actorId: identity.userId,
    actorRole: 'company',
    companyId: identity.companyId,
    companyName: `Orders hardening company ${RUN_ID}`,
    order: orderInput(title),
    buildResponse,
  });
  trackedOrderIds.add(result.orderId);
  return result;
}

function countAssertion(): void {
  assertions += 1;
}

async function expectAppError(
  action: () => Promise<unknown>,
  statusCode: number,
  code: string,
): Promise<void> {
  try {
    await action();
    assert.fail(`Expected ${statusCode} ${code}`);
  } catch (error) {
    assert.ok(error instanceof AppError, `Expected AppError, received ${String(error)}`);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    countAssertion();
  }
}

async function testIdempotentCreation(identity: TestIdentity): Promise<void> {
  const input = orderInput(`Idempotent order ${RUN_ID}`);
  const key = `order-regression-${RUN_ID}`;
  const requestHash = OrdersService.hashOrderRequest(input);
  const invocation = () =>
    OrdersRepository.createOrderWithSideEffects({
      actorId: identity.userId,
      actorRole: 'company',
      companyId: identity.companyId,
      companyName: `Orders hardening company ${RUN_ID}`,
      order: input,
      idempotency: {
        actorId: identity.userId,
        scope: 'orders.create',
        key,
        requestHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      buildResponse,
    });

  const [first, second] = await Promise.all([invocation(), invocation()]);
  trackedOrderIds.add(first.orderId);
  trackedOrderIds.add(second.orderId);

  assert.deepEqual(
    [first.replayed, second.replayed].sort(),
    [false, true],
    'one concurrent request must be replayed',
  );
  assert.equal(first.orderId, second.orderId, 'replay must return the original order');
  assert.deepEqual(first.response, second.response, 'replay must return the original response');
  assert.equal(
    await prisma.order.count({
      where: { company_id: identity.companyId, title: input.title, deleted_at: null },
    }),
    1,
    'idempotent requests must create exactly one order',
  );
  countAssertion();

  const sequentialReplay = await invocation();
  assert.equal(sequentialReplay.replayed, true, 'sequential duplicate must replay');
  assert.equal(sequentialReplay.orderId, first.orderId);
  assert.deepEqual(sequentialReplay.response, first.response);
  countAssertion();

  const changedInput = { ...input, title: `${input.title} changed` };
  await expectAppError(
    () =>
      OrdersRepository.createOrderWithSideEffects({
        actorId: identity.userId,
        actorRole: 'company',
        companyId: identity.companyId,
        companyName: `Orders hardening company ${RUN_ID}`,
        order: changedInput,
        idempotency: {
          actorId: identity.userId,
          scope: 'orders.create',
          key,
          requestHash: OrdersService.hashOrderRequest(changedInput),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
        buildResponse,
      }),
    409,
    'IDEMPOTENCY_KEY_REUSED',
  );
}

async function testIdempotencyActorIsolation(
  firstIdentity: TestIdentity,
  secondIdentity: TestIdentity,
): Promise<void> {
  const key = `shared-actor-key-${RUN_ID}`;
  const firstInput = orderInput(`Actor one order ${RUN_ID}`);
  const secondInput = orderInput(`Actor two order ${RUN_ID}`);
  const create = (
    identity: TestIdentity,
    input: OrdersRepository.CreateOrderForPersistence,
  ) =>
    OrdersRepository.createOrderWithSideEffects({
      actorId: identity.userId,
      actorRole: 'company',
      companyId: identity.companyId,
      companyName: `Orders hardening company ${RUN_ID}`,
      order: input,
      idempotency: {
        actorId: identity.userId,
        scope: 'orders.create',
        key,
        requestHash: OrdersService.hashOrderRequest(input),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      buildResponse,
    });

  const [first, second] = await Promise.all([
    create(firstIdentity, firstInput),
    create(secondIdentity, secondInput),
  ]);
  trackedOrderIds.add(first.orderId);
  trackedOrderIds.add(second.orderId);

  assert.notEqual(first.orderId, second.orderId, 'different actors may safely reuse the same key');
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, false);
  countAssertion();
}

async function testPendingIdempotency(identity: TestIdentity): Promise<void> {
  const input = orderInput(`Pending idempotency ${RUN_ID}`);
  const key = `pending-idempotency-${RUN_ID}`;
  await prisma.idempotencyKey.create({
    data: {
      actor_id: identity.userId,
      scope: 'orders.create',
      key,
      request_hash: OrdersService.hashOrderRequest(input),
      status: 'pending',
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  await expectAppError(
    () =>
      OrdersRepository.createOrderWithSideEffects({
        actorId: identity.userId,
        actorRole: 'company',
        companyId: identity.companyId,
        companyName: `Orders hardening company ${RUN_ID}`,
        order: input,
        idempotency: {
          actorId: identity.userId,
          scope: 'orders.create',
          key,
          requestHash: OrdersService.hashOrderRequest(input),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
        buildResponse,
      }),
    409,
    'IDEMPOTENCY_REQUEST_IN_PROGRESS',
  );
}

async function testFailedRequestRetry(identity: TestIdentity): Promise<void> {
  const input = orderInput(`Failed then retried ${RUN_ID}`);
  const key = `failed-retry-${RUN_ID}`;
  const idempotency = {
    actorId: identity.userId,
    scope: 'orders.create',
    key,
    requestHash: OrdersService.hashOrderRequest(input),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };

  await assert.rejects(
    () =>
      OrdersRepository.createOrderWithSideEffects({
        actorId: identity.userId,
        actorRole: 'company',
        companyId: identity.companyId,
        companyName: `Orders hardening company ${RUN_ID}`,
        order: input,
        idempotency,
        buildResponse: () => {
          throw new Error('intentional transaction rollback');
        },
      }),
    /intentional transaction rollback/,
  );
  assert.equal(
    await prisma.idempotencyKey.count({
      where: { actor_id: identity.userId, scope: 'orders.create', key },
    }),
    0,
    'failed transaction must not retain a partial idempotency record',
  );
  assert.equal(
    await prisma.order.count({
      where: { company_id: identity.companyId, title: input.title },
    }),
    0,
    'failed transaction must not retain a partial order',
  );

  const retried = await OrdersRepository.createOrderWithSideEffects({
    actorId: identity.userId,
    actorRole: 'company',
    companyId: identity.companyId,
    companyName: `Orders hardening company ${RUN_ID}`,
    order: input,
    idempotency,
    buildResponse,
  });
  trackedOrderIds.add(retried.orderId);
  assert.equal(retried.replayed, false);
  countAssertion();
}

async function testExpiredIdempotencyReuse(identity: TestIdentity): Promise<void> {
  const input = orderInput(`Expired key reuse ${RUN_ID}`);
  const key = `expired-key-${RUN_ID}`;
  await prisma.idempotencyKey.create({
    data: {
      actor_id: identity.userId,
      scope: 'orders.create',
      key,
      request_hash: 'expired-request-hash',
      status: 'completed',
      status_code: 201,
      response: { id: randomUUID(), stale: true },
      expires_at: new Date(Date.now() - 60_000),
      completed_at: new Date(Date.now() - 120_000),
    },
  });

  const result = await OrdersRepository.createOrderWithSideEffects({
    actorId: identity.userId,
    actorRole: 'company',
    companyId: identity.companyId,
    companyName: `Orders hardening company ${RUN_ID}`,
    order: input,
    idempotency: {
      actorId: identity.userId,
      scope: 'orders.create',
      key,
      requestHash: OrdersService.hashOrderRequest(input),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    buildResponse,
  });
  trackedOrderIds.add(result.orderId);

  const record = await prisma.idempotencyKey.findUnique({
    where: {
      actor_id_scope_key: {
        actor_id: identity.userId,
        scope: 'orders.create',
        key,
      },
    },
  });
  assert.equal(result.replayed, false, 'expired key must start a fresh request');
  assert.equal(record?.status, 'completed');
  assert.equal(record?.request_hash, OrdersService.hashOrderRequest(input));
  assert.ok(record?.completed_at);
  countAssertion();
}

async function testNoIdempotencyKey(identity: TestIdentity): Promise<void> {
  const title = `Non-idempotent order ${RUN_ID}`;
  const first = await createPersistedOrder(identity, title);
  const second = await createPersistedOrder(identity, title);

  assert.notEqual(first.orderId, second.orderId, 'requests without a key must preserve create behavior');
  assert.equal(
    await prisma.order.count({
      where: { company_id: identity.companyId, title, deleted_at: null },
    }),
    2,
    'requests without a key must create two orders',
  );
  countAssertion();
}

async function testOutboxDeliveryIsolation(identity: TestIdentity): Promise<void> {
  const result = await createPersistedOrder(identity, `Outbox isolation ${RUN_ID}`);
  assert.ok(result.outboxEventId, 'order creation must persist an outbox event');

  await prisma.outboxEvent.update({
    where: { id: result.outboxEventId },
    data: {
      event_type: 'regression.unsupported',
      created_at: new Date(0),
      available_at: new Date(0),
    },
  });

  const delivered = await processOutboxBatch(1);
  const [order, event] = await Promise.all([
    prisma.order.findUnique({ where: { id: result.orderId } }),
    prisma.outboxEvent.findUnique({ where: { id: result.outboxEventId } }),
  ]);

  assert.equal(delivered, 0, 'failed delivery must not be reported as delivered');
  assert.ok(order, 'outbox delivery failure must not roll back or delete the core order');
  assert.equal(event?.status, 'pending', 'retryable delivery failure must return to pending');
  assert.equal(event?.attempts, 1, 'delivery attempt must be recorded');
  assert.match(event?.last_error ?? '', /Unsupported outbox event type/);
  countAssertion();
}

async function testOutboxDeadLetter(identity: TestIdentity): Promise<void> {
  const result = await createPersistedOrder(identity, `Outbox dead letter ${RUN_ID}`);
  assert.ok(result.outboxEventId);
  await prisma.outboxEvent.update({
    where: { id: result.outboxEventId },
    data: {
      event_type: 'regression.unsupported',
      status: 'pending',
      attempts: 9,
      available_at: new Date(0),
      created_at: new Date(0),
    },
  });

  const delivered = await processOutboxBatch(1);
  const event = await prisma.outboxEvent.findUnique({ where: { id: result.outboxEventId } });
  assert.equal(delivered, 0);
  assert.equal(event?.status, 'dead', 'maximum attempts must move an event to dead-letter state');
  assert.equal(event?.attempts, 10);
  assert.match(event?.last_error ?? '', /Unsupported outbox event type/);
  countAssertion();
}

function testOrderStateMachine(): void {
  assert.equal(canTransitionOrder('draft', 'published'), true);
  assert.equal(canTransitionOrder('published', 'partially_assigned'), true);
  assert.equal(canTransitionOrder('partially_assigned', 'assigned'), true);
  assert.equal(canTransitionOrder('assigned', 'in_progress'), true);
  assert.equal(canTransitionOrder('in_progress', 'completed'), true);
  assert.equal(isTerminalOrderStatus('completed'), true);
  assert.equal(isTerminalOrderStatus('cancelled'), true);
  assert.throws(
    () => assertOrderTransition('completed', 'published'),
    (error: unknown) =>
      error instanceof AppError
      && error.statusCode === 409
      && error.code === 'ORDER_STATUS_TRANSITION_INVALID',
  );
  assert.throws(
    () => assertOrderTransition('cancelled', 'in_progress'),
    (error: unknown) =>
      error instanceof AppError
      && error.statusCode === 409
      && error.code === 'ORDER_STATUS_TRANSITION_INVALID',
  );
  countAssertion();
}

async function testCancellationCascade(identity: TestIdentity, worker: TestWorker): Promise<void> {
  const result = await createPersistedOrder(identity, `Cancellable order ${RUN_ID}`);
  const createdOrder = await prisma.order.findUnique({ where: { id: result.orderId } });
  assert.equal(createdOrder?.version, 1);
  const creationHistory = await prisma.orderStatusHistory.findMany({
    where: { order_id: result.orderId },
    orderBy: { created_at: 'asc' },
  });
  assert.equal(creationHistory.length, 1);
  assert.equal(creationHistory[0]?.from_status, 'draft');
  assert.equal(creationHistory[0]?.to_status, 'published');
  assert.equal(creationHistory[0]?.version, 1);
  countAssertion();

  const assignment = await prisma.assignment.create({
    data: {
      order_id: result.orderId,
      worker_id: worker.workerId,
      assigned_category: 'Regression test role',
      status: 'assigned',
    },
  });
  const kioskSession = await prisma.kioskSession.create({
    data: {
      token_hash: `kiosk-session-${RUN_ID}`,
      company_id: identity.companyId,
      order_id: result.orderId,
      assignment_id: assignment.id,
      created_by_id: identity.userId,
    },
  });
  const venueKiosk = await prisma.venueKiosk.create({
    data: {
      company_id: identity.companyId,
      name: `Regression kiosk ${RUN_ID}`,
      token_hash: `venue-kiosk-${RUN_ID}`,
      status: 'active',
      created_by_id: identity.userId,
    },
  });
  const activeSession = await prisma.kioskActiveSession.create({
    data: {
      kiosk_id: venueKiosk.id,
      company_id: identity.companyId,
      order_id: result.orderId,
      status: 'active',
      activated_by_id: identity.userId,
    },
  });
  const attendance = await prisma.attendanceLog.create({
    data: {
      assignment_id: assignment.id,
      checkin_time: new Date(),
    },
  });

  await expectAppError(
    () =>
      OrdersService.cancelOrder(result.orderId, identity.userId, 'company', {
        reason: 'open attendance policy regression',
      }),
    409,
    'ORDER_HAS_ACTIVE_ATTENDANCE',
  );

  const unchanged = await Promise.all([
    prisma.order.findUnique({ where: { id: result.orderId } }),
    prisma.assignment.findUnique({ where: { id: assignment.id } }),
    prisma.kioskSession.findUnique({ where: { id: kioskSession.id } }),
    prisma.kioskActiveSession.findUnique({ where: { id: activeSession.id } }),
  ]);
  assert.equal(unchanged[0]?.status, 'published');
  assert.equal(unchanged[1]?.status, 'assigned');
  assert.equal(unchanged[2]?.revoked_at, null);
  assert.equal(unchanged[3]?.status, 'active');
  countAssertion();

  await prisma.attendanceLog.update({
    where: { id: attendance.id },
    data: { checkout_time: new Date() },
  });
  await OrdersService.cancelOrder(result.orderId, identity.userId, 'company', {
    reason: 'regression cascade',
    expected_version: 1,
  });

  const [
    order,
    updatedAssignment,
    updatedKiosk,
    updatedActiveSession,
    notification,
    outbox,
    history,
    audit,
  ] =
    await Promise.all([
      prisma.order.findUnique({ where: { id: result.orderId } }),
      prisma.assignment.findUnique({ where: { id: assignment.id } }),
      prisma.kioskSession.findUnique({ where: { id: kioskSession.id } }),
      prisma.kioskActiveSession.findUnique({ where: { id: activeSession.id } }),
      prisma.notification.findFirst({
        where: {
          recipient_id: worker.userId,
          metadata: { path: ['order_id'], equals: result.orderId },
        },
      }),
      prisma.outboxEvent.findFirst({
        where: {
          aggregate: 'order',
          aggregate_id: result.orderId,
          event_type: 'order.cancelled',
        },
      }),
      prisma.orderStatusHistory.findMany({
        where: { order_id: result.orderId },
        orderBy: { created_at: 'asc' },
      }),
      prisma.auditLog.findFirst({
        where: {
          entity_type: 'order',
          entity_id: result.orderId,
          action: 'order_cancelled',
        },
      }),
    ]);

  assert.equal(order?.status, 'cancelled');
  assert.equal(order?.version, 2, 'successful transition must increment version');
  assert.equal(updatedAssignment?.status, 'cancelled');
  assert.ok(updatedKiosk?.revoked_at, 'legacy kiosk session must be revoked');
  assert.equal(updatedActiveSession?.status, 'revoked');
  assert.ok(updatedActiveSession?.revoked_at, 'active kiosk session must be revoked');
  assert.ok(notification, 'worker must receive an in-app cancellation notification');
  assert.ok(outbox, 'cancellation push must be persisted to the outbox');
  assert.equal(history.length, 2, 'creation and cancellation must both be in status history');
  assert.equal(history[1]?.from_status, 'published');
  assert.equal(history[1]?.to_status, 'cancelled');
  assert.equal(history[1]?.version, 2);
  assert.equal(history[1]?.reason, 'regression cascade');
  assert.ok(audit, 'cancellation audit must be committed with the state transition');
  countAssertion();

  await expectAppError(
    () =>
      OrdersService.cancelOrder(result.orderId, identity.userId, 'company', {
        expected_version: 1,
      }),
    409,
    'ORDER_VERSION_CONFLICT',
  );

  await expectAppError(
    () => OrdersService.cancelOrder(result.orderId, identity.userId, 'company', {}),
    409,
    'ORDER_ALREADY_CANCELLED',
  );
}

async function testOptimisticCancelConcurrency(identity: TestIdentity): Promise<void> {
  const result = await createPersistedOrder(identity, `Concurrent cancel ${RUN_ID}`);
  const settled = await Promise.allSettled([
    OrdersService.cancelOrder(result.orderId, identity.userId, 'company', {
      reason: 'first concurrent cancellation',
      expected_version: 1,
    }),
    OrdersService.cancelOrder(result.orderId, identity.userId, 'company', {
      reason: 'second concurrent cancellation',
      expected_version: 1,
    }),
  ]);

  const fulfilled = settled.filter((item) => item.status === 'fulfilled');
  const rejected = settled.filter(
    (item): item is PromiseRejectedResult => item.status === 'rejected',
  );
  assert.equal(fulfilled.length, 1, 'only one optimistic transition may commit');
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof AppError);
  assert.equal(rejected[0].reason.statusCode, 409);
  assert.ok(
    ['ORDER_VERSION_CONFLICT', 'ORDER_ALREADY_CANCELLED'].includes(rejected[0].reason.code),
    `unexpected stale transition code: ${rejected[0].reason.code}`,
  );

  const [order, historyCount, cancellationAuditCount] = await Promise.all([
    prisma.order.findUnique({ where: { id: result.orderId } }),
    prisma.orderStatusHistory.count({
      where: { order_id: result.orderId, to_status: 'cancelled' },
    }),
    prisma.auditLog.count({
      where: {
        entity_type: 'order',
        entity_id: result.orderId,
        action: 'order_cancelled',
      },
    }),
  ]);
  assert.equal(order?.status, 'cancelled');
  assert.equal(order?.version, 2);
  assert.equal(historyCount, 1, 'stale transition must not append duplicate history');
  assert.equal(cancellationAuditCount, 1, 'stale transition must not append duplicate audit');
  countAssertion();
}

async function testCompletedOrderTerminal(identity: TestIdentity): Promise<void> {
  const result = await createPersistedOrder(identity, `Completed order ${RUN_ID}`);
  await prisma.order.update({ where: { id: result.orderId }, data: { status: 'completed' } });

  await expectAppError(
    () => OrdersService.cancelOrder(result.orderId, identity.userId, 'company', {}),
    400,
    'ORDER_ALREADY_COMPLETED',
  );
}

async function cleanup(): Promise<void> {
  const orderIds = [...trackedOrderIds];
  const userIds = [...trackedUserIds];

  for (const orderId of orderIds) {
    await prisma.notification.deleteMany({
      where: { metadata: { path: ['order_id'], equals: orderId } },
    });
  }
  await prisma.outboxEvent.deleteMany({ where: { aggregate: 'order', aggregate_id: { in: orderIds } } });
  await prisma.idempotencyKey.deleteMany({ where: { actor_id: { in: userIds } } });
  await prisma.auditLog.deleteMany({
    where: { entity_type: 'order', entity_id: { in: orderIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Order hardening regression tests refuse to run with NODE_ENV=production.');
  }
  if (process.env[TEST_CONFIRM_ENV] !== '1') {
    throw new Error(
      `${TEST_CONFIRM_ENV}=1 is required because this suite creates and deletes isolated database fixtures.`,
    );
  }

  await assertSafeDatabaseRuntime();
  await prisma.idempotencyKey.count();
  try {
    const identity = await createIdentity();
    const secondIdentity = await createIdentity();
    const worker = await createWorker();
    await createSuperAdmin();

    testOrderStateMachine();
    await testIdempotentCreation(identity);
    await testIdempotencyActorIsolation(identity, secondIdentity);
    await testPendingIdempotency(identity);
    await testFailedRequestRetry(identity);
    await testExpiredIdempotencyReuse(identity);
    await testNoIdempotencyKey(identity);
    await testOutboxDeliveryIsolation(identity);
    await testOutboxDeadLetter(identity);
    await testCancellationCascade(identity, worker);
    await testOptimisticCancelConcurrency(identity);
    await testCompletedOrderTerminal(identity);
    console.log(`Order hardening regression PASS (${assertions} scenario groups).`);
  } finally {
    await cleanup();
  }
}

main()
  .catch((error) => {
    console.error('Order hardening regression FAIL:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await disconnectRedis();
  });
