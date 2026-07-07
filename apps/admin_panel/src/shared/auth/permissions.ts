import type { AdminPermission, AuthUser } from '../api/types';

export const ADMIN_PERMISSIONS: AdminPermission[] = [
  'view_dashboard',
  'view_workers',
  'manage_workers',
  'view_companies',
  'manage_companies',
  'view_orders',
  'view_assignments',
  'manage_assignments',
  'view_attendance',
  'view_reports',
  'manage_kiosks',
  'view_notifications',
  'manage_admins',
];

export const ADMIN_PERMISSION_DEPENDENCIES: Partial<Record<AdminPermission, AdminPermission[]>> = {
  manage_workers: ['view_workers'],
  manage_companies: ['view_companies'],
  manage_assignments: ['view_assignments', 'view_orders', 'view_workers'],
  manage_kiosks: ['view_orders', 'view_assignments'],
};

const ADMIN_LANDING_PATHS: Array<{ permission: AdminPermission; path: string }> = [
  { permission: 'view_dashboard', path: '/' },
  { permission: 'view_workers', path: '/workers' },
  { permission: 'view_companies', path: '/companies' },
  { permission: 'view_orders', path: '/orders' },
  { permission: 'view_assignments', path: '/assignments' },
  { permission: 'view_attendance', path: '/attendance' },
  { permission: 'manage_kiosks', path: '/attendance/qr-display' },
  { permission: 'view_reports', path: '/reports' },
  { permission: 'view_notifications', path: '/notifications' },
  { permission: 'manage_admins', path: '/admins' },
];

export function isAdminRole(role?: string | null) {
  return role === 'super_admin' || role === 'admin';
}

export function hasPermission(user: AuthUser | null | undefined, permission: AdminPermission) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return user.role === 'admin' && (user.permissions ?? []).includes(permission);
}

export function getAdminLandingPath(user: AuthUser | null | undefined) {
  if (!user || user.role === 'super_admin') return '/';
  const allowed = ADMIN_LANDING_PATHS.find((item) => hasPermission(user, item.permission));
  return allowed?.path ?? '/';
}

export function expandPermissions(permissions: AdminPermission[]) {
  const selected = new Set<AdminPermission>();

  function add(permission: AdminPermission): void {
    for (const dependency of ADMIN_PERMISSION_DEPENDENCIES[permission] ?? []) {
      add(dependency);
    }
    selected.add(permission);
  }

  permissions.forEach(add);
  return ADMIN_PERMISSIONS.filter((permission) => selected.has(permission));
}

export function isRequiredBySelectedPermissions(permission: AdminPermission, selected: AdminPermission[]) {
  return selected.some((item) => (ADMIN_PERMISSION_DEPENDENCIES[item] ?? []).includes(permission));
}
