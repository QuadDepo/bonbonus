#!/usr/bin/env node
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import {
  extractBonusItems,
  lookupProducts,
  productSummariesToCsv,
  search,
  searchRecipes,
  toCsv,
} from './index.ts';
import { fail, writeOutput } from './cli/shared.ts';
import { runBonusBox } from './bonusbox/cli.ts';
import { runAuth } from './auth/cli.ts';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const USAGE = `Usage: bonbonus <command> [options]

Commands:
  extract                    Fetch this week's Albert Heijn bonus items.
  search <term>              Search AH products by free text.
  product <id> [<id>...]     Look up one or more products by numeric AH id.
  recipes <term>             Search Allerhande recipes by free text.
  bonusbox [list|activate]   Read or activate your personal Bonus Box (needs login).
  auth <subcommand>          Manage AH login (login | status | logout).

Global options:
  -h, --help                 Show this help.
  -v, --version              Show version.

Run 'bonbonus <command> --help' for command-specific options.

Environment:
  BONBONUS_CONCURRENCY          Positive integer; parallel promotion fetches for 'extract'.
  BONBONUS_CLIENT_VERSION       Override the web AH x-client-version header (default: 1.32.4).
  BONBONUS_MOBILE_CLIENT_VERSION Override the mobile/member x-client-version (default: 9.28).
  BONBONUS_AUTH_FILE            Override the stored credentials path (default: XDG config dir).`;

const EXTRACT_USAGE = `Usage: bonbonus extract [--format json|csv] [--pretty] [--output <path>]

Options:
  --format <fmt>             Output format: json (default) or csv.
  --pretty                   Pretty-print JSON output.
  --output <path>            Write to file instead of stdout.`;

const SEARCH_USAGE = `Usage: bonbonus search <term> [--bonus-only] [--page N] [--size N] [--taxonomy <id>] [--format json|csv] [--pretty] [--output <path>]

Options:
  --bonus-only               Only return products with an active bonus discount.
  --page N                   Result page (default: 0).
  --size N                   Page size (default: 30).
  --taxonomy <id>            Filter to a specific AH taxonomy id (numeric).
  --format <fmt>             Output format: json (default) or csv.
  --pretty                   Pretty-print JSON output.
  --output <path>            Write to file instead of stdout.`;

const PRODUCT_USAGE = `Usage: bonbonus product <id> [<id>...] [--format json|csv] [--pretty] [--output <path>]

Look up one or more products by their numeric AH id (the integer used in product URLs).

Options:
  --format <fmt>             Output format: json (default) or csv.
  --pretty                   Pretty-print JSON output.
  --output <path>            Write to file instead of stdout.`;

const RECIPES_USAGE = `Usage: bonbonus recipes <term> [--size N] [--pretty] [--output <path>]

Search Allerhande recipes by free text. Returns slim recipe summaries with the
ah.nl URL for each result.

Options:
  --size N                   Number of results (default: 30).
  --pretty                   Pretty-print JSON output.
  --output <path>            Write to file instead of stdout.`;

const parseConcurrency = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    console.error(`Invalid BONBONUS_CONCURRENCY=${raw}; must be a positive integer.`);
    process.exit(1);
  }
  return parsed;
};

const parsePositiveInteger = (raw: string, flag: string, usage: string): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return fail(`Invalid ${flag}: ${raw} (must be a positive integer)`, usage);
  }
  return n;
};

const parseNonNegativeInteger = (raw: string, flag: string, usage: string): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return fail(`Invalid ${flag}: ${raw} (must be a non-negative integer)`, usage);
  }
  return n;
};

const runExtract = async (args: string[]) => {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: 'string', default: 'json' },
        output: { type: 'string' },
        pretty: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), EXTRACT_USAGE);
  }

  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(EXTRACT_USAGE + '\n');
    return;
  }
  if (positionals.length > 0) return fail(`Unexpected arguments: ${positionals.join(' ')}`, EXTRACT_USAGE);

  const format = values.format;
  if (format !== 'json' && format !== 'csv') return fail(`Invalid --format: ${format}`, EXTRACT_USAGE);

  const concurrency = parseConcurrency(process.env.BONBONUS_CONCURRENCY);
  const result = await extractBonusItems({ concurrency });

  const body =
    format === 'csv'
      ? toCsv(result.items)
      : JSON.stringify(result, null, values.pretty ? 2 : 0);

  await writeOutput(body, values.output);

  if (result.promotionsTotal > 0 && result.promotionsQueried === 0) {
    console.error(`All ${result.promotionsTotal} promotions failed to fetch.`);
    process.exit(1);
  }
};

