import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import '../src/middleware/auth';
import { AppError } from '../src/lib/errors';
import { prisma } from '../src/lib/prisma';
import {
  isReviewScopedRequest,
  restrictReviewAdminPermissions,
} from '../src/lib/review-scope';
import { requirePermission } from '../src/middleware/rbac';
import { ListOrdersQuerySchema } from '../src/modules/orders/orders.schema';
import { ListAssignmentsQuerySchema } from '../src/modules/assignments/assignments.schema';
import { ListAttendanceQuerySchema } from '../src/modules/attendance/attendance.schema';
import { ReportQuerySchema } from '../src/modules/reports/reports.schema';
import type { CreateOrderForPersistence } from '../src/modules/orders/orders.repository';

const REVIEW_USER_FILTER = { is_review_account: true };
const PRODUCTION_USER_FILTER = { is_review_account: false };

function assertReviewUserFilter(actual: unknown, message: string): void {
  assert.deepEqual(actual, REVIEW_USER_FILTER, message);
}

function assertProductionUserFilter(actual: unknown, message: string): void {
  assert.deepEqual(actual, PRODUCTION_USER_FILTER, message);
}

async function expectNotFound(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => (
    error instanceof AppError
    && error.statusCode === 404
    && error.code === code
  ));
}

async function invokeMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
): Promise<unknown> {
  return new Promise((resolve) => {
    middleware(req, {} as Response, ((error?: unknown) => resolve(error)) as NextFunction);
  });
}

async function testPermissionCeilingAndRequestScope(): Promise<void> {
  assert.deepEqual(
    restrictReviewAdminPermissions(['view_workers', 'manage_workers'], true),
    ['view_workers'],
    'reviewer permissions must be intersected with the fixed view-only allowlist',
  );
  assert.deepEqual(
    restrictReviewAdminPermissions(['view_workers', 'manage_workers'], false),
    ['view_workers', 'manage_workers'],
    'normal admin permissions must remain unchanged',
  );

  (prisma.user.findUnique as unknown) = async () => ({
    role: 'admin',
    is_active: true,
    deleted_at: null,
    is_review_account: true,
    admin: { permissions: ['view_workers', 'manage_workers'] },
  });

  const viewRequest = {
    user: { sub: 'review-admin', role: 'admin', session_version: 1 },
  } as unknown as Request;
  assert.equal(await invokeMiddleware(requirePermission('view_workers'), viewRequest), undefined);
  assert.equal(isReviewScopedRequest(viewRequest), true, 'RBAC must attach review scope to the request');

  const manageRequest = {
    user: { sub: 'review-admin', role: 'admin', session_version: 1 },
  } as unknown as Request;
  const denied = await invokeMiddleware(requirePermission('manage_workers'), manageRequest);
  assert.ok(denied instanceof AppError);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.code, 'PERMISSION_DENIED');
}

