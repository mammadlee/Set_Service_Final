import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { isAdminRole } from '../../shared/auth/permissions';
import { LoadingState } from '../../shared/components/StateBlock';
import { appStrings } from '../../shared/i18n/appStrings';

export function ProtectedRoute() {
  const { isAuthenticated, isCheckingSession, user } = useAuth();

  if (isCheckingSession) {
    return <LoadingState label={appStrings.loading} />;
  }

  if (!isAuthenticated || !isAdminRole(user?.role)) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
