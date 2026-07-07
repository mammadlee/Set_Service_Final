import { Prisma } from '@prisma/client';
import { Errors } from '../../lib/errors';
import { sendPushToUser } from '../../lib/fcm';
import { AssignmentStatus, Role } from '../../types/prisma';
import {
  CancelAssignmentInput,
  CreateAssignmentsInput,
  ListAssignmentsQueryInput,
} from './assignments.schema';
import * as AssignmentsRepository from './assignments.repository';

type AssignmentRecord = NonNullable<Awaited<ReturnType<typeof AssignmentsRepository.findAssignmentById>>>;
type CompanyRecord = NonNullable<Awaited<ReturnType<typeof AssignmentsRepository.findCompanyByUserId>>>;
type WorkerRecord = NonNullable<Awaited<ReturnType<typeof AssignmentsRepository.findWorkerByUserId>>>;

export async function createAssignments(actorId: string, roleValue: string, input: CreateAssignmentsInput) {
  const role = parseRole(roleValue);
  if (role !== 'super_admin' && role !== 'admin') {
    throw Errors.forbidden('Only admin can create assignments.', 'ROLE_FORBIDDEN');
  }

  const assignmentRequests = normalizeAssignmentRequests(input);
  uniqueWorkerIds(assignmentRequests.map((assignment) => assignment.workerId));
  const result = await AssignmentsRepository.createAssignmentsWithSideEffects({
    actorId,
    actorRole: role,
    orderId: input.order_id,
    assignments: assignmentRequests,
  });

  switch (result.kind) {
    case 'created':
      await Promise.allSettled(
        result.assignments.map((assignment) =>
          sendPushToUser(assignment.worker.user.id, {
            title: 'Yeni növbə təyin olundu',
            body: `"${assignment.order.title}" sifarişinə təyin olundunuz.`,
            data: {
              type: 'job_assigned',
              assignment_id: assignment.id,
              order_id: input.order_id,
              role: 'worker',
            },
          })
        )
      );
      return {
        assigned_count: result.assignments.length,
        assignments: result.assignments.map((assignment) => toAssignmentResponse(assignment, role)),
      };
    case 'order_not_active':
      throw Errors.conflict('Order must exist and be active before workers can be assigned.', 'ORDER_NOT_ACTIVE');
    case 'category_required':
      throw Errors.badRequest('Category is required when assigning workers to a multi-category order.', 'ASSIGNMENT_CATEGORY_REQUIRED');
    case 'invalid_category':
      throw Errors.badRequest('Assignment category does not belong to this order.', 'INVALID_ORDER_CATEGORY', {
        category: result.category,
        order_category_item_id: result.orderCategoryItemId,
      });
    case 'invalid_workers':
      throw Errors.badRequest('One or more workers were not found.', 'WORKERS_NOT_FOUND', {
        worker_ids: result.missingWorkerIds,
      });
    case 'unavailable_workers':
      throw Errors.badRequest('All assigned workers must be approved and available.', 'WORKERS_NOT_AVAILABLE', {
        workers: result.workers,
      });
    case 'position_mismatch':
      throw Errors.badRequest('Seçilmiş işçi bu vəzifə üçün uyğun deyil.', 'WORKER_POSITION_MISMATCH', {
        workers: result.workers,
      });
    case 'duplicate_assignments':
      throw Errors.conflict('One or more workers are already assigned to this order.', 'DUPLICATE_ASSIGNMENT', {
        assignments: result.assignments.map((assignment) => ({
          id: assignment.id,
          worker_id: assignment.worker_id,
          status: assignment.status,
          deleted_at: assignment.deleted_at,
        })),
      });
    case 'capacity_exceeded':
      throw Errors.conflict('Assignment count cannot exceed order required worker count.', 'ORDER_CAPACITY_EXCEEDED', {
        required_count: result.requiredCount,
        current_count: result.currentCount,
        requested_count: result.requestedCount,
        category: result.category,
      });
  }
}

