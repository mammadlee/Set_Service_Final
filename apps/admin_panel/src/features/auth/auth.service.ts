import { apiRequest } from '../../shared/api/http';
import { tokenStore } from '../../shared/api/tokenStore';
import type { TokenResponse } from '../../shared/api/types';
import { isAdminRole } from '../../shared/auth/permissions';
import { appStrings } from '../../shared/i18n/appStrings';

export const authService = {
  async loginAdmin(email: string, password: string) {
    const result = await apiRequest<TokenResponse>('/auth/admin/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });

    if (!isAdminRole(result.user.role)) {
      throw new Error(appStrings.auth.onlySuperAdmin);
    }

    tokenStore.setTokens(result.access_token, result.refresh_token);
    return result;
  },

  async logout() {
    const refreshToken = tokenStore.getRefreshToken();
    try {
      if (refreshToken) {
        await apiRequest<void>('/auth/logout', {
          method: 'POST',
          body: { refresh_token: refreshToken },
          retry: false,
        });
      }
    } finally {
      tokenStore.clear();
    }
  },
};
