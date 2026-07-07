import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { LoadingState } from '../../shared/components/StateBlock';
import { appStrings } from '../../shared/i18n/appStrings';

export function ProtectedRoute() {
  const { isAuthenticated, isCheckingSession, user } = useAuth();

  if (isCheckingSession) {
    return <LoadingState label={appStrings.auth.refreshingSession} />;
  }

  if (!isAuthenticated || user?.role !== 'company') {
    return <Navigate to="/login" replace />;
  }

  if (user.company?.status !== 'approved') {
    return <Navigate to="/pending-approval" replace state={{ status: user.company?.status }} />;
  }

  return <Outlet />;
}
