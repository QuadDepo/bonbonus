/**
 * AH GraphQL transport and response parsing.
 *
 * Handles sending GQL requests to the Albert Heijn bonus API and transforming
 * the responses into domain types.
 */

import { AH_CLIENT_VERSION, AH_GQL_URL, AH_ORIGIN, DEFAULT_TIMEOUT_MS, DEFAULT_USER_AGENT } from '../utils/constants.ts';
import { AhNetworkError, AhSourceChangedError } from '../utils/errors.ts';
import type { BonusCategoriesResponse, BonusCategory, BonusCategoryPromotion, BonusItem, RawProduct } from '../utils/types.ts';
import { rawProductToBonusItem } from '../extract/product.ts';
import { BONUS_CATEGORIES_QUERY, BONUS_PROMOTION_PRODUCTS_QUERY } from './queries.ts';

interface GraphqlProduct {
  id?: number | string;
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  salesUnitSize?: string | null;
  availability?: { availabilityLabel?: string | null } | null;
  webPath?: string | null;
  summary?: string | null;
  highlights?: string[] | null;
  icons?: string[] | null;
  imagePack?: Array<{ small?: { url?: string | null } | null; large?: { url?: string | null } | null }> | null;
  tradeItem?: { gtin?: string | null } | null;
  priceV2?: {
    now?: { amount?: number | null } | null;
    was?: { amount?: number | null } | null;
    unitInfo?: { price?: { amount?: number | null } | null; description?: string | null } | null;
    discount?: { description?: string | null; smartLabel?: string | null; theme?: string | null } | null;
  } | null;
}

interface GraphqlPromotion {
  title?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  products?: GraphqlProduct[] | null;
}

interface BonusPromotionResponse {
  data?: {
    bonusPromotions?: GraphqlPromotion[] | null;
  };
}

export const formatPeriodDate = (value?: string) => {
  if (!value) return undefined;
  return value.includes('T') ? value.slice(0, 10) : value;
};

const toIsoDate = (value?: string | null) => {
  if (!value) return undefined;
  if (value.includes('T')) return value;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
};

const toRawProduct = (product: GraphqlProduct): RawProduct => ({
  id: String(product.id ?? ''),
  gtin: product.tradeItem?.gtin ?? null,
  title: product.title ?? undefined,
  brand: product.brand ?? undefined,
  category: product.category ?? undefined,
  salesUnitSize: product.salesUnitSize ?? undefined,
  availabilityLabel: product.availability?.availabilityLabel ?? undefined,
  webPath: product.webPath ?? undefined,
  summary: product.summary ?? undefined,
  highlights: product.highlights ?? null,
  icons: product.icons ?? null,
  imageUrl: product.imagePack?.[0]?.small?.url ?? product.imagePack?.[0]?.large?.url ?? null,
  priceNow: product.priceV2?.now?.amount ?? null,
  priceWas: product.priceV2?.was?.amount ?? null,
  unitPrice: product.priceV2?.unitInfo?.price?.amount ?? null,
  unitDescription: product.priceV2?.unitInfo?.description ?? null,
  discountDescription: product.priceV2?.discount?.description ?? null,
  discountLabel: product.priceV2?.discount?.smartLabel ?? null,
  discountTheme: product.priceV2?.discount?.theme ?? null,
});

const buildGqlHeaders = (referer = `${AH_ORIGIN}/bonus`) => ({
  'content-type': 'application/json',
  'client-name': 'ah-bonus',
  'client-version': AH_CLIENT_VERSION,
  origin: AH_ORIGIN,
  referer,
  'user-agent': DEFAULT_USER_AGENT,
  accept: 'application/json',
});

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

const gqlFetch = async <T>(body: string, headers: Record<string, string>, timeoutMs: number): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(AH_GQL_URL, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
          await sleep(BASE_BACKOFF_MS * 2 ** attempt);
          continue;
        }
        const hint =
          response.status === 400 || response.status === 403
            ? ` — AH may have rotated their client; try setting BONBONUS_CLIENT_VERSION (current: ${AH_CLIENT_VERSION})`
            : '';
        throw new AhNetworkError(`GQL request failed: ${response.status}${hint}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof AhNetworkError) throw error;
      if (attempt >= MAX_RETRIES) break;
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new AhNetworkError(`GQL request failed after ${MAX_RETRIES + 1} attempts: ${message}`);
};

export const fetchBonusCategories = async (
  weekNumber: number,
  periodStart: string,
  periodEnd: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BonusCategory[]> => {
  const headers = buildGqlHeaders();
  const body = JSON.stringify({
    operationName: 'bonusCategories',
    variables: { input: { weekNumber, periodStart, periodEnd } },
    query: BONUS_CATEGORIES_QUERY,
  });

  try {
    const result = await gqlFetch<BonusCategoriesResponse>(body, headers, timeoutMs);
    return result.data?.bonusCategories ?? [];
  } catch (error) {
    if (error instanceof AhNetworkError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AhNetworkError(`Failed to fetch bonus categories: ${message}`);
  }
};

export const extractProductsFromBonusPromotionResponse = (
  response: BonusPromotionResponse,
  context: { promotionId: string; promotionTitle: string; periodStart: string; periodEnd: string },
): BonusItem[] => {
  const promotion = response.data?.bonusPromotions?.[0];
  if (!promotion) {
    throw new AhSourceChangedError(`No promotion payload found for promotion ${context.promotionId}`);
  }

  const validFrom = toIsoDate(promotion.periodStart) ?? toIsoDate(context.periodStart);
  const validUntil = toIsoDate(promotion.periodEnd) ?? toIsoDate(context.periodEnd);

  return (promotion.products ?? [])
    .map(toRawProduct)
    .filter((product) => Boolean(product.id && product.title && product.webPath))
    .map((product) =>
      rawProductToBonusItem(product, {
        sourcePageUrl: `${AH_ORIGIN}/bonus/groep/${context.promotionId}`,
        sourcePageTitle: context.promotionTitle,
        validFrom,
        validUntil,
      }),
    );
};

export const fetchPromotionProducts = async (
  promotion: { id: string; title: string; periodStart: string; periodEnd: string },
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BonusItem[]> => {
  const headers = buildGqlHeaders(`${AH_ORIGIN}/bonus/groep/${promotion.id}`);
  const body = JSON.stringify({
    operationName: 'bonusPromotionProducts',
    variables: {
      id: promotion.id,
      orderId: null,
      hideVariants: true,
      periodStart: formatPeriodDate(promotion.periodStart),
      periodEnd: formatPeriodDate(promotion.periodEnd),
    },
    query: BONUS_PROMOTION_PRODUCTS_QUERY,
  });

  try {
    const result = await gqlFetch<BonusPromotionResponse>(body, headers, timeoutMs);
    return extractProductsFromBonusPromotionResponse(result, {
      promotionId: promotion.id,
      promotionTitle: promotion.title,
      periodStart: promotion.periodStart,
      periodEnd: promotion.periodEnd,
    });
  } catch (error) {
    if (error instanceof AhNetworkError || error instanceof AhSourceChangedError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AhNetworkError(`Failed to fetch promotion ${promotion.id}: ${message}`);
  }
};