async function testEntityListAndDetailIsolation(): Promise<void> {
  (prisma.$transaction as unknown) = async (input: unknown) => (
    Array.isArray(input) ? Promise.all(input) : undefined
  );

  const Workers = await import('../src/modules/workers/workers.service');
  let workerListWhere: any;
  let workerDetailWhere: any;
  (prisma.worker.count as unknown) = async ({ where }: any) => {
    workerListWhere = where;
    return 0;
  };
  (prisma.worker.findMany as unknown) = async () => [];
  (prisma.worker.findFirst as unknown) = async ({ where }: any) => {
    workerDetailWhere = where;
    return null;
  };
  await Workers.listWorkers({}, true);
  assertReviewUserFilter(workerListWhere.user, 'review worker list must be user-scoped');
  await expectNotFound(() => Workers.getWorkerById('production-worker', true), 'WORKER_NOT_FOUND');
  assertReviewUserFilter(workerDetailWhere.user, 'cross-scope worker detail must query inside the review cohort');
  await expectNotFound(
    () => Workers.getWorkerDocumentDownload(
      { sub: 'review-admin', role: 'admin', isReviewAccount: true },
      'production-worker',
      'health_certificate',
    ),
    'WORKER_DOCUMENT_NOT_FOUND',
  );
  assertReviewUserFilter(workerDetailWhere.user, 'cross-scope worker documents must query inside the review cohort');

  const Companies = await import('../src/modules/companies/companies.service');
  let companyListWhere: any;
  let companyDetailWhere: any;
  (prisma.company.count as unknown) = async ({ where }: any) => {
    companyListWhere = where;
    return 0;
  };
  (prisma.company.findMany as unknown) = async () => [];
  (prisma.company.findFirst as unknown) = async ({ where }: any) => {
    companyDetailWhere = where;
    return null;
  };
  await Companies.listCompanies({ page: 1, limit: 20, sort: 'desc' }, true);
  assert.ok(
    companyListWhere.AND.some((condition: any) => condition.user?.is_review_account === true),
    'review company list must add the cohort marker to its AND filters',
  );
  await expectNotFound(() => Companies.getCompanyById('production-company', true), 'COMPANY_NOT_FOUND');
  assertReviewUserFilter(companyDetailWhere.user, 'cross-scope company detail must query inside the review cohort');
  await expectNotFound(
    () => Companies.getCompanyDocumentDownload(
      { sub: 'review-admin', role: 'admin', isReviewAccount: true },
      'production-company',
      'tax_certificate',
    ),
    'COMPANY_DOCUMENT_NOT_FOUND',
  );
  assertReviewUserFilter(companyDetailWhere.user, 'cross-scope company documents must query inside the review cohort');

  const Orders = await import('../src/modules/orders/orders.service');
  let orderListWhere: any;
  let orderListReviewFlag = false;
  let orderDetailWhere: any;
  (prisma.order.count as unknown) = async ({ where }: any) => {
    orderListWhere = where;
    return 0;
  };
  (prisma.order.findMany as unknown) = async ({ include }: any) => {
    orderListReviewFlag = include.assignments.where.worker?.user?.is_review_account === true;
    return [];
  };
  (prisma.order.findFirst as unknown) = async ({ where }: any) => {
    orderDetailWhere = where;
    return null;
  };
  await Orders.listOrders('review-admin', 'admin', ListOrdersQuerySchema.parse({}), true);
  assertReviewUserFilter(orderListWhere.company.user, 'review order list must be company-scoped');
  assert.equal(orderListReviewFlag, true, 'nested order assignment counts must exclude non-review workers');
  await expectNotFound(
    () => Orders.getOrder('production-order', 'review-admin', 'admin', true),
    'ORDER_NOT_FOUND',
  );
  assertReviewUserFilter(orderDetailWhere.company.user, 'cross-scope order detail must query inside the review cohort');

  const Assignments = await import('../src/modules/assignments/assignments.service');
  let assignmentListWhere: any;
  let assignmentDetailWhere: any;
  (prisma.assignment.count as unknown) = async ({ where }: any) => {
    assignmentListWhere = where;
    return 0;
  };
  (prisma.assignment.findMany as unknown) = async () => [];
  (prisma.assignment.findFirst as unknown) = async ({ where }: any) => {
    assignmentDetailWhere = where;
    return null;
  };
  await Assignments.listAssignments(
    'review-admin',
    'admin',
    ListAssignmentsQuerySchema.parse({}),
    true,
  );
  assert.ok(
    assignmentListWhere.AND.some((condition: any) => condition.worker?.user?.is_review_account === true),
    'review assignment list must exclude production workers',
  );
  assert.ok(
    assignmentListWhere.AND.some((condition: any) => condition.order?.company?.user?.is_review_account === true),
    'review assignment list must exclude production companies',
  );
  await expectNotFound(
    () => Assignments.getAssignment('production-assignment', 'review-admin', 'admin', true),
    'ASSIGNMENT_NOT_FOUND',
  );
  assertReviewUserFilter(assignmentDetailWhere.worker.user, 'assignment detail must scope its worker');
  assertReviewUserFilter(assignmentDetailWhere.order.company.user, 'assignment detail must scope its company');

  const Attendance = await import('../src/modules/attendance/attendance.service');
  let attendanceListWhere: any;
  let attendanceMonitorWhere: any;
  let attendanceDetailWhere: any;
  (prisma.attendanceLog.count as unknown) = async ({ where }: any) => {
    attendanceListWhere = where;
    return 0;
  };
  (prisma.attendanceLog.findMany as unknown) = async () => [];
  (prisma.attendanceLog.findFirst as unknown) = async ({ where }: any) => {
    attendanceDetailWhere = where;
    return null;
  };
  (prisma.assignment.count as unknown) = async ({ where }: any) => {
    attendanceMonitorWhere = where;
    return 0;
  };
  const attendanceQuery = ListAttendanceQuerySchema.parse({});
  await Attendance.listAttendance('review-admin', 'admin', attendanceQuery, true);
  assert.ok(
    attendanceListWhere.AND.some((condition: any) => (
      condition.assignment?.worker?.user?.is_review_account === true
      && condition.assignment?.order?.company?.user?.is_review_account === true
    )),
    'review attendance list must scope both sides of the assignment',
  );
  await Attendance.listAttendanceMonitor('admin', attendanceQuery, true);
  assert.ok(
    attendanceMonitorWhere.AND.some((condition: any) => condition.worker?.user?.is_review_account === true),
    'review attendance monitor must exclude production workers',
  );
  assert.ok(
    attendanceMonitorWhere.AND.some((condition: any) => condition.order?.company?.user?.is_review_account === true),
    'review attendance monitor must exclude production companies',
  );
  await expectNotFound(
    () => Attendance.getAttendance('production-attendance', 'review-admin', 'admin', true),
    'ATTENDANCE_NOT_FOUND',
  );
  assertReviewUserFilter(attendanceDetailWhere.assignment.worker.user, 'attendance detail must scope its worker');
  assertReviewUserFilter(attendanceDetailWhere.assignment.order.company.user, 'attendance detail must scope its company');
}

