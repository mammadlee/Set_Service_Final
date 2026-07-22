import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { deleteExpiredIdempotencyKey } from '../../lib/idempotency';
import { OrderStatus, Role } from '../../types/prisma';
import { CreateOrderInput } from './orders.schema';

export type NormalizedOrderCategoryItem = {
  category: string;
  department_id?: string;
  subdepartment_id?: string;
  position_id?: string;
  required_count: number;
  notes?: string;
};

export type CreateOrderForPersistence = Omit<
  CreateOrderInput,
  'category' | 'required_count' | 'category_items'
> & {
  category: string;
  required_count: number;
  category_items: NormalizedOrderCategoryItem[];
};

const companySummarySelect = {
  id: true,
  name: true,
  status: true,
  user: {
    select: {
      id: true,
      name: true,
      phone: true,
    },
  },
} satisfies Prisma.CompanySelect;

const departmentSummarySelect = {
  id: true,
  slug: true,
  name_az: true,
  name_en: true,
  status: true,
} satisfies Prisma.DepartmentSelect;

const subdepartmentSummarySelect = {
  id: true,
  slug: true,
  department_id: true,
  name_az: true,
  name_en: true,
  status: true,
} satisfies Prisma.SubdepartmentSelect;

const positionSummarySelect = {
  id: true,
  slug: true,
  subdepartment_id: true,
  name_az: true,
  name_en: true,
  status: true,
  subdepartment: {
    select: {
      ...subdepartmentSummarySelect,
      department: { select: departmentSummarySelect },
    },
  },
} satisfies Prisma.PositionSelect;

export const orderCategoryItemSelect = {
  id: true,
  category: true,
  department_id: true,
  subdepartment_id: true,
  position_id: true,
  required_count: true,
  notes: true,
  department: { select: departmentSummarySelect },
  subdepartment: { select: subdepartmentSummarySelect },
  position: { select: positionSummarySelect },
} satisfies Prisma.OrderCategoryItemSelect;

export const orderListInclude = {
  company: { select: companySummarySelect },
  category_items: {
    where: { deleted_at: null },
    select: orderCategoryItemSelect,
    orderBy: { created_at: 'asc' },
  },
  assignments: {
    where: { deleted_at: null },
    select: {
      id: true,
      status: true,
      order_category_item_id: true,
      assigned_category: true,
      position_id: true,
    },
  },
  _count: { select: { assignments: true, ratings: true } },
} satisfies Prisma.OrderInclude;

export const orderDetailInclude = {
  company: { select: companySummarySelect },
  assignments: {
    where: { deleted_at: null },
    select: {
      id: true,
      worker_id: true,
      order_category_item_id: true,
      assigned_category: true,
      status: true,
      assigned_at: true,
      updated_at: true,
      order_category_item: {
        select: orderCategoryItemSelect,
      },
    },
    orderBy: { assigned_at: 'desc' },
  },
  category_items: {
    where: { deleted_at: null },
    select: orderCategoryItemSelect,
    orderBy: { created_at: 'asc' },
  },
  _count: { select: { assignments: true, ratings: true } },
} satisfies Prisma.OrderInclude;

export type OrderDetailRecord = Prisma.OrderGetPayload<{
  include: typeof orderDetailInclude;
}>;

export type OrderIdempotencyInput = {
  actorId: string;
  scope: string;
  key: string;
  requestHash: string;
  expiresAt: Date;
};

export type CreateOrderResult = {
  response: Prisma.InputJsonValue;
  orderId: string;
  outboxEventId?: string;
  replayed: boolean;
};

export function findCompanyByUserId(userId: string) {
  return prisma.company.findUnique({
    where: { user_id: userId },
    include: { user: { select: { id: true, name: true, phone: true } } },
  });
}

export function findOrderById(id: string) {
  return prisma.order.findFirst({
    where: { id, deleted_at: null },
    include: orderDetailInclude,
  });
}

