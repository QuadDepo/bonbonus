# bonbonus

Albert Heijn bonus extractor for `deze week`, built as a reusable TypeScript library with a thin CLI.

## Install

```bash
npm install bonbonus
# or
pnpm add bonbonus
```

## Usage

Library:

```ts
import { extractBonusItems, toCsv } from 'bonbonus';

const result = await extractBonusItems();
console.log(result.items);
console.log(toCsv(result.items));
```

CLI:

```bash
bonbonus extract
bonbonus extract --pretty
bonbonus extract --format csv
bonbonus extract --format csv --output ./bonus.csv
bonbonus extract --output ./bonus.json
```

Or one-off via `npx bonbonus extract`.

## Personal Bonus Box (authenticated)

The personal **Bonus Box** ("Mijn Bonus Box") is per-account, so it needs a one-time login.

```bash
bonbonus auth login          # prints a login URL; paste the code from the redirect
bonbonus auth status         # show login state + token validity
bonbonus auth logout         # delete stored credentials

bonbonus bonusbox            # list your box (activated + activatable items)
bonbonus bonusbox list --pretty
bonbonus bonusbox activate 716411 590069   # activate specific items by id
bonbonus bonusbox activate --all           # activate every activatable item
```

Login uses the AH iOS app's OAuth flow against `api.ah.nl`. Because the login page
has a CAPTCHA, `auth login` opens with instructions to grab the `code` from the
`appie://login-exit` redirect in your browser's DevTools, then exchanges it for a
token (valid ~7 days, auto-refreshed). Credentials are stored at
`$XDG_CONFIG_HOME/bonbonus/auth.json` (mode `0600`); override with `BONBONUS_AUTH_FILE`.

Library equivalents: `getBonusBox()`, `activateBonusBox({ ids })` / `activateBonusBox({ all: true })`, `getMember()`.

> Activation is one-way — AH has no deactivation. The weekly pick cap
> (`maximumActivations`, typically 5 free / 10 Premium) is reported in the box result.

## Notes

- Queries Albert Heijn's public GraphQL endpoint for the current bonus week.
- `toCsv(items)` emits fixed boolean tag columns for `bonus`, `vandaag`, `available_in_store`, `nutriscore_b`, and `nutriscore_c`.
- Tune fan-out with the `BONBONUS_CONCURRENCY` env var (default: see `src/utils/constants.ts`).

## Stability

Pre-1.0: the API may change between minor versions. The upstream Albert Heijn GraphQL schema can also change without notice, which may require a release to follow.
