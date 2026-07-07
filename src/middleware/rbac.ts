import { Request, Response, NextFunction } from 'express';
import { Errors } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { Role } from '../types/prisma';
import { AdminPermission, normalizePermissions } from '../modules/admins/admins.permissions';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(Errors.unauthorized());
    if (!roles.includes(req.user.role as Role)) {
      return next(Errors.forbidden('Bu bölməyə giriş icazəniz yoxdur.', 'ROLE_FORBIDDEN', { roles }));
    }
    next();
  };
}

export function requirePermission(permission: AdminPermission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void requireAdminPermission(req, permission).then(() => next()).catch(next);
  };
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  void loadCurrentAdmin(req)
    .then((admin) => {
      if (admin.role !== 'super_admin') {
        throw Errors.forbidden('Bu bölmə yalnız Super Admin üçün nəzərdə tutulub.', 'PERMISSION_DENIED');
      }
      next();
    })
    .catch(next);
}

export function requireAnyPermission(...permissions: AdminPermission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void requireAdminAnyPermission(req, permissions).then(() => next()).catch(next);
  };
}

export function requireRoleOrPermission(permission: AdminPermission, ...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(Errors.unauthorized());
    const role = req.user.role as Role;
    if (role === 'super_admin' || role === 'admin') {
      void requireAdminPermission(req, permission).then(() => next()).catch(next);
      return;
    }
    if (!roles.includes(role)) {
      return next(Errors.forbidden('Bu bölməyə giriş icazəniz yoxdur.', 'PERMISSION_DENIED', { permission }));
    }
    next();
  };
}

export function requireApprovedAccount(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(Errors.unauthorized());

  void (async () => {
    if (req.user!.role === 'super_admin' || req.user!.role === 'admin') {
      next();
      return;
    }

    if (req.user!.role === 'worker') {
      const worker = await prisma.worker.findUnique({
        where: { user_id: req.user!.sub },
        select: {
          status: true,
          deleted_at: true,
          user: { select: { is_active: true, deleted_at: true } },
        },
      });
      if (!worker || worker.deleted_at || !worker.user.is_active || worker.user.deleted_at) {
        throw Errors.forbidden('İşçi hesabı aktiv deyil.', 'ACCOUNT_INACTIVE', {
          status: worker?.status ?? 'unknown',
        });
      }
      if (worker.status === 'approved') {
        next();
        return;
      }
      throw Errors.forbidden('İşçi hesabı təsdiqlənməlidir.', 'ACCOUNT_NOT_APPROVED', {
        status: worker?.status ?? 'unknown',
      });
    }

    if (req.user!.role === 'company') {
      const company = await prisma.company.findUnique({
        where: { user_id: req.user!.sub },
        select: {
          status: true,
          deleted_at: true,
          user: { select: { is_active: true, deleted_at: true } },
        },
      });
      if (!company || company.deleted_at || !company.user.is_active || company.user.deleted_at) {
        throw Errors.forbidden('Müəssisə hesabı aktiv deyil.', 'ACCOUNT_INACTIVE', {
          status: company?.status ?? 'unknown',
        });
      }
      if (company.status === 'approved') {
        next();
        return;
      }
      throw Errors.forbidden('Müəssisə hesabı təsdiqlənməlidir.', 'ACCOUNT_NOT_APPROVED', {
        status: company?.status ?? 'unknown',
      });
    }

    throw Errors.forbidden('Hesab rolu dəstəklənmir.', 'ROLE_FORBIDDEN');
  })().catch(next);
}

async function requireAdminPermission(req: Request, permission: AdminPermission): Promise<void> {
  return requireAdminAnyPermission(req, [permission]);
}

async function requireAdminAnyPermission(req: Request, permissionsToCheck: AdminPermission[]): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  const admin = await loadCurrentAdmin(req);

  if (admin.role === 'super_admin') return;
  if (!permissionsToCheck.some((permission) => admin.permissions.includes(permission))) {
    throw Errors.forbidden('Bu bölməyə giriş icazəniz yoxdur.', 'PERMISSION_DENIED', { permissions: permissionsToCheck });
  }
}

async function loadCurrentAdmin(req: Request): Promise<{
  role: 'super_admin' | 'admin';
  permissions: AdminPermission[];
}> {
  if (!req.user) throw Errors.unauthorized();

  const tokenRole = req.user.role as Role;
  if (tokenRole !== 'super_admin' && tokenRole !== 'admin') {
    throw Errors.forbidden('Bu bölməyə giriş icazəniz yoxdur.', 'PERMISSION_DENIED');
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: {
      role: true,
      is_active: true,
      deleted_at: true,
      admin: { select: { permissions: true } },
    },
  });

  if (!user || !user.is_active || user.deleted_at) {
    throw Errors.forbidden('Admin hesabı aktiv deyil.', 'ADMIN_ACCOUNT_INACTIVE');
  }

  if (user.role !== tokenRole || (user.role !== 'super_admin' && user.role !== 'admin')) {
    throw Errors.forbidden('Admin sessiyası yenilənməlidir.', 'ADMIN_SESSION_INVALID');
  }

  if (!user.admin) {
    throw Errors.forbidden('Admin profili tapılmadı.', 'ADMIN_PROFILE_MISSING');
  }

  return {
    role: user.role,
    permissions: normalizePermissions(user.admin.permissions),
  };
}