export function findOrderByIdForCompany(id: string, companyId: string) {
  return prisma.order.findFirst({
    where: { id, company_id: companyId, deleted_at: null },
    include: orderDetailInclude,
  });
}

export async function listOrders(input: {
  where: Prisma.OrderWhereInput;
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
}) {
  const [total, data] = await prisma.$transaction([
    prisma.order.count({ where: input.where }),
    prisma.order.findMany({
      where: input.where,
      include: orderListInclude,
      orderBy: { created_at: input.sort },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);

  return { total, data };
}

export async function createOrderWithSideEffects(input: {
  actorId: string;
  actorRole: Role;
  companyId: string;
  companyName: string;
  order: CreateOrderForPersistence;
  idempotency?: OrderIdempotencyInput;
  buildResponse: (order: OrderDetailRecord) => Prisma.InputJsonValue;
}): Promise<CreateOrderResult> {
  return createOrderWithSideEffectsAttempt(input, true);
}

async function createOrderWithSideEffectsAttempt(
  input: {
    actorId: string;
    actorRole: Role;
    companyId: string;
    companyName: string;
    order: CreateOrderForPersistence;
    idempotency?: OrderIdempotencyInput;
    buildResponse: (order: OrderDetailRecord) => Prisma.InputJsonValue;
  },
  allowExpiredRetry: boolean,
): Promise<CreateOrderResult> {
  if (input.idempotency) {
    await deleteExpiredIdempotencyKey({
      actorId: input.idempotency.actorId,
      scope: input.idempotency.scope,
      key: input.idempotency.key,
    });
  }

  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (input.idempotency) {
        await tx.idempotencyKey.create({
          data: {
            actor_id: input.idempotency.actorId,
            scope: input.idempotency.scope,
            key: input.idempotency.key,
            request_hash: input.idempotency.requestHash,
            expires_at: input.idempotency.expiresAt,
            status: 'pending',
          },
        });
      }

      const order = await createOrderRecord(tx, input);
      const response = input.buildResponse(order);

      await tx.orderStatusHistory.create({
        data: {
          order_id: order.id,
          from_status: 'draft',
          to_status: order.status,
          actor_id: input.actorId,
          actor_role: input.actorRole,
          reason: 'order_created',
          version: order.version,
        },
      });

      await tx.auditLog.create({
        data: {
          actor_id: input.actorId,
          actor_role: input.actorRole,
          action: 'order_created',
          entity_type: 'order',
          entity_id: order.id,
          metadata: {
            company_id: input.companyId,
            company_name: input.companyName,
            required_count: input.order.required_count,
            category_items: input.order.category_items,
            start_datetime: input.order.start_datetime.toISOString(),
            end_datetime: input.order.end_datetime.toISOString(),
            version: order.version,
          },
        },
      });

      const admins = await tx.user.findMany({
        where: { role: 'super_admin', is_active: true, deleted_at: null },
        select: { id: true },
      });

      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            recipient_id: admin.id,
            type: 'order_created' as const,
            title: 'Yeni sifariş yaradıldı',
            body: `${input.companyName} "${input.order.title}" sifarişini yaratdı.`,
            metadata: {
              order_id: order.id,
              company_id: input.companyId,
              required_count: input.order.required_count,
              category_items: input.order.category_items,
            },
          })),
        });
      }

      const outboxEvent = await tx.outboxEvent.create({
        data: {
          aggregate: 'order',
          aggregate_id: order.id,
          event_type: 'order.created',
          payload: {
            role: 'super_admin',
            title: 'Yeni sifariş yaradıldı',
            body: `${input.companyName} "${input.order.title}" sifarişini yaratdı.`,
            data: {
              order_id: order.id,
              company_id: input.companyId,
              role: 'super_admin',
            },
          },
        },
        select: { id: true },
      });

      if (input.idempotency) {
        await tx.idempotencyKey.update({
          where: {
            actor_id_scope_key: {
              actor_id: input.idempotency.actorId,
              scope: input.idempotency.scope,
              key: input.idempotency.key,
            },
          },
          data: {
            status: 'completed',
            status_code: 201,
            response,
            completed_at: new Date(),
          },
        });
      }

      return {
        response,
        orderId: order.id,
        outboxEventId: outboxEvent.id,
        replayed: false,
      };
    });
  } catch (error) {
    if (!input.idempotency || !isUniqueConstraintError(error)) throw error;

    const existing = await prisma.idempotencyKey.findUnique({
      where: {
        actor_id_scope_key: {
          actor_id: input.idempotency.actorId,
          scope: input.idempotency.scope,
          key: input.idempotency.key,
        },
      },
    });

    if (!existing) throw error;
    if (existing.expires_at.getTime() <= Date.now() && allowExpiredRetry) {
      const deleted = await deleteExpiredIdempotencyKey({
        actorId: input.idempotency.actorId,
        scope: input.idempotency.scope,
        key: input.idempotency.key,
      });
      if (deleted === 1) return createOrderWithSideEffectsAttempt(input, false);
    }
    if (existing.request_hash !== input.idempotency.requestHash) {
      throw Errors.conflict(
        'Idempotency-Key was already used with a different request body.',
        'IDEMPOTENCY_KEY_REUSED'
      );
    }
    if (
      existing.status !== 'completed'
      || existing.status_code !== 201
      || existing.response === null
    ) {
      throw Errors.conflict(
        'The original idempotent request is still being processed. Retry shortly.',
        'IDEMPOTENCY_REQUEST_IN_PROGRESS'
      );
    }

    return {
      response: existing.response as Prisma.InputJsonValue,
      orderId: getStoredOrderId(existing.response),
      replayed: true,
    };
  }
}

