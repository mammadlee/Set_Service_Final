import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireAnyPermission, requireApprovedAccount, requirePermission, requireRole } from '../../middleware/rbac';
import { ReportQuerySchema } from './reports.schema';
import * as Service from './reports.service';

const router = Router();
export const companyReportsRouter = Router();

router.use(requireAuth);

router.get('/summary', requireAnyPermission('view_dashboard', 'view_reports'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = ReportQuerySchema.parse(req.query);
    res.json(await Service.getAdminReportSummary(query));
  } catch (error) {
    next(error);
  }
});

router.get('/', requirePermission('view_reports'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = ReportQuerySchema.parse(req.query);
    res.json(await Service.getAdminReportSummary(query));
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
