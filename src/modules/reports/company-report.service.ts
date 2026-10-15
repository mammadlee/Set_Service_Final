import { Prisma } from '@prisma/client';
import { Errors } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { OrderStatus } from '../../types/prisma';
import {
  CompanyReportExportQueryInput,
  CompanyReportQueryInput,
} from './company-report.schema';

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'active',
  'published',
  'partially_assigned',
  'assigned',
  'in_progress',
];
const COUNTED_ASSIGNMENT_STATUSES = ['assigned', 'accepted', 'completed'] as const;
const EXPORT_ORDER_LIMIT = 10_000;
const EXPORT_BATCH_SIZE = 250;

const companyReportOrderSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  status: true,
  created_at: true,
  shift_start: true,
  shift_end: true,
  required_count: true,
  location: true,
  category_items: {
    where: { deleted_at: null },
    select: {
      id: true,
      category: true,
      required_count: true,
      position_id: true,
      position: { select: { id: true, name_az: true, name_en: true } },
    },
  },
  assignments: {
    where: { deleted_at: null },
    orderBy: { assigned_at: 'asc' as const },
    select: {
      id: true,
      status: true,
      assigned_at: true,
      updated_at: true,
      assigned_category: true,
      position_id: true,
      position: { select: { id: true, name_az: true, name_en: true } },
      order_category_item: {
        select: {
          id: true,
          category: true,
          position_id: true,
          position: { select: { id: true, name_az: true, name_en: true } },
        },
      },
      worker: {
        select: {
          id: true,
          profile_photo_url: true,
          position: true,
          user: { select: { name: true } },
        },
      },
      attendance_logs: {
        where: { deleted_at: null },
        orderBy: { created_at: 'asc' as const },
        select: {
          id: true,
          checkin_time: true,
          checkout_time: true,
          created_at: true,
          updated_at: true,
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

type CompanyReportOrder = Prisma.OrderGetPayload<{ select: typeof companyReportOrderSelect }>;

export async function getCompanyDetailedReport(
  companyId: string,
  filters: CompanyReportQueryInput,
) {
  const company = await findCompany(companyId);
  const orderWhere = buildOrderWhere(companyId, filters);
  const assignmentWhere = buildAssignmentWhere(companyId, filters);
  const attendanceWhere = buildAttendanceWhere(companyId, filters);

  const [
    totalOrders,
    orders,
    statusRows,
    requestedWorkers,
    assignedWorkers,
    completedAssignments,
    attendanceRecords,
    completedAttendanceRecords,
    openAttendanceRecords,
    totalRecordedMinutes,
  ] = await Promise.all([
    prisma.order.count({ where: orderWhere }),
    prisma.order.findMany({
      where: orderWhere,
      select: companyReportOrderSelectFor(filters),
      orderBy: [{ created_at: filters.sort }, { id: filters.sort }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: orderWhere,
      _count: { _all: true },
    }),
    filters.position_id
      ? prisma.orderCategoryItem.aggregate({
          where: {
            deleted_at: null,
            position_id: filters.position_id,
            order: orderWhere,
          },
          _sum: { required_count: true },
        })
      : prisma.order.aggregate({
          where: orderWhere,
          _sum: { required_count: true },
        }),
    prisma.assignment.count({
      where: { ...assignmentWhere, status: { in: [...COUNTED_ASSIGNMENT_STATUSES] } },
    }),
    prisma.assignment.count({ where: { ...assignmentWhere, status: 'completed' } }),
    prisma.attendanceLog.count({ where: attendanceWhere }),
    prisma.attendanceLog.count({
      where: { ...attendanceWhere, checkin_time: { not: null }, checkout_time: { not: null } },
    }),
    prisma.attendanceLog.count({
      where: { ...attendanceWhere, checkin_time: { not: null }, checkout_time: null },
    }),
    aggregateRecordedMinutes(companyId, filters),
  ]);

  const filteredOrders = orders.map((order) => filterOrderAssignments(order, filters));
  const assignmentActors = await loadAssignmentActors(filteredOrders);
  const countsByStatus = Object.fromEntries(statusRows.map((row) => [row.status, row._count._all]));
  const activeOrders = ACTIVE_ORDER_STATUSES.reduce(
    (sum, status) => sum + (countsByStatus[status] ?? 0),
    0,
  );

  return {
    company,
    filters: serializeFilters(filters),
    summary: {
      total_orders: totalOrders,
      active_orders: activeOrders,
      pending_orders: countsByStatus.draft ?? 0,
      completed_orders: countsByStatus.completed ?? 0,
      cancelled_orders: countsByStatus.cancelled ?? 0,
      orders_by_status: countsByStatus,
      workers_requested: requestedWorkers._sum.required_count ?? 0,
      workers_assigned: assignedWorkers,
      completed_assignments: completedAssignments,
      attendance_records: attendanceRecords,
      completed_attendance_records: completedAttendanceRecords,
      open_attendance_records: openAttendanceRecords,
      total_recorded_minutes: totalRecordedMinutes,
      total_recorded_hours: roundHours(totalRecordedMinutes),
    },
    orders: {
      data: filteredOrders.map((order) => toOrderReport(order, assignmentActors, filters.position_id)),
      meta: {
        page: filters.page,
        limit: filters.limit,
        total: totalOrders,
        total_pages: Math.ceil(totalOrders / filters.limit),
      },
    },
  };
}

export async function exportCompanyDetailedReportCsv(
  companyId: string,
  filters: CompanyReportExportQueryInput,
) {
  const company = await findCompany(companyId);
  const queryFilters: CompanyReportQueryInput = {
    ...filters,
    page: 1,
    limit: 100,
  };
  const orderWhere = buildOrderWhere(companyId, queryFilters);
  const header = [
    'company_name',
    'order_id',
    'order_title',
    'order_status',
    'order_created_at',
    'shift_start',
    'shift_end',
    'workers_requested',
    'worker_name',
    'assigned_position',
    'assignment_status',
    'assigned_at',
    'assigned_by',
    'check_in',
    'check_out',
    'duration_minutes',
  ];
  const rows: Array<Array<string | number | null>> = [];
  let exportedOrderCount = 0;
  let truncated = false;

  while (exportedOrderCount < EXPORT_ORDER_LIMIT) {
    const remaining = EXPORT_ORDER_LIMIT - exportedOrderCount;
    const take = Math.min(EXPORT_BATCH_SIZE, remaining) + (remaining <= EXPORT_BATCH_SIZE ? 1 : 0);
    const fetched = await prisma.order.findMany({
      where: orderWhere,
      select: companyReportOrderSelectFor(queryFilters),
      orderBy: [{ created_at: filters.sort }, { id: filters.sort }],
      skip: exportedOrderCount,
      take,
    });
    const orders = fetched
      .slice(0, remaining)
      .map((order) => filterOrderAssignments(order, queryFilters));
    if (fetched.length > remaining) truncated = true;
    if (orders.length === 0) break;
    const assignmentActors = await loadAssignmentActors(orders);

    for (const order of orders) {
      if (order.assignments.length === 0) {
        rows.push([
          company.name,
          order.id,
          order.title,
          order.status,
          order.created_at.toISOString(),
          order.shift_start.toISOString(),
          order.shift_end.toISOString(),
          requestedWorkersForOrder(order, filters.position_id),
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ]);
        continue;
      }

      for (const assignment of order.assignments) {
        const attendances = assignment.attendance_logs.length > 0
          ? assignment.attendance_logs
          : [null];
        for (const attendance of attendances) {
          rows.push([
            company.name,
            order.id,
            order.title,
            order.status,
            order.created_at.toISOString(),
            order.shift_start.toISOString(),
            order.shift_end.toISOString(),
            requestedWorkersForOrder(order, filters.position_id),
            assignment.worker.user.name,
            assignmentPositionName(assignment),
            assignment.status,
            assignment.assigned_at.toISOString(),
            assignmentActors.get(assignment.id)?.name ?? null,
            attendance?.checkin_time?.toISOString() ?? null,
            attendance?.checkout_time?.toISOString() ?? null,
            attendance
              ? durationMinutes(attendance.checkin_time, attendance.checkout_time)
              : null,
          ]);
        }
      }
    }

    exportedOrderCount += orders.length;
    if (truncated || fetched.length < take) break;
  }

  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  return {
    csv,
    filename: `company-report-${company.id}.csv`,
    truncated,
    exported_order_count: exportedOrderCount,
  };
}

async function findCompany(companyId: string) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, deleted_at: null },
    select: {
      id: true,
      name: true,
      status: true,
      docs_url: true,
      created_at: true,
      updated_at: true,
      user: {
        select: {
          name: true,
          phone: true,
          email: true,
          is_active: true,
        },
      },
    },
  });
  if (!company) throw Errors.notFound('Company not found.', 'COMPANY_NOT_FOUND');
  return {
    id: company.id,
    name: company.name,
    status: company.status,
    contact_name: company.user.name,
    phone: company.user.phone,
    email: company.user.email,
    is_active: company.user.is_active,
    created_at: company.created_at,
    updated_at: company.updated_at,
  };
}

function buildOrderWhere(
  companyId: string,
  filters: Pick<CompanyReportQueryInput, 'start_date' | 'end_date' | 'order_status' | 'worker_id' | 'position_id'>,
): Prisma.OrderWhereInput {
  const assignmentFilter = buildAssignmentRelationFilter(filters);
  const relationFilter = filters.worker_id
    ? (assignmentFilter ? { assignments: { some: assignmentFilter } } : {})
    : filters.position_id
      ? {
          OR: [
            { category_items: { some: { deleted_at: null, position_id: filters.position_id } } },
            { assignments: { some: assignmentFilter! } },
          ],
        }
      : {};
  return {
    company_id: companyId,
    deleted_at: null,
    ...(filters.order_status ? { status: filters.order_status } : {}),
    ...(filters.start_date || filters.end_date
      ? {
          shift_start: filters.end_date ? { lte: filters.end_date } : undefined,
          shift_end: filters.start_date ? { gte: filters.start_date } : undefined,
        }
      : {}),
    ...relationFilter,
  };
}

function buildAssignmentRelationFilter(
  filters: Pick<CompanyReportQueryInput, 'worker_id' | 'position_id'>,
): Prisma.AssignmentWhereInput | undefined {
  if (!filters.worker_id && !filters.position_id) return undefined;
  return {
    deleted_at: null,
    ...(filters.worker_id ? { worker_id: filters.worker_id } : {}),
    ...(filters.position_id
      ? {
          OR: [
            { position_id: filters.position_id },
            { order_category_item: { position_id: filters.position_id } },
          ],
        }
      : {}),
  };
}

function companyReportOrderSelectFor(
  filters: Pick<CompanyReportQueryInput, 'worker_id' | 'position_id'>,
) {
  return {
    ...companyReportOrderSelect,
    assignments: {
      ...companyReportOrderSelect.assignments,
      where: buildAssignmentRelationFilter(filters) ?? { deleted_at: null },
    },
  } satisfies Prisma.OrderSelect;
}

function buildAssignmentWhere(
  companyId: string,
  filters: Pick<CompanyReportQueryInput, 'start_date' | 'end_date' | 'order_status' | 'worker_id' | 'position_id'>,
): Prisma.AssignmentWhereInput {
  return {
    deleted_at: null,
    ...(filters.worker_id ? { worker_id: filters.worker_id } : {}),
    ...(filters.position_id
      ? {
          OR: [
            { position_id: filters.position_id },
            { order_category_item: { position_id: filters.position_id } },
          ],
        }
      : {}),
    order: buildOrderWhere(companyId, { ...filters, worker_id: undefined, position_id: undefined }),
  };
}

function buildAttendanceWhere(
  companyId: string,
  filters: Pick<CompanyReportQueryInput, 'start_date' | 'end_date' | 'order_status' | 'worker_id' | 'position_id'>,
): Prisma.AttendanceLogWhereInput {
  return {
    deleted_at: null,
    assignment: buildAssignmentWhere(companyId, filters),
  };
}

async function aggregateRecordedMinutes(
  companyId: string,
  filters: Pick<CompanyReportQueryInput, 'start_date' | 'end_date' | 'order_status' | 'worker_id' | 'position_id'>,
): Promise<number> {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`o.company_id = ${companyId}`,
    Prisma.sql`o.deleted_at IS NULL`,
    Prisma.sql`a.deleted_at IS NULL`,
    Prisma.sql`al.deleted_at IS NULL`,
    Prisma.sql`al.checkin_time IS NOT NULL`,
    Prisma.sql`al.checkout_time IS NOT NULL`,
  ];
  if (filters.start_date) clauses.push(Prisma.sql`o.shift_end >= ${filters.start_date}`);
  if (filters.end_date) clauses.push(Prisma.sql`o.shift_start <= ${filters.end_date}`);
  if (filters.order_status) clauses.push(Prisma.sql`o.status = CAST(${filters.order_status} AS "OrderStatus")`);
  if (filters.worker_id) clauses.push(Prisma.sql`a.worker_id = ${filters.worker_id}`);
  if (filters.position_id) {
    clauses.push(Prisma.sql`(a.position_id = ${filters.position_id} OR oci.position_id = ${filters.position_id})`);
  }

  const rows = await prisma.$queryRaw<Array<{ total_minutes: number | null }>>(Prisma.sql`
    SELECT COALESCE(
      SUM(GREATEST(0, EXTRACT(EPOCH FROM (al.checkout_time - al.checkin_time)) / 60)),
      0
    )::double precision AS total_minutes
    FROM attendance_logs al
    JOIN assignments a ON a.id = al.assignment_id
    JOIN orders o ON o.id = a.order_id
    LEFT JOIN order_category_items oci ON oci.id = a.order_category_item_id
    WHERE ${Prisma.join(clauses, ' AND ')}
  `);
  return Math.max(0, Number(rows[0]?.total_minutes ?? 0));
}

