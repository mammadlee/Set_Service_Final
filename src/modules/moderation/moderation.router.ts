import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireApprovedAccount, requirePermission, requireRole } from '../../middleware/rbac';
import { createRateLimitMiddleware } from '../../middleware/rate-limit';
import {
  CreateReportSchema,
  ListReportsSchema,
  ReportIdSchema,
  UpdateReportSchema,
} from './moderation.schema';
import * as Service from './moderation.service';

const router = Router();
const reportLimiter = createRateLimitMiddleware({
  scope: 'moderation_report',
  windowMs: 60 * 60 * 1000,
  max: 10,
  dimensions: ['actor'],
});

router.post(
  '/reports',
  requireAuth,
  requireRole('worker', 'company'),
  requireApprovedAccount,
  reportLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = CreateReportSchema.parse(req.body);
      const role = req.user!.role as 'worker' | 'company';
      res.status(201).json(await Service.createReport(req.user!.sub, role, input));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/reports',
  requireAuth,
  requirePermission('view_moderation'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await Service.listModerationReports(ListReportsSchema.parse(req.query)));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/reports/:id',
  requireAuth,
  requirePermission('view_moderation'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = ReportIdSchema.parse(req.params);
      res.json(await Service.getModerationReport(id));
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/admin/reports/:id/status',
  requireAuth,
  requirePermission('manage_moderation'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = ReportIdSchema.parse(req.params);
      const input = UpdateReportSchema.parse(req.body);
      const actor = req.user! as { sub: string; role: 'admin' | 'super_admin' };
      res.json(await Service.updateModerationReport(id, actor, input));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
