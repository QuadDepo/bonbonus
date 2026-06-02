/**
 * `bonbonus auth <subcommand>` dispatcher: login | status | logout.
 * Mirrors the parseArgs + usage-string style of the run* handlers in cli.ts.
 */

import { parseArgs } from 'node:util';
import { fail } from '../cli/shared.ts';
import { printStatus, runLogin, runLogout } from './login.ts';

const AUTH_USAGE = `Usage: bonbonus auth <subcommand> [options]

Subcommands:
  login                      Sign in to your AH account (one-time browser step).
  status                     Show whether you're logged in and token validity.
  logout                     Delete stored credentials.

Run 'bonbonus auth <subcommand> --help' for details.`;

const LOGIN_USAGE = `Usage: bonbonus auth login [--code <uuid>] [--refresh-token <token>]

Sign in to your Albert Heijn account. Prints a login URL and prompts for the
'code' from the appie://login-exit redirect, then exchanges it for tokens.

Options:
  --code <uuid>              Provide the login code non-interactively (skip prompt).
  --refresh-token <token>    Power-user: store an existing refresh_token directly
                             (skips the browser step).
  -h, --help                 Show this help.`;

const runAuthLogin = async (args: string[]) => {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: false,
      strict: true,
      options: {
        code: { type: 'string' },
        'refresh-token': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), LOGIN_USAGE);
  }

  if (parsed.values.help) {
    process.stdout.write(LOGIN_USAGE + '\n');
    return;
  }

  await runLogin({ code: parsed.values.code, refreshToken: parsed.values['refresh-token'] });
};

export const runAuth = async (args: string[]) => {
  const sub = args[0];
  const rest = args.slice(1);

  if (sub === undefined || sub === '-h' || sub === '--help') {
    process.stdout.write(AUTH_USAGE + '\n');
    return;
  }

  switch (sub) {
    case 'login':
      return runAuthLogin(rest);
    case 'status': {
      const ok = await printStatus();
      if (!ok) process.exitCode = 1;
      return;
    }
    case 'logout':
      return runLogout();
    default:
      return fail(`Unknown auth subcommand: ${sub}`, AUTH_USAGE);
  }
};
