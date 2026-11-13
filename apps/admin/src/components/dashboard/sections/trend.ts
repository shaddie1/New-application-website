import type { OverviewSeriesMonth } from '@onyxhawk/types';

import type { Block } from '../block-state';
import { monthLabel } from '../month';

/**
 * What the trend section shows for the months the overview carries, kept free
 * of React so the rules can be tested without a DOM.
 */

/** One month of the trend chart. */
export type TrendPoint = { label: string; incomeCents: number; netCents: number };

/** The months as the chart plots them, oldest first. A month's revenue is its income. */
export function trendPoints(series: OverviewSeriesMonth[]): TrendPoint[] {
  return series.map((m) => ({ label: m.label, incomeCents: m.revenueCents, netCents: m.netCents }));
}

/**
 * False when every month is zero. The chart then draws its empty plot and
 * says there is nothing to chart yet, where a flat line along zero would read
 * as twelve months of nothing earned.
 */
export function hasFigures(points: TrendPoint[]): boolean {
  return points.some((p) => p.incomeCents !== 0 || p.netCents !== 0);
}

/**
 * What the trend covers, read from the months themselves: "12 months to
 * August 2026", or "6 months to …" against a server that sends six. Null when
 * there are no months to name.
 */
export function trendPeriod(series: OverviewSeriesMonth[]): string | null {
  const last = series[series.length - 1];
  if (last === undefined) return null;
  const count = series.length;
  return `${count} ${count === 1 ? 'month' : 'months'} to ${monthLabel(last)}`;
}

export type TrendView =
  | { kind: 'loading' }
  /** The months could not be loaded: the section says so, and draws no chart. */
  | { kind: 'failed' }
  | { kind: 'chart'; period: string | null; points: TrendPoint[] };

export function trendView(block: Block<OverviewSeriesMonth[]>): TrendView {
  if (block.status === 'loading') return { kind: 'loading' };
  if (block.status === 'failed') return { kind: 'failed' };
  return { kind: 'chart', period: trendPeriod(block.data), points: trendPoints(block.data) };
}
