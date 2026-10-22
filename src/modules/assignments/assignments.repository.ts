import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AssignmentStatus, Role } from '../../types/prisma';
import {
  orderLifecycleWhere,
  reconcileOrderStaffingStatus,
} from '../orders/orders.lifecycle';
import {
  AssignmentWarning,
  buildPositionMismatchWarnings,
  SCHEDULE_CONFLICT_STATUSES,
} from './assignments.rules';

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

const categoryItemSelect = {
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

const assignmentInclude = {
  order_category_item: {
    select: categoryItemSelect,
  },
  position: {
    select: positionSummarySelect,
  },
  order: {
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      required_count: true,
      shift_start: true,
      shift_end: true,
      location: true,
      company_id: true,
      deleted_at: true,
      category_items: {
        where: { deleted_at: null },
        select: categoryItemSelect,
        orderBy: { created_at: 'asc' },
      },
      company: {
        select: {
          id: true,
          name: true,
          status: true,
          user: { select: { id: true, name: true, phone: true, is_review_account: true } },
        },
      },
    },
  },
  worker: {
    select: {
      id: true,
      status: true,
      availability: true,
      position: true,
      profile_photo_url: true,
      positions: {
        select: {
          position_id: true,
          position: { select: positionSummarySelect },
        },
      },
      user: { select: { id: true, name: true, phone: true, is_review_account: true } },
    },
  },
  attendance_logs: {
    where: { deleted_at: null },
    select: {
      id: true,
      checkin_time: true,
      checkout_time: true,
      created_at: true,
      updated_at: true,
    },
    orderBy: { created_at: 'desc' },
    take: 1,
  },
} satisfies Prisma.AssignmentInclude;

export type AssignmentWithRelations = Prisma.AssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

type DuplicateAssignmentSummary = {
  id: string;
  worker_id: string;
  status: AssignmentStatus;
  deleted_at: Date | null;
};

export type CreateAssignmentsResult =
  | { kind: 'created'; assignments: AssignmentWithRelations[]; warnings: AssignmentWarning[] }
  | { kind: 'order_not_active' }
  | { kind: 'category_required' }
  | { kind: 'invalid_category'; category?: string; orderCategoryItemId?: string }
  | { kind: 'invalid_workers'; missingWorkerIds: string[] }
  | { kind: 'cohort_mismatch'; workerIds: string[] }
  | {
      kind: 'unavailable_workers';
      workers: Array<{ id: string; status: string; availability: boolean }>;
    }
  | {
      kind: 'schedule_conflicts';
      conflicts: Array<{
        worker_id: string;
        assignment_id: string;
        order_id: string;
        order_title: string;
        shift_start: Date;
        shift_end: Date;
      }>;
    }
  | { kind: 'duplicate_assignments'; assignments: DuplicateAssignmentSummary[] }
  | {
      kind: 'capacity_exceeded';
      requiredCount: number;
      currentCount: number;
      requestedCount: number;
      category?: string;
    };

export function findCompanyByUserId(userId: string) {
  return prisma.company.findUnique({
    where: { user_id: userId },
    select: {
      id: true,
      status: true,
      deleted_at: true,
      user: { select: { is_review_account: true } },
    },
  });
}

export function findWorkerByUserId(userId: string) {
  return prisma.worker.findUnique({
    where: { user_id: userId },
    select: {
      id: true,
      status: true,
      deleted_at: true,
      user: { select: { is_review_account: true } },
    },
  });
}

export function findAssignmentById(id: string) {
  return prisma.assignment.findFirst({
    where: { id, deleted_at: null },
    include: assignmentInclude,
  });
}

export function findReviewAssignmentById(id: string) {
  return prisma.assignment.findFirst({
    where: {
      id,
      deleted_at: null,
      worker: { user: { is_review_account: true } },
      order: { company: { user: { is_review_account: true } } },
    },
    include: assignmentInclude,
  });
}

