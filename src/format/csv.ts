import type { BonusItem } from '../utils/types.ts';

const TAG_COLUMNS = [
  ['tag_bonus', 'bonus'],
  ['tag_vandaag', 'vandaag'],
  ['tag_available_in_store', 'available_in_store'],
  ['tag_nutriscore_b', 'nutriscore_b'],
  ['tag_nutriscore_c', 'nutriscore_c'],
] as const;

const CORE_COLUMNS = [
  'id',
  'gtin',
  'title',
  'subtitle',
  'priceText',
  'bonusMechanic',
  'validFrom',
  'validUntil',
  'imageUrl',
  'productSize',
  'category',
  'url',
  'sourcePageUrl',
  'sourcePageTitle',
] as const;

const escapeCsvValue = (value: string) => {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
};

const toCell = (value: string | null | undefined) => escapeCsvValue(value ?? '');

const toRow = (item: BonusItem) => {
  const tags = new Set(item.tags);
  const coreValues = CORE_COLUMNS.map((column) => toCell(item[column]));
  const tagValues = TAG_COLUMNS.map(([, tag]) => String(tags.has(tag)));
  return [...coreValues, ...tagValues].join(',');
};

export const toCsv = (items: BonusItem[]) => {
  const header = [
    ...CORE_COLUMNS,
    ...TAG_COLUMNS.map(([column]) => column),
  ].join(',');

  const rows = items.map(toRow);
  return [header, ...rows].join('\r\n');
};