export async function listAssignments(userId: string, roleValue: string, filters: ListAssignmentsQueryInput) {
  const role = parseRole(roleValue);
  const where: Prisma.AssignmentWhereInput = { deleted_at: null };

  if (filters.status) where.status = filters.status;
  if (filters.order_id) where.order_id = filters.order_id;
  if (filters.position_id) where.position_id = filters.position_id;

  if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    where.order = { company_id: company.id, deleted_at: null };
    if (filters.worker_id) where.worker_id = filters.worker_id;
  } else if (role === 'worker') {
    const worker = await getApprovedWorkerForUser(userId);
    if (filters.worker_id && filters.worker_id !== worker.id) {
      throw Errors.forbidden('Workers can only view their own assignments.', 'ASSIGNMENT_ACCESS_DENIED');
    }
    where.worker_id = worker.id;
  } else if (role === 'super_admin' || role === 'admin') {
    if (filters.worker_id) where.worker_id = filters.worker_id;
  } else {
    throw Errors.forbidden('Account role is not supported.', 'ROLE_FORBIDDEN');
  }

  const { data, total } = await AssignmentsRepository.listAssignments({
    where,
    page: filters.page,
    limit: filters.limit,
    sort: filters.sort,
  });

  return {
    data: data.map((assignment: AssignmentRecord) => toAssignmentResponse(assignment, role)),
    meta: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: Math.ceil(total / filters.limit),
    },
  };
}

export async function getAssignment(id: string, userId: string, roleValue: string) {
  const assignment = await findVisibleAssignment(id, userId, parseRole(roleValue));
  if (!assignment) throw Errors.notFound('Assignment not found.', 'ASSIGNMENT_NOT_FOUND');
  return toAssignmentResponse(assignment, parseRole(roleValue));
}

export async function acceptAssignment(id: string, userId: string, roleValue: string) {
  return changeOwnAssignmentStatus(id, userId, parseRole(roleValue), 'accepted');
}

export async function rejectAssignment(id: string, userId: string, roleValue: string) {
  return changeOwnAssignmentStatus(id, userId, parseRole(roleValue), 'rejected');
}

export async function cancelAssignment(
  id: string,
  actorId: string,
  roleValue: string,
  input: CancelAssignmentInput
) {
  const role = parseRole(roleValue);
  if (role !== 'super_admin' && role !== 'admin') {
    throw Errors.forbidden('Only admin can cancel assignments.', 'ROLE_FORBIDDEN');
  }

  const assignment = await AssignmentsRepository.findAssignmentById(id);
  if (!assignment) throw Errors.notFound('Assignment not found.', 'ASSIGNMENT_NOT_FOUND');
  if (assignment.status === 'cancelled') {
    throw Errors.conflict('Assignment is already cancelled.', 'ASSIGNMENT_ALREADY_CANCELLED');
  }
  if (assignment.status === 'completed') {
    throw Errors.badRequest('Completed assignments cannot be cancelled.', 'ASSIGNMENT_ALREADY_COMPLETED');
  }

  const updated = await AssignmentsRepository.cancelAssignmentWithAudit({
    assignmentId: id,
    actorId,
    actorRole: role,
    previousStatus: assignment.status,
    reason: input.reason,
  });

  if (!updated) {
    const latest = await AssignmentsRepository.findAssignmentById(id);
    if (latest?.status === 'cancelled') {
      throw Errors.conflict('Assignment is already cancelled.', 'ASSIGNMENT_ALREADY_CANCELLED');
    }
    if (latest?.status === 'completed') {
      throw Errors.badRequest('Completed assignments cannot be cancelled.', 'ASSIGNMENT_ALREADY_COMPLETED');
    }
    throw Errors.conflict('Assignment could not be cancelled because it changed. Please retry.', 'ASSIGNMENT_CANCEL_CONFLICT');
  }

  await sendPushToUser(updated.worker.user.id, {
    title: 'Təyinat ləğv edildi',
    body: `"${updated.order.title}" üzrə təyinatınız ləğv edildi.`,
    data: {
      type: 'assignment_cancelled',
      assignment_id: updated.id,
      order_id: updated.order_id,
      role: 'worker',
    },
  });

  return toAssignmentResponse(updated, role);
}

