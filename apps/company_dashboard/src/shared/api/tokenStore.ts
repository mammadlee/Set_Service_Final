const accessTokenKey = 'setservice_company_access_token';
const refreshTokenKey = 'setservice_company_refresh_token';

export const tokenStore = {
  getAccessToken() {
    return window.localStorage.getItem(accessTokenKey);
  },

  getRefreshToken() {
    return window.localStorage.getItem(refreshTokenKey);
  },

  setTokens(accessToken: string, refreshToken: string) {
    window.localStorage.setItem(accessTokenKey, accessToken);
    window.localStorage.setItem(refreshTokenKey, refreshToken);
  },

  clear() {
    window.localStorage.removeItem(accessTokenKey);
    window.localStorage.removeItem(refreshTokenKey);
  },
};
