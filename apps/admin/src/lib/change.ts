import type { ComparisonMode, DashboardOverview, OverviewComparison } from '@onyxhawk/types';

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

/** An overview as it arrives: a server older than `comparison` leaves it out. */
export type ReceivedOverview = Omit<DashboardOverview, 'comparison'> & { comparison?: OverviewComparison };

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
