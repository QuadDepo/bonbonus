/**
 * Token minting + lifecycle for the authenticated AH member API.
 *
 * Owns the two mobile-auth HTTP calls (code exchange + refresh) and the
 * getAccessToken() manager that the authenticated transport calls before every
 * request: it returns a valid access token, refreshing proactively when the
 * stored one is within AUTH_REFRESH_SKEW_MS of expiry. Refresh rotates BOTH
 * tokens (per AH), so we persist the new pair atomically under the store lock.
 */

import {
  AH_MOBILE_CLIENT_ID,
  AH_TOKEN_REFRESH_URL,
  AH_TOKEN_URL,
  AUTH_REFRESH_SKEW_MS,
  DEFAULT_TIMEOUT_MS,
} from '../utils/constants.ts';
import { tlsAgent } from '../fetch/tls.ts';
import { AhAuthError, AhNetworkError } from '../utils/errors.ts';
import { createLogger } from '../utils/log.ts';
import {
  AUTH_FILE_VERSION,
  loadAuth,
  parseMemberId,
  saveAuth,
  withAuthLock,
  type StoredAuth,
} from './store.ts';

const log = createLogger('auth/token');

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

type AuthPostResult = { ok: true; tokens: TokenResponse } | { ok: false; status: number };

/**
 * POST a JSON body to a mobile-auth endpoint. Token POSTs return 415 without an
 * explicit application/json content-type (confirmed in research). Returns the
 * HTTP status on a non-2xx so callers can distinguish a dead token (400/401)
 * from a transient server error.
 */
const postAuth = async (
  url: string,
  payload: Record<string, string>,
  timeoutMs: number,
): Promise<AuthPostResult> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
      // @ts-expect-error -- Node's global fetch accepts an undici dispatcher
      dispatcher: tlsAgent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AhNetworkError(`Auth request to ${url} failed: ${message}`);
  }
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, tokens: (await response.json()) as TokenResponse };
};

/** Build a StoredAuth record from a fresh token response. */
const toStoredAuth = (tokens: TokenResponse): StoredAuth => {
  if (!tokens.access_token || !tokens.refresh_token || typeof tokens.expires_in !== 'number') {
    throw new AhNetworkError('AH auth response missing access_token / refresh_token / expires_in');
  }
  return {
    version: AUTH_FILE_VERSION,
    memberId: parseMemberId(tokens.access_token),
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
};

/** Low-level refresh: rotate a refresh token into a fresh pair. Does NOT persist. */
const refreshTokens = async (refreshToken: string, timeoutMs: number): Promise<StoredAuth> => {
  const result = await postAuth(AH_TOKEN_REFRESH_URL, { clientId: AH_MOBILE_CLIENT_ID, refreshToken }, timeoutMs);
  if (!result.ok) {
    // 400/401 here means AH invalidated the refresh token (e.g. the official
    // app re-logged in). The user must sign in again.
    if (result.status === 400 || result.status === 401) {
      throw new AhAuthError('Your AH session has expired. Run `bonbonus auth login` to sign in again.', 'REFRESH_FAILED');
    }
    throw new AhNetworkError(`Token refresh failed (HTTP ${result.status})`);
  }
  return toStoredAuth(result.tokens);
};

/**
 * Exchange a one-time login `code` (from the appie://login-exit redirect) for a
 * token pair and persist it. Used by `bonbonus auth login`.
 */
export const exchangeCode = async (code: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<StoredAuth> => {
  const result = await postAuth(AH_TOKEN_URL, { clientId: AH_MOBILE_CLIENT_ID, code }, timeoutMs);
  if (!result.ok) {
    throw new AhAuthError(
      `Token exchange failed (HTTP ${result.status}). Login codes are single-use and expire quickly — ` +
        'run `bonbonus auth login` again and grab a fresh code.',
      'EXCHANGE_FAILED',
    );
  }
  const auth = toStoredAuth(result.tokens);
  await withAuthLock(() => saveAuth(auth));
  log('exchanged code; member', auth.memberId, 'expires', new Date(auth.expiresAt).toISOString());
  return auth;
};

/**
 * Exchange a pasted refresh_token for a live token pair and persist it. Used by
 * `bonbonus auth login --refresh-token`. A dead token throws REFRESH_FAILED so
 * we never persist an unusable credential.
 */
export const adoptRefreshToken = async (refreshToken: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<StoredAuth> => {
  const auth = await refreshTokens(refreshToken, timeoutMs);
  await withAuthLock(() => saveAuth(auth));
  log('adopted pasted refresh token; member', auth.memberId);
  return auth;
};

/**
 * Return a valid access token for authenticated requests, refreshing it first
 * if it's missing or within the skew window of expiry. Persists any rotation.
 * Throws AhAuthError(NOT_LOGGED_IN) when there are no stored credentials.
 *
 * Pass { force: true } from the 401 backstop to refresh even if the stored
 * token looks unexpired (AH may have invalidated it server-side early).
 */
export const getAccessToken = async (
  options: { force?: boolean } = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> => {
  const current = await loadAuth();
  if (!current) {
    throw new AhAuthError('Not logged in. Run `bonbonus auth login` first.', 'NOT_LOGGED_IN');
  }

  const needsRefresh = options.force || Date.now() >= current.expiresAt - AUTH_REFRESH_SKEW_MS;
  if (!needsRefresh) return current.accessToken;

  // Serialise the rotate+persist so a concurrent process doesn't invalidate our
  // freshly-minted refresh token. Re-load inside the lock in case another
  // process already refreshed while we waited.
  return withAuthLock(async () => {
    const latest = (await loadAuth()) ?? current;
    if (!options.force && Date.now() < latest.expiresAt - AUTH_REFRESH_SKEW_MS) {
      return latest.accessToken; // someone else refreshed while we held the lock
    }
    const rotated = await refreshTokens(latest.refreshToken, timeoutMs);
    await saveAuth(rotated);
    log('refreshed token; expires', new Date(rotated.expiresAt).toISOString());
    return rotated.accessToken;
  });
};
