import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './companies.service';

const router = Router();
router.use(requireAuth);

const UpdateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  docs_url: z.string().url().optional(),
});

const ApproveSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reason: z.string().optional(),
});

// GET /companies/me
router.get('/me', requireRole('company'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getMyCompany(req.user!.sub)); } catch (e) { next(e); }
});

// PATCH /companies/me
router.patch('/me', requireRole('company'), validate(UpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.updateMyCompany(req.user!.sub, req.body)); } catch (e) { next(e); }
});

// GET /admin/companies  (router /admin prefix ilə mount olunacaq)
router.get('/admin/companies', requireRole('super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    res.json(await Service.listCompanies(status));
  } catch (e) { next(e); }
});

// PATCH /admin/companies/:id/approve
router.patch('/admin/companies/:id/approve', requireRole('super_admin'), validate(ApproveSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.approveCompany(req.params.id, req.body.status, req.body.reason));
  } catch (e) { next(e); }
});

export default router;
