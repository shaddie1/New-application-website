import { describe, expect, it } from 'vitest';
import { changeLabel, marginPointsChange, overviewChanges, pctChange, type ReceivedOverview } from './change';

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

describe('marginPointsChange', () => {
  /** An overview whose comparison has these two sides: [revenue, net] now and before. */
  const compared = (current: [number, number], previous: [number, number]): ReceivedOverview => ({
    ...olderServer,
    comparison: {
      mode: 'same-period',
      cutoffDay: 12,
      current: { revenueCents: current[0], netCents: current[1], jobCount: 1 },
      previous: { revenueCents: previous[0], netCents: previous[1], jobCount: 1 },
    },
  });

  it('gives the rise in whole percentage points', () => {
    // 72% now against 71% before.
    expect(marginPointsChange(compared([5_400_000, 3_888_000], [10_000_000, 7_100_000]))).toBe(1);
  });

  it('gives a fall as a negative number of points', () => {
    // 50% now against 60% before.
    expect(marginPointsChange(compared([800_000, 400_000], [500_000, 300_000]))).toBe(-10);
  });

  it('is zero when the two margins are equal, whatever the revenue', () => {
    expect(marginPointsChange(compared([800_000, 400_000], [300_000, 150_000]))).toBe(0);
  });

  it('rounds a difference smaller than half a point to zero, never to minus zero', () => {
    // 49.8% now against 50% before.
    expect(marginPointsChange(compared([1_000_000, 498_000], [1_000_000, 500_000]))).toBe(0);
  });

  it('measures a month that lost money against one that made it', () => {
    // A margin of minus 25% now against 50% before.
    expect(marginPointsChange(compared([400_000, -100_000], [500_000, 250_000]))).toBe(-75);
  });

  it('has no figure when the previous side has no revenue', () => {
    expect(marginPointsChange(compared([800_000, 400_000], [0, -50_000]))).toBeNull();
  });

  it('has no figure when the current side has no revenue', () => {
    expect(marginPointsChange(compared([0, -50_000], [500_000, 300_000]))).toBeNull();
  });

  it('falls back to whole month against whole previous month for an older server', () => {
    // 3,880,000 of 5,400,000 is 71.9%; 10,800,000 of 16,500,000 is 65.5%.
    expect(marginPointsChange(olderServer)).toBe(6);
    expect(marginPointsChange({ ...olderServer, previousRevenueCents: 0 })).toBeNull();
  });

  it('has no figure when there is no overview', () => {
    expect(marginPointsChange(null)).toBeNull();
  });
});
