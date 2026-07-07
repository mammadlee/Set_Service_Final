import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireApprovedAccount, requirePermission, requireRole, requireRoleOrPermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  AssignmentIdParamsSchema,
  CancelAssignmentSchema,
  CreateAssignmentsSchema,
  ListAssignmentsQuerySchema,
} from './assignments.schema';
import * as Service from './assignments.service';

const router = Router();

router.use(requireAuth);

const LegacyAssignParamsSchema = z.object({
  id: z.string().uuid(),
});

const LegacyAssignBodySchema = z
  .object({
    worker_ids: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict();

export const assignCompatibilityRouter = Router();
assignCompatibilityRouter.use(requireAuth);
assignCompatibilityRouter.post(
  '/:id/assign',
  requirePermission('manage_assignments'),
  validate(LegacyAssignBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = LegacyAssignParamsSchema.parse(req.params);
      res.status(201).json(await Service.createAssignments(req.user!.sub, req.user!.role, {
        order_id: id,
        worker_ids: req.body.worker_ids,
      }));
    } catch (e) {
      next(e);
    }
  }
);

// POST /assignments
router.post(
  '/',
  requirePermission('manage_assignments'),
  validate(CreateAssignmentsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await Service.createAssignments(req.user!.sub, req.user!.role, req.body));
    } catch (e) {
      next(e);
    }
  }
);

// GET /assignments
router.get(
  '/',
  requireRoleOrPermission('view_assignments', 'company', 'worker'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = ListAssignmentsQuerySchema.parse(req.query);
      res.json(await Service.listAssignments(req.user!.sub, req.user!.role, query));
    } catch (e) {
      next(e);
    }
  }
);

// GET /assignments/:id
router.get(
  '/:id',
  requireRoleOrPermission('view_assignments', 'company', 'worker'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = AssignmentIdParamsSchema.parse(req.params);
      res.json(await Service.getAssignment(id, req.user!.sub, req.user!.role));
    } catch (e) {
      next(e);
    }
  }
);

// PATCH /assignments/:id/accept
router.patch(
  '/:id/accept',
  requireRole('worker'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = AssignmentIdParamsSchema.parse(req.params);
      res.json(await Service.acceptAssignment(id, req.user!.sub, req.user!.role));
    } catch (e) {
      next(e);
    }
  }
);

// PATCH /assignments/:id/reject
router.patch(
  '/:id/reject',
  requireRole('worker'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = AssignmentIdParamsSchema.parse(req.params);
      res.json(await Service.rejectAssignment(id, req.user!.sub, req.user!.role));
    } catch (e) {
      next(e);
    }
  }
);

// PATCH /assignments/:id/cancel
router.patch(
  '/:id/cancel',
  requirePermission('manage_assignments'),
  validate(CancelAssignmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = AssignmentIdParamsSchema.parse(req.params);
      res.json(await Service.cancelAssignment(id, req.user!.sub, req.user!.role, req.body));
    } catch (e) {
      next(e);
    }
  }
);

export default router;
