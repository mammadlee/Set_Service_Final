import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== 'super_admin') {
    return (
      <section className="panel restricted-panel">
        <h2>Giriş icazəsi yoxdur</h2>
        <p className="muted">Bu bölmə yalnız Super Admin üçün nəzərdə tutulub.</p>
      </section>
    );
  }

  return <>{children}</>;
}
