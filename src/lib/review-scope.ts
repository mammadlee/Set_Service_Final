import type { Request } from 'express';
import { STORE_REVIEW_ADMIN_PERMISSIONS } from './store-review-accounts';
import type { AdminPermission } from '../modules/admins/admins.permissions';

export type AdminReviewScope = Readonly<{
  isReviewAccount: boolean;
}>;

declare global {
  namespace Express {
    interface Request {
      adminReviewScope?: AdminReviewScope;
    }
  }
}

const REVIEW_ADMIN_PERMISSION_SET = new Set<AdminPermission>(
  STORE_REVIEW_ADMIN_PERMISSIONS,
);

export function attachAdminReviewScope(req: Request, isReviewAccount: boolean): void {
  req.adminReviewScope = { isReviewAccount };
}

export function isReviewScopedRequest(req: Request): boolean {
  return req.adminReviewScope?.isReviewAccount === true;
}

/**
 * Reviewer admins are deliberately view-only. Intersecting the persisted
 * permissions with the fixed allowlist prevents an accidental DB permission
 * change from granting a reviewer any manage_* capability.
 */
export function restrictReviewAdminPermissions(
  permissions: AdminPermission[],
  isReviewAccount: boolean,
): AdminPermission[] {
  if (!isReviewAccount) return permissions;
  return permissions.filter((permission) => REVIEW_ADMIN_PERMISSION_SET.has(permission));
}
