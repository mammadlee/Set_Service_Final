import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireApprovedAccount, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './attendance.service';

const router = Router();
router.use(requireAuth);

const QrScanSchema = z.object({ qr_token: z.string().min(1) });

// GET /attendance/qr-token  — planşet üçün
router.get('/qr-token', requireRole('company'), requireApprovedAccount, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getQrToken(req.user!.sub)); } catch (e) { next(e); }
});

// POST /attendance/checkin
router.post('/checkin', requireRole('worker'), requireApprovedAccount, validate(QrScanSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.checkin(req.user!.sub, req.body.qr_token)); } catch (e) { next(e); }
});

// POST /attendance/checkout
router.post('/checkout', requireRole('worker'), requireApprovedAccount, validate(QrScanSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.checkout(req.user!.sub, req.body.qr_token)); } catch (e) { next(e); }
});

export default router;
