import { apiRequest } from '../../shared/api/http';
import { tokenStore } from '../../shared/api/tokenStore';
import type { TokenResponse } from '../../shared/api/types';
import { isAdminRole } from '../../shared/auth/permissions';
import { appStrings } from '../../shared/i18n/appStrings';

export const authService = {
  async loginAdmin(email: string, password: string) {
    const result = await apiRequest<TokenResponse>('/auth/admin/web-login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });

    if (!isAdminRole(result.user.role)) {
      throw new Error(appStrings.auth.onlySuperAdmin);
    }

    tokenStore.setAccessToken(result.access_token);
    return result;
  },

  async logout() {
    try {
      await apiRequest<void>('/auth/admin/web-logout', {
        method: 'POST',
        retry: false,
      });
    } finally {
      tokenStore.clear();
    }
  },
};
