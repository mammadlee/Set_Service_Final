import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireApprovedAccount, requireRole, requireRoleOrPermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  CancelOrderSchema,
  CreateOrderSchema,
  IdempotencyKeySchema,
  ListOrdersQuerySchema,
  OrderIdParamsSchema,
} from './orders.schema';
import * as Service from './orders.service';

const router = Router();

router.use(requireAuth);

// GET /orders
router.get(
  '/',
  requireRoleOrPermission('view_orders', 'company'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = ListOrdersQuerySchema.parse(req.query);
      res.json(await Service.listOrders(req.user!.sub, req.user!.role, query));
    } catch (e) {
      next(e);
    }
  }
);

// POST /orders
router.post(
  '/',
  requireRole('company'),
  requireApprovedAccount,
  validate(CreateOrderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawIdempotencyKey = req.header('Idempotency-Key');
      const idempotencyKey = rawIdempotencyKey === undefined
        ? undefined
        : IdempotencyKeySchema.parse(rawIdempotencyKey);
      const result = await Service.createOrder(
        req.user!.sub,
        req.user!.role,
        req.body,
        idempotencyKey
      );
      if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
      res.status(201).json(result.response);
    } catch (e) {
      next(e);
    }
  }
);

// GET /orders/:id
router.get(
  '/:id',
  requireRoleOrPermission('view_orders', 'company'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = OrderIdParamsSchema.parse(req.params);
      res.json(await Service.getOrder(id, req.user!.sub, req.user!.role));
    } catch (e) {
      next(e);
    }
  }
);

// PATCH /orders/:id/cancel
router.patch(
  '/:id/cancel',
  requireRole('company'),
  requireApprovedAccount,
  validate(CancelOrderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = OrderIdParamsSchema.parse(req.params);
      res.json(await Service.cancelOrder(id, req.user!.sub, req.user!.role, req.body));
    } catch (e) {
      next(e);
    }
  }
);

export default router;
