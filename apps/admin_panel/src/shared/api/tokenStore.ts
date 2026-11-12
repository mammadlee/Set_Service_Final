const accessKey = 'setservice_admin_access_token';
const refreshKey = 'setservice_admin_refresh_token';
let accessToken: string | null = null;

export const tokenStore = {
  getAccessToken() {
    purgeLegacyTokens();
    return accessToken;
  },

  setAccessToken(token: string) {
    purgeLegacyTokens();
    accessToken = token;
  },

  clear() {
    accessToken = null;
    purgeLegacyTokens();
  },
};

function purgeLegacyTokens() {
  window.localStorage.removeItem(accessKey);
  window.localStorage.removeItem(refreshKey);
  window.sessionStorage.removeItem(accessKey);
  window.sessionStorage.removeItem(refreshKey);
}
