export interface BonusItem {
  id: string;
  gtin: string | null;
  title: string;
  subtitle?: string;
  priceText?: string;
  bonusMechanic?: string;
  validFrom?: string;
  validUntil?: string;
  imageUrl?: string;
  tags: string[];
  productSize?: string;
  category?: string;
  url: string;
  sourcePageUrl: string;
  sourcePageTitle?: string;
}

export interface RawProduct {
  id: string;
  gtin: string | null;
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  salesUnitSize?: string | null;
  availabilityLabel?: string | null;
  webPath?: string | null;
  summary?: string | null;
  highlights?: string[] | null;
  icons?: string[] | null;
  imageUrl?: string | null;
  priceNow?: number | null;
  priceWas?: number | null;
  unitPrice?: number | null;
  unitDescription?: string | null;
  discountDescription?: string | null;
  discountLabel?: string | null;
  discountTheme?: string | null;
}

export interface BonusCategoryPromotion {
  id: string;
  title: string;
  productCount: number;
  periodStart: string;
  periodEnd: string;
}

export interface BonusCategory {
  id: string;
  title: string;
  promotions: BonusCategoryPromotion[];
}

export interface BonusCategoriesResponse {
  data?: {
    bonusCategories?: BonusCategory[] | null;
  };
}

export interface ExtractOptions {
  concurrency?: number;
}

export interface ExtractResult {
  items: BonusItem[];
  week: 'deze-week';
  source: 'graphql';
  scrapedAt: string;
  promotionsQueried: number;
  promotionsTotal: number;
}

export interface ProductSummary {
  id: string;
  gtin: string | null;
  title: string;
  subtitle?: string;
  priceText?: string;
  bonusMechanic?: string;
  isBonus: boolean;
  imageUrl?: string;
  tags: string[];
  productSize?: string;
  category?: string;
  url: string;
}

export interface ProductSearchOptions {
  query: string;
  size?: number;
  page?: number;
  taxonomyId?: number;
  bonusOnly?: boolean;
}

export interface ProductSearchResultPublic {
  results: ProductSummary[];
  query: string;
  size: number;
  page: number;
  scrapedAt: string;
}

export interface ProductLookupResult {
  products: ProductSummary[];
  failedIds: number[];
  scrapedAt: string;
}

export interface ProductsGraphqlResponse {
  data?: {
    products?: unknown[] | null;
  };
}

export interface ProductSearchGraphqlResponse {
  data?: {
    productSearch?: {
      products?: unknown[] | null;
    } | null;
  };
}

// --- Personal Bonus Box (authenticated) --------------------------------------

/** AH-controlled status; the values we act on are 'ACTIVATED' and 'ACTIVATABLE'. */
export type BonusBoxActivationStatus = string;

export interface BonusBoxItem {
  /** Promotion id shown to the user (also accepted by `bonusbox activate`). */
  id: string;
  /** Activation key passed as `externalId` to the activate mutation. */
  hqId: string;
  title: string;
  category?: string;
  activationStatus: BonusBoxActivationStatus;
  priceNow?: number;
  priceWas?: number;
  periodStart?: string;
  periodEnd?: string;
}

/** The Bonus Box as read from AH, before CLI-level metadata is attached. */
export interface BonusBoxData {
  items: BonusBoxItem[];
  /** Max offers that can be activated this week (Premium 10 / free 5); null if unknown. */
  maximumActivations: number | null;
  /** How many items are already ACTIVATED. */
  activatedCount: number;
  validityPeriod?: { start: string; end: string };
}

export interface BonusBoxResult extends BonusBoxData {
  weekNumber: number;
  scrapedAt: string;
}

export interface BonusBoxActivation {
  id: string;
  hqId: string;
  title: string;
  /** AH's mutation status, e.g. "SUCCESS" / "FAILED". */
  status: string;
  /** AH's message, e.g. "OFFER_ACTIVATED" / "ACTIVATION_FAILED". */
  message: string;
  ok: boolean;
}

export interface BonusBoxActivationResult {
  results: BonusBoxActivation[];
  scrapedAt: string;
}

export interface MemberInfo {
  id: number;
  email?: string;
  firstName?: string;
  lastName?: string;
  bonusCard?: string;
}

export interface RecipeSummary {
  id: number;
  title: string;
  slug: string;
  url: string;
  rating?: number;
  courses: string[];
  diet: string[];
}

export interface RecipeSearchOptions {
  query: string;
  size?: number;
}

export interface RecipeSearchResultPublic {
  results: RecipeSummary[];
  query: string;
  size: number;
  scrapedAt: string;
}

export interface RecipeSearchGraphqlResponse {
  data?: {
    recipeSearch?: {
      result?: Array<{
        id?: number | null;
        title?: string | null;
        slug?: string | null;
        rating?: { average?: number | null } | null;
        courses?: string[] | null;
        diet?: string[] | null;
      }> | null;
    } | null;
  };
}
