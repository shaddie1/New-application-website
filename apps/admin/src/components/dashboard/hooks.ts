'use client';

import type {
  AdminStats,
  DashboardAccess,
  FinancialSummary,
  MonthlyTargetDto,
  OverviewSeriesMonth,
  OwnershipSummary,
  RevenueBreakdown,
} from '@onyxhawk/types';

import { api } from '../../lib/api';
import type { ReceivedOverview } from '../../lib/change';
import { mapBlock, type BlockResult } from './block-state';
import { monthRange, type YearMonth } from './month';
import { noActiveJobs } from './status';
import { useBlock } from './useBlock';

/**
 * The Dashboard's requests, one hook for each, and the only place they are
 * made from. A hook sends its request when the component that calls it
 * appears, so a section the account lacks is never asked for: its component
 * is never mounted. Two sections that read one answer share one call of the
 * hook, made above them both; calling a hook twice sends its request twice.
 *
 *   section              hook                                        address
 *   (which sections)     useDashboardAccess                          /admin/dashboard/access
 *   1 Needs attention    useAttention                                /admin/stats
 *   2 This month         useMonthOverview                            /admin/finance/overview
 *                        useSavedTargets, for next month's form      /admin/finance/targets
 *   3 Trend              useTrend, from the overview block           no request of its own
 *   4 Breakdown          useRevenueBreakdown, useExpenseSummary      /admin/finance/revenue-breakdown, /admin/financials/summary
 *   5 Ownership summary  useOwnershipSummary                         /admin/financials/ownership-summary
 */

/** Which sections the account has and what it may do there. The page asks this before anything else. */
export function useDashboardAccess(): BlockResult<DashboardAccess> {
  return useBlock(() => api.dashboardAccess().then((res) => res.access), []);
}

/** The live counts. They are always today's, so they do not follow the month. "Empty" when there are no active jobs. */
export function useAttention(): BlockResult<AdminStats> {
  return useBlock(() => api.stats().then((res) => res.stats), [], noActiveJobs);
}

/** The month's figures, targets and the series of months ending at it. */
export function useMonthOverview(month: YearMonth): BlockResult<ReceivedOverview> {
  return useBlock<ReceivedOverview>(
    () => api.overview(month.year, month.month).then((res) => res.overview),
    [month.year, month.month],
  );
}

/**
 * Every month's saved targets. The overview carries the targets of the month
 * on screen and no other, so this list is where next month's are read from
 * before the form for them opens.
 */
export function useSavedTargets(): BlockResult<MonthlyTargetDto[]> {
  return useBlock(() => api.targets().then((res) => res.targets), []);
}

/**
 * The trend's months, oldest first, ending at the month on screen. They come
 * in the overview's answer, so this takes that block and sends nothing: the
 * trend loads, fails and retries with the month's figures. An older server
 * sends no series, which reads as no months.
 */
export function useTrend(overview: BlockResult<ReceivedOverview>): BlockResult<OverviewSeriesMonth[]> {
  return mapBlock(overview, (answer) => answer.series ?? []);
}

/** The month's revenue by service line and by client segment. */
export function useRevenueBreakdown(month: YearMonth): BlockResult<RevenueBreakdown> {
  const { from, to } = monthRange(month);
  return useBlock(() => api.revenueBreakdown(from, to).then((res) => res.breakdown), [from, to]);
}

/** The month's income, expenses by category and net. */
export function useExpenseSummary(month: YearMonth): BlockResult<FinancialSummary> {
  const { from, to } = monthRange(month);
  return useBlock(() => api.financialSummary(from, to).then((res) => res.summary), [from, to]);
}

/** The month's net profit split between the current holders, with each holder's all-time share. */
export function useOwnershipSummary(month: YearMonth): BlockResult<OwnershipSummary> {
  return useBlock(
    () => api.ownershipSummary(month.year, month.month).then((res) => res.summary),
    [month.year, month.month],
  );
}
