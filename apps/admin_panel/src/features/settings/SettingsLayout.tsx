import { SlidersHorizontal, Workflow } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

export function SettingsLayout() {
  return (
    <div className="settings-shell">
      <nav className="settings-nav" aria-label="Parametrlər">
        <NavLink to="/settings/taxonomy">
          <Workflow size={16} />
          <span>Vəzifə Strukturu</span>
        </NavLink>
        <NavLink to="/settings/system">
          <SlidersHorizontal size={16} />
          <span>Sistem Parametrləri</span>
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
