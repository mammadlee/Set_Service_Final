import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  CreateDepartmentSchema,
  CreatePositionSchema,
  CreateSubdepartmentSchema,
  DepartmentIdParamsSchema,
  PositionIdParamsSchema,
  SubdepartmentIdParamsSchema,
  UpdateDepartmentSchema,
  UpdatePositionSchema,
  UpdateSubdepartmentSchema,
} from './taxonomy.schema';
import * as Service from './taxonomy.service';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.listTaxonomy());
  } catch (error) {
    next(error);
  }
});

router.get('/positions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.listPositions());
  } catch (error) {
    next(error);
  }
});

router.use('/admin', requireAuth, requireSuperAdmin);

router.get('/admin', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.listTaxonomy({ includeInactive: true }));
  } catch (error) {
    next(error);
  }
});

router.get('/admin/positions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.listPositions({ includeInactive: true }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/departments', validate(CreateDepartmentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await Service.createDepartment(req.body));
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/departments/:id', validate(UpdateDepartmentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = DepartmentIdParamsSchema.parse(req.params);
    res.json(await Service.updateDepartment(id, req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/subdepartments', validate(CreateSubdepartmentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await Service.createSubdepartment(req.body));
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/subdepartments/:id', validate(UpdateSubdepartmentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = SubdepartmentIdParamsSchema.parse(req.params);
    res.json(await Service.updateSubdepartment(id, req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/positions', validate(CreatePositionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await Service.createPosition(req.body));
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/positions/:id', validate(UpdatePositionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = PositionIdParamsSchema.parse(req.params);
    res.json(await Service.updatePosition(id, req.body));
  } catch (error) {
    next(error);
  }
});

export default router;
