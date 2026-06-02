/**
 * `bonbonus bonusbox <subcommand>` dispatcher: list | activate.
 * Mirrors the parseArgs + usage-string style of the run* handlers in cli.ts.
 */

import { parseArgs } from 'node:util';
import { activateBonusBox, getBonusBox } from '../index.ts';
import { fail, writeOutput } from '../cli/shared.ts';

const BONUSBOX_USAGE = `Usage: bonbonus bonusbox [list] [--pretty] [--output <path>]
       bonbonus bonusbox activate <id> [<id>...] [--pretty] [--output <path>]
       bonbonus bonusbox activate --all [--pretty] [--output <path>]

Read your personal Bonus Box, or activate picks. Requires login first
('bonbonus auth login'). Each item's 'id' (from 'list') is what you pass to
'activate'. Activation is one-way — there is no deactivation.

Options:
  --all                      (activate) Activate every ACTIVATABLE item.
  --pretty                   Pretty-print JSON output.
  --output <path>            Write to file instead of stdout.`;

export const runBonusBox = async (args: string[]) => {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        all: { type: 'boolean', default: false },
        output: { type: 'string' },
        pretty: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), BONUSBOX_USAGE);
  }

  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(BONUSBOX_USAGE + '\n');
    return;
  }

  const [sub, ...ids] = positionals;

  if (sub === undefined || sub === 'list') {
    if (ids.length > 0) return fail(`Unexpected arguments: ${ids.join(' ')}`, BONUSBOX_USAGE);
    const box = await getBonusBox();
    await writeOutput(JSON.stringify(box, null, values.pretty ? 2 : 0), values.output);
    return;
  }

  if (sub === 'activate') {
    if (!values.all && ids.length === 0) {
      return fail('Provide one or more ids to activate, or pass --all.', BONUSBOX_USAGE);
    }
    if (values.all && ids.length > 0) {
      return fail('Pass either ids or --all, not both.', BONUSBOX_USAGE);
    }
    const result = await activateBonusBox(values.all ? { all: true } : { ids });
    await writeOutput(JSON.stringify(result, null, values.pretty ? 2 : 0), values.output);
    const failed = result.results.filter((r) => !r.ok);
    if (result.results.length === 0) {
      console.error('Nothing to activate (no matching ACTIVATABLE items).');
    } else if (failed.length > 0) {
      console.error(`${failed.length} of ${result.results.length} activation(s) failed.`);
      process.exitCode = 1;
    }
    return;
  }

  return fail(`Unknown bonusbox subcommand: ${sub}`, BONUSBOX_USAGE);
};