const runSearch = async (args: string[]) => {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        'bonus-only': { type: 'boolean', default: false },
        page: { type: 'string' },
        size: { type: 'string' },
        taxonomy: { type: 'string' },
        format: { type: 'string', default: 'json' },
        output: { type: 'string' },
        pretty: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), SEARCH_USAGE);
  }

  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(SEARCH_USAGE + '\n');
    return;
  }
  if (positionals.length === 0) return fail('Missing search term.', SEARCH_USAGE);

  const format = values.format;
  if (format !== 'json' && format !== 'csv') return fail(`Invalid --format: ${format}`, SEARCH_USAGE);

  const query = positionals.join(' ');
  const size = values.size ? parsePositiveInteger(values.size, '--size', SEARCH_USAGE) : undefined;
  const page = values.page ? parseNonNegativeInteger(values.page, '--page', SEARCH_USAGE) : undefined;
  const taxonomyId = values.taxonomy ? parsePositiveInteger(values.taxonomy, '--taxonomy', SEARCH_USAGE) : undefined;

  const result = await search({
    query,
    size,
    page,
    taxonomyId,
    bonusOnly: values['bonus-only'],
  });

  const body =
    format === 'csv'
      ? productSummariesToCsv(result.results)
      : JSON.stringify(result, null, values.pretty ? 2 : 0);

  await writeOutput(body, values.output);
};

const runProduct = async (args: string[]) => {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: 'string', default: 'json' },
        output: { type: 'string' },
        pretty: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), PRODUCT_USAGE);
  }

  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(PRODUCT_USAGE + '\n');
    return;
  }
  if (positionals.length === 0) return fail('Missing product id(s).', PRODUCT_USAGE);

  const format = values.format;
  if (format !== 'json' && format !== 'csv') return fail(`Invalid --format: ${format}`, PRODUCT_USAGE);

  const ids: number[] = [];
  for (const raw of positionals) {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      return fail(`Invalid product id: ${raw} (must be a positive integer)`, PRODUCT_USAGE);
    }
    ids.push(n);
  }

  const result = await lookupProducts(ids);

  const body =
    format === 'csv'
      ? productSummariesToCsv(result.products)
      : JSON.stringify(result, null, values.pretty ? 2 : 0);

  await writeOutput(body, values.output);

  if (result.failedIds.length > 0) {
    console.error(`Could not resolve ${result.failedIds.length} id(s): ${result.failedIds.join(', ')}`);
  }
};

const runRecipes = async (args: string[]) => {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        size: { type: 'string' },
        output: { type: 'string' },
        pretty: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), RECIPES_USAGE);
  }

  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(RECIPES_USAGE + '\n');
    return;
  }
  if (positionals.length === 0) return fail('Missing search term.', RECIPES_USAGE);

  const query = positionals.join(' ');
  const size = values.size ? parsePositiveInteger(values.size, '--size', RECIPES_USAGE) : undefined;

  const result = await searchRecipes({ query, size });
  const body = JSON.stringify(result, null, values.pretty ? 2 : 0);
  await writeOutput(body, values.output);
};

const main = async () => {
  const argv = process.argv.slice(2);
  const first = argv[0];

  if (first === '-h' || first === '--help' || first === undefined) {
    process.stdout.write(USAGE + '\n');
    return;
  }
  if (first === '-v' || first === '--version') {
    process.stdout.write(pkg.version + '\n');
    return;
  }

  const rest = argv.slice(1);
  switch (first) {
    case 'extract':
      return runExtract(rest);
    case 'search':
      return runSearch(rest);
    case 'product':
      return runProduct(rest);
    case 'recipes':
      return runRecipes(rest);
    case 'bonusbox':
      return runBonusBox(rest);
    case 'auth':
      return runAuth(rest);
    default:
      return fail(`Unknown command: ${first}`, USAGE);
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
