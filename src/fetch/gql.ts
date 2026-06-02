/**
 * AH GraphQL transport and response parsing.
 *
 * Handles sending GQL requests to the Albert Heijn bonus API and transforming
 * the responses into domain types.
 */

import {
  AH_GQL_URL,
  AH_MOBILE_CLIENT_ID,
  AH_MOBILE_GQL_URL,
  AH_MOBILE_USER_AGENT,
  AH_ORIGIN,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  getAhClientVersion,
  getAhMobileClientVersion,
} from '../utils/constants.ts';
import { getAccessToken } from '../auth/token.ts';
import { assertNoGqlErrors, gqlPost } from './transport.ts';
import { AhAuthError, AhNetworkError, AhSourceChangedError } from '../utils/errors.ts';
import type {
  BonusCategoriesResponse,
  BonusCategory,
  BonusItem,
  ProductSearchGraphqlResponse,
  ProductSummary,
  ProductsGraphqlResponse,
  RecipeSearchGraphqlResponse,
  RecipeSummary,
} from '../utils/types.ts';
import { AH_ALLERHANDE_RECIPE_PATH } from '../utils/constants.ts';
import { rawProductToBonusItem, rawProductToProductSummary, toRawProduct } from '../extract/product.ts';
import {
  BONUS_CATEGORIES_QUERY,
  BONUS_PROMOTION_PRODUCTS_QUERY,
  PRODUCTS_QUERY,
  PRODUCT_SEARCH_QUERY,
  RECIPE_SEARCH_QUERY,
} from './queries.ts';

import type { GraphqlProduct } from '../extract/product.ts';

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

// A 400/403 on the public endpoint usually means AH rotated their web client
// version; point the user at the override knob.
const publicGqlError = (status: number): AhNetworkError => {
  const hint =
    status === 400 || status === 403
      ? ` — AH may have rotated their client (x-client-version); try setting BONBONUS_CLIENT_VERSION (current: ${getAhClientVersion()})`
      : '';
  return new AhNetworkError(`GQL request failed: ${status}${hint}`);
};

const gqlFetch = <T>(body: string, headers: Record<string, string>, timeoutMs: number): Promise<T> =>
  gqlPost<T>(async () => ({ url: AH_GQL_URL, headers, body }), {
    timeoutMs,
    label: 'GQL request',
    toError: publicGqlError,
  });

// --- Authenticated (member) transport ----------------------------------------
// The personal Bonus Box lives on the iOS app's GraphQL surface (api.ah.nl),
// reached with an OAuth bearer token and the appie-ios headers — a different
// host + header set than the anonymous www.ah.nl/gql transport above.

const buildAuthGqlHeaders = (accessToken: string, operationName: string): Record<string, string> => ({
  'content-type': 'application/json',
  accept: 'application/json',
  authorization: `Bearer ${accessToken}`,
  'x-client-name': AH_MOBILE_CLIENT_ID,
  'x-client-version': getAhMobileClientVersion(),
  'x-application': 'AHWEBSHOP',
  'x-apollo-operation-name': operationName,
  'apollographql-client-name': 'nl.ah.Appie-apollo-ios',
  'user-agent': AH_MOBILE_USER_AGENT,
});

/**
 * Send an authenticated GraphQL request to the member API. Fetches a valid
 * access token (refreshing proactively), and on a 401 forces one refresh and
 * retries once — covering tokens AH invalidated server-side before expiry.
 * A 401 that survives the forced refresh surfaces as an auth error (re-login),
 * not a generic network error. Transient 429/5xx back off via the shared core.
 */
