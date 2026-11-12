import type { EquityOverview, ShareholderDto } from '@onyxhawk/types';

import { monthLabel, monthRange, nairobiYearMonth } from '../dashboard/month';

/** What the Ownership page's figures cover. */
export type OwnershipScope = 'all-time' | 'this-month';

export const DEFAULT_SCOPE: OwnershipScope = 'all-time';

type PeriodBreakdown = 'periodIncomeCents' | 'periodExpensesCents' | 'periodProjects';

/** An equity overview as it arrives: a server older than the period's breakdown leaves it out. */
export type ReceivedEquityOverview = Omit<EquityOverview, PeriodBreakdown> & Partial<Pick<EquityOverview, PeriodBreakdown>>;

/** Every figure the Ownership page shows, for one scope. */
export type ScopeFigures = {
  /** The headline net profit. */
  netCents: number;
  /** Null when the server did not send it; the page then shows a dash. */
  incomeCents: number | null;
  expensesCents: number | null;
  projects: number | null;
  /** Each holder's share of the net profit, in table order. */
  holders: { shareholder: ShareholderDto; shareCents: number }[];
  /** Net profit the stakes do not cover; zero when they total 100%. */
  unallocatedCents: number;
  /** The table footer's "net profit to split". */
  footerNetCents: number;
};

/**
 * The page's figures for the chosen scope, all taken from that scope, so one
 * choice moves the headline, the supporting figures, the split, the table's
 * share column and its footer together. The overview is the one requested
 * for the current month, whose period figures are "This month".
 */
export function scopeFigures(overview: ReceivedEquityOverview, scope: OwnershipScope = DEFAULT_SCOPE): ScopeFigures {
  if (scope === 'this-month') {
    return {
      netCents: overview.periodNetCents,
      incomeCents: overview.periodIncomeCents ?? null,
      expensesCents: overview.periodExpensesCents ?? null,
      projects: overview.periodProjects ?? null,
      holders: overview.allocations.map((a) => ({ shareholder: a.shareholder, shareCents: a.periodShareCents })),
      unallocatedCents: overview.unallocatedPeriodCents,
      footerNetCents: overview.periodNetCents,
    };
  }
  const { allTime } = overview;
  return {
    netCents: allTime.totalNetCents,
    incomeCents: allTime.totalIncomeCents,
    expensesCents: allTime.totalExpensesCents,
    projects: allTime.totalProjects,
    holders: overview.allocations.map((a) => ({ shareholder: a.shareholder, shareCents: a.allTimeShareCents })),
    unallocatedCents: overview.unallocatedAllTimeCents,
    footerNetCents: allTime.totalNetCents,
  };
}

/**
 * The month `now` falls in on the Nairobi calendar: its first and last day as
 * YYYY-MM-DD, for the equity request, and its name, such as "November 2026".
 */
export function nairobiMonth(now: Date): { from: string; to: string; label: string } {
  const yearMonth = nairobiYearMonth(now);
  return { ...monthRange(yearMonth), label: monthLabel(yearMonth) };
}
