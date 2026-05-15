import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import {
  AdminLoginSchema,
  CompanyLoginSchema,
  CompanyRegisterSchema,
  FcmTokenSchema,
  LogoutSchema,
  RefreshSchema,
  RegisterSchema,
  VerifyOtpSchema,
  WorkerLoginSchema,
  WorkerRegisterSchema,
  WorkerRequestOtpSchema,
} from './auth.schema';
import * as AuthService from './auth.service';

const router = Router();

const clientIp = (req: Request) =>
  req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim();

router.post('/worker/register', validate(WorkerRegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.registerWorker(req.body, clientIp(req));
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/worker/request-otp', validate(WorkerRequestOtpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.requestWorkerOtp(req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post('/worker/login', validate(WorkerLoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.loginWorker(req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post('/company/register', validate(CompanyRegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.registerCompany(req.body, clientIp(req));
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/company/login', validate(CompanyLoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.loginCompany(req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post('/admin/login', validate(AdminLoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.loginAdmin(req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post('/register', validate(RegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.register(req.body, clientIp(req));
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/verify-otp', validate(VerifyOtpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.verifyOtp(req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post('/refresh', validate(RefreshSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.refresh(req.body.refresh_token, clientIp(req)));
  } catch (e) { next(e); }
});

router.post('/logout', requireAuth, validate(LogoutSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.logout(req.body.refresh_token);
    res.sendStatus(204);
  } catch (e) { next(e); }
});

router.patch('/fcm-token', requireAuth, validate(FcmTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.updateFcmToken(req.user!.sub, req.body.fcm_token);
    res.sendStatus(204);
  } catch (e) { next(e); }
});

export default router;
