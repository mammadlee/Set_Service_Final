import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './workers.service';

const router = Router();
router.use(requireAuth);

const SkillSchema = z.object({
  name: z.string(),
  level: z.number().int().min(1).max(5),
});

const UpdateWorkerSchema = z.object({
  skills: z.array(SkillSchema).optional(),
  availability: z.boolean().optional(),
});

// GET /workers/me
router.get('/me', requireRole('worker'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getMyWorker(req.user!.sub)); } catch (e) { next(e); }
});

// PATCH /workers/me
router.patch('/me', requireRole('worker'), validate(UpdateWorkerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.updateMyWorker(req.user!.sub, req.body)); } catch (e) { next(e); }
});

// GET /admin/workers
router.get('/admin/workers', requireRole('super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const available = req.query.available === 'true' ? true : req.query.available === 'false' ? false : undefined;
    res.json(await Service.listWorkers({ skills: req.query.skills as string, available }));
  } catch (e) { next(e); }
});

export default router;
