import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validate';
import { requireAuth, requireEnrollmentAuth } from '../../middleware/auth';
import { Errors } from '../../lib/errors';
import {
  AdminLoginSchema,
  AdminForgotPasswordSchema,
  CompanyCompleteRegistrationSchema,
  CompanyForgotPasswordSchema,
  CompanyLoginSchema,
  CompanyRegisterSchema,
  CompanyResetPasswordSchema,
  DeleteFcmTokenSchema,
  EmailVerificationConfirmSchema,
  EmailVerificationRequestSchema,
  FcmTokenSchema,
  LogoutSchema,
  RefreshSchema,
  RegisterSchema,
  VerifyOtpSchema,
  WorkerCompleteRegistrationSchema,
  WorkerForgotPasswordSchema,
  WorkerLoginSchema,
  WorkerPhoneChangeConfirmSchema,
  WorkerPhoneChangeRequestSchema,
  WorkerRegisterSchema,
  WorkerRequestOtpSchema,
  WorkerResetPasswordSchema,
} from './auth.schema';
import * as AuthService from './auth.service';
import {
  clearWebRefreshCookie,
  readWebRefreshCookie,
  requireTrustedWebOrigin,
  setWebRefreshCookie,
  webTokenResponse,
  type WebSessionRole,
} from './web-session';

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

router.post('/worker/complete-registration', validate(WorkerCompleteRegistrationSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.completeWorkerRegistration(req.body));
  } catch (e) { next(e); }
});

router.post('/worker/login', validate(WorkerLoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.loginWorker(req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post('/worker/forgot-password', validate(WorkerForgotPasswordSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.forgotWorkerPassword(req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post('/worker/reset-password', validate(WorkerResetPasswordSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.resetWorkerPassword(req.body));
  } catch (e) { next(e); }
});

router.post('/worker/phone-change/request', requireAuth, validate(WorkerPhoneChangeRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.requestWorkerPhoneChange(req.user!.sub, req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post('/worker/phone-change/confirm', requireAuth, validate(WorkerPhoneChangeConfirmSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.confirmWorkerPhoneChange(req.user!.sub, req.body));
  } catch (e) { next(e); }
});

router.post('/email-verification/request', requireEnrollmentAuth, validate(EmailVerificationRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.requestEmailVerification(req.user!.sub, req.body));
  } catch (e) { next(e); }
});

router.post('/email-verification/confirm', requireEnrollmentAuth, validate(EmailVerificationConfirmSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.confirmEmailVerification(req.user!.sub, req.body));
  } catch (e) { next(e); }
});

router.post('/company/register', validate(CompanyRegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.registerCompany(req.body, clientIp(req));
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/company/complete-registration', validate(CompanyCompleteRegistrationSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.completeCompanyRegistration(req.body));
  } catch (e) { next(e); }
});

router.post('/company/login', validate(CompanyLoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.loginCompany(req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post(
  '/company/web-login',
  requireTrustedWebOrigin,
  validate(CompanyLoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.loginCompany(req.body, clientIp(req));
      await assertWebRole(result, 'company');
      setWebRefreshCookie(res, 'company', result.refresh_token);
      res.json(webTokenResponse(result));
    } catch (e) {
      clearWebRefreshCookie(res, 'company');
      next(e);
    }
  },
);

router.post(
  '/company/web-refresh',
  requireTrustedWebOrigin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.refresh(readWebRefreshCookie(req, 'company'), clientIp(req));
      await assertWebRole(result, 'company');
      setWebRefreshCookie(res, 'company', result.refresh_token);
      res.json(webTokenResponse(result));
    } catch (e) {
      clearWebRefreshCookie(res, 'company');
      next(e);
    }
  },
);

router.post(
  '/company/web-logout',
  requireTrustedWebOrigin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AuthService.logoutByRefreshToken(readWebRefreshCookie(req, 'company'));
      clearWebRefreshCookie(res, 'company');
      res.sendStatus(204);
    } catch (e) {
      clearWebRefreshCookie(res, 'company');
      next(e);
    }
  },
);

router.post('/company/forgot-password', validate(CompanyForgotPasswordSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.forgotCompanyPassword(req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post('/company/reset-password', validate(CompanyResetPasswordSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.resetCompanyPassword(req.body));
  } catch (e) { next(e); }
});

router.post('/admin/login', validate(AdminLoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.loginAdmin(req.body, clientIp(req)));
  } catch (e) { next(e); }
});

router.post(
  '/admin/web-login',
  requireTrustedWebOrigin,
  validate(AdminLoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.loginAdmin(req.body, clientIp(req));
      await assertWebRole(result, 'admin');
      setWebRefreshCookie(res, 'admin', result.refresh_token);
      res.json(webTokenResponse(result));
    } catch (e) {
      clearWebRefreshCookie(res, 'admin');
      next(e);
    }
  },
);

router.post(
  '/admin/web-refresh',
  requireTrustedWebOrigin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.refresh(readWebRefreshCookie(req, 'admin'), clientIp(req));
      await assertWebRole(result, 'admin');
      setWebRefreshCookie(res, 'admin', result.refresh_token);
      res.json(webTokenResponse(result));
    } catch (e) {
      clearWebRefreshCookie(res, 'admin');
      next(e);
    }
  },
);

router.post(
  '/admin/web-logout',
  requireTrustedWebOrigin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AuthService.logoutByRefreshToken(readWebRefreshCookie(req, 'admin'));
      clearWebRefreshCookie(res, 'admin');
      res.sendStatus(204);
    } catch (e) {
      clearWebRefreshCookie(res, 'admin');
      next(e);
    }
  },
);

router.post('/admin/forgot-password', validate(AdminForgotPasswordSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.forgotAdminPassword(req.body));
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
    await AuthService.logout(req.body.refresh_token, req.user!.sub);
    res.sendStatus(204);
  } catch (e) { next(e); }
});

router.post('/fcm-token', requireAuth, validate(FcmTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await AuthService.registerFcmToken(req.user!.sub, req.body));
  } catch (e) { next(e); }
});

router.patch('/fcm-token', requireAuth, validate(FcmTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await AuthService.registerFcmToken(req.user!.sub, req.body));
  } catch (e) { next(e); }
});

router.delete('/fcm-token', requireAuth, validate(DeleteFcmTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.deleteFcmToken(req.user!.sub, req.body.fcm_token);
    res.sendStatus(204);
  } catch (e) { next(e); }
});

export default router;

type WebAuthResult = Awaited<ReturnType<typeof AuthService.refresh>>;

async function assertWebRole(result: WebAuthResult, role: WebSessionRole): Promise<void> {
  const isExpectedRole = role === 'company'
    ? result.user.role === 'company'
    : result.user.role === 'admin' || result.user.role === 'super_admin';
  if (isExpectedRole) return;

  await AuthService.logoutByRefreshToken(result.refresh_token).catch(() => undefined);
  throw Errors.unauthorized('Browser session role does not match this application.', 'WEB_ROLE_MISMATCH');
}
