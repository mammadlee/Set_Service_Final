import {
  Activity,
  Bell,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  BarChart3,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { appStrings } from '../../shared/i18n/appStrings';
import { hasPermission } from '../../shared/auth/permissions';
import type { AdminPermission } from '../../shared/api/types';

const navItems = [
  { to: '/', label: appStrings.nav.dashboard, icon: LayoutDashboard, permission: 'view_dashboard' },
  { to: '/workers', label: appStrings.nav.workers, icon: Users, permission: 'view_workers' },
  { to: '/companies', label: appStrings.nav.companies, icon: Building2, permission: 'view_companies' },
  { to: '/orders', label: appStrings.nav.orders, icon: BriefcaseBusiness, permission: 'view_orders' },
  { to: '/assignments', label: appStrings.nav.assignments, icon: ClipboardList, permission: 'view_assignments' },
  { to: '/attendance', label: appStrings.nav.attendance, icon: Activity, permission: 'view_attendance' },
  { to: '/attendance/qr-display', label: appStrings.nav.qrDisplay, icon: QrCode, permission: 'manage_kiosks' },
  { to: '/reports', label: appStrings.nav.reports, icon: BarChart3, permission: 'view_reports' },
  { to: '/notifications', label: appStrings.nav.notifications, icon: Bell, permission: 'view_notifications' },
  { to: '/admins', label: 'Adminlər', icon: ShieldCheck, permission: 'manage_admins' },
] satisfies Array<{ to: string; label: string; icon: typeof LayoutDashboard; permission: AdminPermission }>;

export function AdminLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const visibleNavItems = navItems.filter((item) => hasPermission(user, item.permission));
  const canSeeSettings = user?.role === 'super_admin';
  const panelTitle = user?.role === 'super_admin' ? appStrings.adminPanel : 'Admin Panel';
  const roleLabel = user?.role === 'super_admin' ? appStrings.superAdmin : 'Admin';

  return (
    <div className="admin-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">SET</div>
          <div>
            <strong>{appStrings.brand}</strong>
            <span>{roleLabel}</span>
          </div>
          <button className="icon-btn mobile-only" type="button" onClick={() => setOpen(false)} aria-label={appStrings.closeMenu}>
            <X size={18} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          {canSeeSettings ? (
            <div className="sidebar-group">
              <div className="sidebar-group-label">
                <Settings size={18} />
                <span>Parametrlər</span>
              </div>
              <div className="sidebar-subnav">
                <NavLink to="/settings/taxonomy" onClick={() => setOpen(false)}>
                  <Workflow size={16} />
                  <span>Vəzifə Strukturu</span>
                </NavLink>
                <NavLink to="/settings/system" onClick={() => setOpen(false)}>
                  <SlidersHorizontal size={16} />
                  <span>Sistem Parametrləri</span>
                </NavLink>
              </div>
            </div>
          ) : null}
        </nav>
      </aside>

      {open ? <button className="scrim" type="button" aria-label={appStrings.closeMenu} onClick={() => setOpen(false)} /> : null}

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-btn mobile-only" type="button" onClick={() => setOpen(true)} aria-label={appStrings.openMenu}>
            <Menu size={20} />
          </button>
          <div className="topbar-title">
            <strong>{appStrings.adminPanel}</strong>
            <span>{panelTitle} · {user?.email ?? user?.name}</span>
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
