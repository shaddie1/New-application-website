import type { OverviewSeriesMonth } from '@onyxhawk/types';
import { describe, expect, it } from 'vitest';

import type { Block } from '../block-state';
import { hasFigures, trendPeriod, trendPoints, trendView } from './trend';

const LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `count` whole months ending at the given month, oldest first, as the overview sends them. */
function seriesEnding(year: number, month: number, count: number, figures = { revenueCents: 5_400_000, netCents: 3_880_000 }) {
  const months: OverviewSeriesMonth[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const index = year * 12 + (month - 1) - back;
    months.push({
      year: Math.floor(index / 12),
      month: (index % 12) + 1,
      label: LABELS[index % 12]!,
      jobCount: 2,
      ...figures,
    });
  }
  return months;
}

const loaded = (data: OverviewSeriesMonth[]): Block<OverviewSeriesMonth[]> => ({
  status: 'loaded',
  data,
  refreshing: false,
});

describe('trendPeriod', () => {
  it('names twelve months and the end month for a twelve-entry series ending August 2026', () => {
    expect(trendPeriod(seriesEnding(2026, 8, 12))).toBe('12 months to August 2026');
  });

  it('names six months when the server sends six', () => {
    expect(trendPeriod(seriesEnding(2026, 8, 6))).toBe('6 months to August 2026');
  });

  it('takes the end month from the data across a year boundary', () => {
    expect(trendPeriod(seriesEnding(2026, 1, 12))).toBe('12 months to January 2026');
  });

  it('writes one month in the singular', () => {
    expect(trendPeriod(seriesEnding(2026, 8, 1))).toBe('1 month to August 2026');
  });

  it('has nothing to name when the server sent no months', () => {
    expect(trendPeriod([])).toBeNull();
  });
});

describe('trendPoints', () => {
  it('plots each month, oldest first, with revenue as its income', () => {
    const points = trendPoints(seriesEnding(2026, 8, 3));
    expect(points).toEqual([
      { label: 'Jun', incomeCents: 5_400_000, netCents: 3_880_000 },
      { label: 'Jul', incomeCents: 5_400_000, netCents: 3_880_000 },
      { label: 'Aug', incomeCents: 5_400_000, netCents: 3_880_000 },
    ]);
  });
});

describe('hasFigures', () => {
  it('is false when every month is zero, so the chart gives its empty message', () => {
    const points = trendPoints(seriesEnding(2026, 8, 12, { revenueCents: 0, netCents: 0 }));
    expect(hasFigures(points)).toBe(false);
  });

  it('is true when any month has income or a net figure, a loss included', () => {
    const zero = trendPoints(seriesEnding(2026, 8, 11, { revenueCents: 0, netCents: 0 }));
    expect(hasFigures([...zero, { label: 'Aug', incomeCents: 0, netCents: -120_000 }])).toBe(true);
    expect(hasFigures([...zero, { label: 'Aug', incomeCents: 5_400_000, netCents: 0 }])).toBe(true);
  });
});

describe('trendView', () => {
  it('is the section error, with no chart, for a failed block', () => {
    expect(trendView({ status: 'failed', httpStatus: 500 })).toEqual({ kind: 'failed' });
    expect(trendView({ status: 'failed' })).toEqual({ kind: 'failed' });
  });

  it('is the skeleton while the block loads', () => {
    expect(trendView({ status: 'loading' })).toEqual({ kind: 'loading' });
  });

  it('is the chart, titled from the data, for a loaded block', () => {
    const view = trendView(loaded(seriesEnding(2026, 8, 12)));
    expect(view).toMatchObject({ kind: 'chart', period: '12 months to August 2026' });
    expect(view.kind === 'chart' && view.points).toHaveLength(12);
  });

  it('is still the chart for an all-zero series: the chart itself says there is nothing to plot', () => {
    const view = trendView(loaded(seriesEnding(2026, 8, 12, { revenueCents: 0, netCents: 0 })));
    expect(view.kind).toBe('chart');
    expect(view.kind === 'chart' && hasFigures(view.points)).toBe(false);
  });

  it('keeps the chart on screen while a loaded block is asked again', () => {
    const view = trendView({ status: 'loaded', data: seriesEnding(2026, 8, 12), refreshing: true });
    expect(view.kind).toBe('chart');
  });
});
