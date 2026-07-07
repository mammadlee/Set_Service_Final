import type { ReactNode } from 'react';
import type { AdminPermission } from '../../shared/api/types';
import { hasPermission } from '../../shared/auth/permissions';
import { useAuth } from '../auth/AuthProvider';

export function RequirePermission({ permission, children }: { permission: AdminPermission; children: ReactNode }) {
  const { user } = useAuth();
  if (!hasPermission(user, permission)) {
    return (
      <section className="panel restricted-panel">
        <h2>Giriş icazəsi yoxdur</h2>
        <p className="muted">Bu bölməyə giriş icazəniz yoxdur.</p>
      </section>
    );
  }
  return <>{children}</>;
}
