import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRoleOrPermission } from '../../middleware/rbac';
import * as Service from './notifications.service';
import {
  NotificationIdParamsSchema,
  NotificationListQuerySchema,
} from './notifications.schema';

const router = Router();

router.use(requireAuth);
router.use(requireRoleOrPermission('view_notifications', 'worker', 'company'));

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = NotificationListQuerySchema.parse(req.query);
    res.json(await Service.listNotifications(req.user!.sub, query));
  } catch (e) { next(e); }
});

router.patch('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.markAllNotificationsRead(req.user!.sub)); } catch (e) { next(e); }
});

router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = NotificationIdParamsSchema.parse(req.params);
    res.json(await Service.markNotificationRead(req.user!.sub, id));
  } catch (e) { next(e); }
});

export default router;
