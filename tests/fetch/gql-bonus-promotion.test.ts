import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractProductsFromBonusPromotionResponse } from '../../src/fetch/gql.ts';

const bonusPromotion = JSON.parse(
  readFileSync(new URL('../fixtures/bonus-promotion-767218.json', import.meta.url), 'utf8'),
);

describe('gql bonus promotion extraction', () => {
  it('normalizes products from a bonus promotion payload', () => {
    const items = extractProductsFromBonusPromotionResponse(bonusPromotion, {
      promotionId: '767218',
      promotionTitle: 'Alle A-merk peulvruchten conserven',
      periodStart: '2026-03-02',
      periodEnd: '2026-03-08',
    });

    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('Hak Witte bonen in tomatensaus');
    expect(items[0]?.bonusMechanic).toBe('1 + 1 gratis');
    expect(items[0]?.validFrom).toBe('2026-03-02T00:00:00.000Z');
    expect(items[0]?.url).toBe('https://www.ah.nl/producten/product/wi202196/hak-witte-bonen-in-tomatensaus');
    expect(items[0]?.tags).toContain('bonus');
  });
});
