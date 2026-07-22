import { apiRequest } from '../../shared/api/http';
import { tokenStore } from '../../shared/api/tokenStore';
import type { TokenResponse } from '../../shared/api/types';
import { appStrings } from '../../shared/i18n/appStrings';

export const authService = {
  async loginCompany(email: string, password: string) {
    const result = await apiRequest<TokenResponse>('/auth/company/web-login', {
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

    tokenStore.setAccessToken(result.access_token);
    return result;
  },

  async logout() {
    try {
      await apiRequest<void>('/auth/company/web-logout', {
        method: 'POST',
        retry: false,
      });
    } finally {
      tokenStore.clear();
    }
  },
};
