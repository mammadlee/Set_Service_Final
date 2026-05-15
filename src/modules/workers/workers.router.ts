import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireApprovedAccount, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './workers.service';

const router = Router();

const UpdateWorkerSchema = z.object({
  skills: z.array(z.union([
    z.string().min(1),
    z.object({ name: z.string().min(1), level: z.number().int().min(1).max(5).optional() }),
  ])).optional(),
  languages: z.array(z.string().min(1)).optional(),
  documents: z.array(z.object({ type: z.string(), url: z.string().url() }).passthrough()).optional(),
  availability: z.boolean().optional(),
});

const RejectWorkerSchema = z.object({
  reason: z.string().min(3).max(1000),
});

router.get('/workers/me', requireAuth, requireRole('worker'), requireApprovedAccount, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getMyWorker(req.user!.sub)); } catch (e) { next(e); }
});

router.patch('/workers/me', requireAuth, requireRole('worker'), requireApprovedAccount, validate(UpdateWorkerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.updateMyWorker(req.user!.sub, req.body)); } catch (e) { next(e); }
});

router.get('/admin/workers', requireAuth, requireRole('super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.listWorkers({
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      search: req.query.search as string | undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      sort: req.query.sort === 'asc' ? 'asc' : 'desc',
      available: req.query.available === 'true' ? true : req.query.available === 'false' ? false : undefined,
    }));
  } catch (e) { next(e); }
});

router.get('/admin/workers/:id', requireAuth, requireRole('super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getWorkerById(req.params.id)); } catch (e) { next(e); }
});

router.patch('/admin/workers/:id/approve', requireAuth, requireRole('super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.approveWorker(req.params.id, req.user!)); } catch (e) { next(e); }
});

router.patch('/admin/workers/:id/reject', requireAuth, requireRole('super_admin'), validate(RejectWorkerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.rejectWorker(req.params.id, req.body.reason, req.user!)); } catch (e) { next(e); }
});

export default router;
