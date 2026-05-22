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
