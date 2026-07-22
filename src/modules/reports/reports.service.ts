import { Prisma } from '@prisma/client';
import { Errors } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { ReportQueryInput } from './reports.schema';

export async function getAdminReportSummary(filters: ReportQueryInput) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dateRange = buildDateRange(filters);

  const orderWhere = buildOrderWhere(filters, dateRange);
  const assignmentWhere = buildAssignmentWhere(filters, dateRange);
  const attendanceWhere = buildAttendanceWhere(filters, dateRange);
  const ratingWhere = buildRatingWhere(filters, dateRange);
  const pendingWorkerWhere = buildPendingWorkerWhere(filters, dateRange);
  const pendingCompanyWhere = buildPendingCompanyWhere(filters, dateRange);

  const [
    todayActiveOrders,
    pendingOrders,
    activeAssignments,
    checkedInWorkersToday,
    rejectedAssignments,
    pendingWorkerApprovals,
    pendingCompanyApprovals,
    workerWorkRows,
    companyUsageRows,
    attendanceTotal,
    attendanceCompleted,
    attendanceOpen,
    ratingStats,
    assignmentStatusRows,
    categoryDemandRows,
    legacyDemandRows,
  ] = await Promise.all([
    prisma.order.count({
      where: {
        ...orderWhere,
        status: 'active',
        shift_start: { lt: tomorrowStart },
        shift_end: { gte: todayStart },
      },
    }),
    prisma.order.count({ where: { ...orderWhere, status: 'draft' } }),
    prisma.assignment.count({
      where: { ...assignmentWhere, status: { in: ['assigned', 'accepted'] } },
    }),
    prisma.attendanceLog.findMany({
      where: {
        ...attendanceWhere,
        checkin_time: { gte: todayStart, lt: tomorrowStart },
        checkout_time: null,
      },
      distinct: ['assignment_id'],
      select: { assignment: { select: { worker_id: true } } },
    }),
    prisma.assignment.count({ where: { ...assignmentWhere, status: 'rejected' } }),
    prisma.worker.count({ where: pendingWorkerWhere }),
    prisma.company.count({ where: pendingCompanyWhere }),
    prisma.attendanceLog.findMany({
      where: { ...attendanceWhere, checkout_time: { not: null } },
      select: {
        assignment: {
          select: {
            worker_id: true,
            worker: { select: { user: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.order.findMany({
      where: orderWhere,
      select: {
        company_id: true,
        company: { select: { name: true } },
      },
    }),
    prisma.attendanceLog.count({ where: attendanceWhere }),
    prisma.attendanceLog.count({ where: { ...attendanceWhere, checkout_time: { not: null } } }),
    prisma.attendanceLog.count({ where: { ...attendanceWhere, checkin_time: { not: null }, checkout_time: null } }),
    prisma.rating.aggregate({
      where: ratingWhere,
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.assignment.groupBy({
      by: ['status'],
      where: assignmentWhere,
      _count: { _all: true },
    }),
    prisma.orderCategoryItem.findMany({
      where: {
        deleted_at: null,
        ...(filters.category ? { category: { equals: filters.category, mode: 'insensitive' } } : {}),
        ...(filters.department_id ? { department_id: filters.department_id } : {}),
        ...(filters.subdepartment_id ? { subdepartment_id: filters.subdepartment_id } : {}),
        ...(filters.position_id ? { position_id: filters.position_id } : {}),
        order: orderWhere,
      },
      select: {
        category: true,
        department_id: true,
        subdepartment_id: true,
        position_id: true,
        required_count: true,
        department: { select: { id: true, slug: true, name_az: true, name_en: true, status: true } },
        subdepartment: { select: { id: true, slug: true, name_az: true, name_en: true, status: true } },
        position: { select: { id: true, slug: true, name_az: true, name_en: true, status: true } },
        order: {
          select: {
            company_id: true,
            company: { select: { name: true } },
          },
        },
      },
    }),
    prisma.order.findMany({
      where: {
        ...orderWhere,
        category_items: { none: { deleted_at: null } },
      },
      select: {
        category: true,
        required_count: true,
        company_id: true,
        company: { select: { name: true } },
      },
    }),
  ]);

  const checkedInWorkerIds = new Set<string>();
  for (const row of checkedInWorkersToday) {
    checkedInWorkerIds.add(row.assignment.worker_id);
  }

  const workerWorkCounts: Record<string, { worker_id: string; worker_name: string; completed_count: number }> = {};
  for (const row of workerWorkRows) {
    const workerId = row.assignment.worker_id;
    workerWorkCounts[workerId] ??= {
      worker_id: workerId,
      worker_name: row.assignment.worker.user.name,
      completed_count: 0,
    };
    workerWorkCounts[workerId].completed_count += 1;
  }

  const companyUsage: Record<string, { company_id: string; company_name: string; order_count: number }> = {};
  for (const row of companyUsageRows) {
    companyUsage[row.company_id] ??= {
      company_id: row.company_id,
      company_name: row.company.name,
      order_count: 0,
    };
    companyUsage[row.company_id].order_count += 1;
  }

  const assignmentStats: Array<{ status: string; count: number }> = [];
  for (const row of assignmentStatusRows) {
    assignmentStats.push({
      status: row.status,
      count: row._count._all,
    });
  }
  const demandStats = buildDemandStats(categoryDemandRows, legacyDemandRows);
  const workerDetail = filters.worker_id
    ? await buildWorkerDetail(filters.worker_id, filters, ratingStats._avg.score ?? 0, ratingStats._count._all)
    : null;

  return {
    filters: {
      start_date: filters.start_date ?? null,
      end_date: filters.end_date ?? null,
      company_id: filters.company_id ?? null,
      worker_id: filters.worker_id ?? null,
      category: filters.category ?? null,
      department_id: filters.department_id ?? null,
      subdepartment_id: filters.subdepartment_id ?? null,
      position_id: filters.position_id ?? null,
      foc_training: filters.foc_training ?? null,
    },
    dashboard: {
      today_active_orders: todayActiveOrders,
      pending_orders: pendingOrders,
      active_assignments: activeAssignments,
      checked_in_workers_today: checkedInWorkerIds.size,
      rejected_assignments: rejectedAssignments,
      pending_worker_approvals: pendingWorkerApprovals,
      pending_company_approvals: pendingCompanyApprovals,
    },
    reports: {
      worker_work_counts: Object.values(workerWorkCounts),
      attendance: {
        total_count: attendanceTotal,
        completed_count: attendanceCompleted,
        open_count: attendanceOpen,
      },
      company_usage: Object.values(companyUsage),
      rating_stats: {
        average: ratingStats._avg.score ?? 0,
        count: ratingStats._count._all,
      },
      assignment_stats: assignmentStats,
      position_demand: demandStats.positionDemand,
      department_demand: demandStats.departmentDemand,
      company_position_usage: demandStats.companyPositionUsage,
      worker_detail: workerDetail,
    },
  };
}

export async function getCompanyReportSummary(userId: string, filters: ReportQueryInput) {
  const company = await prisma.company.findFirst({
    where: { user_id: userId, deleted_at: null },
    select: { id: true },
  });
  if (!company) {
    throw Errors.notFound('Company profile not found.', 'COMPANY_NOT_FOUND');
  }

  if (filters.worker_id) {
    await assertCompanyWorkerReportAccess(company.id, filters.worker_id);
  }

  const { foc_training: _focTraining, ...companyVisibleFilters } = filters;
  return getAdminReportSummary({
    ...companyVisibleFilters,
    company_id: company.id,
  });
}

async function assertCompanyWorkerReportAccess(
  companyId: string,
  workerId: string,
): Promise<void> {
  const relationship = await prisma.assignment.findFirst({
    where: {
      worker_id: workerId,
      deleted_at: null,
      order: {
        company_id: companyId,
        deleted_at: null,
      },
    },
    select: { id: true },
  });
  if (!relationship) {
    throw Errors.notFound('Worker report was not found.', 'REPORT_WORKER_NOT_FOUND');
  }
}

async function buildWorkerDetail(
  workerId: string,
  filters: ReportQueryInput,
  ratingAverage: number,
  ratingCount: number
) {
  const worker = await prisma.worker.findFirst({
    where: { id: workerId, deleted_at: null },
    select: {
      id: true,
      worker_class: true,
      is_foc_training: true,
      user: { select: { name: true } },
    },
  });
  if (!worker) return null;

  const attendanceRows: Array<{
    checkin_time: Date | null;
    checkout_time: Date | null;
    assignment: { order: { company: { name: string } } };
  }> = await prisma.attendanceLog.findMany({
    where: buildAttendanceWhere(filters, buildDateRange(filters)),
    select: {
      checkin_time: true,
      checkout_time: true,
      assignment: {
        select: {
          order: { select: { company: { select: { name: true } } } },
        },
      },
    },
  });

  const companyNames: string[] = [
    ...new Set(attendanceRows.map((row) => row.assignment.order.company.name)),
  ].sort((a, b) => a.localeCompare(b, 'az'));

  return {
    worker_id: worker.id,
    worker_name: worker.user.name,
    worker_class: worker.worker_class,
    is_foc_training: worker.is_foc_training,
    work_count: attendanceRows.filter((row) => row.checkin_time !== null).length,
    checkout_completed_count: attendanceRows.filter((row) => row.checkout_time !== null).length,
    company_names: companyNames,
    rating_average: ratingAverage,
    rating_count: ratingCount,
  };
}

function buildDemandStats(
  categoryRows: Array<{
    category: string;
    department_id: string | null;
    subdepartment_id: string | null;
    position_id: string | null;
    required_count: number;
    department: { id: string; slug: string; name_az: string; name_en: string | null; status: string } | null;
    subdepartment: { id: string; slug: string; name_az: string; name_en: string | null; status: string } | null;
    position: { id: string; slug: string; name_az: string; name_en: string | null; status: string } | null;
    order: { company_id: string; company: { name: string } };
  }>,
  legacyRows: Array<{
    category: string;
    required_count: number;
    company_id: string;
    company: { name: string };
  }>
) {
  const positionDemand = new Map<string, {
    position_id: string | null;
    position_name: string;
    department_id: string | null;
    department_name: string | null;
    subdepartment_id: string | null;
    subdepartment_name: string | null;
    required_count: number;
    order_item_count: number;
  }>();
  const departmentDemand = new Map<string, {
    department_id: string | null;
    department_name: string;
    required_count: number;
    order_item_count: number;
  }>();
  const companyPositionUsage = new Map<string, {
    company_id: string;
    company_name: string;
    position_id: string | null;
    position_name: string;
    required_count: number;
    order_item_count: number;
  }>();

  const addRow = (row: {
    category: string;
    required_count: number;
    company_id: string;
    company_name: string;
    department_id: string | null;
    department_name: string | null;
    subdepartment_id: string | null;
    subdepartment_name: string | null;
    position_id: string | null;
    position_name: string;
  }) => {
    const positionKey = row.position_id ?? `legacy:${row.position_name.toLocaleLowerCase('az-AZ')}`;
    const existingPosition = positionDemand.get(positionKey) ?? {
      position_id: row.position_id,
      position_name: row.position_name,
      department_id: row.department_id,
      department_name: row.department_name,
      subdepartment_id: row.subdepartment_id,
      subdepartment_name: row.subdepartment_name,
      required_count: 0,
      order_item_count: 0,
    };
    existingPosition.required_count += row.required_count;
    existingPosition.order_item_count += 1;
    positionDemand.set(positionKey, existingPosition);

    const departmentKey = row.department_id ?? `legacy:${row.department_name ?? 'legacy'}`;
    const existingDepartment = departmentDemand.get(departmentKey) ?? {
      department_id: row.department_id,
      department_name: row.department_name ?? 'Legacy category',
      required_count: 0,
      order_item_count: 0,
    };
    existingDepartment.required_count += row.required_count;
    existingDepartment.order_item_count += 1;
    departmentDemand.set(departmentKey, existingDepartment);

    const companyPositionKey = `${row.company_id}:${positionKey}`;
    const existingCompanyPosition = companyPositionUsage.get(companyPositionKey) ?? {
      company_id: row.company_id,
      company_name: row.company_name,
      position_id: row.position_id,
      position_name: row.position_name,
      required_count: 0,
      order_item_count: 0,
    };
    existingCompanyPosition.required_count += row.required_count;
    existingCompanyPosition.order_item_count += 1;
    companyPositionUsage.set(companyPositionKey, existingCompanyPosition);
  };

  for (const row of categoryRows) {
    addRow({
      category: row.category,
      required_count: row.required_count,
      company_id: row.order.company_id,
      company_name: row.order.company.name,
      department_id: row.department_id,
      department_name: row.department?.name_az ?? null,
      subdepartment_id: row.subdepartment_id,
      subdepartment_name: row.subdepartment?.name_az ?? null,
      position_id: row.position_id,
      position_name: row.position?.name_az ?? row.category,
    });
  }

  for (const row of legacyRows) {
    addRow({
      category: row.category,
      required_count: row.required_count,
      company_id: row.company_id,
      company_name: row.company.name,
      department_id: null,
      department_name: null,
      subdepartment_id: null,
      subdepartment_name: null,
      position_id: null,
      position_name: row.category,
    });
  }

  const byRequiredCount = <T extends { required_count: number }>(left: T, right: T) =>
    right.required_count - left.required_count;

  return {
    positionDemand: [...positionDemand.values()].sort(byRequiredCount),
    departmentDemand: [...departmentDemand.values()].sort(byRequiredCount),
    companyPositionUsage: [...companyPositionUsage.values()].sort(byRequiredCount),
  };
}

function buildDateRange(filters: ReportQueryInput) {
  if (!filters.start_date && !filters.end_date) return undefined;
  return {
    ...(filters.start_date ? { gte: filters.start_date } : {}),
    ...(filters.end_date ? { lte: filters.end_date } : {}),
  };
}

function buildOrderWhere(filters: ReportQueryInput, dateRange?: Prisma.DateTimeFilter): Prisma.OrderWhereInput {
  const andFilters: Prisma.OrderWhereInput[] = [];
  const workerFocFilter = buildWorkerFocFilter(filters);
  if (filters.category) {
    andFilters.push({
      OR: [
        { category: { equals: filters.category, mode: 'insensitive' } },
        {
          category_items: {
            some: {
              category: { equals: filters.category, mode: 'insensitive' },
              deleted_at: null,
            },
          },
        },
      ],
    });
  }
  if (filters.department_id) {
    andFilters.push({
      category_items: { some: { department_id: filters.department_id, deleted_at: null } },
    });
  }
  if (filters.subdepartment_id) {
    andFilters.push({
      category_items: { some: { subdepartment_id: filters.subdepartment_id, deleted_at: null } },
    });
  }
  if (filters.position_id) {
    andFilters.push({
      category_items: { some: { position_id: filters.position_id, deleted_at: null } },
    });
  }
  if (workerFocFilter) {
    andFilters.push({
      assignments: {
        some: {
          deleted_at: null,
          worker: workerFocFilter,
        },
      },
    });
  }

  return {
    deleted_at: null,
    ...(dateRange ? { created_at: dateRange } : {}),
    ...(filters.company_id ? { company_id: filters.company_id } : {}),
    ...(filters.worker_id
      ? {
          assignments: {
            some: {
              worker_id: filters.worker_id,
              deleted_at: null,
            },
          },
        }
      : {}),
    ...(andFilters.length ? { AND: andFilters } : {}),
  };
}

function buildAssignmentWhere(filters: ReportQueryInput, dateRange?: Prisma.DateTimeFilter): Prisma.AssignmentWhereInput {
  const andFilters: Prisma.AssignmentWhereInput[] = [];
  const workerFocFilter = buildWorkerFocFilter(filters);
  if (filters.category) {
    andFilters.push({
      OR: [
        { assigned_category: { equals: filters.category, mode: 'insensitive' } },
        {
          order_category_item: {
            is: {
              category: { equals: filters.category, mode: 'insensitive' },
              deleted_at: null,
            },
          },
        },
      ],
    });
  }
  if (filters.department_id) {
    andFilters.push({
      order_category_item: { is: { department_id: filters.department_id, deleted_at: null } },
    });
  }
  if (filters.subdepartment_id) {
    andFilters.push({
      order_category_item: { is: { subdepartment_id: filters.subdepartment_id, deleted_at: null } },
    });
  }
  if (filters.position_id) {
    andFilters.push({
      OR: [
        { position_id: filters.position_id },
        { order_category_item: { is: { position_id: filters.position_id, deleted_at: null } } },
      ],
    });
  }

  return {
    deleted_at: null,
    ...(dateRange ? { assigned_at: dateRange } : {}),
    ...(filters.worker_id ? { worker_id: filters.worker_id } : {}),
    ...(workerFocFilter ? { worker: workerFocFilter } : {}),
    ...(andFilters.length ? { AND: andFilters } : {}),
    order: {
      deleted_at: null,
      ...(filters.company_id ? { company_id: filters.company_id } : {}),
    },
  };
}

function buildAttendanceWhere(filters: ReportQueryInput, dateRange?: Prisma.DateTimeFilter): Prisma.AttendanceLogWhereInput {
  return {
    deleted_at: null,
    ...(dateRange ? { created_at: dateRange } : {}),
    assignment: buildAssignmentWhere(filters),
  };
}

function buildRatingWhere(filters: ReportQueryInput, dateRange?: Prisma.DateTimeFilter): Prisma.RatingWhereInput {
  const andFilters: Prisma.RatingWhereInput[] = [];
  const workerFocFilter = buildWorkerFocFilter(filters);
  if (filters.category) {
    andFilters.push({
      OR: [
        {
          assignment: {
            is: {
              assigned_category: { equals: filters.category, mode: 'insensitive' },
            },
          },
        },
        {
          assignment: {
            is: {
              order_category_item: {
                is: {
                  category: { equals: filters.category, mode: 'insensitive' },
                  deleted_at: null,
                },
              },
            },
          },
        },
        {
          assignment_id: null,
          order: {
            category: { equals: filters.category, mode: 'insensitive' },
          },
        },
      ],
    });
  }
  if (filters.department_id) {
    andFilters.push({
      OR: [
        {
          assignment: {
            is: {
              order_category_item: { is: { department_id: filters.department_id, deleted_at: null } },
            },
          },
        },
        {
          assignment_id: null,
          order: {
            category_items: { some: { department_id: filters.department_id, deleted_at: null } },
          },
        },
      ],
    });
  }
  if (filters.subdepartment_id) {
    andFilters.push({
      OR: [
        {
          assignment: {
            is: {
              order_category_item: { is: { subdepartment_id: filters.subdepartment_id, deleted_at: null } },
            },
          },
        },
        {
          assignment_id: null,
          order: {
            category_items: { some: { subdepartment_id: filters.subdepartment_id, deleted_at: null } },
          },
        },
      ],
    });
  }
  if (filters.position_id) {
    andFilters.push({
      OR: [
        {
          assignment: {
            is: {
              position_id: filters.position_id,
            },
          },
        },
        {
          assignment: {
            is: {
              order_category_item: { is: { position_id: filters.position_id, deleted_at: null } },
            },
          },
        },
        {
          assignment_id: null,
          order: {
            category_items: { some: { position_id: filters.position_id, deleted_at: null } },
          },
        },
      ],
    });
  }

  return {
    deleted_at: null,
    ...(dateRange ? { created_at: dateRange } : {}),
    ...(filters.worker_id ? { worker_id: filters.worker_id } : {}),
    ...(workerFocFilter ? { worker: workerFocFilter } : {}),
    ...(andFilters.length ? { AND: andFilters } : {}),
    order: {
      deleted_at: null,
      ...(filters.company_id ? { company_id: filters.company_id } : {}),
    },
  };
}

function buildPendingWorkerWhere(filters: ReportQueryInput, dateRange?: Prisma.DateTimeFilter): Prisma.WorkerWhereInput {
  return {
    deleted_at: null,
    status: 'pending_approval',
    ...(dateRange ? { created_at: dateRange } : {}),
    ...(filters.worker_id ? { id: filters.worker_id } : {}),
    ...(buildWorkerFocFilter(filters) ?? {}),
  };
}

function buildWorkerFocFilter(filters: ReportQueryInput): Prisma.WorkerWhereInput | undefined {
  if (filters.foc_training === 'foc') return { is_foc_training: true };
  if (filters.foc_training === 'non_foc') return { is_foc_training: false };
  return undefined;
}

function buildPendingCompanyWhere(filters: ReportQueryInput, dateRange?: Prisma.DateTimeFilter): Prisma.CompanyWhereInput {
  return {
    deleted_at: null,
    status: 'pending_approval',
    ...(dateRange ? { created_at: dateRange } : {}),
    ...(filters.company_id ? { id: filters.company_id } : {}),
  };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
