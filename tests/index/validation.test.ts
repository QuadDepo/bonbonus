import { describe, expect, it } from 'vitest';
import { lookupProducts, search, searchRecipes } from '../../src/index.ts';

describe('search() argument validation', () => {
  it('rejects empty query', async () => {
    // @ts-expect-error -- intentionally invalid
    await expect(search({})).rejects.toThrow(TypeError);
  });

  it('rejects non-positive size', async () => {
    await expect(search({ query: 'pasta', size: 0 })).rejects.toThrow(TypeError);
  });

  it('rejects negative page', async () => {
    await expect(search({ query: 'pasta', page: -1 })).rejects.toThrow(TypeError);
  });

  it('rejects non-integer taxonomyId', async () => {
    await expect(search({ query: 'pasta', taxonomyId: 0 })).rejects.toThrow(TypeError);
  });
});

describe('lookupProducts() argument validation', () => {
  it('rejects empty array', async () => {
    await expect(lookupProducts([])).rejects.toThrow(TypeError);
  });

  it('rejects non-integer id', async () => {
    await expect(lookupProducts([1.5])).rejects.toThrow(TypeError);
  });

  it('rejects zero or negative id', async () => {
    await expect(lookupProducts([0])).rejects.toThrow(TypeError);
    await expect(lookupProducts([-1])).rejects.toThrow(TypeError);
  });
});

describe('searchRecipes() argument validation', () => {
  it('rejects empty query', async () => {
    // @ts-expect-error -- intentionally invalid
    await expect(searchRecipes({})).rejects.toThrow(TypeError);
  });

  it('rejects non-positive size', async () => {
    await expect(searchRecipes({ query: 'lasagne', size: 0 })).rejects.toThrow(TypeError);
  });
});
