import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/company_report_regression';
process.env.APP_TIME_ZONE = 'Asia/Baku';

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const db = prisma as any;
  const observedOrderWheres: any[] = [];
  const observedOrderSelects: any[] = [];
  const companyId = '10000000-0000-4000-8000-000000000001';
  let orderRows: any[] = [];

  db.company.findFirst = async ({ where }: any) => {
    assert.equal(where.id, companyId, 'the requested company must scope the profile lookup');
    return {
      id: companyId,
      name: 'A, "B" Company',
      status: 'approved',
      docs_url: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-02T00:00:00.000Z'),
      user: {
        name: 'Contact',
        phone: '+994501234567',
        email: 'company@example.test',
        is_active: true,
      },
    };
  };
  db.order.count = async ({ where }: any) => {
    observedOrderWheres.push(where);
    return 8;
  };
  db.order.findMany = async ({ where, select }: any) => {
    observedOrderWheres.push(where);
    observedOrderSelects.push(select);
    return orderRows;
  };
  db.order.groupBy = async ({ where }: any) => {
    observedOrderWheres.push(where);
    return [
      { status: 'published', _count: { _all: 2 } },
      { status: 'assigned', _count: { _all: 1 } },
      { status: 'draft', _count: { _all: 1 } },
      { status: 'completed', _count: { _all: 3 } },
      { status: 'cancelled', _count: { _all: 1 } },
    ];
  };
  db.order.aggregate = async ({ where }: any) => {
    observedOrderWheres.push(where);
    return { _sum: { required_count: 19 } };
  };
  db.orderCategoryItem.aggregate = async ({ where }: any) => {
    assert.equal(where.position_id, '30000000-0000-4000-8000-000000000001');
    assert.equal(where.order.company_id, companyId);
    return { _sum: { required_count: 2 } };
  };
  db.assignment.count = async ({ where }: any) => where.status === 'completed' ? 6 : 11;
  let attendanceCountCall = 0;
  db.attendanceLog.count = async () => [12, 9, 2][attendanceCountCall++] ?? 0;
  db.auditLog.findMany = async () => [];
  db.$queryRaw = async () => [{ total_minutes: 615 }];

  const { CompanyReportQuerySchema } = await import('../src/modules/reports/company-report.schema');
  const {
    attendanceStatus,
    csvCell,
    durationMinutes,
    exportCompanyDetailedReportCsv,
    getCompanyDetailedReport,
  } = await import('../src/modules/reports/company-report.service');

  const filters = CompanyReportQuerySchema.parse({
    start_date: '2026-04-01',
    end_date: '2026-04-30',
    order_status: 'published',
  });
  const report = await getCompanyDetailedReport(companyId, filters);

  assert.equal(report.company.id, companyId);
  assert.equal(report.summary.total_orders, 8);
  assert.equal(report.summary.active_orders, 3);
  assert.equal(report.summary.pending_orders, 1);
  assert.equal(report.summary.completed_orders, 3);
  assert.equal(report.summary.cancelled_orders, 1);
  assert.equal(report.summary.workers_requested, 19);
  assert.equal(report.summary.workers_assigned, 11);
  assert.equal(report.summary.completed_assignments, 6);
  assert.equal(report.summary.total_recorded_minutes, 615);
  assert.equal(report.summary.total_recorded_hours, 10.25);
  assert.ok(observedOrderWheres.length >= 4);
  for (const where of observedOrderWheres) {
    assert.equal(where.company_id, companyId, 'every order query must remain company-scoped');
    assert.equal(where.status, 'published');
    assert.equal(where.shift_end.gte.toISOString(), '2026-03-31T20:00:00.000Z');
    assert.equal(where.shift_start.lte.toISOString(), '2026-04-30T19:59:59.999Z');
  }

  assert.equal(durationMinutes(new Date('2026-01-01T08:00:00Z'), new Date('2026-01-01T09:45:00Z')), 105);
  assert.equal(durationMinutes(new Date('2026-01-01T09:00:00Z'), null), null);
  assert.equal(attendanceStatus(null, null), 'not_checked_in');
  assert.equal(attendanceStatus(new Date(), null), 'currently_working');
  assert.equal(attendanceStatus(new Date(), new Date()), 'checked_out');
  assert.equal(csvCell('A, "B"'), '"A, ""B"""');
  assert.equal(csvCell('=HYPERLINK("https://example.test")'), `"'=HYPERLINK(""https://example.test"")"`);
  assert.equal(
    CompanyReportQuerySchema.safeParse({ start_date: '2026-05-02', end_date: '2026-05-01' }).success,
    false,
    'inverted date ranges must be rejected',
  );

  const selectedWorkerId = '20000000-0000-4000-8000-000000000001';
  const otherWorkerId = '20000000-0000-4000-8000-000000000002';
  const positionId = '30000000-0000-4000-8000-000000000001';
  const otherPositionId = '30000000-0000-4000-8000-000000000002';
  const assignment = (id: string, workerId: string, workerName: string, assignedPositionId: string) => ({
    id,
    status: 'completed',
    assigned_at: new Date('2026-04-01T07:00:00.000Z'),
    updated_at: new Date('2026-04-01T12:00:00.000Z'),
    assigned_category: 'Xidmət',
    position_id: assignedPositionId,
    position: { id: assignedPositionId, name_az: assignedPositionId === positionId ? 'Ofisiant' : 'Aşpaz', name_en: 'Position' },
    order_category_item: null,
    worker: {
      id: workerId,
      profile_photo_url: null,
      position: 'Ofisiant',
      user: { name: workerName },
    },
    attendance_logs: [{
      id: `attendance-${id}`,
      checkin_time: new Date('2026-04-01T08:00:00.000Z'),
      checkout_time: new Date('2026-04-01T12:00:00.000Z'),
      created_at: new Date('2026-04-01T08:00:00.000Z'),
      updated_at: new Date('2026-04-01T12:00:00.000Z'),
    }],
  });
  orderRows = [{
    id: '40000000-0000-4000-8000-000000000001',
    title: 'Filtrlənən növbə',
    description: 'Hesabat filtri üçün test sifarişi',
    category: 'Xidmət',
    status: 'completed',
    created_at: new Date('2026-04-01T06:00:00.000Z'),
    shift_start: new Date('2026-04-01T08:00:00.000Z'),
    shift_end: new Date('2026-04-01T12:00:00.000Z'),
    required_count: 10,
    location: 'Bakı',
    category_items: [
      { id: 'category-item-1', category: 'Ofisiant', required_count: 2, position_id: positionId, position: { id: positionId, name_az: 'Ofisiant', name_en: 'Waiter' } },
      { id: 'category-item-2', category: 'Aşpaz', required_count: 8, position_id: otherPositionId, position: { id: otherPositionId, name_az: 'Aşpaz', name_en: 'Cook' } },
    ],
    assignments: [
      assignment('50000000-0000-4000-8000-000000000001', selectedWorkerId, 'Seçilmiş İşçi', positionId),
      assignment('50000000-0000-4000-8000-000000000002', otherWorkerId, 'Gizli İşçi', otherPositionId),
    ],
  }];

  const workerFilters = CompanyReportQuerySchema.parse({ worker_id: selectedWorkerId });
  const workerReport = await getCompanyDetailedReport(companyId, workerFilters);
  assert.equal(observedOrderSelects.at(-1).assignments.where.worker_id, selectedWorkerId);
  assert.deepEqual(
    workerReport.orders.data[0].assignments.map((item) => item.worker.id),
    [selectedWorkerId],
    'worker filter must also scope nested assignment and attendance details',
  );
  assert.equal(workerReport.orders.data[0].attendance_record_count, 1);

  const positionReport = await getCompanyDetailedReport(
    companyId,
    CompanyReportQuerySchema.parse({ position_id: positionId }),
  );
  assert.equal(observedOrderSelects.at(-1).assignments.where.OR[0].position_id, positionId);
  assert.deepEqual(
    positionReport.orders.data[0].assignments.map((item) => item.position_id),
    [positionId],
    'position filter must also scope nested assignment and attendance details',
  );
  assert.equal(positionReport.summary.workers_requested, 2, 'position summary must use matching category demand');
  assert.equal(positionReport.orders.data[0].workers_requested, 2, 'order demand must be position-scoped');
  assert.deepEqual(positionReport.orders.data[0].category_items.map((item) => item.position_id), [positionId]);

  const exported = await exportCompanyDetailedReportCsv(companyId, {
    worker_id: selectedWorkerId,
    sort: 'desc',
    format: 'csv',
  });
  assert.match(exported.csv, /Seçilmiş İşçi/);
  assert.doesNotMatch(exported.csv, /Gizli İşçi/);

  const routerSource = fs.readFileSync(
    path.resolve('src/modules/reports/reports.router.ts'),
    'utf8',
  );
  assert.match(routerSource, /companies\/:companyId[\s\S]*requirePermission\('view_reports'\)/);
  assert.match(routerSource, /Cache-Control': 'private, no-store'/);

  console.log('company-detailed-report-regression: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
