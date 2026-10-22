import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireAnyPermission, requireApprovedAccount, requirePermission, requireRole } from '../../middleware/rbac';
import { ReportQuerySchema } from './reports.schema';
import * as Service from './reports.service';
import {
  CompanyReportExportQuerySchema,
  CompanyReportParamsSchema,
  CompanyReportQuerySchema,
} from './company-report.schema';
import {
  exportCompanyDetailedReportCsv,
  getCompanyDetailedReport,
} from './company-report.service';
import { isReviewScopedRequest } from '../../lib/review-scope';

const router = Router();
export const companyReportsRouter = Router();

router.use(requireAuth);

router.get(
  '/companies/:companyId/export',
  requirePermission('view_reports'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { companyId } = CompanyReportParamsSchema.parse(req.params);
      const query = CompanyReportExportQuerySchema.parse(req.query);
      const exported = await exportCompanyDetailedReportCsv(
        companyId,
        query,
        isReviewScopedRequest(req),
      );
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exported.filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Export-Truncated': exported.truncated ? 'true' : 'false',
        'X-Exported-Order-Count': String(exported.exported_order_count),
      });
      res.send(exported.csv);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/companies/:companyId',
  requirePermission('view_reports'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { companyId } = CompanyReportParamsSchema.parse(req.params);
      const query = CompanyReportQuerySchema.parse(req.query);
      res.json(await getCompanyDetailedReport(
        companyId,
        query,
        isReviewScopedRequest(req),
      ));
    } catch (error) {
      next(error);
    }
  },
);

router.get('/summary', requireAnyPermission('view_dashboard', 'view_reports'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = ReportQuerySchema.parse(req.query);
    res.json(await Service.getAdminReportSummary(query, {
      isReviewAccount: isReviewScopedRequest(req),
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/', requirePermission('view_reports'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = ReportQuerySchema.parse(req.query);
    res.json(await Service.getAdminReportSummary(query, {
      isReviewAccount: isReviewScopedRequest(req),
    }));
  } catch (error) {
    next(error);
  }
});

companyReportsRouter.use(requireAuth);
companyReportsRouter.use(requireRole('company'));
companyReportsRouter.use(requireApprovedAccount);

companyReportsRouter.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = ReportQuerySchema.parse(req.query);
    res.json(await Service.getCompanyReportSummary(req.user!.sub, query));
  } catch (error) {
    next(error);
  }
});

companyReportsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = ReportQuerySchema.parse(req.query);
    res.json(await Service.getCompanyReportSummary(req.user!.sub, query));
  } catch (error) {
    next(error);
  }
});

export default router;
