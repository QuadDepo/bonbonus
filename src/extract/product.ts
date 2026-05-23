/** Mappers from raw GraphQL `Product` shape into our public domain types. */

import { AH_ORIGIN } from '../utils/constants.ts';
import type { BonusItem, ProductSummary, RawProduct } from '../utils/types.ts';

export interface GraphqlProduct {
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

export const toRawProduct = (product: GraphqlProduct): RawProduct => ({
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

const toCurrency = (amount?: number | null) => {
  if (amount == null) return undefined;
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

const buildPriceText = (product: RawProduct) => {
  if (product.priceNow == null && product.priceWas == null) return undefined;

  const now = toCurrency(product.priceNow);
  const was = toCurrency(product.priceWas);

  if (now && was && now !== was) {
    return `${now} (was ${was})`;
  }

  return now ?? was;
};

const getCategoryLeaf = (category?: string | null) => {
  if (!category) return undefined;
  const segments = category.split('/');
  return segments[segments.length - 1];
};

const buildTags = (product: RawProduct): string[] => {
  const tags = new Set<string>();
  if (product.availabilityLabel) tags.add(product.availabilityLabel);
  if (product.discountLabel) tags.add(product.discountLabel);
  if (product.discountTheme) tags.add(product.discountTheme.toLowerCase());
  for (const icon of product.icons ?? []) tags.add(icon.toLowerCase());
  return [...tags];
};

export const rawProductToBonusItem = (
  product: RawProduct,
  context: {
    sourcePageUrl: string;
    sourcePageTitle?: string;
    validFrom?: string;
    validUntil?: string;
  },
): BonusItem => ({
  id: product.id,
  gtin: product.gtin,
  title: product.title ?? '',
  subtitle: product.brand ?? undefined,
  priceText: buildPriceText(product),
  bonusMechanic: product.discountDescription ?? undefined,
  validFrom: context.validFrom,
  validUntil: context.validUntil,
  imageUrl: product.imageUrl ?? undefined,
  tags: buildTags(product),
  productSize: product.salesUnitSize ?? undefined,
  category: getCategoryLeaf(product.category),
  url: new URL(product.webPath ?? '', AH_ORIGIN).toString(),
  sourcePageUrl: context.sourcePageUrl,
  sourcePageTitle: context.sourcePageTitle,
});

export const rawProductToProductSummary = (product: RawProduct): ProductSummary => ({
  id: product.id,
  gtin: product.gtin,
  title: product.title ?? '',
  subtitle: product.brand ?? undefined,
  priceText: buildPriceText(product),
  bonusMechanic: product.discountDescription ?? undefined,
  isBonus: Boolean(product.discountDescription || product.discountLabel),
  imageUrl: product.imageUrl ?? undefined,
  tags: buildTags(product),
  productSize: product.salesUnitSize ?? undefined,
  category: getCategoryLeaf(product.category),
  url: new URL(product.webPath ?? '', AH_ORIGIN).toString(),
});