async function createOrderRecord(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    order: CreateOrderForPersistence;
  }
): Promise<OrderDetailRecord> {
  return tx.order.create({
      data: {
        company_id: input.companyId,
        title: input.order.title,
        description: input.order.description,
        category: input.order.category,
        shift_start: input.order.start_datetime,
        shift_end: input.order.end_datetime,
        required_count: input.order.required_count,
        required_skills: input.order.required_skills ?? [],
        location: input.order.location,
        pay_rate: input.order.pay_rate,
        notes: input.order.notes,
        status: 'published',
        category_items: {
          create: input.order.category_items.map((item) => ({
            category: item.category,
            department_id: item.department_id,
            subdepartment_id: item.subdepartment_id,
            position_id: item.position_id,
            required_count: item.required_count,
            notes: item.notes,
          })),
        },
      },
      include: orderDetailInclude,
    });
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function getStoredOrderId(response: Prisma.JsonValue): string {
  if (typeof response !== 'object' || response === null || Array.isArray(response)) return '';
  const id = (response as Prisma.JsonObject).id;
  return typeof id === 'string' ? id : '';
}

export async function cancelCompanyOrderWithAudit(input: {
  orderId: string;
  companyId: string;
  actorId: string;
  actorRole: Role;
  previousStatus: OrderStatus;
  expectedVersion: number;
  reason?: string;
}) {
  try {
    return await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
      const lockedOrder = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "orders"
        WHERE id = ${input.orderId}
          AND company_id = ${input.companyId}
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (lockedOrder.length !== 1) return null;

      // Lock every child in deterministic order before checking attendance.
      // Check-in and direct cancellation use the same order -> assignment order.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "assignments"
        WHERE order_id = ${input.orderId}
          AND deleted_at IS NULL
        ORDER BY id
        FOR UPDATE
      `;

      const currentOrder = await tx.order.findFirst({
        where: {
          id: input.orderId,
          company_id: input.companyId,
          deleted_at: null,
        },
        select: { status: true, version: true },
      });
      if (
        !currentOrder
        || currentOrder.status !== input.previousStatus
        || currentOrder.version !== input.expectedVersion
      ) {
        return null;
      }

      const openAttendance = await tx.attendanceLog.findFirst({
        where: {
          deleted_at: null,
          checkin_time: { not: null },
          checkout_time: null,
          assignment: {
            order_id: input.orderId,
            deleted_at: null,
            status: { in: ['assigned', 'accepted'] },
          },
        },
        select: { id: true },
      });
      if (openAttendance) {
        throw Errors.conflict(
          'Order cannot be cancelled while a worker has an open attendance session.',
          'ORDER_HAS_ACTIVE_ATTENDANCE'
        );
      }

      const assignments = await tx.assignment.findMany({
        where: {
          order_id: input.orderId,
          deleted_at: null,
          status: { in: ['assigned', 'accepted'] },
        },
        select: { worker: { select: { user_id: true } } },
      });
      const workerUserIds = [...new Set(assignments.map((item) => item.worker.user_id))];

      const result = await tx.order.updateMany({
        where: {
          id: input.orderId,
          company_id: input.companyId,
          deleted_at: null,
          status: input.previousStatus,
          version: input.expectedVersion,
        },
        data: { status: 'cancelled', version: { increment: 1 } },
      });
      if (result.count !== 1) return null;

      const now = new Date();
      await tx.assignment.updateMany({
        where: {
          order_id: input.orderId,
          deleted_at: null,
          status: { in: ['assigned', 'accepted'] },
        },
        data: { status: 'cancelled' },
      });
      await tx.kioskSession.updateMany({
        where: { order_id: input.orderId, deleted_at: null, revoked_at: null },
        data: { revoked_at: now },
      });
      await tx.kioskActiveSession.updateMany({
        where: {
          order_id: input.orderId,
          deleted_at: null,
          status: 'active',
          revoked_at: null,
        },
        data: { status: 'revoked', revoked_at: now },
      });
      await tx.attendanceQrToken.updateMany({
        where: { order_id: input.orderId, deleted_at: null, revoked_at: null },
        data: { revoked_at: now },
      });

      const order = await tx.order.findFirst({
        where: { id: input.orderId, company_id: input.companyId, deleted_at: null },
        include: orderDetailInclude,
      });
      if (!order) return null;

      await tx.orderStatusHistory.create({
        data: {
          order_id: input.orderId,
          from_status: input.previousStatus,
          to_status: order.status,
          actor_id: input.actorId,
          actor_role: input.actorRole,
          reason: input.reason,
          version: order.version,
        },
      });

      await tx.auditLog.create({
        data: {
          actor_id: input.actorId,
          actor_role: input.actorRole,
          action: 'order_cancelled',
          entity_type: 'order',
          entity_id: input.orderId,
          metadata: {
            previous_status: input.previousStatus,
            new_status: order.status,
            reason: input.reason,
            cancelled_assignments: assignments.length,
            revoked_kiosk_at: now.toISOString(),
            previous_version: input.expectedVersion,
            new_version: order.version,
          },
        },
      });

      if (workerUserIds.length > 0) {
        await tx.notification.createMany({
          data: workerUserIds.map((recipientId) => ({
            recipient_id: recipientId,
            type: 'system' as const,
            title: 'Sifariş ləğv edildi',
            body: `"${order.title}" sifarişi ləğv edildi.`,
            metadata: { order_id: order.id, reason: input.reason },
          })),
        });
      }

      const outboxEvent = await tx.outboxEvent.create({
        data: {
          aggregate: 'order',
          aggregate_id: order.id,
          event_type: 'order.cancelled',
          payload: {
            user_ids: workerUserIds,
            title: 'Sifariş ləğv edildi',
            body: `"${order.title}" sifarişi ləğv edildi.`,
            data: { order_id: order.id, role: 'worker' },
          },
        },
        select: { id: true },
      });

      return { order, outboxEventId: outboxEvent.id };
      },
      // Explicit parent/child locks provide the serialization boundary. READ
      // COMMITTED is intentional: if this transaction waited for a concurrent
      // check-in, the attendance recheck must use a fresh post-lock snapshot.
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    if (isTransactionConflictError(error)) return null;
    throw error;
  }
}

function isTransactionConflictError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}
