import {
  Activity,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Flag,
  QrCode,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  UserRoundX,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { appStrings } from '../../shared/i18n/appStrings';
import { hasPermission } from '../../shared/auth/permissions';
import type { AdminPermission } from '../../shared/api/types';

type NavigationItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: AdminPermission;
  end?: boolean;
};

const primaryNavigation = [
  { to: '/', label: appStrings.nav.dashboard, icon: LayoutDashboard, permission: 'view_dashboard', end: true },
  { to: '/workers', label: appStrings.nav.workers, icon: Users, permission: 'view_workers' },
  { to: '/companies', label: appStrings.nav.companies, icon: Building2, permission: 'view_companies' },
  { to: '/orders', label: appStrings.nav.orders, icon: BriefcaseBusiness, permission: 'view_orders' },
  { to: '/attendance', label: appStrings.nav.attendance, icon: Activity, permission: 'view_attendance' },
  { to: '/reports', label: appStrings.nav.reports, icon: BarChart3, permission: 'view_reports' },
] satisfies NavigationItem[];

const mobileNavigation = primaryNavigation.filter((item) => (
  item.to === '/'
  || item.to === '/workers'
  || item.to === '/orders'
  || item.to === '/attendance'
));

export function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const visiblePrimaryNavigation = primaryNavigation.filter((item) => hasPermission(user, item.permission));
  const visibleMobileNavigation = mobileNavigation.filter((item) => hasPermission(user, item.permission));
  const canSeeNotifications = hasPermission(user, 'view_notifications');
  const canSeeModeration = hasPermission(user, 'view_moderation');
  const canManageKiosks = hasPermission(user, 'manage_kiosks');
  const canSeeSystem = user?.role === 'super_admin';
  const canSeeAdmins = canSeeSystem && hasPermission(user, 'manage_admins');
  const roleLabel = user?.role === 'super_admin' ? appStrings.superAdmin : 'Admin';
  const currentTitle = pageTitle(location.pathname);
  const moreActive = ['/companies', '/reports', '/moderation', '/admins', '/settings'].some((path) => (
    location.pathname.startsWith(path)
  ));

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  return (
    <div className="admin-shell">
      <aside className="sidebar" aria-label="Əsas naviqasiya">
        <div className="brand-row">
          <div className="brand-mark">SET</div>
          <div>
            <strong>{appStrings.brand}</strong>
            <span>{roleLabel}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-title">Əsas bölmələr</span>
          {visiblePrimaryNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <div className="sidebar-nav-block" key={item.to}>
                <NavLink to={item.to} end={item.end}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
                {item.to === '/attendance' && canManageKiosks ? (
                  <div className="sidebar-subnav contextual-subnav">
                    <NavLink to="/attendance/qr-display">
                      <QrCode size={16} />
                      <span>{appStrings.nav.qrDisplay}</span>
                    </NavLink>
                  </div>
                ) : null}
                {item.to === '/reports' && canSeeModeration ? (
                  <div className="sidebar-subnav contextual-subnav">
                    <NavLink to="/moderation"><Flag size={16} /><span>Şikayətlər</span></NavLink>
                  </div>
                ) : null}
              </div>
            );
          })}

          {canSeeSystem ? (
            <div className="sidebar-group system-navigation">
              <div className="sidebar-group-label">
                <Settings size={18} />
                <span>Sistem</span>
              </div>
              <div className="sidebar-subnav">
                {canSeeAdmins ? (
                  <NavLink to="/admins">
                    <ShieldCheck size={16} />
                    <span>Adminlər</span>
                  </NavLink>
                ) : null}
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
              </div>
            </div>
          ) : null}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-brand mobile-only" aria-hidden="true">SET</div>
          <div className="topbar-title">
            <strong>{currentTitle}</strong>
            <span>{appStrings.brand} · {user?.email ?? user?.name}</span>
          </div>
          <div className="topbar-actions">
            {canSeeNotifications ? (
              <NavLink
                className="notification-entry"
                to="/notifications"
                aria-label={appStrings.nav.notifications}
                title={appStrings.nav.notifications}
              >
                <Bell size={18} />
                <span className="desktop-only">{appStrings.nav.notifications}</span>
              </NavLink>
            ) : null}
            <span className="user-role desktop-only">{roleLabel}</span>
            <button className="btn secondary compact desktop-only" type="button" onClick={() => void logout()}>
              <LogOut size={16} />
              {appStrings.logout}
            </button>
          </div>
        </header>

        <section className="content-panel">
          <Outlet />
        </section>
      </main>

      <nav className="mobile-bottom-nav mobile-only" aria-label="Mobil naviqasiya">
        {visibleMobileNavigation.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <Icon size={20} />
              <span>{mobileLabel(item.to, item.label)}</span>
            </NavLink>
          );
        })}
        <button
          className={moreActive || moreOpen ? 'active' : ''}
          type="button"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={21} />
          <span>Daha çox</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="mobile-more-layer mobile-only">
          <button className="mobile-more-scrim" type="button" aria-label="Daha çox menyusunu bağla" onClick={() => setMoreOpen(false)} />
          <section id="mobile-more-menu" className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="Daha çox">
            <div className="mobile-more-header">
              <div>
                <strong>Daha çox</strong>
                <span>{user?.name ?? user?.email}</span>
              </div>
              <button className="icon-btn" type="button" onClick={() => setMoreOpen(false)} aria-label={appStrings.close}>
                <X size={19} />
              </button>
            </div>
            <div className="mobile-more-links">
              {hasPermission(user, 'view_companies') ? <MoreLink to="/companies" icon={Building2} label={appStrings.nav.companies} /> : null}
              {hasPermission(user, 'view_reports') ? <MoreLink to="/reports" icon={BarChart3} label={appStrings.nav.reports} /> : null}
              {canSeeModeration ? <MoreLink to="/moderation" icon={Flag} label="Şikayətlər" /> : null}
              {canSeeAdmins ? <MoreLink to="/admins" icon={ShieldCheck} label="Adminlər" /> : null}
              {canSeeSystem ? <MoreLink to="/settings/taxonomy" icon={Settings} label="Parametrlər" /> : null}
              <button className="mobile-more-link logout-link" type="button" onClick={() => void logout()}>
                <LogOut size={19} />
                <span>Çıxış</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function MoreLink({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) {
  return (
    <NavLink className="mobile-more-link" to={to}>
      <Icon size={19} />
      <span>{label}</span>
      <ChevronRight size={18} />
    </NavLink>
  );
}

function mobileLabel(path: string, fallback: string): string {
  if (path === '/') return 'Ana səhifə';
  return fallback;
}

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/workers')) return appStrings.nav.workers;
  if (pathname.startsWith('/companies')) return appStrings.nav.companies;
  if (pathname.startsWith('/assignments')) return `${appStrings.nav.orders} · ${appStrings.nav.assignments}`;
  if (pathname.startsWith('/orders')) return appStrings.nav.orders;
  if (pathname.startsWith('/attendance/qr-display')) return `${appStrings.nav.attendance} · ${appStrings.nav.qrDisplay}`;
  if (pathname.startsWith('/attendance')) return appStrings.nav.attendance;
  if (pathname.startsWith('/reports')) return appStrings.nav.reports;
  if (pathname.startsWith('/moderation')) return 'Şikayətlər';
  if (pathname.startsWith('/notifications')) return appStrings.nav.notifications;
  if (pathname.startsWith('/admins')) return 'Sistem · Adminlər';
  if (pathname.startsWith('/settings')) return 'Sistem · Parametrlər';
  return appStrings.nav.dashboard;
}