async function testNormalAdminExcludesReviewCohort(): Promise<void> {
  (prisma.$transaction as unknown) = async (input: unknown) => (
    Array.isArray(input) ? Promise.all(input) : undefined
  );

  const Workers = await import('../src/modules/workers/workers.service');
  let workerListWhere: any;
  let workerDetailWhere: any;
  (prisma.worker.count as unknown) = async ({ where }: any) => {
    workerListWhere = where;
    return 0;
  };
  (prisma.worker.findMany as unknown) = async () => [];
  (prisma.worker.findFirst as unknown) = async ({ where }: any) => {
    workerDetailWhere = where;
    return null;
  };
  await Workers.listWorkers({}, false);
  assertProductionUserFilter(workerListWhere.user, 'normal admin worker list must exclude reviewer users');
  await expectNotFound(() => Workers.getWorkerById('review-worker', false), 'WORKER_NOT_FOUND');
  assertProductionUserFilter(workerDetailWhere.user, 'normal admin worker detail must exclude reviewer users');

  const Companies = await import('../src/modules/companies/companies.service');
  let companyListWhere: any;
  let companyDetailWhere: any;
  (prisma.company.count as unknown) = async ({ where }: any) => {
    companyListWhere = where;
    return 0;
  };
  (prisma.company.findMany as unknown) = async () => [];
  (prisma.company.findFirst as unknown) = async ({ where }: any) => {
    companyDetailWhere = where;
    return null;
  };
  await Companies.listCompanies({ page: 1, limit: 20, sort: 'desc' }, false);
  assert.ok(
    companyListWhere.AND.some((condition: any) => condition.user?.is_review_account === false),
    'normal admin company list must exclude reviewer users',
  );
  await expectNotFound(() => Companies.getCompanyById('review-company', false), 'COMPANY_NOT_FOUND');
  assertProductionUserFilter(companyDetailWhere.user, 'normal admin company detail must exclude reviewer users');

  const Orders = await import('../src/modules/orders/orders.service');
  let orderListWhere: any;
  let orderAssignmentScope: unknown;
  let orderDetailWhere: any;
  (prisma.order.count as unknown) = async ({ where }: any) => {
    orderListWhere = where;
    return 0;
  };
  (prisma.order.findMany as unknown) = async ({ include }: any) => {
    orderAssignmentScope = include.assignments.where.worker?.user?.is_review_account;
    return [];
  };
  (prisma.order.findFirst as unknown) = async ({ where }: any) => {
    orderDetailWhere = where;
    return null;
  };
  await Orders.listOrders('normal-admin', 'admin', ListOrdersQuerySchema.parse({}), false);
  assertProductionUserFilter(orderListWhere.company.user, 'normal admin order list must exclude reviewer companies');
  assert.equal(orderAssignmentScope, false, 'normal admin nested order data must exclude reviewer workers');
  await expectNotFound(
    () => Orders.getOrder('review-order', 'normal-admin', 'admin', false),
    'ORDER_NOT_FOUND',
  );
  assertProductionUserFilter(orderDetailWhere.company.user, 'normal admin order detail must exclude reviewer companies');

  const Assignments = await import('../src/modules/assignments/assignments.service');
  let assignmentListWhere: any;
  let assignmentDetailWhere: any;
  (prisma.assignment.count as unknown) = async ({ where }: any) => {
    assignmentListWhere = where;
    return 0;
  };
  (prisma.assignment.findMany as unknown) = async () => [];
  (prisma.assignment.findFirst as unknown) = async ({ where }: any) => {
    assignmentDetailWhere = where;
    return null;
  };
  await Assignments.listAssignments(
    'normal-admin',
    'admin',
    ListAssignmentsQuerySchema.parse({}),
    false,
  );
  assert.ok(assignmentListWhere.AND.some((condition: any) => (
    condition.worker?.user?.is_review_account === false
  )));
  assert.ok(assignmentListWhere.AND.some((condition: any) => (
    condition.order?.company?.user?.is_review_account === false
  )));
  await expectNotFound(
    () => Assignments.getAssignment('review-assignment', 'normal-admin', 'admin', false),
    'ASSIGNMENT_NOT_FOUND',
  );
  assertProductionUserFilter(assignmentDetailWhere.worker.user, 'normal admin assignment must exclude reviewer worker');
  assertProductionUserFilter(assignmentDetailWhere.order.company.user, 'normal admin assignment must exclude reviewer company');

  const Attendance = await import('../src/modules/attendance/attendance.service');
  let attendanceListWhere: any;
  let attendanceMonitorWhere: any;
  let attendanceDetailWhere: any;
  (prisma.attendanceLog.count as unknown) = async ({ where }: any) => {
    attendanceListWhere = where;
    return 0;
  };
  (prisma.attendanceLog.findMany as unknown) = async () => [];
  (prisma.attendanceLog.findFirst as unknown) = async ({ where }: any) => {
    attendanceDetailWhere = where;
    return null;
  };
  (prisma.assignment.count as unknown) = async ({ where }: any) => {
    attendanceMonitorWhere = where;
    return 0;
  };
  const attendanceQuery = ListAttendanceQuerySchema.parse({});
  await Attendance.listAttendance('normal-admin', 'admin', attendanceQuery, false);
  assert.ok(attendanceListWhere.AND.some((condition: any) => (
    condition.assignment?.worker?.user?.is_review_account === false
    && condition.assignment?.order?.company?.user?.is_review_account === false
  )));
  await Attendance.listAttendanceMonitor('admin', attendanceQuery, false);
  assert.ok(attendanceMonitorWhere.AND.some((condition: any) => (
    condition.worker?.user?.is_review_account === false
  )));
  assert.ok(attendanceMonitorWhere.AND.some((condition: any) => (
    condition.order?.company?.user?.is_review_account === false
  )));
  await expectNotFound(
    () => Attendance.getAttendance('review-attendance', 'normal-admin', 'admin', false),
    'ATTENDANCE_NOT_FOUND',
  );
  assertProductionUserFilter(attendanceDetailWhere.assignment.worker.user, 'normal admin attendance must exclude reviewer worker');
  assertProductionUserFilter(attendanceDetailWhere.assignment.order.company.user, 'normal admin attendance must exclude reviewer company');
}

