import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { refreshSession, setUnauthorizedHandler } from '../../shared/api/http';
import { isAccessTokenExpired, isAccessTokenPayload, readAccessTokenPayload } from '../../shared/api/jwt';
import { tokenStore } from '../../shared/api/tokenStore';
import type { AuthUser } from '../../shared/api/types';
import { isAdminRole } from '../../shared/auth/permissions';
import { authService } from '../../features/auth/auth.service';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isCheckingSession: boolean;
  setSession: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const storedUserKey = 'setservice_admin_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    purgeLegacyUser();
    setUser(null);
    setIsCheckingSession(false);
  }, []);

  const setSession = useCallback((nextUser: AuthUser) => {
    const tokenPayload = readAccessTokenPayload(tokenStore.getAccessToken());
    if (
      !isAdminRole(nextUser.role) ||
      !isAdminRole(tokenPayload?.role) ||
      nextUser.role !== tokenPayload.role ||
      !isAccessTokenPayload(tokenPayload) ||
      isAccessTokenExpired(tokenPayload)
    ) {
      clearSession();
      return;
    }

    purgeLegacyUser();
    setUser(nextUser);
  }, [clearSession]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;

    async function restoreBrowserSession() {
      setIsCheckingSession(true);
      const restoredUser = await refreshSession();
      if (cancelled) return;

      if (!restoredUser) {
        clearSession();
        return;
      }

      setSession(restoredUser);
      setIsCheckingSession(false);
    }

    void restoreBrowserSession();
    return () => {
      cancelled = true;
    };
  }, [clearSession, setSession]);

  const accessTokenPayload = readAccessTokenPayload(tokenStore.getAccessToken());
  const isAdminSession = Boolean(
    user &&
    isAdminRole(user.role) &&
    isAdminRole(accessTokenPayload?.role) &&
    user.role === accessTokenPayload?.role &&
    isAccessTokenPayload(accessTokenPayload) &&
    !isAccessTokenExpired(accessTokenPayload)
  );

  useEffect(() => {
    if (
      user &&
      (!isAdminRole(accessTokenPayload?.role) || !isAccessTokenPayload(accessTokenPayload))
    ) {
      clearSession();
    }
  }, [accessTokenPayload?.role, accessTokenPayload?.token_use, clearSession, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: isAdminSession,
      isCheckingSession,
      setSession,
      logout,
    }),
    [isAdminSession, isCheckingSession, logout, setSession, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

function purgeLegacyUser(): void {
  window.localStorage.removeItem(storedUserKey);
  window.sessionStorage.removeItem(storedUserKey);
}
