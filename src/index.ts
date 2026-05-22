import { fetchBonusCategories, fetchPromotionProducts } from './fetch/gql.ts';
import { getCurrentBonusWeek } from './utils/week.ts';
import { DEFAULT_CONCURRENCY, DEFAULT_WEEK } from './utils/constants.ts';
import { createLogger } from './utils/log.ts';
import type { BonusCategoryPromotion, BonusItem, ExtractOptions, ExtractResult } from './utils/types.ts';

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
  const week = options.week ?? DEFAULT_WEEK;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

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
    week,
    source: 'graphql',
    scrapedAt: new Date().toISOString(),
    promotionsQueried: succeeded,
    promotionsTotal: promotions.length,
  };
};

export { toCsv } from './format/csv.ts';
export type { BonusItem, ExtractOptions, ExtractResult } from './utils/types.ts';
export { AhScrapeError, AhNetworkError, AhSourceChangedError } from './utils/errors.ts';
