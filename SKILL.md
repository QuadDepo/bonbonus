---
name: bonbonus
description: Query Albert Heijn (AH) — the Dutch supermarket — via the `bonbonus` CLI and library. Four commands: `extract` (this week's bonus offers), `search` (any AH product by free text, with optional bonus-only filter), `product` (look up a product by its numeric AH id), and `recipes` (search Allerhande recipes by free text). Use when the user asks about AH bonus/sale items, "deze week" deals, Dutch grocery promotions, comparing AH prices by brand/category, finding products that are currently on bonus, or finding Allerhande recipes. To filter the bonus extract, fetch it first and filter the JSON result. Do not use for historical AH data (only the current week of bonus is exposed), real-time stock or store-availability checks, full recipe detail (steps/nutrition/ingredients), or non-AH retailers.
---

# bonbonus

## CLI usage

The binary is `bonbonus`. Four subcommands: `extract`, `search`, `product`, `recipes`.

```sh
# Bonus extract — this week's promotions
bonbonus extract                              # JSON to stdout
bonbonus extract --pretty
bonbonus extract --format csv --output deals.csv

# Product search by free text
bonbonus search pasta                         # 30 results
bonbonus search "alpro yoghurt" --bonus-only --size 50
bonbonus search melk --taxonomy 6401          # filter to an AH taxonomy id
bonbonus search pasta --page 1                # next page

# Product lookup by id
bonbonus product 597485                       # single product
bonbonus product 597485 598385 12000          # batch

# Recipe search (Allerhande)
bonbonus recipes lasagne --size 10
bonbonus recipes "weekend bbq" --pretty

bonbonus --help            # or -h
bonbonus --version         # or -v
bonbonus search --help     # per-command help
```

Flags accept both `--flag value` and `--flag=value` syntax. `--output` auto-creates parent directories.

A full `extract` returns ~3500 items across ~200 promotions and takes ~20–40 seconds. For large output, always use `--output` rather than piping huge stdout through shell tools. `search`, `product`, and `recipes` are single requests and return in well under a second.

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

- `0` — Success, including partial success on `extract` (some promotions failed but others returned data).
- `1` — Invalid arguments, invalid env vars, total failure (every promotion fetch failed in `extract`), or transport failure on `search`/`product`/`recipes`.

For `extract`, check `promotionsQueried` vs `promotionsTotal` in the JSON output to detect partial failures even when exit is 0.

## Output shape — `extract` (JSON)

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

## Output shape — `search` and `product`

Both return `ProductSummary[]`.

```jsonc
// bonbonus search
{
  "results": [ /* ProductSummary[] */ ],
  "query": "pasta",
  "size": 30,
  "page": 0,
  "scrapedAt": "2026-05-23T..."
}

// bonbonus product
{ "products": [ /* ProductSummary[] */ ], "scrapedAt": "..." }
```

### ProductSummary fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | AH product id (the number after `wi` in the URL) |
| `gtin` | string \| null | Barcode |
| `title` | string | Product title |
| `subtitle` | string? | Brand |
| `priceText` | string? | `"€2,49 (was €3,29)"` (nl-NL formatted) |
| `bonusMechanic` | string? | e.g. `"2 voor €5"`, `"5% volume voordeel"` |
| `isBonus` | boolean | `true` when an active discount is attached |
| `imageUrl` | string? | Product image |
| `tags` | string[] | Lowercased: availability, discount label, theme, icons |
| `productSize` | string? | e.g. `"500 g"` |
| `category` | string? | Last segment of AH category path |
| `url` | string | Absolute product URL on ah.nl |

CSV columns for these commands: `id,gtin,title,subtitle,priceText,bonusMechanic,isBonus,imageUrl,productSize,category,url` plus the same five boolean tag columns as the bonus extract.

## Output shape — `recipes`

```jsonc
{
  "results": [
    {
      "id": 1202268,
      "title": "Lasagne met venkel en geitenkaas",
      "slug": "lasagne-met-venkel-en-geitenkaas",
      "url": "https://www.ah.nl/allerhande/recept/R-R1202268/lasagne-met-venkel-en-geitenkaas",
      "rating": 4,
      "courses": ["hoofdgerecht"],
      "diet": ["vegetarisch", "zonder vlees/vis"]
    }
  ],
  "query": "lasagne",
  "size": 30,
  "scrapedAt": "..."
}
```

Recipe results are intentionally slim — only `id`, `title`, `slug`, `url`, `rating`, `courses`, `diet`. Full recipe detail (steps, nutrition, ingredient list) lives on a separate AH API that this CLI does not currently expose. Use the `url` to send the user to the recipe page for the rest.

`recipes` only emits JSON; CSV is not supported because the `courses`/`diet` arrays don't collapse cleanly into flat columns.

## Common task recipes

**Count items in the bonus extract:**
```sh
bonbonus extract | jq '.items | length'
```

**Find current bonus items for a term (preferred — single request):**
```sh
bonbonus search "yoghurt" --bonus-only | jq '.results[] | {title, priceText, bonusMechanic, url}'
```

**Filter the full bonus extract by tag:**
```sh
bonbonus extract | jq '.items[] | select(.tags | index("bonus"))'
```

**Look up a known product by id:**
```sh
bonbonus product 597485 | jq '.products[0] | {title, priceText, isBonus}'
```

**Recipe ideas for a theme:**
```sh
bonbonus recipes "weekend bbq" --size 5 | jq '.results[] | {title, url, rating}'
```

**Recipe ideas filtered by course:**
```sh
bonbonus recipes "pasta" --size 30 | jq '.results[] | select(.courses | index("hoofdgerecht"))'
```

**Export bonus extract for spreadsheet import:**
```sh
bonbonus extract --format csv --output ~/Downloads/ah-deals.csv
```

**Check for partial failures on extract:**
```sh
bonbonus extract --output deals.json
jq '{queried: .promotionsQueried, total: .promotionsTotal}' deals.json
```

## Library usage

For programmatic use inside a Node project:

```typescript
import {
  extractBonusItems,
  search,
  lookupProducts,
  searchRecipes,
  toCsv,
  productSummariesToCsv,
} from 'bonbonus';

const bonus = await extractBonusItems({ concurrency: 5 });
const found = await search({ query: 'pasta', bonusOnly: true, size: 50 });
const items = await lookupProducts([597485, 598385]);
const ideas = await searchRecipes({ query: 'lasagne', size: 10 });
```

All four throw `TypeError` for invalid arguments and `AhNetworkError` / `AhSourceChangedError` (both exported) for transport or schema problems.

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Exit 1, "All N promotions failed to fetch" | AH blocked the request or rotated client | Set `BONBONUS_CLIENT_VERSION` to a newer value. Retry. |
| `GQL request failed: 403` from `search`/`product`/`recipes` | Same as above — AH rotated the client | Set `BONBONUS_CLIENT_VERSION` to a newer value. |
| `AhSourceChangedError: No bonusPromotions field` | AH changed their GraphQL schema | Inspect `src/fetch/queries.ts`; the schema fragment may need updating. Not a runtime-fixable issue. |
| `AhSourceChangedError: No productSearch / products / recipeSearch field` | AH changed their GraphQL schema for these ops | Same as above. |
| Exit 0 but `promotionsQueried < promotionsTotal` | Transient per-promotion failures | Re-run, or lower `BONBONUS_CONCURRENCY` to reduce rate-limit risk. |
| `Invalid BONBONUS_CONCURRENCY=...` | Non-integer or non-positive value | Set to a positive integer (e.g., `5` or `10`). |
| Unknown flag / `Unknown command` | Typo or wrong subcommand | Only `extract`, `search`, `product`, `recipes` exist. `bonbonus --help` shows usage; `bonbonus <command> --help` shows per-command flags. |

## Constraints

- Requires Node 18+ (`AbortSignal.timeout`, `parseArgs`).
- Live network calls to `ah.nl/gql`; no offline mode.
- Only the current AH bonus week is exposed by `extract` — no historical or future weeks.
- `recipes` returns slim summaries only. Steps, nutrition, and the ingredient list are not exposed by this CLI (they live on a separate AH API).
- The CLI exits non-zero on total failure but always emits valid JSON/CSV on the configured output when any data was retrieved.
