import { describe, expect, it } from 'vitest';
import { changeLabel, overviewChanges, pctChange, type ReceivedOverview } from './change';

const progress = (actual: number) => ({ actual, target: 0, percent: 0 });

/** An overview as an older server sends it: whole months, no comparison. */
const olderServer: ReceivedOverview = {
  year: 2026,
  month: 11,
  monthLabel: 'November 2026',
  revenue: progress(5_400_000),
  netProfit: progress(3_880_000),
  jobs: progress(2),
  previousRevenueCents: 16_500_000,
  previousNetCents: 10_800_000,
  previousJobCount: 4,
  hasTargets: false,
};

describe('pctChange', () => {
  it('gives the rounded percentage against the previous figure', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 200)).toBe(-75);
  });

  it('has no percentage when there is nothing to compare against', () => {
    expect(pctChange(500, 0)).toBeNull();
  });

  it('measures against the size of a previous loss', () => {
    expect(pctChange(100, -200)).toBe(150);
  });
});

describe('changeLabel', () => {
  it('names the comparison the server made', () => {
    expect(changeLabel('same-period')).toBe('vs same period last month');
    expect(changeLabel('full-month')).toBe('vs previous month');
  });

  it('keeps the old wording for a server that does not say', () => {
    expect(changeLabel(undefined)).toBe('vs last month');
  });

  it('can carry the figure compared against', () => {
    expect(changeLabel('same-period', 'KSh 35k')).toBe('vs KSh 35k same period last month');
  });
});

describe('overviewChanges', () => {
  it('uses the two sides of the comparison, not the whole-month headline', () => {
    const changes = overviewChanges({
      ...olderServer,
      comparison: {
        mode: 'same-period',
        cutoffDay: 12,
        current: { revenueCents: 900_000, netCents: 780_000, jobCount: 1 },
        previous: { revenueCents: 600_000, netCents: 390_000, jobCount: 2 },
      },
    });
    expect(changes).toEqual({ mode: 'same-period', revenue: 50, netProfit: 100, jobs: -50 });
  });

  it('falls back to whole month against whole previous month for an older server', () => {
    expect(overviewChanges(olderServer)).toEqual({ mode: undefined, revenue: -67, netProfit: -64, jobs: -50 });
  });

  it('has no percentages when the previous side is empty', () => {
    const changes = overviewChanges({
      ...olderServer,
      comparison: {
        mode: 'same-period',
        cutoffDay: 1,
        current: { revenueCents: 900_000, netCents: 780_000, jobCount: 1 },
        previous: { revenueCents: 0, netCents: 0, jobCount: 0 },
      },
    });
    expect(changes).toEqual({ mode: 'same-period', revenue: null, netProfit: null, jobs: null });
  });
});
