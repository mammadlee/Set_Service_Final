import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/jwt';
import { Errors } from '../lib/errors';
import { prisma } from '../lib/prisma';

// Express Request-ə user əlavə edirik
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
    const payload = verifyToken(token);
    void assertSessionCurrent(payload)
      .then(() => {
        req.user = payload;
        next();
      })
      .catch(next);
  } catch {
    next(Errors.unauthorized('Token etibarsızdır və ya müddəti bitib'));
  }
}

async function assertSessionCurrent(payload: JwtPayload): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      role: true,
      is_active: true,
      deleted_at: true,
      password_set_at: true,
    },
  });

  if (!user || !user.is_active || user.deleted_at) {
    throw Errors.forbidden('Hesab aktiv deyil.', 'ACCOUNT_INACTIVE');
  }

  if (user.role !== payload.role) {
    throw Errors.unauthorized('Sessiya yenilənməlidir.', 'SESSION_INVALID');
  }

  if (user.password_set_at && payload.iat) {
    const issuedAtMs = payload.iat * 1000;
    if (issuedAtMs < user.password_set_at.getTime() - 1000) {
      throw Errors.unauthorized('Sessiya yenilənməlidir.', 'SESSION_REVOKED');
    }
  }
}
