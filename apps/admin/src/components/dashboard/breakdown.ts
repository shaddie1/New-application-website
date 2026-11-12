/**
 * What each of the Dashboard's breakdown charts shows, kept free of React so
 * it can be tested without a DOM.
 */

/** The key the server files revenue under when a job has no service line or client segment. */
export const UNKNOWN_KEY = '__unknown';

export type RevenueItem = { key: string; label: string; incomeCents: number };

/**
 * "chart": some revenue is classified. "nudge": there is revenue and none of
 * it is classified, so a chart would be one slice of "Unclassified". "empty":
 * no revenue.
 */
export type RevenueChartView = 'chart' | 'nudge' | 'empty';

/** Decided from the key, never the label, which is only wording. */
export function revenueChartView(items: RevenueItem[]): RevenueChartView {
  const earning = items.filter((i) => i.incomeCents > 0);
  if (earning.length === 0) return 'empty';
  return earning.every((i) => i.key === UNKNOWN_KEY) ? 'nudge' : 'chart';
}

/** Both revenue charts. When both are nudges the page shows one, not two. */
export function revenueViews(lists: { byServiceLine: RevenueItem[]; bySegment: RevenueItem[] }): {
  serviceLine: RevenueChartView;
  segment: RevenueChartView;
  combinedNudge: boolean;
} {
  const serviceLine = revenueChartView(lists.byServiceLine);
  const segment = revenueChartView(lists.bySegment);
  return { serviceLine, segment, combinedNudge: serviceLine === 'nudge' && segment === 'nudge' };
}

/**
 * What a nudge says to someone who cannot open Jobs & costs: the fact, with
 * no instruction they cannot act on. (The owner is told what to add, and is
 * given the link.) A past month is named; only the month still running is
 * "this month".
 */
export function unclassifiedNote({
  missing, month, isCurrentMonth,
}: {
  missing: 'service-line' | 'segment' | 'both';
  /** The month on screen: "November 2026". */
  month: string;
  isCurrentMonth: boolean;
}): string {
  const what = {
    'service-line': 'Service lines',
    segment: 'Client segments',
    both: 'Service lines and client segments',
  }[missing];
  const jobs = isCurrentMonth ? "this month's jobs" : `the ${month} jobs`;
  return `${what} have not been added to ${jobs} yet.`;
}

export type ChartSlice = { key: string; label: string; value: number; color?: string };

/**
 * A revenue list as donut slices. Unclassified revenue is a remainder, not a
 * category, so it is drawn in the neutral grey; the others carry no colour of
 * their own and take the chart's colours in turn.
 */
export function revenueSlices(items: RevenueItem[]): ChartSlice[] {
  return items.map((i) => ({
    key: i.key,
    label: i.label,
    value: i.incomeCents,
    ...(i.key === UNKNOWN_KEY ? { color: 'var(--chart-other)' } : {}),
  }));
}

// ── Profit share ────────────────────────────────────────────────────────────

type Allocation = { shareholder: { id: string; name: string }; periodShareCents: number };

export type HolderSlice = { key: string; label: string; value: number; color: string };

/** As on the Ownership page: the first five holders take a colour, the rest share the neutral grey. */
const COLOURED_HOLDERS = 5;

/**
 * One slice per holder, in table order. A holder's colour is the colour of
 * their place in the table, so it is the same here and on Ownership and does
 * not move when the shares change. The label is the name alone: the chart's
 * legend already gives each share.
 */
export function holderSlices(allocations: Allocation[]): HolderSlice[] {
  return allocations.map((a, index) => ({
    key: a.shareholder.id,
    label: a.shareholder.name,
    value: Math.max(0, a.periodShareCents),
    color: index < COLOURED_HOLDERS ? `var(--chart-${index + 1})` : 'var(--chart-other)',
  }));
}

/** A loss or a break-even month has no profit to share, whoever holds what. */
export function profitShareView(overview: {
  periodNetCents: number;
  allocations: Allocation[];
}): 'chart' | 'no-profit' | 'no-holders' {
  if (overview.periodNetCents <= 0) return 'no-profit';
  return overview.allocations.length === 0 ? 'no-holders' : 'chart';
}
