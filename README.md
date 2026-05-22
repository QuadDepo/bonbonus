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

## Notes

- Queries Albert Heijn's public GraphQL endpoint for the current bonus week.
- `toCsv(items)` emits fixed boolean tag columns for `bonus`, `vandaag`, `available_in_store`, `nutriscore_b`, and `nutriscore_c`.
- Tune fan-out with the `BONBONUS_CONCURRENCY` env var (default: see `src/utils/constants.ts`).

## Stability

Pre-1.0: the API may change between minor versions. The upstream Albert Heijn GraphQL schema can also change without notice, which may require a release to follow.
