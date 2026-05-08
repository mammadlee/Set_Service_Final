import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './ratings.service';

const router = Router();
router.use(requireAuth);

const CreateRatingSchema = z.object({
  worker_id: z.string().uuid(),
  order_id: z.string().uuid(),
  score: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

// POST /ratings
router.post('/', requireRole('company', 'super_admin'), validate(CreateRatingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await Service.createRating(req.user!.sub, req.user!.role, req.body));
  } catch (e) { next(e); }
});

// GET /ratings/worker/:worker_id
router.get('/worker/:worker_id', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getWorkerRatings(req.params.worker_id)); } catch (e) { next(e); }
});

export default router;