async function loadAssignmentActors(orders: CompanyReportOrder[]) {
  const assignmentIds = orders.flatMap((order) => order.assignments.map((assignment) => assignment.id));
  if (assignmentIds.length === 0) return new Map<string, { id: string; name: string; role: string }>();
  const events = await prisma.auditLog.findMany({
    where: {
      action: 'assignment_created',
      entity_type: 'assignment',
      entity_id: { in: assignmentIds },
    },
    orderBy: { created_at: 'asc' },
    select: {
      entity_id: true,
      actor_role: true,
      actor: { select: { id: true, name: true } },
    },
  });
  const actors = new Map<string, { id: string; name: string; role: string }>();
  for (const event of events) {
    if (event.actor && !actors.has(event.entity_id)) {
      actors.set(event.entity_id, { ...event.actor, role: event.actor_role });
    }
  }
  return actors;
}

function toOrderReport(
  order: CompanyReportOrder,
  assignmentActors: Map<string, { id: string; name: string; role: string }>,
  positionId?: string,
) {
  const attendanceRecords = order.assignments.flatMap((assignment) =>
    assignment.attendance_logs.map((attendance) => ({
      id: attendance.id,
      assignment_id: assignment.id,
      worker_id: assignment.worker.id,
      worker_name: assignment.worker.user.name,
      position: assignmentPositionName(assignment),
      status: attendanceStatus(attendance.checkin_time, attendance.checkout_time),
      checkin_time: attendance.checkin_time,
      checkout_time: attendance.checkout_time,
      duration_minutes: durationMinutes(attendance.checkin_time, attendance.checkout_time),
      created_at: attendance.created_at,
      updated_at: attendance.updated_at,
    })),
  );
  const totalMinutes = attendanceRecords.reduce(
    (sum, attendance) => sum + (attendance.duration_minutes ?? 0),
    0,
  );
  return {
    id: order.id,
    title: order.title,
    description: order.description,
    category: order.category,
    status: order.status,
    created_at: order.created_at,
    start_datetime: order.shift_start,
    end_datetime: order.shift_end,
    location: order.location,
    workers_requested: requestedWorkersForOrder(order, positionId),
    workers_assigned: order.assignments.filter((assignment) =>
      COUNTED_ASSIGNMENT_STATUSES.includes(assignment.status as typeof COUNTED_ASSIGNMENT_STATUSES[number]),
    ).length,
    completed_assignments: order.assignments.filter((assignment) => assignment.status === 'completed').length,
    attendance_record_count: attendanceRecords.length,
    total_recorded_minutes: totalMinutes,
    total_recorded_hours: roundHours(totalMinutes),
    category_items: positionId
      ? order.category_items.filter((item) => item.position_id === positionId)
      : order.category_items,
    assignments: order.assignments.map((assignment) => ({
      id: assignment.id,
      status: assignment.status,
      assigned_at: assignment.assigned_at,
      updated_at: assignment.updated_at,
      category: assignment.order_category_item?.category ?? assignment.assigned_category,
      position_id: assignment.position_id ?? assignment.order_category_item?.position_id,
      position: assignmentPositionName(assignment),
      worker: {
        id: assignment.worker.id,
        name: assignment.worker.user.name,
        profile_photo_url: assignment.worker.profile_photo_url,
        registered_position: assignment.worker.position,
      },
      assigned_by: assignmentActors.get(assignment.id) ?? null,
      attendance: assignment.attendance_logs.map((attendance) => ({
        id: attendance.id,
        status: attendanceStatus(attendance.checkin_time, attendance.checkout_time),
        checkin_time: attendance.checkin_time,
        checkout_time: attendance.checkout_time,
        duration_minutes: durationMinutes(attendance.checkin_time, attendance.checkout_time),
      })),
    })),
    attendance: attendanceRecords,
  };
}

