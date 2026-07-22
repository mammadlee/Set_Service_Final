const accessTokenKey = 'setservice_company_access_token';
const refreshTokenKey = 'setservice_company_refresh_token';
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
  window.localStorage.removeItem(accessTokenKey);
  window.localStorage.removeItem(refreshTokenKey);
  window.sessionStorage.removeItem(accessTokenKey);
  window.sessionStorage.removeItem(refreshTokenKey);
}