async function testDirectAdminManageEndpointsStayInCohort(): Promise<void> {
  const actor = { sub: 'normal-admin', role: 'admin' };
  const Workers = await import('../src/modules/workers/workers.service');
  const workerMutationWheres: any[] = [];
  let workerFindManyWhere: any;
  (prisma.worker.findFirst as unknown) = async ({ where }: any) => {
    workerMutationWheres.push(where);
    return null;
  };
  (prisma.worker.findMany as unknown) = async ({ where }: any) => {
    workerFindManyWhere = where;
    return [];
  };

  await expectNotFound(
    () => Workers.updateWorkerClass('review-worker', 'A', actor, false),
    'WORKER_NOT_FOUND',
  );
  await expectNotFound(
    () => Workers.approveWorker('review-worker', actor, null, false),
    'WORKER_NOT_FOUND',
  );
  await expectNotFound(
    () => Workers.rejectWorker('review-worker', 'Synthetic reason', actor, false),
    'WORKER_NOT_FOUND',
  );
  await expectNotFound(
    () => Workers.updateWorkersFocTraining(
      ['review-worker'],
      true,
      'Synthetic note',
      actor,
      false,
    ),
    'WORKERS_NOT_FOUND',
  );
  assert.ok(
    workerMutationWheres.every((where) => where.user?.is_review_account === false),
    'normal admin direct worker mutations must query only production workers',
  );
  assertProductionUserFilter(
    workerFindManyWhere.user,
    'normal admin bulk FOC changes must query only production workers',
  );

  const workerReadsBeforeReviewAttempt = workerMutationWheres.length;
  await assert.rejects(
    () => Workers.updateWorkerClass('review-worker', 'A', actor, true),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 403
      && error.code === 'STORE_REVIEW_ADMIN_VIEW_ONLY',
  );
  assert.equal(
    workerMutationWheres.length,
    workerReadsBeforeReviewAttempt,
    'review admin mutation must stop before loading a worker',
  );

  const Companies = await import('../src/modules/companies/companies.service');
  const companyMutationWheres: any[] = [];
  (prisma.company.findFirst as unknown) = async ({ where }: any) => {
    companyMutationWheres.push(where);
    return null;
  };
  await expectNotFound(
    () => Companies.approveCompany('review-company', actor, false),
    'COMPANY_NOT_FOUND',
  );
  await expectNotFound(
    () => Companies.rejectCompany('review-company', 'Synthetic reason', actor, false),
    'COMPANY_NOT_FOUND',
  );
  assert.ok(
    companyMutationWheres.every((where) => where.user?.is_review_account === false),
    'normal admin direct company mutations must query only production companies',
  );
  const companyReadsBeforeReviewAttempt = companyMutationWheres.length;
  await assert.rejects(
    () => Companies.approveCompany('review-company', actor, true),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 403
      && error.code === 'STORE_REVIEW_ADMIN_VIEW_ONLY',
  );
  assert.equal(
    companyMutationWheres.length,
    companyReadsBeforeReviewAttempt,
    'review admin mutation must stop before loading a company',
  );

  const Attendance = await import('../src/modules/attendance/attendance.service');
  let kioskListWhere: any;
  let kioskCompanyWhere: any;
  let kioskCreationCompanyWhere: any;
  let eligibleOrderWhere: any;
  let directKioskWhere: any;
  let directSessionWhere: any;
  (prisma.venueKiosk.findMany as unknown) = async ({ where }: any) => {
    kioskListWhere = where;
    return [];
  };
  (prisma.company.findMany as unknown) = async ({ where }: any) => {
    kioskCompanyWhere = where;
    return [];
  };
  (prisma.order.findMany as unknown) = async ({ where }: any) => {
    eligibleOrderWhere = where;
    return [];
  };
  await Attendance.listVenueKiosks('normal-admin', 'admin', {}, false);
  assertProductionUserFilter(
    kioskListWhere.company.user,
    'normal admin kiosk list must exclude reviewer companies',
  );
  await Attendance.listVenueKioskCompanies('admin', false);
  assert.equal(kioskCompanyWhere.user.is_review_account, false);
  await Attendance.listKioskEligibleOrders('normal-admin', 'admin', {}, false);
  assert.ok(
    eligibleOrderWhere.AND.some((condition: any) => (
      condition.company?.user?.is_review_account === false
    )),
    'normal admin eligible kiosk orders must exclude reviewer companies',
  );

  (prisma.company.findFirst as unknown) = async ({ where }: any) => {
    kioskCreationCompanyWhere = where;
    return null;
  };
  await assert.rejects(
    () => Attendance.createVenueKiosk('normal-admin', 'admin', {
      company_id: 'review-company',
      name: 'Synthetic kiosk',
    }, false),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 404
      && error.code === 'COMPANY_NOT_AVAILABLE',
  );
  assert.equal(
    kioskCreationCompanyWhere.user.is_review_account,
    false,
    'normal admin kiosk creation must resolve only production companies',
  );

  (prisma.venueKiosk.findFirst as unknown) = async ({ where }: any) => {
    directKioskWhere = where;
    return null;
  };
  await expectNotFound(
    () => Attendance.deactivateVenueKiosk('normal-admin', 'admin', 'review-kiosk', false),
    'VENUE_KIOSK_NOT_FOUND',
  );
  assertProductionUserFilter(
    directKioskWhere.company.user,
    'normal admin direct kiosk mutation must query only production kiosks',
  );

  (prisma.kioskSession.findFirst as unknown) = async ({ where }: any) => {
    directSessionWhere = where;
    return null;
  };
  await expectNotFound(
    () => Attendance.revokeKioskSession('normal-admin', 'admin', 'review-session', false),
    'KIOSK_SESSION_NOT_FOUND',
  );
  assertProductionUserFilter(
    directSessionWhere.company.user,
    'normal admin direct kiosk-session mutation must query only production sessions',
  );

  const kioskReadsBeforeReviewAttempt = directKioskWhere;
  await assert.rejects(
    () => Attendance.deactivateVenueKiosk('review-admin', 'admin', 'review-kiosk', true),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 403
      && error.code === 'STORE_REVIEW_ADMIN_VIEW_ONLY',
  );
  assert.equal(
    directKioskWhere,
    kioskReadsBeforeReviewAttempt,
    'review admin kiosk mutation must stop before loading a kiosk',
  );
}

async function testAdminUpdateRechecksProductionCohortInsideTransaction(): Promise<void> {
  const Admins = await import('../src/modules/admins/admins.service');
  const actor = { sub: 'super-admin-user', role: 'super_admin' };
  let writes = 0;
  let lockSql = '';

  (prisma.$transaction as unknown) = async (operation: any) => operation({
    $queryRaw: async (strings: TemplateStringsArray) => {
      lockSql = strings.join('?');
      return [];
    },
    admin: {
      findFirst: async () => { writes += 1; return null; },
      updateMany: async () => { writes += 1; return { count: 1 }; },
    },
    user: { updateMany: async () => { writes += 1; return { count: 1 }; } },
    refreshToken: { updateMany: async () => { writes += 1; } },
    deviceToken: { updateMany: async () => { writes += 1; } },
    auditLog: { create: async () => { writes += 1; } },
  });
  await expectNotFound(
    () => Admins.updateAdmin('review-admin-profile', actor, { name: 'Blocked update' }),
    'ADMIN_NOT_FOUND',
  );
  assert.match(lockSql, /is_review_account\s*=\s*FALSE/i);
  assert.match(lockSql, /FOR UPDATE OF a, u/i);
  assert.equal(writes, 0, 'review admin ID must fail at the transaction lock before any write');

  const now = new Date('2026-10-17T00:00:00.000Z');
  const existing = {
    id: 'production-admin-profile',
    user_id: 'production-admin-user',
    permissions: ['view_workers'],
    created_at: now,
    updated_at: now,
    user: {
      id: 'production-admin-user',
      phone: 'admin:production@example.test',
      email: 'production@example.test',
      name: 'Production Admin',
      role: 'admin',
      is_active: true,
      is_review_account: false,
      deleted_at: null,
    },
  };
  const updated = {
    ...existing,
    user: { ...existing.user, name: 'Updated Production Admin' },
  };
  let adminReads = 0;
  let userUpdateWhere: any;
  let auditWrites = 0;
  (prisma.$transaction as unknown) = async (operation: any) => operation({
    $queryRaw: async () => [{ id: existing.id }],
    admin: {
      findFirst: async ({ where }: any) => {
        assert.equal(
          where.user.is_review_account,
          false,
          'admin transaction read must stay in production cohort',
        );
        adminReads += 1;
        return adminReads === 1 ? existing : updated;
      },
      updateMany: async () => ({ count: 1 }),
    },
    user: {
      updateMany: async ({ where, data }: any) => {
        userUpdateWhere = where;
        assert.deepEqual(data, { name: 'Updated Production Admin' });
        return { count: 1 };
      },
    },
    refreshToken: { updateMany: async () => ({ count: 0 }) },
    deviceToken: { updateMany: async () => ({ count: 0 }) },
    auditLog: { create: async () => { auditWrites += 1; } },
  });
  const result = await Admins.updateAdmin(existing.id, actor, {
    name: 'Updated Production Admin',
  });
  assert.equal(result.name, 'Updated Production Admin');
  assert.equal(userUpdateWhere.is_review_account, false);
  assert.equal(userUpdateWhere.role, 'admin');
  assert.equal(userUpdateWhere.deleted_at, null);
  assert.equal(adminReads, 2, 'normal update must recheck the cohort after the guarded write');
  assert.equal(auditWrites, 1, 'normal admin updates must retain audit behavior');

  let guardedWrites = 0;
  (prisma.$transaction as unknown) = async (operation: any) => operation({
    $queryRaw: async () => [{ id: existing.id }],
    admin: {
      findFirst: async () => existing,
      updateMany: async () => ({ count: 1 }),
    },
    user: {
      // Simulate the exact-cohort predicate no longer matching at write time.
      updateMany: async () => { guardedWrites += 1; return { count: 0 }; },
    },
    refreshToken: { updateMany: async () => { guardedWrites += 1; } },
    deviceToken: { updateMany: async () => { guardedWrites += 1; } },
    auditLog: { create: async () => { guardedWrites += 1; } },
  });
  await expectNotFound(
    () => Admins.updateAdmin(existing.id, actor, { name: 'Raced update' }),
    'ADMIN_NOT_FOUND',
  );
  assert.equal(guardedWrites, 1, 'failed exact-cohort write must stop before sessions or audit change');
}

