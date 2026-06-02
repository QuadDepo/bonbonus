export class AhScrapeError extends Error {
  name = 'AhScrapeError';
}

export class AhNetworkError extends AhScrapeError {
  name = 'AhNetworkError';
}

export class AhSourceChangedError extends AhScrapeError {
  name = 'AhSourceChangedError';
}

// Authentication-layer failures for the member API: not logged in, or a refresh
// token AH has invalidated. `code` lets the CLI map these to a clear "run auth
// login" exit without leaking a stack trace. NOT_LOGGED_IN = no stored creds;
// REFRESH_FAILED = stored refresh token rejected (must re-login); EXCHANGE_FAILED
// = the login `code` was bad/expired during `auth login`.
export type AhAuthErrorCode = 'NOT_LOGGED_IN' | 'REFRESH_FAILED' | 'EXCHANGE_FAILED';

export class AhAuthError extends AhScrapeError {
  name = 'AhAuthError';
  code: AhAuthErrorCode;
  constructor(message: string, code: AhAuthErrorCode) {
    super(message);
    this.code = code;
  }
}