async function changeOwnAssignmentStatus(
  id: string,
  userId: string,
  role: Role,
  nextStatus: Extract<AssignmentStatus, 'accepted' | 'rejected'>
) {
  if (role !== 'worker') {
    throw Errors.forbidden('Only assigned workers can accept or reject assignments.', 'ROLE_FORBIDDEN');
  }

  const worker = await getApprovedWorkerForUser(userId);
  const assignment = await AssignmentsRepository.findAssignmentByIdForWorker(id, worker.id);
  if (!assignment) throw Errors.notFound('Assignment not found.', 'ASSIGNMENT_NOT_FOUND');
  if (assignment.order.status !== 'active' || assignment.order.deleted_at !== null) {
    throw Errors.conflict('Order is not active.', 'ORDER_NOT_ACTIVE');
  }

  if (assignment.status !== 'assigned') {
    throw assignmentStatusError(assignment.status);
  }

  const updated = await AssignmentsRepository.changeWorkerAssignmentStatus({
    assignmentId: id,
    workerId: worker.id,
    actorId: userId,
    actorRole: role,
    nextStatus,
  });

  if (!updated) {
    const latest = await AssignmentsRepository.findAssignmentByIdForWorker(id, worker.id);
    if (latest && (latest.order.status !== 'active' || latest.order.deleted_at !== null)) {
      throw Errors.conflict('Order is not active.', 'ORDER_NOT_ACTIVE');
    }
    if (latest) throw assignmentStatusError(latest.status);
    throw Errors.conflict('Assignment could not be updated because it changed. Please retry.', 'ASSIGNMENT_STATUS_CONFLICT');
  }

  await sendPushToUser(updated.order.company.user.id, {
    title: nextStatus === 'accepted' ? 'Növbə qəbul edildi' : 'Növbə rədd edildi',
    body:
      nextStatus === 'accepted'
        ? `${updated.worker.user.name} "${updated.order.title}" növbəsini qəbul etdi.`
        : `${updated.worker.user.name} "${updated.order.title}" növbəsini rədd etdi.`,
    data: {
      type: nextStatus === 'accepted' ? 'assignment_accepted' : 'assignment_rejected',
      assignment_id: updated.id,
      order_id: updated.order_id,
      role: 'company',
    },
  });

  return toAssignmentResponse(updated, role);
}

function uniqueWorkerIds(workerIds: string[]): string[] {
  const unique = [...new Set(workerIds)];
  if (unique.length !== workerIds.length) {
    throw Errors.badRequest('worker_ids must not contain duplicates.', 'DUPLICATE_WORKER_IDS');
  }
  return unique;
}

function normalizeAssignmentRequests(input: CreateAssignmentsInput) {
  if (input.assignments?.length) {
    return input.assignments.map((assignment) => ({
      workerId: assignment.worker_id,
      category: assignment.category,
      orderCategoryItemId: assignment.order_category_item_id,
      positionId: assignment.position_id,
    }));
  }

  return (input.worker_ids ?? []).map((workerId) => ({
    workerId,
    category: input.category,
    orderCategoryItemId: input.order_category_item_id,
    positionId: input.position_id,
  }));
}

async function findVisibleAssignment(id: string, userId: string, role: Role): Promise<AssignmentRecord | null> {
  if (role === 'super_admin' || role === 'admin') {
    return AssignmentsRepository.findAssignmentById(id);
  }

  if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    return AssignmentsRepository.findAssignmentByIdForCompany(id, company.id);
  }

  if (role === 'worker') {
    const worker = await getApprovedWorkerForUser(userId);
    return AssignmentsRepository.findAssignmentByIdForWorker(id, worker.id);
  }

  return null;
}