async function testDashboardIsolation(): Promise<void> {
  const orderWheres: any[] = [];
  const assignmentWheres: any[] = [];
  const attendanceWheres: any[] = [];
  const workerWheres: any[] = [];
  const companyWheres: any[] = [];
  const ratingWheres: any[] = [];

  (prisma.order.count as unknown) = async ({ where }: any) => { orderWheres.push(where); return 0; };
  (prisma.order.groupBy as unknown) = async ({ where }: any) => { orderWheres.push(where); return []; };
  (prisma.order.findMany as unknown) = async ({ where }: any) => { orderWheres.push(where); return []; };
  (prisma.assignment.count as unknown) = async ({ where }: any) => { assignmentWheres.push(where); return 0; };
  (prisma.assignment.groupBy as unknown) = async ({ where }: any) => { assignmentWheres.push(where); return []; };
  (prisma.assignment.findMany as unknown) = async () => [];
  (prisma.attendanceLog.count as unknown) = async ({ where }: any) => { attendanceWheres.push(where); return 0; };
  (prisma.attendanceLog.findMany as unknown) = async ({ where }: any) => { attendanceWheres.push(where); return []; };
  (prisma.attendanceLog.groupBy as unknown) = async ({ where }: any) => { attendanceWheres.push(where); return []; };
  (prisma.worker.count as unknown) = async ({ where }: any) => { workerWheres.push(where); return 0; };
  (prisma.company.count as unknown) = async ({ where }: any) => { companyWheres.push(where); return 0; };
  (prisma.company.findMany as unknown) = async () => [];
  (prisma.rating.aggregate as unknown) = async ({ where }: any) => {
    ratingWheres.push(where);
    return { _avg: { score: null }, _count: { _all: 0 } };
  };
  (prisma.orderCategoryItem.findMany as unknown) = async () => [];

  const Reports = await import('../src/modules/reports/reports.service');
  for (const isReviewAccount of [true, false]) {
    orderWheres.length = 0;
    assignmentWheres.length = 0;
    attendanceWheres.length = 0;
    workerWheres.length = 0;
    companyWheres.length = 0;
    ratingWheres.length = 0;

    await Reports.getAdminReportSummary(ReportQuerySchema.parse({}), { isReviewAccount });

    assert.ok(orderWheres.every((where) => where.company?.user?.is_review_account === isReviewAccount));
    assert.ok(assignmentWheres.every((where) => (
      where.worker?.user?.is_review_account === isReviewAccount
      && where.order?.company?.user?.is_review_account === isReviewAccount
    )));
    assert.ok(attendanceWheres.every((where) => (
      where.assignment?.worker?.user?.is_review_account === isReviewAccount
      && where.assignment?.order?.company?.user?.is_review_account === isReviewAccount
    )));
    assert.ok(workerWheres.every((where) => where.user?.is_review_account === isReviewAccount));
    assert.ok(companyWheres.every((where) => where.user?.is_review_account === isReviewAccount));
    assert.ok(ratingWheres.every((where) => (
      where.worker?.user?.is_review_account === isReviewAccount
      && where.order?.company?.user?.is_review_account === isReviewAccount
      && where.rater?.is_review_account === isReviewAccount
    )));
  }
}

async function testReportRelationshipFiltersStayInCohort(): Promise<void> {
  const workerId = '00000000-0000-4000-8000-000000000041';
  const orderWheres: any[] = [];
  const ratingWheres: any[] = [];

  (prisma.order.count as unknown) = async ({ where }: any) => { orderWheres.push(where); return 0; };
  (prisma.order.groupBy as unknown) = async ({ where }: any) => { orderWheres.push(where); return []; };
  (prisma.order.findMany as unknown) = async ({ where }: any) => { orderWheres.push(where); return []; };
  (prisma.assignment.count as unknown) = async () => 0;
  (prisma.assignment.groupBy as unknown) = async () => [];
  (prisma.assignment.findMany as unknown) = async () => [];
  (prisma.attendanceLog.count as unknown) = async () => 0;
  (prisma.attendanceLog.findMany as unknown) = async () => [];
  (prisma.attendanceLog.groupBy as unknown) = async () => [];
  (prisma.worker.count as unknown) = async () => 0;
  (prisma.worker.findFirst as unknown) = async () => null;
  (prisma.company.count as unknown) = async () => 0;
  (prisma.company.findMany as unknown) = async () => [];
  (prisma.rating.aggregate as unknown) = async ({ where }: any) => {
    ratingWheres.push(where);
    return { _avg: { score: null }, _count: { _all: 0 } };
  };
  (prisma.orderCategoryItem.findMany as unknown) = async () => [];

  const Reports = await import('../src/modules/reports/reports.service');
  const filters = ReportQuerySchema.parse({ worker_id: workerId, foc_training: 'foc' });

  for (const isReviewAccount of [false, true]) {
    orderWheres.length = 0;
    ratingWheres.length = 0;

    await Reports.getAdminReportSummary(filters, { isReviewAccount });

    assert.ok(orderWheres.length > 0, 'report must execute at least one order query');
    for (const where of orderWheres) {
      assert.equal(
        where.assignments?.some?.worker_id,
        workerId,
        'worker-filtered order queries must keep the requested worker predicate',
      );
      assert.equal(
        where.assignments?.some?.worker?.user?.is_review_account,
        isReviewAccount,
        'worker-filtered order queries must reject corrupt cross-cohort assignments',
      );
      const focRelationship = where.AND?.find((condition: any) => (
        condition.assignments?.some?.worker?.is_foc_training === true
      ));
      assert.ok(focRelationship, 'FOC-filtered order queries must use an assignment relationship');
      assert.equal(
        focRelationship.assignments.some.worker.user?.is_review_account,
        isReviewAccount,
        'FOC-filtered order queries must reject corrupt cross-cohort assignments',
      );
    }

    assert.equal(ratingWheres.length, 1, 'report summary must execute one rating aggregate');
    assert.equal(
      ratingWheres[0].rater?.is_review_account,
      isReviewAccount,
      'rating aggregates must reject ratings created by a cross-cohort rater',
    );
  }
}

