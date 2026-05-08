import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import {
  RegisterSchema, VerifyOtpSchema, RefreshSchema, LogoutSchema, FcmTokenSchema,
} from './auth.schema';
import * as AuthService from './auth.service';

const router = Router();

// POST /auth/register
router.post('/register', validate(RegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.register(req.body);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// POST /auth/verify-otp
router.post('/verify-otp', validate(VerifyOtpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.verifyOtp(req.body);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /auth/refresh
router.post('/refresh', validate(RefreshSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.refresh(req.body.refresh_token);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /auth/logout
router.post('/logout', requireAuth, validate(LogoutSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.logout(req.body.refresh_token);
    res.sendStatus(204);
  } catch (e) { next(e); }
});

// PATCH /auth/fcm-token
router.patch('/fcm-token', requireAuth, validate(FcmTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.updateFcmToken(req.user!.sub, req.body.fcm_token);
    res.sendStatus(204);
  } catch (e) { next(e); }
});

export default router;
