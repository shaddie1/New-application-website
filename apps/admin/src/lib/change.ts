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
 * The two sides every change figure is worked out from, and the mode that
 * labels them: the comparison the server made, or, against an older server
 * that sends none, the whole month and the whole previous month with no mode.
 */
function comparedSides(overview: ReceivedOverview): {
  mode: ComparisonMode | undefined;
  current: OverviewComparison['current'];
  previous: OverviewComparison['previous'];
} {
  if (overview.comparison) return overview.comparison;
  return {
    mode: undefined,
    current: {
      revenueCents: overview.revenue.actual,
      netCents: overview.netProfit.actual,
      jobCount: overview.jobs.actual,
    },
    previous: {
      revenueCents: overview.previousRevenueCents,
      netCents: overview.previousNetCents,
      jobCount: overview.previousJobCount,
    },
  };
}

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
  if (!overview) return { mode: undefined, revenue: null, netProfit: null, jobs: null };
  const { mode, current, previous } = comparedSides(overview);
  return {
    mode,
    revenue: pctChange(current.revenueCents, previous.revenueCents),
    netProfit: pctChange(current.netCents, previous.netCents),
    jobs: pctChange(current.jobCount, previous.jobCount),
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
  const { current, previous } = comparedSides(overview);
  if (!(current.revenueCents > 0) || !(previous.revenueCents > 0)) return null;

  const points = Math.round(
    (current.netCents / current.revenueCents - previous.netCents / previous.revenueCents) * 100,
  );
  // A small fall rounds to -0, which is not the 0 a caller compares with.
  return points === 0 ? 0 : points;
}
