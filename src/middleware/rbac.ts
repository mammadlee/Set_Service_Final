import { Request, Response, NextFunction } from 'express';
import { Errors } from '../lib/errors';

type Role = 'super_admin' | 'company' | 'worker';

/**
 * requireRole('super_admin') — yalnız super_admin keçə bilər
 * requireRole('company', 'super_admin') — hər ikisi keçə bilər
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(Errors.unauthorized());
    if (!roles.includes(req.user.role as Role)) {
      return next(Errors.forbidden(`Yalnız ${roles.join(' və ya ')} rolu üçün`));
    }
    next();
  };
}
