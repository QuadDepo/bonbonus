import { describe, expect, it } from 'vitest';
import { AhSourceChangedError } from '../../src/utils/errors.ts';

describe('error contracts', () => {
  it('exposes named scraper errors', () => {
    expect(new AhSourceChangedError('x').name).toBe('AhSourceChangedError');
  });
});