async function testReviewOrderSideEffectsStayInCohort(): Promise<void> {
  const repository = await import('../src/modules/orders/orders.repository');
  const notificationRecipients: string[][] = [];
  const adminLookups: any[] = [];
  let outboxWrites = 0;

  const fakeOrder = { id: 'review-order', status: 'published', version: 1 };
  const tx = {
    order: { create: async () => fakeOrder },
    orderStatusHistory: { create: async () => ({ id: 'history' }) },
    auditLog: { create: async () => ({ id: 'audit' }) },
    user: {
      findMany: async ({ where }: any) => {
        adminLookups.push(where);
        return where.is_review_account ? [{ id: 'review-admin' }] : [{ id: 'production-admin' }];
      },
    },
    notification: {
      createMany: async ({ data }: any) => {
        notificationRecipients.push(data.map((row: any) => row.recipient_id));
        return { count: data.length };
      },
    },
    outboxEvent: {
      create: async () => {
        outboxWrites += 1;
        return { id: `outbox-${outboxWrites}` };
      },
    },
  };
  (prisma.$transaction as unknown) = async (operation: any) => operation(tx);

  const order: CreateOrderForPersistence = {
    title: 'Store review shift',
    description: 'Synthetic store review data',
    category: 'Review role',
    category_items: [{ category: 'Review role', required_count: 1 }],
    required_count: 1,
    start_datetime: new Date('2030-01-01T08:00:00.000Z'),
    end_datetime: new Date('2030-01-01T16:00:00.000Z'),
    location: 'Synthetic review venue',
    required_skills: [],
  };

  const reviewResult = await repository.createOrderWithSideEffects({
    actorId: 'review-company-user',
    actorRole: 'company',
    companyId: 'review-company',
    companyName: 'SET Review Company',
    isReviewAccount: true,
    order,
    buildResponse: () => ({ id: 'review-order' }),
  });
  assert.equal(reviewResult.outboxEventId, undefined);
  assert.equal(outboxWrites, 0, 'review order creation must not enqueue role-wide push/outbox work');
  assert.deepEqual(notificationRecipients[0], ['review-admin']);
  assert.deepEqual(adminLookups[0], {
    role: 'admin',
    is_review_account: true,
    is_active: true,
    deleted_at: null,
  });

  const productionResult = await repository.createOrderWithSideEffects({
    actorId: 'production-company-user',
    actorRole: 'company',
    companyId: 'production-company',
    companyName: 'Production Company',
    order,
    buildResponse: () => ({ id: 'production-order' }),
  });
  assert.equal(productionResult.outboxEventId, 'outbox-1');
  assert.equal(outboxWrites, 1, 'normal production order behavior must remain unchanged');
  assert.deepEqual(notificationRecipients[1], ['production-admin']);
  assert.deepEqual(adminLookups[1], {
    role: 'super_admin',
    is_review_account: false,
    is_active: true,
    deleted_at: null,
  });
}

