import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireApprovedAccount, requireRole, requireRoleOrPermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  AttendanceIdParamsSchema,
  ActivateVenueKioskSchema,
  CheckInSchema,
  CheckOutSchema,
  CreateKioskSessionSchema,
  CreateVenueKioskSchema,
  GenerateQrTokenSchema,
  KioskSessionIdParamsSchema,
  KioskTokenParamsSchema,
  ListVenueKiosksQuerySchema,
  VenueKioskIdParamsSchema,
  ListAttendanceQuerySchema,
} from './attendance.schema';
import * as Service from './attendance.service';

const router = Router();
const legacyKioskPathsEnabled = process.env.NODE_ENV !== 'production';

// Public token-protected kiosk endpoints. These do not require admin/company
// credentials on venue tablets.
router.get('/kiosk-sessions/context', async (req: Request, res: Response, next: NextFunction) => {
  try {
    setKioskResponseHeaders(res);
    res.json(await Service.getKioskSession(readKioskCapability(req)));
  } catch (e) {
    next(e);
  }
});

router.post('/kiosk-sessions/qr-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    setKioskResponseHeaders(res);
    res.json(await Service.generateKioskQrToken(readKioskCapability(req)));
  } catch (e) {
    next(e);
  }
});

router.get('/venue-kiosks/context', async (req: Request, res: Response, next: NextFunction) => {
  try {
    setKioskResponseHeaders(res);
    res.json(await Service.getKioskSession(readKioskCapability(req)));
  } catch (e) {
    next(e);
  }
});

router.post('/venue-kiosks/qr-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    setKioskResponseHeaders(res);
    res.json(await Service.generateKioskQrToken(readKioskCapability(req)));
  } catch (e) {
    next(e);
  }
});

// Local-only migration bridge for kiosk links issued before capability headers
// were introduced. These routes are not registered in production, keeping raw
// capabilities out of the production API route surface and application logs.
// LOCAL_ONLY_KIOSK_LEGACY_START
if (legacyKioskPathsEnabled) {
  router.get('/kiosk-sessions/:token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      setKioskResponseHeaders(res);
      const { token } = KioskTokenParamsSchema.parse(req.params);
      res.setHeader('Deprecation', 'true');
      res.json(await Service.getKioskSession(token));
    } catch (e) {
      next(e);
    }
  });

  router.post('/kiosk-sessions/:token/qr-token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      setKioskResponseHeaders(res);
      const { token } = KioskTokenParamsSchema.parse(req.params);
      res.setHeader('Deprecation', 'true');
      res.json(await Service.generateKioskQrToken(token));
    } catch (e) {
      next(e);
    }
  });

  router.get('/venue-kiosks/:token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      setKioskResponseHeaders(res);
      const { token } = KioskTokenParamsSchema.parse(req.params);
      res.setHeader('Deprecation', 'true');
      res.json(await Service.getKioskSession(token));
    } catch (e) {
      next(e);
    }
  });

  router.post('/venue-kiosks/:token/qr-token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      setKioskResponseHeaders(res);
      const { token } = KioskTokenParamsSchema.parse(req.params);
      res.setHeader('Deprecation', 'true');
      res.json(await Service.generateKioskQrToken(token));
    } catch (e) {
      next(e);
    }
  });
}
// LOCAL_ONLY_KIOSK_LEGACY_END

router.use(requireAuth);

router.get(
  '/venue-kiosks',
  requireRoleOrPermission('manage_kiosks', 'company'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = ListVenueKiosksQuerySchema.parse(req.query);
      res.json(await Service.listVenueKiosks(req.user!.sub, req.user!.role, query));
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/venue-kiosks',
  requireRoleOrPermission('manage_kiosks', 'company'),
  requireApprovedAccount,
  validate(CreateVenueKioskSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await Service.createVenueKiosk(req.user!.sub, req.user!.role, req.body));
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/venue-kiosks/:id/activate',
  requireRoleOrPermission('manage_kiosks', 'company'),
  requireApprovedAccount,
  validate(ActivateVenueKioskSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = VenueKioskIdParamsSchema.parse(req.params);
      res.json(await Service.activateVenueKiosk(req.user!.sub, req.user!.role, id, req.body));
    } catch (e) {
      next(e);
    }
  }
);

router.delete(
  '/venue-kiosks/:id/active-session',
  requireRoleOrPermission('manage_kiosks', 'company'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = VenueKioskIdParamsSchema.parse(req.params);
      res.json(await Service.deactivateVenueKiosk(req.user!.sub, req.user!.role, id));
    } catch (e) {
      next(e);
    }
  }
);

router.delete(
  '/venue-kiosks/:id',
  requireRoleOrPermission('manage_kiosks', 'company'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = VenueKioskIdParamsSchema.parse(req.params);
      res.json(await Service.disableVenueKiosk(req.user!.sub, req.user!.role, id));
    } catch (e) {
      next(e);
    }
  }
);

// POST /attendance/kiosk-sessions
router.post(
  '/kiosk-sessions',
  requireRoleOrPermission('manage_kiosks', 'company'),
  requireApprovedAccount,
  validate(CreateKioskSessionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await Service.createKioskSession(req.user!.sub, req.user!.role, req.body));
    } catch (e) {
      next(e);
    }
  }
);

// DELETE /attendance/kiosk-sessions/:id
router.delete(
  '/kiosk-sessions/:id',
  requireRoleOrPermission('manage_kiosks', 'company'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = KioskSessionIdParamsSchema.parse(req.params);
      await Service.revokeKioskSession(req.user!.sub, req.user!.role, id);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }
);

// POST /attendance/qr-token
router.post(
  '/qr-token',
  requireRoleOrPermission('manage_kiosks', 'company'),
  requireApprovedAccount,
  validate(GenerateQrTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await Service.generateQrToken(req.user!.sub, req.user!.role, req.body));
    } catch (e) {
      next(e);
    }
  }
);

// POST /attendance/check-in
router.post(
  '/check-in',
  requireRole('worker'),
  requireApprovedAccount,
  validate(CheckInSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await Service.checkIn(req.user!.sub, req.user!.role, req.body));
    } catch (e) {
      next(e);
    }
  }
);

// POST /attendance/check-out
router.post(
  '/check-out',
  requireRole('worker'),
  requireApprovedAccount,
  validate(CheckOutSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await Service.checkOut(req.user!.sub, req.user!.role, req.body));
    } catch (e) {
      next(e);
    }
  }
);

// GET /attendance
router.get(
  '/',
  requireRoleOrPermission('view_attendance', 'company', 'worker'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = ListAttendanceQuerySchema.parse(req.query);
      res.json(await Service.listAttendance(req.user!.sub, req.user!.role, query));
    } catch (e) {
      next(e);
    }
  }
);

// GET /attendance/:id
router.get(
  '/:id',
  requireRoleOrPermission('view_attendance', 'company', 'worker'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = AttendanceIdParamsSchema.parse(req.params);
      res.json(await Service.getAttendance(id, req.user!.sub, req.user!.role));
    } catch (e) {
      next(e);
    }
  }
);

export default router;

function readKioskCapability(req: Request): string {
  return KioskTokenParamsSchema.parse({
    token: req.get('x-kiosk-capability'),
  }).token;
}

function setKioskResponseHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
}
