import { Request, Response, NextFunction } from 'express';
import { Errors } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { Role } from '../types/prisma';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(Errors.unauthorized());
    if (!roles.includes(req.user.role as Role)) {
      return next(Errors.forbidden(`Only ${roles.join(' or ')} can access this resource`, 'ROLE_FORBIDDEN'));
    }
    next();
  };
}

export function requireApprovedAccount(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(Errors.unauthorized());

  void (async () => {
    if (req.user!.role === 'super_admin') {
      next();
      return;
    }

    if (req.user!.role === 'worker') {
      const worker = await prisma.worker.findUnique({
        where: { user_id: req.user!.sub },
        select: { status: true },
      });
      if (worker?.status === 'approved') {
        next();
        return;
      }
      throw Errors.forbidden('Worker account must be approved before using this API.', 'ACCOUNT_NOT_APPROVED', {
        status: worker?.status ?? 'unknown',
      });
    }

    if (req.user!.role === 'company') {
      const company = await prisma.company.findUnique({
        where: { user_id: req.user!.sub },
        select: { status: true },
      });
      if (company?.status === 'approved') {
        next();
        return;
      }
      throw Errors.forbidden('Company account must be approved before using this API.', 'ACCOUNT_NOT_APPROVED', {
        status: company?.status ?? 'unknown',
      });
    }

    throw Errors.forbidden('Account role is not supported.', 'ROLE_FORBIDDEN');
  })().catch(next);
}
