/**
 * AH GraphQL transport and response parsing.
 *
 * Handles sending GQL requests to the Albert Heijn bonus API and transforming
 * the responses into domain types.
 */

import { Agent } from 'undici';
import { AH_GQL_URL, AH_ORIGIN, DEFAULT_TIMEOUT_MS, DEFAULT_USER_AGENT, getAhClientVersion } from '../utils/constants.ts';
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
  accept: 'application/graphql-response+json,application/json;q=0.9',
  'accept-language': 'en-US,en;q=0.9,nl;q=0.8',
  'x-client-name': 'ah-bonus',
  'x-client-platform-type': 'Web',
  'x-client-version': getAhClientVersion(),
  origin: AH_ORIGIN,
  referer,
  'user-agent': DEFAULT_USER_AGENT,
  'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
});

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

// Akamai's edge rejects Node's default OpenSSL cipher list as non-browser. A
// Chrome-like cipher list yields a TLS Client Hello (JA3/JA4) the bot wall
// accepts. Without this, requests from Linux Node return HTTP 403 before any
// HTTP-layer inspection. Confirmed via tls.peet.ws fingerprint capture.
const CHROME_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':');

const tlsAgent = new Agent({ connect: { ciphers: CHROME_CIPHERS } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

/** Honor Retry-After (seconds or HTTP-date), clamped to MAX_BACKOFF_MS. */
const retryAfterMs = (header: string | null): number | undefined => {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  }
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.min(dateMs - Date.now(), MAX_BACKOFF_MS));
  }
  return undefined;
};

const gqlFetch = async <T>(body: string, headers: Record<string, string>, timeoutMs: number): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(AH_GQL_URL, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
        // @ts-expect-error -- Node's global fetch accepts an undici dispatcher
        dispatcher: tlsAgent,
      });

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
          const wait = retryAfterMs(response.headers.get('retry-after')) ?? BASE_BACKOFF_MS * 2 ** attempt;
          await sleep(wait);
          continue;
        }
        const hint =
          response.status === 400 || response.status === 403
            ? ` — AH may have rotated their client (x-client-version); try setting BONBONUS_CLIENT_VERSION (current: ${getAhClientVersion()})`
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
  // `data.bonusPromotions` missing => schema change; empty array => promotion
  // legitimately has no products right now (transient/empty), not a schema break.
  if (!response.data || !('bonusPromotions' in response.data)) {
    throw new AhSourceChangedError(`No bonusPromotions field in response for promotion ${context.promotionId}`);
  }
  const promotion = response.data.bonusPromotions?.[0];
  if (!promotion) return [];

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
