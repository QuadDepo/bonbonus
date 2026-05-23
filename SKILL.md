---
name: bonbonus
description: Fetch this week's Albert Heijn (AH) bonus offers — Dutch supermarket promotions — via the `bonbonus` CLI and library. Use when the user asks about Albert Heijn bonus/sale items, "deze week" deals, Dutch grocery promotions, comparing AH prices, searching/filtering current AH deals by brand or category, or exporting current AH bonus items to JSON or CSV. To filter, fetch the full extract first and then filter the result. Do not use for historical AH data (only the current week is exposed), real-time stock or store-availability checks, or non-AH retailers.
---

# bonbonus

## CLI usage

The binary is `bonbonus`. Only one subcommand exists: `extract`.

```sh
bonbonus extract                              # JSON to stdout
bonbonus extract --pretty                     # indented JSON
bonbonus extract --format csv                 # CSV (RFC 4180, CRLF rows)
bonbonus extract --output deals.json          # write JSON file
bonbonus extract --format csv --output deals.csv
bonbonus --help        # or -h
bonbonus --version     # or -v
```

Flags accept both `--flag value` and `--flag=value` syntax. `--output` auto-creates parent directories.

A full extract returns ~3500 items across ~200 promotions and takes ~20–40 seconds depending on network and concurrency. For large output, always use `--output` rather than piping huge stdout through shell tools.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `BONBONUS_CONCURRENCY` | Parallel promotion fetches. Positive integer. | `10` |
| `BONBONUS_CLIENT_VERSION` | Override the AH `x-client-version` header. Set this if requests start failing with HTTP 400/403 (AH rotated their client). | `1.32.4` |

```sh
BONBONUS_CONCURRENCY=5 bonbonus extract --output deals.json
BONBONUS_CLIENT_VERSION=1.33.0 bonbonus extract
```

## Exit codes

- `0` — Success, including partial success (some promotions failed but others returned data).
- `1` — Invalid arguments, invalid env vars, or total failure (every promotion fetch failed).

Check `promotionsQueried` vs `promotionsTotal` in the JSON output to detect partial failures even when exit is 0.

## Output shape (JSON)

```jsonc
{
  "items": [ /* BonusItem[] */ ],
  "week": "deze-week",
  "source": "graphql",
  "scrapedAt": "2026-05-22T17:45:00.000Z",
  "promotionsQueried": 199,   // succeeded
  "promotionsTotal": 199      // attempted
}
```

### BonusItem fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | AH product id |
| `gtin` | string \| null | Barcode |
| `title` | string | Product title |
| `subtitle` | string? | Brand |
| `priceText` | string? | e.g. `"€2,49 (was €3,29)"` (nl-NL formatted) |
| `bonusMechanic` | string? | e.g. `"2 voor €5"` |
| `validFrom` / `validUntil` | string? | ISO 8601 |
| `imageUrl` | string? | Product image |
| `tags` | string[] | Lowercased: availability, discount label, theme, icons |
| `productSize` | string? | e.g. `"500 g"` |
| `category` | string? | Last segment of AH category path |
| `url` | string | Absolute product URL on ah.nl |
| `sourcePageUrl` | string | The promotion group URL the product came from |
| `sourcePageTitle` | string? | Promotion title |

### CSV columns

Core columns match BonusItem (minus `tags`), followed by boolean tag columns:
`tag_bonus`, `tag_vandaag`, `tag_available_in_store`, `tag_nutriscore_b`, `tag_nutriscore_c`.

Rows are separated by `\r\n` per RFC 4180.

## Common task recipes

**Count items:**
```sh
bonbonus extract | jq '.items | length'
```

**Find deals on a brand/term (case-insensitive):**
```sh
bonbonus extract | jq '.items[] | select(.title | ascii_downcase | contains("yoghurt"))'
```

**Items with a specific tag:**
```sh
bonbonus extract | jq '.items[] | select(.tags | index("bonus"))'
```

**Export for spreadsheet import:**
```sh
bonbonus extract --format csv --output ~/Downloads/ah-deals.csv
```

**Check for partial failures:**
```sh
bonbonus extract --output deals.json
jq '{queried: .promotionsQueried, total: .promotionsTotal}' deals.json
```

## Library usage

For programmatic use inside a Node project:

```typescript
import { extractBonusItems, toCsv } from 'bonbonus';

const result = await extractBonusItems({ concurrency: 5 });
console.log(result.items.length, 'items');
console.log(toCsv(result.items));
```

`extractBonusItems` throws `TypeError` for invalid `concurrency`, and `AhNetworkError` / `AhSourceChangedError` (both exported) for transport or schema problems.

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Exit 1, "All N promotions failed to fetch" | AH blocked the request or rotated client | Set `BONBONUS_CLIENT_VERSION` to a newer value. Retry. |
| `AhSourceChangedError: No bonusPromotions field` | AH changed their GraphQL schema | Inspect `src/fetch/queries.ts`; the schema fragment may need updating. Not a runtime-fixable issue. |
| Exit 0 but `promotionsQueried < promotionsTotal` | Transient per-promotion failures | Re-run, or lower `BONBONUS_CONCURRENCY` to reduce rate-limit risk. |
| `Invalid BONBONUS_CONCURRENCY=...` | Non-integer or non-positive value | Set to a positive integer (e.g., `5` or `10`). |
| Unknown flag / `Unknown command` | Typo or wrong subcommand | Only `extract` exists. `bonbonus --help` shows the full usage. |

## Constraints

- Requires Node 18+ (`AbortSignal.timeout`, `parseArgs`).
- Live network call to `ah.nl/gql`; no offline mode.
- Only the current AH bonus week is exposed — no historical or future weeks.
- The CLI exits non-zero on total failure but always emits valid JSON/CSV on the configured output when any data was retrieved.
