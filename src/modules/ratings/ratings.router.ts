import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireApprovedAccount, requirePermission, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  CreateRatingSchema,
  LegacyWorkerRatingsParamsSchema,
} from './ratings.schema';
import * as Service from './ratings.service';

const router = Router();
router.use(requireAuth);

router.post(
  '/',
  requireRole('company'),
  requireApprovedAccount,
  validate(CreateRatingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await Service.createRating(req.user!.sub, req.user!.role, req.body));
    } catch (e) {
      next(e);
    }
  }
);

router.get(
  '/me',
  requireRole('worker'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await Service.getMyRatings(req.user!.sub, req.user!.role));
    } catch (e) {
      next(e);
    }
  }
);

router.get(
  '/worker/:worker_id',
  requirePermission('view_workers'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { worker_id } = LegacyWorkerRatingsParamsSchema.parse(req.params);
      res.json(await Service.getWorkerRatings(worker_id, req.user!.role));
    } catch (e) {
      next(e);
    }
  }
);

export default router;
