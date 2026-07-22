import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authService } from '../../features/auth/auth.service';
import { refreshSession, setUnauthorizedHandler } from '../../shared/api/http';
import { isAccessTokenExpired, isAccessTokenPayload, readAccessTokenPayload } from '../../shared/api/jwt';
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
      nextUser.role !== 'company' ||
      tokenPayload?.role !== 'company' ||
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

  const tokenPayload = readAccessTokenPayload(tokenStore.getAccessToken());
  const isCompanySession = Boolean(
    user &&
    user.role === 'company' &&
    tokenPayload?.role === 'company' &&
    isAccessTokenPayload(tokenPayload) &&
    !isAccessTokenExpired(tokenPayload),
  );

  useEffect(() => {
    if (user && (tokenPayload?.role !== 'company' || !isAccessTokenPayload(tokenPayload))) clearSession();
  }, [clearSession, tokenPayload?.role, tokenPayload?.token_use, user]);

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

function purgeLegacyUser(): void {
  window.localStorage.removeItem(storedUserKey);
  window.sessionStorage.removeItem(storedUserKey);
}
