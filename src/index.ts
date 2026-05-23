import {
  fetchBonusCategories,
  fetchProductSearch,
  fetchProductsByIds,
  fetchPromotionProducts,
  fetchRecipeSearch,
} from './fetch/gql.ts';
import { getCurrentBonusWeek } from './utils/week.ts';
import { DEFAULT_CONCURRENCY, DEFAULT_WEEK } from './utils/constants.ts';
import { createLogger } from './utils/log.ts';
import type {
  BonusCategoryPromotion,
  BonusItem,
  ExtractOptions,
  ExtractResult,
  ProductLookupResult,
  ProductSearchOptions,
  ProductSearchResultPublic,
  ProductSummary,
  RecipeSearchOptions,
  RecipeSearchResultPublic,
} from './utils/types.ts';

const log = createLogger('index');

// First-wins: a product appearing in multiple promotions keeps the first
// encounter's sourcePageUrl / validFrom / validUntil. Subsequent promotion
// metadata is discarded — callers needing all promotions for a product
// should consume the raw fan-out instead.
const dedupeItems = (items: BonusItem[]) => {
  const seen = new Set<string>();
  const deduped: BonusItem[] = [];

  for (const item of items) {
    const key = item.url || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
};

/** Simple worker-pool: runs up to `concurrency` tasks in parallel, settling each independently. */
const runWithConcurrency = async <T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> => {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let index = 0;

  const worker = async () => {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
};

export const extractBonusItems = async (options: ExtractOptions = {}): Promise<ExtractResult> => {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError(`extractBonusItems: concurrency must be a positive integer, got ${options.concurrency}`);
  }

  const { weekNumber, periodStart, periodEnd } = getCurrentBonusWeek();
  log('Bonus week', weekNumber, periodStart, '→', periodEnd);

  const categories = await fetchBonusCategories(weekNumber, periodStart, periodEnd);
  const promotions: BonusCategoryPromotion[] = categories.flatMap((cat) => cat.promotions ?? []);
  log('Found', promotions.length, 'promotions across', categories.length, 'categories');

  const tasks = promotions.map((promo) => () => {
    log('Fetching products for', promo.id, promo.title);
    return fetchPromotionProducts({
      id: promo.id,
      title: promo.title,
      periodStart: promo.periodStart,
      periodEnd: promo.periodEnd,
    });
  });

  const settled = await runWithConcurrency(tasks, concurrency);

  const collected: BonusItem[] = [];
  let succeeded = 0;
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      collected.push(...r.value);
      succeeded++;
    } else {
      const promo = promotions[i];
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
      log('Failed promotion', promo.id, promo.title, '—', message);
    }
  }

  const items = dedupeItems(collected);

  return {
    items,
    week: DEFAULT_WEEK,
    source: 'graphql',
    scrapedAt: new Date().toISOString(),
    promotionsQueried: succeeded,
    promotionsTotal: promotions.length,
  };
};

const DEFAULT_PRODUCT_SEARCH_SIZE = 30;
const DEFAULT_RECIPE_SEARCH_SIZE = 30;

const validatePositiveInt = (label: string, value: number) => {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer, got ${value}`);
  }
};

const validateNonNegativeInt = (label: string, value: number) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer, got ${value}`);
  }
};

export const search = async (options: ProductSearchOptions): Promise<ProductSearchResultPublic> => {
  if (!options.query || typeof options.query !== 'string') {
    throw new TypeError('search: query must be a non-empty string');
  }
  const size = options.size ?? DEFAULT_PRODUCT_SEARCH_SIZE;
  const page = options.page ?? 0;
  validatePositiveInt('size', size);
  validateNonNegativeInt('page', page);
  if (options.taxonomyId !== undefined) validatePositiveInt('taxonomyId', options.taxonomyId);

  const results = await fetchProductSearch({
    query: options.query,
    size,
    page,
    taxonomyId: options.taxonomyId,
  });

  const filtered = options.bonusOnly ? results.filter((p) => p.isBonus) : results;

  return {
    results: filtered,
    query: options.query,
    size,
    page,
    scrapedAt: new Date().toISOString(),
  };
};

export const lookupProducts = async (ids: number[]): Promise<ProductLookupResult> => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new TypeError('lookupProducts: ids must be a non-empty array');
  }
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 1) {
      throw new TypeError(`lookupProducts: each id must be a positive integer, got ${id}`);
    }
  }

  const { products, failedIds } = await fetchProductsByIds(ids);
  return {
    products,
    failedIds,
    scrapedAt: new Date().toISOString(),
  };
};

export const searchRecipes = async (options: RecipeSearchOptions): Promise<RecipeSearchResultPublic> => {
  if (!options.query || typeof options.query !== 'string') {
    throw new TypeError('searchRecipes: query must be a non-empty string');
  }
  const size = options.size ?? DEFAULT_RECIPE_SEARCH_SIZE;
  validatePositiveInt('size', size);

  const results = await fetchRecipeSearch(options.query, size);
  return {
    results,
    query: options.query,
    size,
    scrapedAt: new Date().toISOString(),
  };
};

export { toCsv, productSummariesToCsv } from './format/csv.ts';
export type {
  BonusItem,
  ExtractOptions,
  ExtractResult,
  ProductLookupResult,
  ProductSearchOptions,
  ProductSearchResultPublic,
  ProductSummary,
  RecipeSearchOptions,
  RecipeSearchResultPublic,
} from './utils/types.ts';
export type { RecipeSummary } from './utils/types.ts';
export { AhScrapeError, AhNetworkError, AhSourceChangedError } from './utils/errors.ts';
