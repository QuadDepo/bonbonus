import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BonusCategoriesResponse } from '../../src/utils/types.ts';

const fixture: BonusCategoriesResponse = JSON.parse(
  readFileSync(new URL('../fixtures/bonus-categories.json', import.meta.url), 'utf8'),
);

describe('bonus categories response parsing', () => {
  it('parses categories from the response', () => {
    const categories = fixture.data?.bonusCategories ?? [];
    expect(categories).toHaveLength(2);
    expect(categories[0]?.title).toBe('Groente, aardappelen');
    expect(categories[1]?.title).toBe('Zuivel, eieren');
  });

  it('extracts promotions from categories', () => {
    const categories = fixture.data?.bonusCategories ?? [];
    const promotions = categories.flatMap((cat) => cat.promotions);
    expect(promotions).toHaveLength(3);
    expect(promotions[0]?.id).toBe('767205');
    expect(promotions[0]?.title).toBe('Alle AH groenten');
    expect(promotions[0]?.productCount).toBe(42);
    expect(promotions[0]?.periodStart).toBe('2026-03-02');
    expect(promotions[0]?.periodEnd).toBe('2026-03-08');
  });

  it('computes total product count across all promotions', () => {
    const categories = fixture.data?.bonusCategories ?? [];
    const total = categories
      .flatMap((cat) => cat.promotions)
      .reduce((sum, p) => sum + p.productCount, 0);
    expect(total).toBe(85);
  });
});
