export const ADMIN_PERMISSIONS = [
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
] as const;

export type AdminPermission = typeof ADMIN_PERMISSIONS[number];

export const ADMIN_PERMISSION_DEPENDENCIES: Partial<Record<AdminPermission, readonly AdminPermission[]>> = {
  manage_workers: ['view_workers'],
  manage_companies: ['view_companies'],
  manage_assignments: ['view_assignments', 'view_orders', 'view_workers'],
  manage_kiosks: ['view_orders', 'view_assignments'],
};

export function isAdminPermission(value: unknown): value is AdminPermission {
  return typeof value === 'string' && (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}

export function normalizePermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set<AdminPermission>();

  function add(permission: AdminPermission): void {
    for (const dependency of ADMIN_PERMISSION_DEPENDENCIES[permission] ?? []) {
      add(dependency);
    }
    selected.add(permission);
  }

  value.filter(isAdminPermission).forEach(add);
  return ADMIN_PERMISSIONS.filter((permission) => selected.has(permission));
}
