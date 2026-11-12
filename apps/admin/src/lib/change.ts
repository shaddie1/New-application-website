import type { ComparisonMode, DashboardOverview, OverviewComparison, OverviewSeriesMonth } from '@onyxhawk/types';

/** Percent change, or null when there is no previous figure to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

const COMPARED_WITH: Record<ComparisonMode, string> = {
  'same-period': 'same period last month',
  'full-month': 'previous month',
};

/**
 * The line beside a change figure: "vs same period last month", "vs previous
 * month", or "vs last month" when the server is too old to say which
 * comparison it made. `previous`, when given, is the figure compared against:
 * "vs KSh 12k previous month".
 */
export function changeLabel(mode: ComparisonMode | undefined, previous?: string): string {
  const comparedWith = mode ? COMPARED_WITH[mode] : 'last month';
  return previous === undefined ? `vs ${comparedWith}` : `vs ${previous} ${comparedWith}`;
}

/** An overview as it arrives: an older server leaves out `comparison` and `series`. */
export type ReceivedOverview = Omit<DashboardOverview, 'comparison' | 'series'> & {
  comparison?: OverviewComparison;
  series?: OverviewSeriesMonth[];
};

/**
 * The percent change of an overview's three figures, and the mode that labels
 * them. Each is worked out from the comparison's two sides. Against an older
 * server that sends no comparison, the whole month is set against the whole
 * previous month, as before, and the mode is undefined.
 */
export function overviewChanges(overview: ReceivedOverview | null): {
  mode: ComparisonMode | undefined;
  revenue: number | null;
  netProfit: number | null;
  jobs: number | null;
} {
  const comparison = overview?.comparison;
  if (comparison) {
    const { current, previous } = comparison;
    return {
      mode: comparison.mode,
      revenue: pctChange(current.revenueCents, previous.revenueCents),
      netProfit: pctChange(current.netCents, previous.netCents),
      jobs: pctChange(current.jobCount, previous.jobCount),
    };
  }
  return {
    mode: undefined,
    revenue: pctChange(overview?.revenue.actual ?? 0, overview?.previousRevenueCents ?? 0),
    netProfit: pctChange(overview?.netProfit.actual ?? 0, overview?.previousNetCents ?? 0),
    jobs: pctChange(overview?.jobs.actual ?? 0, overview?.previousJobCount ?? 0),
  };
}

/**
 * How far the margin (net profit as a share of revenue) moved, in whole
 * percentage points: 72% against 66% is 6, and 50% against 60% is -10. It is
 * the difference of the two margins, not a percent change of one, so it reads
 * as "points" and never as "%". The two sides are the comparison's, as in
 * `overviewChanges`, or the whole month against the whole previous month for
 * an older server. Null when either side has no revenue: a side without
 * revenue has no margin, so there is nothing to subtract.
 */
export function marginPointsChange(overview: ReceivedOverview | null): number | null {
  if (!overview) return null;
  const comparison = overview.comparison;
  const current = comparison
    ? { revenue: comparison.current.revenueCents, net: comparison.current.netCents }
    : { revenue: overview.revenue.actual, net: overview.netProfit.actual };
  const previous = comparison
    ? { revenue: comparison.previous.revenueCents, net: comparison.previous.netCents }
    : { revenue: overview.previousRevenueCents, net: overview.previousNetCents };
  if (!(current.revenue > 0) || !(previous.revenue > 0)) return null;

  const points = Math.round((current.net / current.revenue - previous.net / previous.revenue) * 100);
  // A small fall rounds to -0, which is not the 0 a caller compares with.
  return points === 0 ? 0 : points;
}