async function testExternalDeliveryBarrierAndCancellationOutbox(): Promise<void> {
  const {
    filterExternalDeliveryTargets,
    mayDeliverExternally,
  } = await import('../src/lib/review-delivery-policy');

  assert.equal(mayDeliverExternally(true), false);
  assert.equal(mayDeliverExternally(false), true);
  assert.deepEqual(
    filterExternalDeliveryTargets([
      { id: 'review-token', token: 'synthetic-review-token', is_review_account: true },
      { id: 'production-token', token: 'synthetic-production-token', is_review_account: false },
    ]).map((target) => target.id),
    ['production-token'],
    'captured device-token delivery must fail closed for reviewer users',
  );

  const Fcm = await import('../src/lib/fcm');
  let deviceTokenWhere: any;
  let providerCallCount = 0;
  let providerTargetIds: string[] = [];
  (prisma.deviceToken.findMany as unknown) = async ({ where }: any) => {
    deviceTokenWhere = where;
    return [{
      id: 'production-token',
      token: 'synthetic-production-token',
      user: { is_review_account: false },
    }];
  };
  await Fcm.deliverPushToUsers(['review-user', 'production-user'], {
    title: 'Synthetic delivery test',
    body: 'Only an ordinary account may reach the injected provider.',
  }, {
    sendToTokens: async (targets) => {
      providerCallCount += 1;
      providerTargetIds = targets.map((target) => target.id);
    },
  });
  assert.equal(
    deviceTokenWhere.user.is_review_account,
    false,
    'the centralized FCM boundary must never load reviewer device tokens',
  );
  assert.equal(providerCallCount, 1, 'ordinary FCM delivery must still invoke the provider');
  assert.deepEqual(providerTargetIds, ['production-token']);

  const OrdersRepository = await import('../src/modules/orders/orders.repository');
  let currentIsReviewAccount = true;
  let orderRead = 0;
  let outboxWrites = 0;
  let inAppWrites = 0;
  const tx = {
    $queryRaw: async () => [{ id: 'order-id' }],
    order: {
      findFirst: async () => {
        orderRead += 1;
        if (orderRead % 2 === 1) {
          return {
            status: 'published',
            version: 1,
            company: { user: { is_review_account: currentIsReviewAccount } },
          };
        }
        return {
          id: 'order-id',
          title: 'Synthetic review shift',
          status: 'cancelled',
          version: 2,
          assignments: [],
          category_items: [],
          company: { id: 'company-id', name: 'Synthetic Company', user: { id: 'company-user' } },
          _count: { assignments: 0, ratings: 0 },
        };
      },
      updateMany: async () => ({ count: 1 }),
    },
    attendanceLog: { findFirst: async () => null },
    assignment: {
      findMany: async () => [{
        worker: {
          user_id: currentIsReviewAccount ? 'review-worker-user' : 'production-worker-user',
          user: { is_review_account: currentIsReviewAccount },
        },
      }],
      updateMany: async () => ({ count: 1 }),
    },
    kioskSession: { updateMany: async () => ({ count: 0 }) },
    kioskActiveSession: { updateMany: async () => ({ count: 0 }) },
    attendanceQrToken: { updateMany: async () => ({ count: 0 }) },
    orderStatusHistory: { create: async () => ({ id: 'history-id' }) },
    auditLog: { create: async () => ({ id: 'audit-id' }) },
    notification: {
      createMany: async ({ data }: any) => {
        inAppWrites += data.length;
        return { count: data.length };
      },
    },
    outboxEvent: {
      create: async () => {
        outboxWrites += 1;
        return { id: `outbox-${outboxWrites}` };
      },
    },
  };
  (prisma.$transaction as unknown) = async (operation: any) => operation(tx);

  const reviewCancellation = await OrdersRepository.cancelCompanyOrderWithAudit({
    orderId: 'order-id',
    companyId: 'company-id',
    actorId: 'review-company-user',
    actorRole: 'company',
    previousStatus: 'published',
    expectedVersion: 1,
    reason: 'Synthetic review cancellation',
  });
  assert.equal(reviewCancellation?.outboxEventId, undefined);
  assert.equal(outboxWrites, 0, 'review cancellation must not enqueue provider outbox work');
  assert.equal(inAppWrites, 1, 'review cancellation may keep its isolated in-app notification');

  currentIsReviewAccount = false;
  const productionCancellation = await OrdersRepository.cancelCompanyOrderWithAudit({
    orderId: 'order-id',
    companyId: 'company-id',
    actorId: 'production-company-user',
    actorRole: 'company',
    previousStatus: 'published',
    expectedVersion: 1,
    reason: 'Production cancellation regression',
  });
  assert.equal(productionCancellation?.outboxEventId, 'outbox-1');
  assert.equal(outboxWrites, 1, 'ordinary cancellation must preserve provider outbox behavior');
}

async function testReviewFcmRegistrationCannotPersistProviderTokens(): Promise<void> {
  const AuthService = await import('../src/modules/auth/auth.service');
  let reviewAccount = true;
  let upsertCount = 0;
  let revokedCount = 0;
  let clearedLegacyTokenCount = 0;

  (prisma.user.findFirst as unknown) = async ({ select }: any) => {
    assert.equal(select.is_review_account, true, 'FCM registration must load the review marker');
    return {
      id: reviewAccount ? 'review-worker-user' : 'production-worker-user',
      role: 'worker',
      is_review_account: reviewAccount,
    };
  };
  (prisma.$transaction as unknown) = async (operation: any) => operation({
    deviceToken: {
      updateMany: async ({ where, data }: any) => {
        if (reviewAccount) {
          assert.deepEqual(where, {
            user_id: 'review-worker-user',
            revoked_at: null,
            deleted_at: null,
          });
          assert.ok(data.revoked_at instanceof Date);
          assert.ok(data.deleted_at instanceof Date);
          revokedCount += 1;
          return { count: 1 };
        }
        return { count: 0 };
      },
      upsert: async () => {
        upsertCount += 1;
        return {
          id: 'production-device-token',
          platform: 'ios',
          app_role: 'worker',
          last_seen_at: new Date('2026-10-17T00:00:00.000Z'),
        };
      },
    },
    user: {
      updateMany: async ({ where, data }: any) => {
        assert.deepEqual(where, {
          id: 'review-worker-user',
          is_review_account: true,
        });
        assert.deepEqual(data, { fcm_token: null });
        clearedLegacyTokenCount += 1;
        return { count: 1 };
      },
    },
  });

  const reviewResult = await AuthService.registerFcmToken('review-worker-user', {
    fcm_token: 'synthetic-review-fcm-token',
    platform: 'ios',
    device_id: 'review-device',
  });
  assert.equal(reviewResult.registered, false);
  assert.equal(reviewResult.id, null);
  assert.equal(upsertCount, 0, 'review FCM registration must not persist a provider token');
  assert.equal(revokedCount, 1, 'review FCM registration must revoke stale active tokens');
  assert.equal(clearedLegacyTokenCount, 1, 'review FCM registration must clear the legacy token field');

  reviewAccount = false;
  const productionResult = await AuthService.registerFcmToken('production-worker-user', {
    fcm_token: 'synthetic-production-fcm-token',
    platform: 'ios',
    device_id: 'production-device',
  });
  assert.equal(productionResult.registered, true);
  assert.equal(productionResult.id, 'production-device-token');
  assert.equal(upsertCount, 1, 'ordinary FCM registration behavior must remain unchanged');
}

