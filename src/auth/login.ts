/**
 * Interactive UX for `bonbonus auth {login,status,logout}`.
 *
 * Login is a one-time browser step (hCaptcha can't be automated): we print the
 * AH login URL + how to grab the `code` from the appie://login-exit redirect,
 * read it, and exchange it for tokens via auth/token.ts. A pasted refresh token
 * is supported as a power-user fallback.
 */

import { createInterface } from 'node:readline/promises';
import { AH_LOGIN_URL } from '../utils/constants.ts';
import { fetchMember } from '../fetch/bonusbox.ts';
import { adoptRefreshToken, exchangeCode } from './token.ts';
import { clearAuth, loadAuth, resolveAuthFilePath, type StoredAuth } from './store.ts';

const LOGIN_INSTRUCTIONS = `bonbonus needs a one-time browser login to your Albert Heijn account.
The login page uses a CAPTCHA, so this step can't be automated.

1. Open this URL in a browser (Chrome/Edge recommended):

     ${AH_LOGIN_URL}

2. Before logging in, open DevTools (F12 / Cmd+Opt+I) -> "Network" tab,
   and tick "Preserve log".
3. Log in with your AH account (solve the CAPTCHA if shown).
4. The page then tries to redirect to "appie://login-exit?code=...". The
   browser can't open it, but the redirect is visible in the Network log
   (filter for "login-exit"). Copy the "code" value — a UUID like
   1a2b3c4d-....
`;

const greet = (member: { firstName?: string; id: number }) => {
  const who = member.firstName ? `${member.firstName} (member ${member.id})` : `member ${member.id}`;
  return who;
};

const formatExpiry = (auth: StoredAuth): string => {
  const remainingMs = auth.expiresAt - Date.now();
  if (remainingMs <= 0) return `expired ${new Date(auth.expiresAt).toISOString()}`;
  const days = Math.floor(remainingMs / 86_400_000);
  const hours = Math.floor((remainingMs % 86_400_000) / 3_600_000);
  return `valid until ${new Date(auth.expiresAt).toISOString()} (~${days}d ${hours}h, auto-refreshes)`;
};

const promptForCode = async (): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question('Paste the code here: ');
    return answer.trim();
  } finally {
    rl.close();
  }
};

export interface LoginOptions {
  code?: string;
  refreshToken?: string;
}

/** Run the login flow. Returns once credentials are stored and verified. */
export const runLogin = async (options: LoginOptions): Promise<void> => {
  if (options.refreshToken) {
    await adoptRefreshToken(options.refreshToken);
  } else {
    let code = options.code;
    if (!code) {
      process.stderr.write(LOGIN_INSTRUCTIONS + '\n');
      code = await promptForCode();
    }
    if (!code) {
      throw new Error('No code provided.');
    }
    process.stderr.write('Exchanging code for tokens... ');
    await exchangeCode(code);
    process.stderr.write('done.\n');
  }

  // Verify the freshly-stored token actually authenticates.
  const member = await fetchMember();
  const auth = await loadAuth();
  process.stdout.write(`Logged in as ${greet(member)}.\n`);
  if (member.bonusCard) process.stdout.write(`Bonus card: ${member.bonusCard}\n`);
  if (auth) process.stdout.write(`Access token ${formatExpiry(auth)}.\n`);
  process.stdout.write(`Credentials stored in ${resolveAuthFilePath()} (mode 0600).\n`);
};

/** Print login state. Returns true if logged in with a usable (unexpired) token. */
export const printStatus = async (): Promise<boolean> => {
  const auth = await loadAuth();
  if (!auth) {
    process.stdout.write('Not logged in. Run `bonbonus auth login`.\n');
    return false;
  }
  process.stdout.write(`Logged in as member ${auth.memberId ?? '(unknown)'}.\n`);
  process.stdout.write(`Access token ${formatExpiry(auth)}.\n`);
  process.stdout.write(`Credentials: ${resolveAuthFilePath()}\n`);
  return auth.expiresAt > Date.now();
};

/** Delete stored credentials. */
export const runLogout = async (): Promise<void> => {
  const removed = await clearAuth();
  process.stdout.write(removed ? 'Logged out (credentials deleted).\n' : 'Not logged in; nothing to delete.\n');
};