function requestedWorkersForOrder(order: CompanyReportOrder, positionId?: string): number {
  if (!positionId) return order.required_count;
  return order.category_items
    .filter((item) => item.position_id === positionId)
    .reduce((sum, item) => sum + item.required_count, 0);
}

function filterOrderAssignments(
  order: CompanyReportOrder,
  filters: Pick<CompanyReportQueryInput, 'worker_id' | 'position_id'>,
): CompanyReportOrder {
  if (!filters.worker_id && !filters.position_id) return order;
  return {
    ...order,
    assignments: order.assignments.filter((assignment) => {
      if (filters.worker_id && assignment.worker.id !== filters.worker_id) return false;
      if (
        filters.position_id
        && assignment.position_id !== filters.position_id
        && assignment.order_category_item?.position_id !== filters.position_id
      ) {
        return false;
      }
      return true;
    }),
  };
}

function assignmentPositionName(assignment: CompanyReportOrder['assignments'][number]): string | null {
  return assignment.position?.name_az
    ?? assignment.order_category_item?.position?.name_az
    ?? assignment.order_category_item?.category
    ?? assignment.assigned_category
    ?? null;
}

export function durationMinutes(checkin: Date | null, checkout: Date | null): number | null {
  if (!checkin || !checkout) return null;
  return Math.max(0, Math.round((checkout.getTime() - checkin.getTime()) / 60_000));
}

export function attendanceStatus(checkin: Date | null, checkout: Date | null) {
  if (checkout) return 'checked_out' as const;
  if (checkin) return 'currently_working' as const;
  return 'not_checked_in' as const;
}

function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

function serializeFilters(filters: CompanyReportQueryInput) {
  return {
    start_date: filters.start_date ?? null,
    end_date: filters.end_date ?? null,
    order_status: filters.order_status ?? null,
    worker_id: filters.worker_id ?? null,
    position_id: filters.position_id ?? null,
    sort: filters.sort,
  };
}

export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const raw = String(value);
  // Spreadsheet applications can evaluate cells beginning with these
  // characters as formulas. Prefix user-controlled values with an apostrophe
  // so exports remain data when opened in Excel or similar tools.
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