export function findAssignmentByIdForReviewScope(id: string, isReviewAccount: boolean) {
  return prisma.assignment.findFirst({
    where: {
      id,
      deleted_at: null,
      worker: { user: { is_review_account: isReviewAccount } },
      order: { company: { user: { is_review_account: isReviewAccount } } },
    },
    include: assignmentInclude,
  });
}

export function findAssignmentByIdForCompany(
  id: string,
  companyId: string,
  isReviewAccount?: boolean,
) {
  return prisma.assignment.findFirst({
    where: {
      id,
      deleted_at: null,
      ...(isReviewAccount === undefined
        ? {}
        : { worker: { user: { is_review_account: isReviewAccount } } }),
      order: { company_id: companyId, deleted_at: null },
    },
    include: assignmentInclude,
  });
}

export function findAssignmentByIdForWorker(
  id: string,
  workerId: string,
  isReviewAccount?: boolean,
) {
  return prisma.assignment.findFirst({
    where: {
      id,
      worker_id: workerId,
      deleted_at: null,
      ...(isReviewAccount === undefined
        ? {}
        : { order: { company: { user: { is_review_account: isReviewAccount } } } }),
    },
    include: assignmentInclude,
  });
}

export async function listAssignments(input: {
  where: Prisma.AssignmentWhereInput;
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
}) {
  const [total, data] = await prisma.$transaction([
    prisma.assignment.count({ where: input.where }),
    prisma.assignment.findMany({
      where: input.where,
      include: assignmentInclude,
      orderBy: [{ assigned_at: input.sort }, { id: input.sort }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);

  return { total, data };
}

export async function findAssignmentCreators(assignmentIds: string[], isReviewAccount = false) {
  if (assignmentIds.length === 0) return [];
  return prisma.auditLog.findMany({
    where: {
      entity_type: 'assignment',
      entity_id: { in: assignmentIds },
      action: 'assignment_created',
      actor: { is_review_account: isReviewAccount },
    },
    select: {
      entity_id: true,
      created_at: true,
      actor: { select: { id: true, name: true } },
    },
    orderBy: { created_at: 'asc' },
  });
}

export function createAssignmentsWithSideEffects(input: {
  actorId: string;
  actorRole: Role;
  actorIsReviewAccount?: boolean;
  orderId: string;
  assignments: Array<{
    workerId: string;
    category?: string;
    orderCategoryItemId?: string;
    positionId?: string;
  }>;
}): Promise<CreateAssignmentsResult> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM "orders" WHERE id = ${input.orderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "order_category_items" WHERE order_id = ${input.orderId} AND deleted_at IS NULL FOR UPDATE`;

    const order = await tx.order.findFirst({
      where: { id: input.orderId, ...orderLifecycleWhere('staffing') },
      select: {
        id: true,
        title: true,
        category: true,
        required_count: true,
        company_id: true,
        shift_start: true,
        shift_end: true,
        company: {
          select: {
            user: { select: { is_review_account: true } },
          },
        },
        category_items: {
          where: { deleted_at: null },
          select: {
            id: true,
            category: true,
            department_id: true,
            subdepartment_id: true,
            position_id: true,
            required_count: true,
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!order) return { kind: 'order_not_active' as const };
    const orderIsReviewAccount = order.company?.user?.is_review_account === true;
    if (orderIsReviewAccount !== (input.actorIsReviewAccount === true)) {
      return {
        kind: 'cohort_mismatch' as const,
        workerIds: input.assignments.map((assignment) => assignment.workerId),
      };
    }
    const resolvedAssignments = input.assignments.map((assignment) => {
      const category = resolveAssignmentCategory(order, assignment);
      return { ...assignment, ...category };
    });
    const invalidCategory = resolvedAssignments.find((assignment) => assignment.kind === 'invalid_category');
    if (invalidCategory) {
      return {
        kind: 'invalid_category' as const,
        category: invalidCategory.category,
        orderCategoryItemId: invalidCategory.orderCategoryItemId,
      };
    }
    if (resolvedAssignments.some((assignment) => assignment.kind === 'category_required')) {
      return { kind: 'category_required' as const };
    }

    const workerIds = resolvedAssignments.map((assignment) => assignment.workerId);

    // Serialize assignment decisions for the same workers across different
    // orders. This makes the overlap check safe under concurrent admin calls.
    const sortedWorkerIds = [...workerIds].sort();
    if (sortedWorkerIds.length > 0) {
      await tx.$queryRaw(Prisma.sql`
        SELECT id
        FROM "workers"
        WHERE id IN (${Prisma.join(sortedWorkerIds)})
        ORDER BY id
        FOR UPDATE
      `);
    }

    const workers = await tx.worker.findMany({
      where: { id: { in: workerIds }, deleted_at: null },
      select: {
        id: true,
        user_id: true,
        status: true,
        availability: true,
        // Preserve the production account-state guard: a worker profile alone
        // is not assignable when the owning user was disabled or deleted.
        user: {
          select: {
            name: true,
            is_active: true,
            deleted_at: true,
            is_review_account: true,
          },
        },
        positions: { select: { position_id: true } },
      },
    });

    const foundWorkerIds = new Set(workers.map((worker) => worker.id));
    const missingWorkerIds = workerIds.filter((workerId) => !foundWorkerIds.has(workerId));
    if (missingWorkerIds.length > 0) {
      return { kind: 'invalid_workers' as const, missingWorkerIds };
    }

    const cohortMismatchWorkerIds = workers
      .filter((worker) => (worker.user.is_review_account === true) !== orderIsReviewAccount)
      .map((worker) => worker.id);
    if (cohortMismatchWorkerIds.length > 0) {
      return { kind: 'cohort_mismatch' as const, workerIds: cohortMismatchWorkerIds };
    }

    const unavailableWorkers = workers.filter((worker) =>
      worker.status !== 'approved'
      || !worker.availability
      || !worker.user.is_active
      || worker.user.deleted_at !== null
    );
    if (unavailableWorkers.length > 0) {
      return {
        kind: 'unavailable_workers' as const,
        workers: unavailableWorkers.map((worker) => ({
          id: worker.id,
          status: worker.status,
          availability: worker.availability,
        })),
      };
    }

    const scheduleConflicts = await tx.assignment.findMany({
      where: {
        worker_id: { in: workerIds },
        order_id: { not: input.orderId },
        status: { in: SCHEDULE_CONFLICT_STATUSES },
        deleted_at: null,
        order: {
          deleted_at: null,
          shift_start: { lt: order.shift_end },
          shift_end: { gt: order.shift_start },
        },
      },
      select: {
        id: true,
        worker_id: true,
        order_id: true,
        order: {
          select: {
            title: true,
            shift_start: true,
            shift_end: true,
          },
        },
      },
      orderBy: { assigned_at: 'asc' },
    });
    if (scheduleConflicts.length > 0) {
      return {
        kind: 'schedule_conflicts' as const,
        conflicts: scheduleConflicts.map((assignment) => ({
          worker_id: assignment.worker_id,
          assignment_id: assignment.id,
          order_id: assignment.order_id,
          order_title: assignment.order.title,
          shift_start: assignment.order.shift_start,
          shift_end: assignment.order.shift_end,
        })),
      };
    }

    const warnings = buildPositionMismatchWarnings(resolvedAssignments, workers);

    const duplicateAssignments = await tx.assignment.findMany({
      where: { order_id: input.orderId, worker_id: { in: workerIds } },
      select: { id: true, worker_id: true, status: true, deleted_at: true },
    });
    if (duplicateAssignments.length > 0) {
      return {
        kind: 'duplicate_assignments' as const,
        assignments: duplicateAssignments,
      };
    }

    const categoryGroups = new Map<string, typeof resolvedAssignments>();
    for (const assignment of resolvedAssignments) {
      const key = assignment.orderCategoryItemId ?? `legacy:${assignment.assignedCategory}`;
      categoryGroups.set(key, [...(categoryGroups.get(key) ?? []), assignment]);
    }

    for (const group of categoryGroups.values()) {
      const sample = group[0];
      const item = sample.orderCategoryItemId
        ? order.category_items.find((categoryItem) => categoryItem.id === sample.orderCategoryItemId)
        : null;
      const requiredCount = item?.required_count ?? order.required_count;
      const currentCount = await tx.assignment.count({
        where: {
          order_id: input.orderId,
          deleted_at: null,
          status: { in: ['assigned', 'accepted', 'completed'] },
          ...(sample.orderCategoryItemId
            ? { order_category_item_id: sample.orderCategoryItemId }
            : {
                OR: [
                  { order_category_item_id: null, assigned_category: sample.assignedCategory },
                  { order_category_item_id: null, assigned_category: null },
                ],
              }),
        },
      });

      if (currentCount + group.length > requiredCount) {
        return {
          kind: 'capacity_exceeded' as const,
          requiredCount,
          currentCount,
          requestedCount: group.length,
          category: sample.assignedCategory,
        };
      }
    }

    const created: AssignmentWithRelations[] = [];
    for (const worker of workers) {
      const requestedAssignment = resolvedAssignments.find((assignment) => assignment.workerId === worker.id)!;
      const assignment = await tx.assignment.create({
        data: {
          order_id: input.orderId,
          order_category_item_id: requestedAssignment.orderCategoryItemId,
          assigned_category: requestedAssignment.assignedCategory,
          position_id: requestedAssignment.positionId,
          worker_id: worker.id,
          status: 'assigned',
        },
        include: assignmentInclude,
      });
      created.push(assignment);

      await tx.notification.create({
        data: {
          recipient_id: worker.user_id,
          type: 'job_assigned',
          title: 'Yeni növbə təyin olundu',
          body: `"${order.title}" sifarişinə təyin olundunuz.`,
          metadata: {
            order_id: input.orderId,
            assignment_id: assignment.id,
            worker_id: worker.id,
            category: assignment.assigned_category,
            position_id: assignment.position_id,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actor_id: input.actorId,
          actor_role: input.actorRole,
          action: 'assignment_created',
          entity_type: 'assignment',
          entity_id: assignment.id,
          metadata: {
            order_id: input.orderId,
            worker_id: worker.id,
            category: assignment.assigned_category,
            position_id: assignment.position_id,
            status: assignment.status,
          },
        },
      });
    }

    await reconcileOrderStaffingStatus(tx, input.orderId, {
      actorId: input.actorId,
      actorRole: input.actorRole,
      reason: 'assignment_created',
    });

    const refreshed = await tx.assignment.findMany({
      where: { id: { in: created.map((assignment) => assignment.id) }, deleted_at: null },
      include: assignmentInclude,
      orderBy: { assigned_at: 'asc' },
    });
    return { kind: 'created' as const, assignments: refreshed, warnings };
  });
}

function resolveAssignmentCategory(
  order: {
    category: string;
    category_items: Array<{
      id: string;
      category: string;
      department_id: string | null;
      subdepartment_id: string | null;
      position_id: string | null;
      required_count: number;
    }>;
  },
  assignment: { workerId: string; category?: string; orderCategoryItemId?: string; positionId?: string }
) {
  if (assignment.orderCategoryItemId) {
    const item = order.category_items.find((categoryItem) => categoryItem.id === assignment.orderCategoryItemId);
    if (item && assignment.positionId && item.position_id && item.position_id !== assignment.positionId) {
      return {
        kind: 'invalid_category' as const,
        orderCategoryItemId: assignment.orderCategoryItemId,
        category: assignment.category,
      };
    }
    return item
      ? { kind: 'ok' as const, orderCategoryItemId: item.id, assignedCategory: item.category, positionId: item.position_id ?? undefined }
      : {
          kind: 'invalid_category' as const,
          orderCategoryItemId: assignment.orderCategoryItemId,
          category: assignment.category,
        };
  }

  if (assignment.positionId) {
    const item = order.category_items.find((categoryItem) => categoryItem.position_id === assignment.positionId);
    return item
      ? { kind: 'ok' as const, orderCategoryItemId: item.id, assignedCategory: item.category, positionId: item.position_id ?? undefined }
      : { kind: 'invalid_category' as const, category: assignment.category };
  }

  if (assignment.category) {
    const item = order.category_items.find(
      (categoryItem) => categoryItem.category.toLowerCase() === assignment.category!.toLowerCase()
    );
    if (item) return { kind: 'ok' as const, orderCategoryItemId: item.id, assignedCategory: item.category, positionId: item.position_id ?? undefined };
    if (order.category_items.length === 0 && order.category.toLowerCase() === assignment.category.toLowerCase()) {
      return { kind: 'ok' as const, orderCategoryItemId: undefined, assignedCategory: order.category };
    }
    return { kind: 'invalid_category' as const, category: assignment.category };
  }

  if (order.category_items.length === 1) {
    const [item] = order.category_items;
    return { kind: 'ok' as const, orderCategoryItemId: item.id, assignedCategory: item.category, positionId: item.position_id ?? undefined };
  }

  if (order.category_items.length === 0) {
    return { kind: 'ok' as const, orderCategoryItemId: undefined, assignedCategory: order.category };
  }

  return { kind: 'category_required' as const };
}

export function changeWorkerAssignmentStatus(input: {
  assignmentId: string;
  workerId: string;
  actorId: string;
  actorRole: Role;
  nextStatus: Extract<AssignmentStatus, 'accepted' | 'rejected'>;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const candidate = await tx.assignment.findFirst({
      where: {
        id: input.assignmentId,
        worker_id: input.workerId,
        deleted_at: null,
      },
      select: {
        order_id: true,
        worker: { select: { user: { select: { is_review_account: true } } } },
        order: {
          select: {
            company: { select: { user: { select: { is_review_account: true } } } },
          },
        },
      },
    });
    if (!candidate) return null;
    if (
      (candidate.worker.user.is_review_account === true)
      !== (candidate.order.company.user.is_review_account === true)
    ) return null;

    await tx.$queryRaw`SELECT id FROM "orders" WHERE id = ${candidate.order_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "assignments" WHERE id = ${input.assignmentId} FOR UPDATE`;

    const changedAt = new Date();
    const result = await tx.assignment.updateMany({
      where: {
        id: input.assignmentId,
        worker_id: input.workerId,
        deleted_at: null,
        status: 'assigned',
        order: orderLifecycleWhere('staffing'),
      },
      data: {
        status: input.nextStatus,
        attendance_activity_at: changedAt,
      },
    });

    if (result.count !== 1) return null;

    if (input.nextStatus === 'rejected') {
      await tx.attendanceQrToken.updateMany({
        where: {
          assignment_id: input.assignmentId,
          deleted_at: null,
          revoked_at: null,
        },
        data: { revoked_at: changedAt },
      });
    }

    await reconcileOrderStaffingStatus(tx, candidate.order_id, {
      actorId: input.actorId,
      actorRole: input.actorRole,
      reason: `assignment_${input.nextStatus}`,
    });

    const assignment = await tx.assignment.findFirst({
      where: { id: input.assignmentId, worker_id: input.workerId, deleted_at: null },
      include: assignmentInclude,
    });
    if (!assignment) return null;

    await tx.auditLog.create({
      data: {
        actor_id: input.actorId,
        actor_role: input.actorRole,
        action: 'status_changed',
        entity_type: 'assignment',
        entity_id: input.assignmentId,
        metadata: {
          previous_status: 'assigned',
          new_status: input.nextStatus,
          order_id: assignment.order_id,
          worker_id: assignment.worker_id,
        },
      },
    });

    await tx.notification.create({
      data: {
        recipient_id: assignment.order.company.user.id,
        type: 'system',
        title: input.nextStatus === 'accepted' ? 'Növbə qəbul edildi' : 'Növbə rədd edildi',
        body:
          input.nextStatus === 'accepted'
            ? `${assignment.worker.user.name} "${assignment.order.title}" növbəsini qəbul etdi.`
            : `${assignment.worker.user.name} "${assignment.order.title}" növbəsini rədd etdi.`,
        metadata: {
          assignment_id: assignment.id,
          order_id: assignment.order_id,
          worker_id: assignment.worker_id,
          status: input.nextStatus,
        },
      },
    });

    return assignment;
  });
}

export function cancelAssignmentWithAudit(input: {
  assignmentId: string;
  actorId: string;
  actorRole: Role;
  actorIsReviewAccount?: boolean;
  reason?: string;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const candidate = await tx.assignment.findFirst({
      where: { id: input.assignmentId, deleted_at: null },
      select: { order_id: true },
    });
    if (!candidate) return { kind: 'not_found' as const };

    // Match check-in and whole-order cancellation: parent order is always locked
    // before its assignment so concurrent lifecycle mutations cannot deadlock.
    await tx.$queryRaw`
      SELECT id
      FROM "orders"
      WHERE id = ${candidate.order_id}
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT id
      FROM "assignments"
      WHERE id = ${input.assignmentId}
      FOR UPDATE
    `;

    const current = await tx.assignment.findFirst({
      where: { id: input.assignmentId, deleted_at: null },
      include: assignmentInclude,
    });
    if (!current) return { kind: 'not_found' as const };
    if (
      (current.worker.user.is_review_account === true)
      !== (current.order.company.user.is_review_account === true)
      || (current.order.company.user.is_review_account === true)
        !== (input.actorIsReviewAccount === true)
    ) return { kind: 'cohort_mismatch' as const };
    if (current.status === 'cancelled') return { kind: 'already_cancelled' as const };
    if (current.status === 'completed') return { kind: 'already_completed' as const };

    if (current.status === 'accepted') {
      const openAttendance = await tx.attendanceLog.findFirst({
        where: {
          assignment_id: input.assignmentId,
          checkout_time: null,
          deleted_at: null,
        },
        select: { id: true },
      });
      if (openAttendance) {
        return {
          kind: 'open_attendance' as const,
          attendanceId: openAttendance.id,
        };
      }
    }

    const changedAt = new Date();
    const result = await tx.assignment.updateMany({
      where: {
        id: input.assignmentId,
        deleted_at: null,
        status: current.status,
      },
      data: {
        status: 'cancelled',
        attendance_activity_at: changedAt,
      },
    });

    if (result.count !== 1) return { kind: 'state_changed' as const };

    await tx.attendanceQrToken.updateMany({
      where: {
        assignment_id: input.assignmentId,
        deleted_at: null,
        revoked_at: null,
      },
      data: { revoked_at: changedAt },
    });

    await reconcileOrderStaffingStatus(tx, current.order_id, {
      actorId: input.actorId,
      actorRole: input.actorRole,
      reason: 'assignment_cancelled',
    });

    const assignment = await tx.assignment.findFirst({
      where: { id: input.assignmentId, deleted_at: null },
      include: assignmentInclude,
    });
    if (!assignment) return { kind: 'state_changed' as const };

    await tx.auditLog.create({
      data: {
        actor_id: input.actorId,
        actor_role: input.actorRole,
        action: 'status_changed',
        entity_type: 'assignment',
        entity_id: input.assignmentId,
        metadata: {
          previous_status: current.status,
          new_status: 'cancelled',
          order_id: assignment.order_id,
          worker_id: assignment.worker_id,
          reason: input.reason,
        },
      },
    });

    await tx.notification.create({
      data: {
        recipient_id: assignment.worker.user.id,
        type: 'system',
        title: 'Təyinat ləğv edildi',
        body: `"${assignment.order.title}" üzrə təyinatınız ləğv edildi.`,
        metadata: {
          assignment_id: assignment.id,
          order_id: assignment.order_id,
          worker_id: assignment.worker_id,
          reason: input.reason,
        },
      },
    });

    return { kind: 'cancelled' as const, assignment };
  });
}
