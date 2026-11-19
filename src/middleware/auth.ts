import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, verifyRegistrationToken, JwtPayload } from '../lib/jwt';
import { Errors } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { updateRequestContext } from '../lib/request-context';
import { enforceActorRateLimit } from './rate-limit';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(Errors.unauthorized());
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    void assertSessionCurrent(payload)
      .then(async (session) => {
        req.user = payload;
        updateRequestContext({
          actor_id: payload.sub,
          role: payload.role,
          tenant_id: session.tenant_id,
        });
        await enforceActorRateLimit(req, _res);
        next();
      })
      .catch(next);
  } catch {
    next(Errors.unauthorized('Token etibarsızdır və ya müddəti bitib'));
  }
}

/**
 * Narrow authentication for post-OTP registration steps. Registration tokens
 * are deliberately rejected by requireAuth and may only reach routes that opt
 * into this middleware (private document upload and email verification).
 */
export function requireEnrollmentAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(Errors.unauthorized());
  }

  const token = header.slice(7);
  let payload: JwtPayload;
  try {
    try {
      payload = verifyAccessToken(token);
    } catch {
      payload = verifyRegistrationToken(token);
    }
  } catch {
    return next(Errors.unauthorized('Qeydiyyat sessiyası etibarsızdır və ya müddəti bitib.', 'ENROLLMENT_TOKEN_INVALID'));
  }

  void assertEnrollmentSessionCurrent(payload)
    .then(async (session) => {
      req.user = payload;
      updateRequestContext({ actor_id: payload.sub, role: payload.role, tenant_id: session.tenant_id });
      await enforceActorRateLimit(req, res);
      next();
    })
    .catch(next);
}

async function assertSessionCurrent(payload: JwtPayload): Promise<{ tenant_id?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      role: true,
      is_active: true,
      deleted_at: true,
      session_version: true,
      worker: { select: { status: true, deleted_at: true } },
      company: { select: { id: true, status: true, deleted_at: true } },
    },
  });

  if (!user || !user.is_active || user.deleted_at) {
    throw Errors.forbidden('Hesab aktiv deyil.', 'ACCOUNT_INACTIVE');
  }

  if (user.role !== payload.role) {
    throw Errors.unauthorized('Sessiya yenilənməlidir.', 'SESSION_INVALID');
  }

  if (payload.session_version !== user.session_version) {
    throw Errors.unauthorized('Sessiya ləğv edilib.', 'SESSION_REVOKED');
  }

  if (user.role === 'worker' && (
    !user.worker
    || user.worker.deleted_at
    || user.worker.status !== 'approved'
  )) {
    throw Errors.forbidden('İşçi hesabı aktiv deyil.', 'WORKER_NOT_APPROVED', {
      status: user.worker?.status ?? 'deleted',
    });
  }

  if (user.role === 'company' && (
    !user.company
    || user.company.deleted_at
    || user.company.status !== 'approved'
  )) {
    throw Errors.forbidden('Müəssisə hesabı aktiv deyil.', 'COMPANY_NOT_APPROVED', {
      status: user.company?.status ?? 'deleted',
    });
  }

  return {
    tenant_id: user.role === 'company' ? user.company?.id : undefined,
  };
}

async function assertEnrollmentSessionCurrent(payload: JwtPayload): Promise<{ tenant_id?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      role: true,
      is_active: true,
      deleted_at: true,
      password_set_at: true,
      session_version: true,
      worker: { select: { status: true, deleted_at: true } },
      company: { select: { id: true, status: true, deleted_at: true } },
    },
  });
  if (!user || !user.is_active || user.deleted_at || !user.password_set_at) {
    throw Errors.forbidden('Qeydiyyat sessiyası aktiv deyil.', 'ENROLLMENT_SESSION_INACTIVE');
  }
  if (user.role !== payload.role || payload.session_version !== user.session_version) {
    throw Errors.unauthorized('Qeydiyyat sessiyası yenilənməlidir.', 'ENROLLMENT_SESSION_INVALID');
  }
  if (user.role === 'worker') {
    if (!user.worker || user.worker.deleted_at || !['pending_approval', 'approved'].includes(user.worker.status)) {
      throw Errors.forbidden('İşçi qeydiyyatı sənəd qəbul etmir.', 'WORKER_ENROLLMENT_CLOSED');
    }
  } else if (user.role === 'company') {
    if (!user.company || user.company.deleted_at || !['pending_approval', 'approved'].includes(user.company.status)) {
      throw Errors.forbidden('Müəssisə qeydiyyatı sənəd qəbul etmir.', 'COMPANY_ENROLLMENT_CLOSED');
    }
  } else {
    throw Errors.forbidden('Bu rol üçün qeydiyyat sessiyası mövcud deyil.', 'ENROLLMENT_ROLE_INVALID');
  }
  return { tenant_id: user.role === 'company' ? user.company?.id : undefined };
}
