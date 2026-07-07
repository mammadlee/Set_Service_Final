import { Navigate, Route, Routes } from 'react-router-dom';
import { CompanyLayout } from './layout/CompanyLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AssignmentsPage } from '../features/assignments/AssignmentsPage';
import { AttendanceDetailPage } from '../features/attendance/AttendanceDetailPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { QrTokensPage } from '../features/attendance/QrTokensPage';
import { LoginPage } from '../features/auth/LoginPage';
import { PendingApprovalPage } from '../features/auth/PendingApprovalPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { OrderDetailPage } from '../features/orders/OrderDetailPage';
import { OrdersPage } from '../features/orders/OrdersPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/pending-approval" element={<PendingApprovalPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<CompanyLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="attendance/:id" element={<AttendanceDetailPage />} />
          <Route path="qr" element={<QrTokensPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
