/** Transforms a RawProduct (flat GQL fields) into a BonusItem (public shape). */

import { AH_ORIGIN } from '../utils/constants.ts';
import type { BonusItem, RawProduct } from '../utils/types.ts';

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

export const rawProductToBonusItem = (
  product: RawProduct,
  context: {
    sourcePageUrl: string;
    sourcePageTitle?: string;
    validFrom?: string;
    validUntil?: string;
  },
): BonusItem => {
  const tags = new Set<string>();
  if (product.availabilityLabel) tags.add(product.availabilityLabel);
  if (product.discountLabel) tags.add(product.discountLabel);
  if (product.discountTheme) tags.add(product.discountTheme.toLowerCase());
  for (const icon of product.icons ?? []) tags.add(icon.toLowerCase());

  return {
    id: product.id,
    gtin: product.gtin,
    title: product.title ?? '',
    subtitle: product.brand ?? undefined,
    priceText: buildPriceText(product),
    bonusMechanic: product.discountDescription ?? undefined,
    validFrom: context.validFrom,
    validUntil: context.validUntil,
    imageUrl: product.imageUrl ?? undefined,
    tags: [...tags],
    productSize: product.salesUnitSize ?? undefined,
    category: getCategoryLeaf(product.category),
    url: new URL(product.webPath ?? '', AH_ORIGIN).toString(),
    sourcePageUrl: context.sourcePageUrl,
    sourcePageTitle: context.sourcePageTitle,
  } satisfies BonusItem;
};
