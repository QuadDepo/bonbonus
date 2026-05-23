import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  mapProductSearchResponse,
  mapProductsResponse,
  mapRecipeSearchResponse,
} from '../../src/fetch/gql.ts';
import { AhSourceChangedError } from '../../src/utils/errors.ts';

const productSearchFixture = JSON.parse(
  readFileSync(new URL('../fixtures/product-search.json', import.meta.url), 'utf8'),
);

const recipeSearchFixture = JSON.parse(
  readFileSync(new URL('../fixtures/recipe-search.json', import.meta.url), 'utf8'),
);

describe('mapProductSearchResponse', () => {
  it('maps products into ProductSummary[]', () => {
    const products = mapProductSearchResponse(productSearchFixture);

    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      id: '597485',
      title: 'AH Lasagne ei 2-pack',
      isBonus: true,
      bonusMechanic: '5% volume voordeel',
      productSize: '2 stuks',
      category: 'Lasagnebladen',
      url: 'https://www.ah.nl/producten/product/wi597485/ah-lasagne-ei-2-pack',
    });
    expect(products[0]?.tags).toContain('bonus');
    expect(products[0]?.priceText).toMatch(/3,02/);
  });

  it('flags non-bonus products as isBonus: false', () => {
    const products = mapProductSearchResponse(productSearchFixture);
    expect(products[1]?.isBonus).toBe(false);
    expect(products[1]?.bonusMechanic).toBeUndefined();
  });

  it('throws AhSourceChangedError when productSearch field is missing', () => {
    expect(() => mapProductSearchResponse({ data: {} })).toThrow(AhSourceChangedError);
  });
});

describe('mapProductsResponse', () => {
  it('maps a products payload into ProductSummary[]', () => {
    const response = {
      data: { products: productSearchFixture.data.productSearch.products },
    };
    const products = mapProductsResponse(response);
    expect(products).toHaveLength(2);
    expect(products[0]?.id).toBe('597485');
  });

  it('throws AhSourceChangedError when products field is missing', () => {
    expect(() => mapProductsResponse({ data: {} })).toThrow(AhSourceChangedError);
  });

  it('throws AhNetworkError (not AhSourceChangedError) when AH returns GraphQL errors', () => {
    const response = { data: null, errors: [{ message: 'Subgraph errors redacted' }] };
    // @ts-expect-error -- testing the error envelope, not the success shape
    expect(() => mapProductsResponse(response)).toThrow(/Subgraph errors redacted/);
    // @ts-expect-error -- same
    expect(() => mapProductsResponse(response)).not.toThrow(AhSourceChangedError);
  });
});

describe('mapRecipeSearchResponse', () => {
  it('maps result into RecipeSummary[] and drops rows missing id/title/slug', () => {
    const recipes = mapRecipeSearchResponse(recipeSearchFixture);

    expect(recipes).toHaveLength(2);
    expect(recipes[0]).toEqual({
      id: 1202268,
      title: 'Lasagne met venkel en geitenkaas',
      slug: 'lasagne-met-venkel-en-geitenkaas',
      url: 'https://www.ah.nl/allerhande/recept/R-R1202268/lasagne-met-venkel-en-geitenkaas',
      rating: 4,
      courses: ['hoofdgerecht'],
      diet: ['vegetarisch', 'zonder vlees/vis'],
    });
  });

  it('throws AhSourceChangedError when recipeSearch field is missing', () => {
    expect(() => mapRecipeSearchResponse({ data: {} })).toThrow(AhSourceChangedError);
  });
});
