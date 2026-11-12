/**
 * What each of the Dashboard's breakdown charts shows, kept free of React so
 * it can be tested without a DOM.
 */

import type { Block } from './block-state';

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

/**
 * Whether anything was spent: a month with no expense in any category has no
 * whole to take shares of, so its card says so and draws no chart.
 */
export function hasExpenses(byCategoryCents: Record<string, number>): boolean {
  return Object.values(byCategoryCents).some((cents) => cents > 0);
}

// ── The section's cards ─────────────────────────────────────────────────────

/** One card of the breakdown section, and what it holds. */
export type BreakdownCard =
  | { card: 'service-line' | 'segment'; state: 'loading' | RevenueChartView }
  /** Both revenue charts as one card: their one request failed, or neither list is classified. */
  | { card: 'revenue'; state: 'failed' | 'nudge' }
  | { card: 'expenses'; state: 'loading' | 'failed' | 'chart' };

/**
 * The section's cards, in order, from its two requests. Each request answers
 * for its own cards only: expenses that fail to load leave the revenue charts
 * drawn, and the other way round. The revenue request feeds two charts, so
 * its failure is one card with one Retry. A failed request is never one of
 * the "nothing recorded" states: those are for a month the server answered for.
 */
export function breakdownCards(
  revenue: Block<{ byServiceLine: RevenueItem[]; bySegment: RevenueItem[] }>,
  expenses: Block<unknown>,
): BreakdownCard[] {
  const expensesCard: BreakdownCard = {
    card: 'expenses',
    state: expenses.status === 'loading' ? 'loading' : expenses.status === 'failed' ? 'failed' : 'chart',
  };

  if (revenue.status === 'loading') {
    return [{ card: 'service-line', state: 'loading' }, { card: 'segment', state: 'loading' }, expensesCard];
  }
  if (revenue.status === 'failed') return [{ card: 'revenue', state: 'failed' }, expensesCard];

  const views = revenueViews(revenue.data);
  if (views.combinedNudge) return [{ card: 'revenue', state: 'nudge' }, expensesCard];
  return [{ card: 'service-line', state: views.serviceLine }, { card: 'segment', state: views.segment }, expensesCard];
}
