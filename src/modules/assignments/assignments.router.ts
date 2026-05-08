import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './assignments.service';

const router = Router();
router.use(requireAuth);

const AssignSchema = z.object({
  worker_ids: z.array(z.string().uuid()).min(1),
});

const StatusSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
});

// POST /orders/:id/assign  — bu route orders router-dən çağırılır
// Burada ayrıca export edirik ki, app.ts-dən istifadə edək
export const assignRouter = Router();
assignRouter.use(requireAuth);
assignRouter.post('/:id/assign', requireRole('super_admin'), validate(AssignSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.assignWorkers(req.params.id, req.body.worker_ids));
  } catch (e) { next(e); }
});

// GET /assignments/me
router.get('/me', requireRole('worker'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.getMyAssignments(req.user!.sub, req.query.status as string));
  } catch (e) { next(e); }
});

// PATCH /assignments/:id/status
router.patch('/:id/status', requireRole('worker'), validate(StatusSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.updateAssignmentStatus(req.params.id, req.user!.sub, req.body.status));
  } catch (e) { next(e); }
});

export default router;
