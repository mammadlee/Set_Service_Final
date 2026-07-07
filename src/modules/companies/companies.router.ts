import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireApprovedAccount, requirePermission, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './companies.service';

const router = Router();

const UpdateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  docs_url: z.string().url().optional(),
  documents: z.array(z.object({ type: z.string(), url: z.string().url() }).passthrough()).optional(),
});

const RejectSchema = z.object({
  reason: z.string().min(3).max(1000),
});

router.get('/companies/me', requireAuth, requireRole('company'), requireApprovedAccount, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getMyCompany(req.user!.sub)); } catch (e) { next(e); }
});

router.patch('/companies/me', requireAuth, requireRole('company'), requireApprovedAccount, validate(UpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.updateMyCompany(req.user!.sub, req.body)); } catch (e) { next(e); }
});

router.get('/admin/companies', requireAuth, requirePermission('view_companies'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.listCompanies({
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      search: req.query.search as string | undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      sort: req.query.sort === 'asc' ? 'asc' : 'desc',
    }));
  } catch (e) { next(e); }
});

router.get('/admin/companies/:id', requireAuth, requirePermission('view_companies'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getCompanyById(req.params.id)); } catch (e) { next(e); }
});

router.patch('/admin/companies/:id/approve', requireAuth, requirePermission('manage_companies'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.approveCompany(req.params.id, req.user!)); } catch (e) { next(e); }
});

router.patch('/admin/companies/:id/reject', requireAuth, requirePermission('manage_companies'), validate(RejectSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.rejectCompany(req.params.id, req.body.reason, req.user!)); } catch (e) { next(e); }
});

export default router;
