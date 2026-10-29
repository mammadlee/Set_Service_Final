import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { AdminIdParamsSchema, CreateAdminSchema, UpdateAdminSchema } from './admins.schema';
import * as Service from './admins.service';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('manage_admins'));

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.listAdmins());
  } catch (error) {
    next(error);
  }
});

router.post('/', validate(CreateAdminSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await Service.createAdmin(req.body, {
      sub: req.user!.sub,
      role: req.user!.role,
    }));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', validate(UpdateAdminSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = AdminIdParamsSchema.parse(req.params);
    res.json(await Service.updateAdmin(id, {
      sub: req.user!.sub,
      role: req.user!.role,
    }, req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = AdminIdParamsSchema.parse(req.params);
    res.json(await Service.deactivateAdmin(id, {
      sub: req.user!.sub,
      role: req.user!.role,
    }));
  } catch (error) {
    next(error);
  }
});

export default router;
