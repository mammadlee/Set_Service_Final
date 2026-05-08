import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './orders.service';

const router = Router();
router.use(requireAuth);

const CreateOrderSchema = z.object({
  shift_start: z.string().datetime(),
  shift_end: z.string().datetime(),
  required_count: z.number().int().min(1),
  required_skills: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const CancelSchema = z.object({
  status: z.literal('cancelled'),
});

// GET /orders
router.get('/', requireRole('company', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    res.json(await Service.listOrders(req.user!.sub, req.user!.role, {
      status: req.query.status as string,
      page, limit,
    }));
  } catch (e) { next(e); }
});

// POST /orders
router.post('/', requireRole('company', 'super_admin'), validate(CreateOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await Service.createOrder(req.user!.sub, req.user!.role, req.body));
  } catch (e) { next(e); }
});

// GET /orders/:id
router.get('/:id', requireRole('company', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.getOrder(req.params.id, req.user!.sub, req.user!.role));
  } catch (e) { next(e); }
});

// PATCH /orders/:id
router.patch('/:id', requireRole('company', 'super_admin'), validate(CancelSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.cancelOrder(req.params.id, req.user!.sub, req.user!.role));
  } catch (e) { next(e); }
});

export default router;
