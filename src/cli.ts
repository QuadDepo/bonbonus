#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { extractBonusItems, toCsv } from './index.ts';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const usage = `Usage: bonbonus extract [--format json|csv] [--pretty] [--output <path>]

Commands:
  extract              Fetch this week's Albert Heijn bonus items.

Options:
  --format <fmt>       Output format: json (default) or csv.
  --pretty             Pretty-print JSON output.
  --output <path>      Write to file instead of stdout.
  -h, --help           Show this help.
  -v, --version        Show version.

Environment:
  BONBONUS_CONCURRENCY Positive integer; how many promotions to fetch in parallel.`;

const parseConcurrency = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    console.error(`Invalid BONBONUS_CONCURRENCY=${raw}; must be a positive integer.`);
    process.exit(1);
  }
  return parsed;
};

const fail = (message: string): never => {
  console.error(message);
  console.error(usage);
  process.exit(1);
};

const main = async () => {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: 'string', default: 'json' },
        output: { type: 'string' },
        pretty: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(usage + '\n');
    return;
  }
  if (values.version) {
    process.stdout.write(pkg.version + '\n');
    return;
  }

  const command = positionals[0];
  if (command !== 'extract') return fail(command ? `Unknown command: ${command}` : 'Missing command.');
  if (positionals.length > 1) return fail(`Unexpected arguments: ${positionals.slice(1).join(' ')}`);

  const format = values.format;
  if (format !== 'json' && format !== 'csv') return fail(`Invalid --format: ${format}`);

  const concurrency = parseConcurrency(process.env.BONBONUS_CONCURRENCY);
  const result = await extractBonusItems({ concurrency });

  const body =
    format === 'csv'
      ? toCsv(result.items)
      : JSON.stringify(result, null, values.pretty ? 2 : 0);

  if (values.output) {
    const absolutePath = resolve(process.cwd(), values.output);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, body + '\n', 'utf8');
    return;
  }

  process.stdout.write(body + '\n');
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