async function getApprovedCompanyForUser(userId: string): Promise<CompanyRecord> {
  const company = await AssignmentsRepository.findCompanyByUserId(userId);
  if (!company || company.deleted_at) {
    throw Errors.notFound('Company profile not found.', 'COMPANY_NOT_FOUND');
  }
  if (company.status !== 'approved') {
    throw Errors.forbidden('Company account must be approved before using assignment APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: company.status,
    });
  }
  return company;
}

async function getApprovedWorkerForUser(userId: string): Promise<WorkerRecord> {
  const worker = await AssignmentsRepository.findWorkerByUserId(userId);
  if (!worker || worker.deleted_at) {
    throw Errors.notFound('Worker profile not found.', 'WORKER_NOT_FOUND');
  }
  if (worker.status !== 'approved') {
    throw Errors.forbidden('Worker account must be approved before using assignment APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: worker.status,
    });
  }
  return worker;
}

function assignmentStatusError(status: AssignmentStatus) {
  if (status === 'accepted') {
    return Errors.conflict('Assignment is already accepted.', 'ASSIGNMENT_ALREADY_ACCEPTED');
  }
  if (status === 'rejected') {
    return Errors.conflict('Assignment is already rejected.', 'ASSIGNMENT_ALREADY_REJECTED');
  }
  if (status === 'cancelled') {
    return Errors.badRequest('Cancelled assignments cannot be accepted or rejected.', 'ASSIGNMENT_CANCELLED');
  }
  if (status === 'completed') {
    return Errors.badRequest('Completed assignments cannot be accepted or rejected.', 'ASSIGNMENT_COMPLETED');
  }
  return Errors.conflict('Assignment is not ready for this status change.', 'ASSIGNMENT_STATUS_CONFLICT');
}

function parseRole(role: string): Role {
  if (role === 'super_admin' || role === 'admin' || role === 'company' || role === 'worker') return role;
  throw Errors.forbidden('Account role is not supported.', 'ROLE_FORBIDDEN');
}

function toAssignmentResponse(assignment: AssignmentRecord, viewerRole: Role) {
  return {
    id: assignment.id,
    order_id: assignment.order_id,
    worker_id: assignment.worker_id,
    order_category_item_id: assignment.order_category_item_id,
    position_id: assignment.position_id,
    category: assignment.assigned_category ?? assignment.order.category,
    category_item: assignment.order_category_item
      ? {
          id: assignment.order_category_item.id,
          category: assignment.order_category_item.category,
          department_id: assignment.order_category_item.department_id,
          subdepartment_id: assignment.order_category_item.subdepartment_id,
          position_id: assignment.order_category_item.position_id,
          department: assignment.order_category_item.department,
          subdepartment: assignment.order_category_item.subdepartment,
          position: assignment.order_category_item.position,
          required_count: assignment.order_category_item.required_count,
          notes: assignment.order_category_item.notes,
        }
      : null,
    position: assignment.position,
    status: assignment.status,
    assigned_at: assignment.assigned_at,
    updated_at: assignment.updated_at,
    order: {
      id: assignment.order.id,
      title: assignment.order.title,
      category: assignment.order.category,
      category_items: assignment.order.category_items,
      status: assignment.order.status,
      required_count: assignment.order.required_count,
      start_datetime: assignment.order.shift_start,
      end_datetime: assignment.order.shift_end,
      location: assignment.order.location,
      company: {
        id: assignment.order.company.id,
        name: assignment.order.company.name,
        status: assignment.order.company.status,
        contact_name: assignment.order.company.user.name,
        phone: assignment.order.company.user.phone,
      },
    },
    worker: {
      id: assignment.worker.id,
      name: assignment.worker.user.name,
      ...(viewerRole === 'company' ? {} : { phone: assignment.worker.user.phone }),
      status: assignment.worker.status,
      availability: assignment.worker.availability,
      position: assignment.worker.position,
      position_ids: assignment.worker.positions.map((item: { position_id: string }) => item.position_id),
      positions: assignment.worker.positions.map((item: { position: unknown }) => item.position),
    },
  };
}
