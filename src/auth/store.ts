/**
 * On-disk credential store for the authenticated AH member API.
 *
 * Resolves an XDG config path (overridable via BONBONUS_AUTH_FILE), reads and
 * writes auth.json atomically with mode 0600, and serialises refresh races with
 * a best-effort lock file. Token *minting* lives in token.ts — this module only
 * knows how to persist what it's given.
 */

import { chmod, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { AhAuthError } from '../utils/errors.ts';
import { createLogger } from '../utils/log.ts';

const log = createLogger('auth/store');

// Bump if the on-disk shape changes; load() rejects unknown future versions.
export const AUTH_FILE_VERSION = 1;

export interface StoredAuth {
  version: number;
  memberId: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
}

/**
 * Resolve the auth.json path:
 *   1. BONBONUS_AUTH_FILE (explicit override)
 *   2. $XDG_CONFIG_HOME/bonbonus/auth.json
 *   3. ~/.config/bonbonus/auth.json
 */
export const resolveAuthFilePath = (): string => {
  const override = process.env.BONBONUS_AUTH_FILE;
  if (override && override.trim()) return override;

  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? xdg : join(homedir(), '.config');
  return join(base, 'bonbonus', 'auth.json');
};

/** member id is the prefix of the access token: "<memberId>_<uuid>". */
export const parseMemberId = (accessToken: string): string | null => {
  const underscore = accessToken.indexOf('_');
  if (underscore <= 0) return null;
  return accessToken.slice(0, underscore);
};

/** Load stored credentials, or null if the user has never logged in. */
export const loadAuth = async (): Promise<StoredAuth | null> => {
  const path = resolveAuthFilePath();
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  let parsed: StoredAuth;
  try {
    parsed = JSON.parse(raw) as StoredAuth;
  } catch {
    throw new AhAuthError(
      `Stored credentials at ${path} are corrupt. Run \`bonbonus auth logout\` then \`bonbonus auth login\`.`,
      'NOT_LOGGED_IN',
    );
  }

  if (parsed.version !== AUTH_FILE_VERSION) {
    throw new AhAuthError(
      `Stored credentials at ${path} use an unsupported version (${parsed.version}). Run \`bonbonus auth login\` again.`,
      'NOT_LOGGED_IN',
    );
  }
  if (!parsed.accessToken || !parsed.refreshToken) {
    throw new AhAuthError(
      `Stored credentials at ${path} are incomplete. Run \`bonbonus auth login\` again.`,
      'NOT_LOGGED_IN',
    );
  }

  // Best-effort: tighten perms on an older/looser file from a previous version.
  chmod(path, 0o600).catch(() => {});

  return parsed;
};

/** Atomically write credentials with mode 0600 (temp file + rename). */
export const saveAuth = async (auth: StoredAuth): Promise<void> => {
  const path = resolveAuthFilePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(auth, null, 2) + '\n', { mode: 0o600 });
  try {
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
  log('saved credentials to', path);
};

/** Delete stored credentials. Returns true if a file was removed. */
export const clearAuth = async (): Promise<boolean> => {
  const path = resolveAuthFilePath();
  try {
    await rm(path, { force: false });
    log('cleared credentials at', path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

/**
 * Run `fn` while holding a best-effort lock next to auth.json, so two concurrent
 * `bonbonus` processes don't both rotate the (single-use) refresh token. The
 * lock is advisory: on contention we wait briefly and proceed rather than fail
 * a user's command. The atomic rename in saveAuth is the real backstop.
 */
export const withAuthLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const lockPath = `${resolveAuthFilePath()}.lock`;
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });

  const maxWaitMs = 5_000;
  const pollMs = 100;
  const deadline = Date.now() + maxWaitMs;

  // Acquire: exclusive-create the lock file. Retry until it's free or we time out.
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) {
        // Assume a stale lock from a crashed process; steal it and proceed.
        log('auth lock contended past', maxWaitMs, 'ms — proceeding without it');
        break;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  try {
    return await fn();
  } finally {
    await rm(lockPath, { force: true }).catch(() => {});
  }
};