async function testAssignmentMutationsRejectCrossCohortWorkers(): Promise<void> {
  const repository = await import('../src/modules/assignments/assignments.repository');
  let orderIsReviewAccount = true;
  let workerIsReviewAccount = false;
  let writes = 0;
  const tx = {
    $queryRaw: async () => [],
    order: {
      findFirst: async () => ({
        id: 'order-id',
        title: 'Synthetic shift',
        category: 'Review role',
        required_count: 1,
        company_id: 'company-id',
        shift_start: new Date('2030-01-01T08:00:00.000Z'),
        shift_end: new Date('2030-01-01T16:00:00.000Z'),
        company: { user: { is_review_account: orderIsReviewAccount } },
        category_items: [],
      }),
    },
    worker: {
      findMany: async () => [{
        id: 'worker-id',
        user_id: 'worker-user-id',
        status: 'approved',
        availability: true,
        user: {
          name: 'Synthetic Worker',
          is_active: true,
          deleted_at: null,
          is_review_account: workerIsReviewAccount,
        },
        positions: [],
      }],
    },
    assignment: {
      findMany: async () => { throw new Error('cross-cohort assignment must stop before relationship queries'); },
      create: async () => { writes += 1; throw new Error('cross-cohort assignment must not be created'); },
    },
    notification: { create: async () => { writes += 1; } },
    auditLog: { create: async () => { writes += 1; } },
  };
  (prisma.$transaction as unknown) = async (operation: any) => operation(tx);

  async function attempt() {
    return repository.createAssignmentsWithSideEffects({
      actorId: 'production-admin',
      actorRole: 'admin',
      orderId: 'order-id',
      assignments: [{ workerId: 'worker-id' }],
    });
  }

  assert.deepEqual(await attempt(), { kind: 'cohort_mismatch', workerIds: ['worker-id'] });
  orderIsReviewAccount = false;
  workerIsReviewAccount = true;
  assert.deepEqual(await attempt(), { kind: 'cohort_mismatch', workerIds: ['worker-id'] });
  assert.equal(writes, 0, 'cohort mismatch must stop before assignment, notification, or audit writes');
}

async function testExistingCrossCohortRelationshipsCannotMutate(): Promise<void> {
  const AttendanceRepository = await import('../src/modules/attendance/attendance.repository');
  let writes = 0;
  const attendanceTx = {
    assignment: {
      findFirst: async () => ({
        order_id: 'order-id',
        worker: { user: { is_review_account: true } },
        order: { company: { user: { is_review_account: false } } },
      }),
    },
    $queryRaw: async () => [],
    attendanceLog: {
      create: async () => { writes += 1; },
      update: async () => { writes += 1; },
    },
    auditLog: { create: async () => { writes += 1; } },
  };
  (prisma.$transaction as unknown) = async (operation: any) => operation(attendanceTx);
  const qr = {
    tokenHash: 'synthetic-token-hash',
    nonce: 'synthetic-nonce',
    assignmentId: 'assignment-id',
    orderId: 'order-id',
    companyId: 'company-id',
  };
  assert.deepEqual(await AttendanceRepository.createCheckInWithAudit({
    assignmentId: 'assignment-id',
    workerId: 'worker-id',
    actorId: 'worker-user-id',
    actorRole: 'worker',
    qr,
  }), { kind: 'assignment_not_accepted' });
  assert.deepEqual(await AttendanceRepository.checkOutWithAudit({
    assignmentId: 'assignment-id',
    workerId: 'worker-id',
    actorId: 'worker-user-id',
    actorRole: 'worker',
    qr,
  }), { kind: 'assignment_not_accepted' });
  assert.equal(writes, 0, 'cross-cohort attendance must stop before attendance or audit writes');

  const AssignmentsRepository = await import('../src/modules/assignments/assignments.repository');
  let assignmentRead = 0;
  const cancellationTx = {
    assignment: {
      findFirst: async () => {
        assignmentRead += 1;
        if (assignmentRead === 1) return { order_id: 'order-id' };
        return {
          status: 'assigned',
          worker: { user: { is_review_account: false } },
          order: { company: { user: { is_review_account: true } } },
        };
      },
      updateMany: async () => { writes += 1; return { count: 1 }; },
    },
    $queryRaw: async () => [],
    attendanceLog: { findFirst: async () => null },
    attendanceQrToken: { updateMany: async () => { writes += 1; } },
    notification: { create: async () => { writes += 1; } },
    auditLog: { create: async () => { writes += 1; } },
  };
  (prisma.$transaction as unknown) = async (operation: any) => operation(cancellationTx);
  assert.deepEqual(await AssignmentsRepository.cancelAssignmentWithAudit({
    assignmentId: 'assignment-id',
    actorId: 'production-admin',
    actorRole: 'admin',
  }), { kind: 'cohort_mismatch' });
  assert.equal(writes, 0, 'cross-cohort cancellation must stop before assignment or notification writes');
}

async function testRatingCannotCreateCrossCohortRelationship(): Promise<void> {
  const Ratings = await import('../src/modules/ratings/ratings.service');
  let transactionCalled = false;
  (prisma.company.findUnique as unknown) = async () => ({
    id: 'company-id',
    status: 'approved',
    deleted_at: null,
    user: { is_review_account: false },
  });
  (prisma.assignment.findFirst as unknown) = async () => ({
    id: 'assignment-id',
    order_id: 'order-id',
    worker_id: 'worker-id',
    worker: {
      id: 'worker-id',
      user_id: 'worker-user-id',
      user: { id: 'worker-user-id', name: 'Review Worker', is_review_account: true },
    },
    order: {
      id: 'order-id',
      title: 'Synthetic shift',
      company_id: 'company-id',
      company: {
        id: 'company-id',
        user_id: 'company-user-id',
        name: 'Production Company',
        user: { is_review_account: false },
      },
    },
    attendance_logs: [{ id: 'attendance-id', checkout_time: new Date() }],
  });
  (prisma.$transaction as unknown) = async () => {
    transactionCalled = true;
    throw new Error('rating transaction must not be called');
  };

  await assert.rejects(
    () => Ratings.createRating('company-user-id', 'company', {
      assignment_id: 'assignment-id',
      score: 5,
    }),
    (error: unknown) => error instanceof AppError && error.code === 'RATING_NOT_AVAILABLE',
  );
  assert.equal(transactionCalled, false);
}

async function main(): Promise<void> {
  await testPermissionCeilingAndRequestScope();
  await testEntityListAndDetailIsolation();
  await testNormalAdminExcludesReviewCohort();
  await testDirectAdminManageEndpointsStayInCohort();
  await testAdminUpdateRechecksProductionCohortInsideTransaction();
  await testDashboardIsolation();
  await testReportRelationshipFiltersStayInCohort();
  await testReviewOrderSideEffectsStayInCohort();
  await testExternalDeliveryBarrierAndCancellationOutbox();
  await testReviewFcmRegistrationCannotPersistProviderTokens();
  await testAssignmentMutationsRejectCrossCohortWorkers();
  await testExistingCrossCohortRelationshipsCannotMutate();
  await testRatingCannotCreateCrossCohortRelationship();
  console.log('review-runtime-isolation-regression: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
