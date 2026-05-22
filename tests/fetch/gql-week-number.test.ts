import { describe, expect, it } from 'vitest';
import { getCurrentBonusWeek } from '../../src/utils/week.ts';

describe('getCurrentBonusWeek', () => {
  it('returns week 10 for Monday 2026-03-02', () => {
    const result = getCurrentBonusWeek(new Date('2026-03-02T12:00:00Z'));
    expect(result.weekNumber).toBe(10);
    expect(result.periodStart).toBe('2026-03-02');
    expect(result.periodEnd).toBe('2026-03-08');
  });

  it('returns week 10 for Sunday 2026-03-08', () => {
    const result = getCurrentBonusWeek(new Date('2026-03-08T12:00:00Z'));
    expect(result.weekNumber).toBe(10);
    expect(result.periodStart).toBe('2026-03-02');
    expect(result.periodEnd).toBe('2026-03-08');
  });

  it('returns week 1 for 2026-01-01 (Thursday)', () => {
    const result = getCurrentBonusWeek(new Date('2026-01-01T12:00:00Z'));
    expect(result.weekNumber).toBe(1);
    expect(result.periodStart).toBe('2025-12-29');
    expect(result.periodEnd).toBe('2026-01-04');
  });

  it('returns week 53 for 2025-12-29 (Monday)', () => {
    const result = getCurrentBonusWeek(new Date('2025-12-29T12:00:00Z'));
    expect(result.weekNumber).toBe(1);
    expect(result.periodStart).toBe('2025-12-29');
    expect(result.periodEnd).toBe('2026-01-04');
  });

  it('returns correct Monday-Sunday range for mid-week Wednesday', () => {
    const result = getCurrentBonusWeek(new Date('2026-03-04T12:00:00Z'));
    expect(result.periodStart).toBe('2026-03-02');
    expect(result.periodEnd).toBe('2026-03-08');
  });
});
