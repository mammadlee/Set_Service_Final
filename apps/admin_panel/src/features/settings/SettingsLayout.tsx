import { SlidersHorizontal, UserRoundX, Workflow } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

export function SettingsLayout() {
  return (
    <div className="settings-shell">
      <nav className="settings-nav" aria-label="Parametrlər">
        <NavLink to="/settings/taxonomy">
          <Workflow size={16} />
          <span>Vəzifə strukturu</span>
        </NavLink>
        <NavLink to="/settings/system">
          <SlidersHorizontal size={16} />
          <span>Sistem parametrləri</span>
        </NavLink>
        <NavLink to="/settings/deletion-requests">
          <UserRoundX size={16} />
          <span>Hesab silmə müraciətləri</span>
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
