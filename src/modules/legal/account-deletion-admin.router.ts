import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/rbac';
import {
  getExternalDeletionRequest,
  listExternalDeletionRequests,
  reviewExternalDeletionRequest,
} from './account-deletion.service';

const router = Router();
router.use(requireAuth, requireSuperAdmin);

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']).optional(),
}).strict();
const IdSchema = z.object({ id: z.string().uuid() }).strict();
const ReviewSchema = z.object({
  status: z.enum(['reviewing', 'resolved', 'dismissed']),
  resolution_note: z.string().trim().min(3).max(1000).optional(),
  ownership_verification: z.enum([
    'authenticated_account',
    'verified_phone_support',
    'verified_email_support',
  ]).optional(),
}).strict();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listExternalDeletionRequests(ListQuerySchema.parse(req.query)));
  } catch (error) { next(error); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = IdSchema.parse(req.params);
    res.json(await getExternalDeletionRequest(id));
  } catch (error) { next(error); }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = IdSchema.parse(req.params);
    res.json(await reviewExternalDeletionRequest(id, req.user!.sub, ReviewSchema.parse(req.body)));
  } catch (error) { next(error); }
});

export default router;
