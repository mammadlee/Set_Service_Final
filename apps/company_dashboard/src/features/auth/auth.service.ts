import { apiRequest } from '../../shared/api/http';
import { tokenStore } from '../../shared/api/tokenStore';
import type { TokenResponse } from '../../shared/api/types';
import { appStrings } from '../../shared/i18n/appStrings';

export const authService = {
  async loginCompany(email: string, password: string) {
    const result = await apiRequest<TokenResponse>('/auth/company/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });

    if (result.user.role !== 'company') {
      throw new Error(appStrings.auth.onlyCompany);
    }
    if (result.user.company?.status !== 'approved') {
      throw new Error(appStrings.auth.notApproved);
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
