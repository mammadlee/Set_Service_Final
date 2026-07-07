import {
  Activity,
  Bell,
  BriefcaseBusiness,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { appStrings } from '../../shared/i18n/appStrings';

const navItems = [
  { to: '/', label: appStrings.nav.dashboard, icon: LayoutDashboard },
  { to: '/orders', label: appStrings.nav.orders, icon: BriefcaseBusiness },
  { to: '/assignments', label: appStrings.nav.assignments, icon: ClipboardList },
  { to: '/attendance', label: appStrings.nav.attendance, icon: Activity },
  { to: '/qr', label: appStrings.nav.qrTokens, icon: QrCode },
  { to: '/notifications', label: appStrings.nav.notifications, icon: Bell },
];

export function CompanyLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="company-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">H</div>
          <div>
            <strong>{appStrings.brand}</strong>
            <span>{appStrings.company}</span>
          </div>
          <button className="icon-btn mobile-only" type="button" onClick={() => setOpen(false)} aria-label={appStrings.closeMenu}>
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {open ? <button className="scrim" type="button" aria-label={appStrings.closeMenu} onClick={() => setOpen(false)} /> : null}

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-btn mobile-only" type="button" onClick={() => setOpen(true)} aria-label={appStrings.openMenu}>
            <Menu size={20} />
          </button>
          <div className="topbar-title">
            <strong>{appStrings.dashboardName}</strong>
            <span>{user?.name} · {user?.phone}</span>
          </div>
          <button className="btn secondary compact" type="button" onClick={() => void logout()}>
            <LogOut size={16} />
            {appStrings.logout}
          </button>
        </header>
        <section className="content-panel">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
