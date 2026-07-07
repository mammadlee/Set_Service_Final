const accessKey = 'setservice_admin_access_token';
const refreshKey = 'setservice_admin_refresh_token';

export const tokenStore = {
  getAccessToken() {
    return window.localStorage.getItem(accessKey);
  },
  getRefreshToken() {
    return window.localStorage.getItem(refreshKey);
  },
  setTokens(accessToken: string, refreshToken: string) {
    window.localStorage.setItem(accessKey, accessToken);
    window.localStorage.setItem(refreshKey, refreshToken);
  },
  clear() {
    window.localStorage.removeItem(accessKey);
    window.localStorage.removeItem(refreshKey);
  },
};
