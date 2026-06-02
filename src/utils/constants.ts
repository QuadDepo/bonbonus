export const AH_ORIGIN = 'https://www.ah.nl';
export const AH_GQL_URL = 'https://www.ah.nl/gql';
export const AH_ALLERHANDE_RECIPE_PATH = '/allerhande/recept';
export const DEFAULT_WEEK = 'deze-week';
export const DEFAULT_CONCURRENCY = 10;
export const DEFAULT_TIMEOUT_MS = 15000;
// AH may invalidate older client-versions over time. Override via env when that
// happens; we'll still surface a clear error if the server rejects the request.
// Read per-call so library consumers can mutate process.env after import.
export const DEFAULT_AH_CLIENT_VERSION = '1.32.4';
export const getAhClientVersion = () => process.env.BONBONUS_CLIENT_VERSION || DEFAULT_AH_CLIENT_VERSION;
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

// --- Member (authenticated) mobile API ---------------------------------------
// A DIFFERENT surface from the anonymous www.ah.nl/gql above: OAuth2 bearer
// tokens against api.ah.nl with the iOS app's headers. Validated 2026-06-02
// (see docs/bonus-box-research.md).
export const AH_MOBILE_API_ORIGIN = 'https://api.ah.nl';
export const AH_MOBILE_GQL_URL = `${AH_MOBILE_API_ORIGIN}/graphql`;
export const AH_TOKEN_URL = `${AH_MOBILE_API_ORIGIN}/mobile-auth/v1/auth/token`;
export const AH_TOKEN_REFRESH_URL = `${AH_MOBILE_API_ORIGIN}/mobile-auth/v1/auth/token/refresh`;
// login.ah.nl is a browser step (hCaptcha) — printed for the user, not fetched.
export const AH_LOGIN_URL =
  'https://login.ah.nl/login?client_id=appie-ios&response_type=code&redirect_uri=appie://login-exit';

// live appie-go (v9.28) uses `appie-ios`; `appie` is legacy.
export const AH_MOBILE_CLIENT_ID = 'appie-ios';
// Independent from the web client's BONBONUS_CLIENT_VERSION so the two surfaces
// can rotate separately. Override via env when AH invalidates this version.
export const DEFAULT_AH_MOBILE_CLIENT_VERSION = '9.28';
export const getAhMobileClientVersion = () =>
  process.env.BONBONUS_MOBILE_CLIENT_VERSION || DEFAULT_AH_MOBILE_CLIENT_VERSION;
export const AH_MOBILE_USER_AGENT = 'Appie/9.28 (iPhone17,3; iPhone; CPU OS 26_1 like Mac OS X)';

// Refresh this many ms before the recorded expiry rather than waiting for a 401.
export const AUTH_REFRESH_SKEW_MS = 60_000;
