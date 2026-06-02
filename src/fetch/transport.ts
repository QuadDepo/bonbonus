/**
 * Shared GraphQL transport for both AH surfaces: the anonymous www.ah.nl/gql
 * client and the authenticated api.ah.nl member client.
 *
 * Owns the one Chrome-fingerprint TLS agent, the retry/backoff loop, and the
 * GraphQL-error assertion — so a fix to any of those happens in exactly one
 * place. Callers supply a per-attempt request builder (URL + headers + body)
 * and an optional 401 hook; everything else is uniform.
 */

import { tlsAgent } from './tls.ts';
import { AhNetworkError } from '../utils/errors.ts';

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

/** Honor Retry-After (seconds or HTTP-date), clamped to MAX_BACKOFF_MS. */
const retryAfterMs = (header: string | null): number | undefined => {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  }
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.min(dateMs - Date.now(), MAX_BACKOFF_MS));
  }
  return undefined;
};

export interface GqlRequestInit {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface GqlPostOptions {
  timeoutMs: number;
  /** Human label for error messages, e.g. 'GQL request' or 'Authenticated GQL (FetchMember)'. */
  label: string;
  /**
   * Called once on a 401. Return true to refresh state (e.g. force a token
   * refresh via the next build()) and retry; false/absent treats 401 as a
   * normal non-retryable failure.
   */
  on401?: () => Promise<boolean>;
  /** Map a terminal non-2xx status to an Error (lets callers add context/hints). */
  toError?: (status: number) => Error;
}

/**
 * POST a GraphQL request with retry/backoff. `build` is invoked once per attempt
 * so callers can supply fresh per-attempt state (e.g. a refreshed bearer token).
 * Transient 429/5xx back off; a 401 may trigger a single `on401` retry.
 */
export const gqlPost = async <T>(build: () => Promise<GqlRequestInit>, opts: GqlPostOptions): Promise<T> => {
  let handled401 = false;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { url, headers, body } = await build();
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(opts.timeoutMs),
        // @ts-expect-error -- Node's global fetch accepts an undici dispatcher
        dispatcher: tlsAgent,
      });

      if (response.status === 401 && opts.on401 && !handled401) {
        handled401 = true;
        if (await opts.on401()) {
          attempt--; // a forced refresh shouldn't burn a retry
          continue;
        }
      }

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
          const wait = retryAfterMs(response.headers.get('retry-after')) ?? BASE_BACKOFF_MS * 2 ** attempt;
          await sleep(wait);
          continue;
        }
        throw opts.toError?.(response.status) ?? new AhNetworkError(`${opts.label} failed: ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      // AhNetworkError (and any Ah* error a toError/on401 throws) is terminal — don't retry.
      if (error instanceof AhNetworkError) throw error;
      if (attempt >= MAX_RETRIES) break;
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new AhNetworkError(`${opts.label} failed after ${MAX_RETRIES + 1} attempts: ${message}`);
};

/** Throw if a GraphQL response carries top-level errors. Shared by both transports. */
export const assertNoGqlErrors = (errors: Array<{ message?: string }> | null | undefined, context: string): void => {
  if (errors && errors.length > 0) {
    const messages = errors.map((e) => e.message ?? 'unknown error').join('; ');
    throw new AhNetworkError(`${context}: AH returned errors: ${messages}`);
  }
};
