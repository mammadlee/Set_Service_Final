import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './layout/AdminLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { RequirePermission } from './routes/RequirePermission';
import { RequireSuperAdmin } from './routes/RequireSuperAdmin';
import { useAuth } from './auth/AuthProvider';
import { getAdminLandingPath, hasPermission } from '../shared/auth/permissions';
import { AdminsPage } from '../features/admins/AdminsPage';
import { AssignmentDetailPage } from '../features/assignments/AssignmentDetailPage';
import { AssignmentsPage } from '../features/assignments/AssignmentsPage';
import { AttendanceDetailPage } from '../features/attendance/AttendanceDetailPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { QrDisplayPage } from '../features/attendance/QrDisplayPage';
import { LoginPage } from '../features/auth/LoginPage';
import { CompaniesPage } from '../features/companies/CompaniesPage';
import { CompanyDetailPage } from '../features/companies/CompanyDetailPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { OrderDetailPage } from '../features/orders/OrderDetailPage';
import { OrdersPage } from '../features/orders/OrdersPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { SettingsLayout } from '../features/settings/SettingsLayout';
import { SystemSettingsPage } from '../features/settings/SystemSettingsPage';
import { TaxonomyPage } from '../features/taxonomy/TaxonomyPage';
import { WorkerDetailPage } from '../features/workers/WorkerDetailPage';
import { WorkersPage } from '../features/workers/WorkersPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminIndexRoute />} />
          <Route path="workers" element={<RequirePermission permission="view_workers"><WorkersPage /></RequirePermission>} />
          <Route path="workers/:id" element={<RequirePermission permission="view_workers"><WorkerDetailPage /></RequirePermission>} />
          <Route path="companies" element={<RequirePermission permission="view_companies"><CompaniesPage /></RequirePermission>} />
          <Route path="companies/:id" element={<RequirePermission permission="view_companies"><CompanyDetailPage /></RequirePermission>} />
          <Route path="orders" element={<RequirePermission permission="view_orders"><OrdersPage /></RequirePermission>} />
          <Route path="orders/:id" element={<RequirePermission permission="view_orders"><OrderDetailPage /></RequirePermission>} />
          <Route path="assignments" element={<RequirePermission permission="view_assignments"><AssignmentsPage /></RequirePermission>} />
          <Route path="assignments/:id" element={<RequirePermission permission="view_assignments"><AssignmentDetailPage /></RequirePermission>} />
          <Route path="attendance" element={<RequirePermission permission="view_attendance"><AttendancePage /></RequirePermission>} />
          <Route path="attendance/qr-display" element={<RequirePermission permission="manage_kiosks"><QrDisplayPage /></RequirePermission>} />
          <Route path="attendance/:id" element={<RequirePermission permission="view_attendance"><AttendanceDetailPage /></RequirePermission>} />
          <Route path="reports" element={<RequirePermission permission="view_reports"><ReportsPage /></RequirePermission>} />
          <Route path="notifications" element={<RequirePermission permission="view_notifications"><NotificationsPage /></RequirePermission>} />
          <Route path="settings" element={<RequireSuperAdmin><SettingsLayout /></RequireSuperAdmin>}>
            <Route index element={<Navigate to="taxonomy" replace />} />
            <Route path="taxonomy" element={<TaxonomyPage />} />
            <Route path="system" element={<SystemSettingsPage />} />
          </Route>
          <Route path="taxonomy" element={<Navigate to="/settings/taxonomy" replace />} />
          <Route path="admins" element={<RequirePermission permission="manage_admins"><AdminsPage /></RequirePermission>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AdminIndexRoute() {
  const { user } = useAuth();
  if (hasPermission(user, 'view_dashboard')) return <DashboardPage />;

  const landingPath = getAdminLandingPath(user);
  if (landingPath !== '/') return <Navigate to={landingPath} replace />;

  return (
    <RequirePermission permission="view_dashboard">
      <DashboardPage />
    </RequirePermission>
  );
}
