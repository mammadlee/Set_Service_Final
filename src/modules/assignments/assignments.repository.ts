import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AssignmentStatus, Role } from '../../types/prisma';

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
          user: { select: { id: true, name: true, phone: true } },
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
      positions: {
        select: {
          position_id: true,
          position: { select: positionSummarySelect },
        },
      },
      user: { select: { id: true, name: true, phone: true } },
    },
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
  | { kind: 'created'; assignments: AssignmentWithRelations[] }
  | { kind: 'order_not_active' }
  | { kind: 'category_required' }
  | { kind: 'invalid_category'; category?: string; orderCategoryItemId?: string }
  | { kind: 'invalid_workers'; missingWorkerIds: string[] }
  | {
      kind: 'unavailable_workers';
      workers: Array<{ id: string; status: string; availability: boolean }>;
    }
  | {
      kind: 'position_mismatch';
      workers: Array<{ id: string; position_id: string; category?: string }>;
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
    select: { id: true, status: true, deleted_at: true },
  });
}

export function findWorkerByUserId(userId: string) {
  return prisma.worker.findUnique({
    where: { user_id: userId },
    select: { id: true, status: true, deleted_at: true },
  });
}

export function findAssignmentById(id: string) {
  return prisma.assignment.findFirst({
    where: { id, deleted_at: null },
    include: assignmentInclude,
  });
}

export function findAssignmentByIdForCompany(id: string, companyId: string) {
  return prisma.assignment.findFirst({
    where: { id, deleted_at: null, order: { company_id: companyId, deleted_at: null } },
    include: assignmentInclude,
  });
}

export function findAssignmentByIdForWorker(id: string, workerId: string) {
  return prisma.assignment.findFirst({
    where: { id, worker_id: workerId, deleted_at: null },
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
      orderBy: { assigned_at: input.sort },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);

  return { total, data };
}

export function createAssignmentsWithSideEffects(input: {
  actorId: string;
  actorRole: Role;
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
      where: { id: input.orderId, status: 'active', deleted_at: null },
      select: {
        id: true,
        title: true,
        category: true,
        required_count: true,
        company_id: true,
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

    const workers = await tx.worker.findMany({
      where: { id: { in: workerIds }, deleted_at: null },
      select: {
        id: true,
        user_id: true,
        status: true,
        availability: true,
        user: { select: { name: true } },
        positions: { select: { position_id: true } },
      },
    });

    const foundWorkerIds = new Set(workers.map((worker) => worker.id));
    const missingWorkerIds = workerIds.filter((workerId) => !foundWorkerIds.has(workerId));
    if (missingWorkerIds.length > 0) {
      return { kind: 'invalid_workers' as const, missingWorkerIds };
    }

    const unavailableWorkers = workers.filter((worker) => worker.status !== 'approved' || !worker.availability);
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

    const workersById = new Map(workers.map((worker) => [worker.id, worker]));
    const positionMismatches = resolvedAssignments.filter((assignment) => {
      if (!assignment.positionId) return false;
      const worker = workersById.get(assignment.workerId);
      return !worker?.positions.some((position) => position.position_id === assignment.positionId);
    });
    if (positionMismatches.length > 0) {
      return {
        kind: 'position_mismatch' as const,
        workers: positionMismatches.map((assignment) => ({
          id: assignment.workerId,
          position_id: assignment.positionId!,
          category: assignment.assignedCategory,
        })),
      };
    }

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

    return { kind: 'created' as const, assignments: created };
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
    const result = await tx.assignment.updateMany({
      where: {
        id: input.assignmentId,
        worker_id: input.workerId,
        deleted_at: null,
        status: 'assigned',
        order: {
          status: 'active',
          deleted_at: null,
        },
      },
      data: { status: input.nextStatus },
    });

    if (result.count !== 1) return null;

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
  previousStatus: AssignmentStatus;
  reason?: string;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.assignment.updateMany({
      where: {
        id: input.assignmentId,
        deleted_at: null,
        status: { notIn: ['cancelled', 'completed'] },
      },
      data: { status: 'cancelled' },
    });

    if (result.count !== 1) return null;

    const assignment = await tx.assignment.findFirst({
      where: { id: input.assignmentId, deleted_at: null },
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
          previous_status: input.previousStatus,
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

    return assignment;
  });
}