export const authGqlFetch = <T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> => {
  const body = JSON.stringify({ operationName, query, variables });
  let forceRefresh = false;
  const label = `Authenticated GQL (${operationName})`;

  return gqlPost<T>(
    async () => {
      const accessToken = await getAccessToken({ force: forceRefresh });
      return { url: AH_MOBILE_GQL_URL, headers: buildAuthGqlHeaders(accessToken, operationName), body };
    },
    {
      timeoutMs,
      label,
      on401: async () => {
        forceRefresh = true; // next build() mints a fresh token
        return true;
      },
      // A 401 after the forced refresh means the session is truly dead.
      toError: (status) =>
        status === 401
          ? new AhAuthError('Your AH session is no longer valid. Run `bonbonus auth login` to sign in again.', 'REFRESH_FAILED')
          : new AhNetworkError(`${label} failed: ${status}`),
    },
  );
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

interface GqlEnvelope {
  data?: unknown;
  errors?: Array<{ message?: string }>;
}

/**
 * Distinguish AH's three failure modes:
 *  1. Top-level GraphQL `errors` with `data: null` — usually "id not found" or
 *     subgraph failure. Surface AH's message so callers can act on it.
 *  2. `data` present but the expected field key is missing — schema drift.
 *  3. Happy path — return data[field].
 */
const extractGqlField = <T>(response: GqlEnvelope, field: string, context: string): T => {
  assertNoGqlErrors(response.errors, context);
  if (!response.data || typeof response.data !== 'object') {
    throw new AhNetworkError(`${context}: AH returned no data`);
  }
  const data = response.data as Record<string, unknown>;
  if (!(field in data)) {
    throw new AhSourceChangedError(`No ${field} field in response for ${context}`);
  }
  return data[field] as T;
};

export const mapProductSearchResponse = (response: ProductSearchGraphqlResponse): ProductSummary[] => {
  const productSearch = extractGqlField<{ products?: unknown[] | null } | null>(
    response as GqlEnvelope,
    'productSearch',
    'productSearch',
  );
  const products = productSearch?.products ?? [];
  return products
    .map((p) => toRawProduct(p as GraphqlProduct))
    .filter((p) => Boolean(p.id && p.title && p.webPath))
    .map(rawProductToProductSummary);
};

interface ProductSearchVariables {
  query: string;
  size: number;
  page: number;
  taxonomyId?: number;
}

export const fetchProductSearch = async (
  variables: ProductSearchVariables,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ProductSummary[]> => {
  const headers = buildGqlHeaders(`${AH_ORIGIN}/zoeken?query=${encodeURIComponent(variables.query)}`);
  const input: Record<string, unknown> = {
    query: variables.query,
    size: variables.size,
    page: variables.page,
  };
  if (variables.taxonomyId !== undefined) input.taxonomyId = variables.taxonomyId;

  const body = JSON.stringify({
    operationName: 'productSearch',
    variables: { input },
    query: PRODUCT_SEARCH_QUERY,
  });

  try {
    const result = await gqlFetch<ProductSearchGraphqlResponse>(body, headers, timeoutMs);
    return mapProductSearchResponse(result);
  } catch (error) {
    if (error instanceof AhNetworkError || error instanceof AhSourceChangedError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AhNetworkError(`Failed to search products: ${message}`);
  }
};

export const mapProductsResponse = (response: ProductsGraphqlResponse): ProductSummary[] => {
  const products = extractGqlField<unknown[] | null>(response as GqlEnvelope, 'products', 'products');
  return (products ?? [])
    .map((p) => toRawProduct(p as GraphqlProduct))
    .filter((p) => Boolean(p.id && p.title && p.webPath))
    .map(rawProductToProductSummary);
};

// Recipe ids on ah.nl are 7-digit numbers (~1.2M+); product ids are 4-6 digit.
// A common mistake is to pass a recipe id to `bonbonus product`, which AH then
// rejects with a redacted subgraph error. Detect and hint.
const looksLikeRecipeId = (id: number) => id >= 1_000_000;

const recipeIdHint = (ids: number[]): string => {
  const suspicious = ids.filter(looksLikeRecipeId);
  if (suspicious.length === 0) return '';
  const verb = suspicious.length === 1 ? 'looks' : 'look';
  const noun = suspicious.length === 1 ? 'a recipe id' : 'recipe ids';
  return ` — ${suspicious.join(', ')} ${verb} like ${noun}; try \`bonbonus recipes\` or pass the integer after \`wi\` in the product URL`;
};

const fetchProductsBatch = async (
  ids: number[],
  timeoutMs: number,
): Promise<ProductSummary[]> => {
  const headers = buildGqlHeaders();
  const body = JSON.stringify({
    operationName: 'products',
    variables: { productsInput: ids.map((id) => ({ id })) },
    query: PRODUCTS_QUERY,
  });
  const result = await gqlFetch<ProductsGraphqlResponse>(body, headers, timeoutMs);
  return mapProductsResponse(result);
};

export interface FetchProductsResult {
  products: ProductSummary[];
  failedIds: number[];
}

// AH's batch lookup is all-or-nothing: one invalid id => `data: null` for the
// whole batch. To get partial-success semantics (matching extract), on a batch
// failure with >1 id we retry per-id in parallel and collect what succeeds.
export const fetchProductsByIds = async (
  ids: number[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FetchProductsResult> => {
  try {
    const products = await fetchProductsBatch(ids, timeoutMs);
    return { products, failedIds: [] };
  } catch (error) {
    if (error instanceof AhSourceChangedError) throw error;
    if (ids.length === 1) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AhNetworkError(`${message}${recipeIdHint(ids)}`);
    }
    if (!(error instanceof AhNetworkError)) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AhNetworkError(`Failed to fetch products: ${message}`);
    }
    // Fallback: retry per-id to identify which ids resolve.
    const settled = await Promise.allSettled(ids.map((id) => fetchProductsBatch([id], timeoutMs)));
    const products: ProductSummary[] = [];
    const failedIds: number[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') products.push(...r.value);
      else failedIds.push(ids[i]);
    });
    return { products, failedIds };
  }
};

export const mapRecipeSearchResponse = (response: RecipeSearchGraphqlResponse): RecipeSummary[] => {
  const recipeSearch = extractGqlField<{ result?: unknown[] | null } | null>(
    response as GqlEnvelope,
    'recipeSearch',
    'recipeSearch',
  );
  const result = (recipeSearch?.result ?? []) as Array<{
    id?: number | null;
    title?: string | null;
    slug?: string | null;
    rating?: { average?: number | null } | null;
    courses?: string[] | null;
    diet?: string[] | null;
  }>;
  return result
    .filter((r) => r.id != null && r.title && r.slug)
    .map((r) => ({
      id: r.id as number,
      title: r.title as string,
      slug: r.slug as string,
      url: `${AH_ORIGIN}${AH_ALLERHANDE_RECIPE_PATH}/R-R${r.id}/${r.slug}`,
      rating: r.rating?.average ?? undefined,
      courses: r.courses ?? [],
      diet: r.diet ?? [],
    }));
};

export const fetchRecipeSearch = async (
  query: string,
  size: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RecipeSummary[]> => {
  const headers = buildGqlHeaders(`${AH_ORIGIN}/allerhande/recepten-zoeken?q=${encodeURIComponent(query)}`);
  const body = JSON.stringify({
    operationName: 'recipeSearch',
    variables: { query: { searchText: query, size } },
    query: RECIPE_SEARCH_QUERY,
  });

  try {
    const result = await gqlFetch<RecipeSearchGraphqlResponse>(body, headers, timeoutMs);
    return mapRecipeSearchResponse(result);
  } catch (error) {
    if (error instanceof AhNetworkError || error instanceof AhSourceChangedError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AhNetworkError(`Failed to search recipes: ${message}`);
  }
};
