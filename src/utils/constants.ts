export const AH_ORIGIN = 'https://www.ah.nl';
export const AH_GQL_URL = 'https://www.ah.nl/gql';
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
