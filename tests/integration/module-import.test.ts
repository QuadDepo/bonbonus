import { describe, expect, it } from 'vitest';
import { extractBonusItems } from '../../src/index.ts';

describe('module exports', () => {
  it('exports extractBonusItems', () => {
    expect(typeof extractBonusItems).toBe('function');
  });
});
