import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AUTH_FILE_VERSION,
  clearAuth,
  loadAuth,
  parseMemberId,
  resolveAuthFilePath,
  saveAuth,
  type StoredAuth,
} from '../../src/auth/store.ts';
import { AhAuthError } from '../../src/utils/errors.ts';

let dir: string;
const prevEnv = process.env.BONBONUS_AUTH_FILE;

const sample = (): StoredAuth => ({
  version: AUTH_FILE_VERSION,
  memberId: '12345678',
  accessToken: '12345678_abc',
  refreshToken: 'refresh-xyz',
  expiresAt: Date.now() + 600_000,
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bonbonus-auth-'));
  process.env.BONBONUS_AUTH_FILE = join(dir, 'auth.json');
});

afterEach(async () => {
  if (prevEnv === undefined) delete process.env.BONBONUS_AUTH_FILE;
  else process.env.BONBONUS_AUTH_FILE = prevEnv;
  await rm(dir, { recursive: true, force: true });
});

describe('resolveAuthFilePath', () => {
  it('honors BONBONUS_AUTH_FILE override', () => {
    expect(resolveAuthFilePath()).toBe(join(dir, 'auth.json'));
  });
});

describe('parseMemberId', () => {
  it('extracts the prefix before the first underscore', () => {
    expect(parseMemberId('117477224_3b2c-uuid')).toBe('117477224');
  });
  it('returns null when there is no prefix', () => {
    expect(parseMemberId('no-underscore')).toBeNull();
    expect(parseMemberId('_leading')).toBeNull();
  });
});

describe('saveAuth / loadAuth', () => {
  it('round-trips credentials', async () => {
    const auth = sample();
    await saveAuth(auth);
    expect(await loadAuth()).toEqual(auth);
  });

  it('writes the file with mode 0600', async () => {
    await saveAuth(sample());
    const mode = (await stat(resolveAuthFilePath())).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('returns null when no credentials exist', async () => {
    expect(await loadAuth()).toBeNull();
  });

  it('throws AhAuthError on a version mismatch', async () => {
    await writeFile(resolveAuthFilePath(), JSON.stringify({ ...sample(), version: 999 }));
    await expect(loadAuth()).rejects.toThrow(AhAuthError);
  });

  it('throws AhAuthError on corrupt JSON', async () => {
    await writeFile(resolveAuthFilePath(), '{not json');
    await expect(loadAuth()).rejects.toThrow(AhAuthError);
  });
});

describe('clearAuth', () => {
  it('removes an existing file and reports it', async () => {
    await saveAuth(sample());
    expect(await clearAuth()).toBe(true);
    expect(await loadAuth()).toBeNull();
  });

  it('reports false when nothing to remove', async () => {
    expect(await clearAuth()).toBe(false);
  });
});
