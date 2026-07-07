import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { isAdminRole } from '../../shared/auth/permissions';

export function ProtectedRoute() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated || !isAdminRole(user?.role)) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
