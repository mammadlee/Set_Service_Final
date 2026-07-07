import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setUnauthorizedHandler } from '../../shared/api/http';
import { readAccessTokenPayload } from '../../shared/api/jwt';
import { tokenStore } from '../../shared/api/tokenStore';
import type { AuthUser } from '../../shared/api/types';
import { isAdminRole } from '../../shared/auth/permissions';
import { authService } from '../../features/auth/auth.service';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setSession: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());

  const clearSession = useCallback(() => {
    tokenStore.clear();
    window.localStorage.removeItem('setservice_admin_user');
    setUser(null);
  }, []);

  const setSession = useCallback((nextUser: AuthUser) => {
    const tokenPayload = readAccessTokenPayload(tokenStore.getAccessToken());
    if (!isAdminRole(nextUser.role) || !isAdminRole(tokenPayload?.role)) {
      clearSession();
      return;
    }

    window.localStorage.setItem('setservice_admin_user', JSON.stringify(nextUser));
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

  const accessTokenPayload = readAccessTokenPayload(tokenStore.getAccessToken());
  const isAdminSession = Boolean(
    user &&
    isAdminRole(user.role) &&
    isAdminRole(accessTokenPayload?.role)
  );

  useEffect(() => {
    if (user && !isAdminSession) clearSession();
  }, [clearSession, isAdminSession, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: isAdminSession,
      setSession,
      logout,
    }),
    [isAdminSession, logout, setSession, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

function readStoredUser(): AuthUser | null {
  const raw = window.localStorage.getItem('setservice_admin_user');
  const tokenPayload = readAccessTokenPayload(tokenStore.getAccessToken());
  if (!raw || !isAdminRole(tokenPayload?.role)) {
    tokenStore.clear();
    window.localStorage.removeItem('setservice_admin_user');
    return null;
  }

  try {
    const user = JSON.parse(raw) as AuthUser;
    if (!isAdminRole(user.role) || user.role !== tokenPayload.role) {
      tokenStore.clear();
      window.localStorage.removeItem('setservice_admin_user');
      return null;
    }
    return user;
  } catch {
    tokenStore.clear();
    window.localStorage.removeItem('setservice_admin_user');
    return null;
  }
}
