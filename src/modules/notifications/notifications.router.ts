import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRoleOrPermission } from '../../middleware/rbac';
import * as Service from './notifications.service';

const router = Router();

router.use(requireAuth);
router.use(requireRoleOrPermission('view_notifications', 'worker', 'company'));

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.listNotifications(req.user!.sub, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      unread_only: req.query.unread_only === 'true',
    }));
  } catch (e) { next(e); }
});

router.patch('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.markAllNotificationsRead(req.user!.sub)); } catch (e) { next(e); }
});

router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.markNotificationRead(req.user!.sub, req.params.id)); } catch (e) { next(e); }
});

export default router;
