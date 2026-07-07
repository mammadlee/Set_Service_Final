import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authService } from '../../features/auth/auth.service';
import { refreshSession, setUnauthorizedHandler } from '../../shared/api/http';
import { isAccessTokenExpired, readAccessTokenPayload } from '../../shared/api/jwt';
import { tokenStore } from '../../shared/api/tokenStore';
import type { AuthUser } from '../../shared/api/types';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isCheckingSession: boolean;
  setSession: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const storedUserKey = 'setservice_company_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [isCheckingSession, setIsCheckingSession] = useState(() => {
    const tokenPayload = readAccessTokenPayload(tokenStore.getAccessToken());
    return Boolean(user && tokenPayload?.role === 'company' && isAccessTokenExpired(tokenPayload));
  });

  const clearSession = useCallback(() => {
    tokenStore.clear();
    window.localStorage.removeItem(storedUserKey);
    setUser(null);
    setIsCheckingSession(false);
  }, []);

  const setSession = useCallback((nextUser: AuthUser) => {
    const tokenPayload = readAccessTokenPayload(tokenStore.getAccessToken());
    if (nextUser.role !== 'company' || tokenPayload?.role !== 'company') {
      clearSession();
      return;
    }

    window.localStorage.setItem(storedUserKey, JSON.stringify(nextUser));
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

  const tokenPayload = readAccessTokenPayload(tokenStore.getAccessToken());
  const isCompanySession = Boolean(
    user && user.role === 'company' && tokenPayload?.role === 'company' && !isAccessTokenExpired(tokenPayload),
  );

  useEffect(() => {
    if (user && tokenPayload?.role !== 'company') clearSession();
  }, [clearSession, tokenPayload?.role, user]);

  useEffect(() => {
    let cancelled = false;

    async function ensureFreshSession() {
      if (!user) {
        setIsCheckingSession(false);
        return;
      }

      const currentPayload = readAccessTokenPayload(tokenStore.getAccessToken());
      if (currentPayload?.role !== 'company') {
        clearSession();
        return;
      }

      if (!isAccessTokenExpired(currentPayload)) {
        setIsCheckingSession(false);
        return;
      }

      setIsCheckingSession(true);
      const refreshed = await refreshSession();
      if (cancelled) return;

      if (!refreshed) {
        clearSession();
        return;
      }

      setIsCheckingSession(false);
    }

    void ensureFreshSession();
    return () => {
      cancelled = true;
    };
  }, [clearSession, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: isCompanySession,
      isCheckingSession,
      setSession,
      logout,
    }),
    [isCheckingSession, isCompanySession, logout, setSession, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

function readStoredUser(): AuthUser | null {
  const raw = window.localStorage.getItem(storedUserKey);
  const tokenPayload = readAccessTokenPayload(tokenStore.getAccessToken());
  if (!raw || tokenPayload?.role !== 'company') {
    tokenStore.clear();
    window.localStorage.removeItem(storedUserKey);
    return null;
  }

  try {
    const user = JSON.parse(raw) as AuthUser;
    if (user.role !== 'company' || user.role !== tokenPayload.role) {
      tokenStore.clear();
      window.localStorage.removeItem(storedUserKey);
      return null;
    }
    return user;
  } catch {
    tokenStore.clear();
    window.localStorage.removeItem(storedUserKey);
    return null;
  }
}
