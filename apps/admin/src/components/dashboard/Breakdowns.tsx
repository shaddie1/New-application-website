'use client';

import { Tags } from 'lucide-react';
import type { ExpenseCategory } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { money } from '../../lib/money';
import { DonutChart } from '../charts';
import { Card } from '../ui/card';
import { BlockFailed, Skeleton } from './BlockState';
import {
  holderSlices,
  profitShareView,
  revenueSlices,
  revenueViews,
  unclassifiedNote,
  type RevenueChartView,
  type RevenueItem,
} from './breakdown';
import { monthLabel, monthRange, type YearMonth } from './month';
import { TextLink } from './TextLink';
import { useBlock } from './useBlock';

/**
 * The Dashboard's part-to-whole charts. Each component here returns cards
 * meant to sit straight in the page's two-column grid, and each makes its own
 * request, so one that fails says so in its own card and the others stay.
 */

const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  MATERIALS: 'Materials',
  TRANSPORT: 'Transport',
  EMPLOYEE_PAY: 'Employee pay',
  LUNCH: 'Lunch',
  MISCELLANEOUS: 'Miscellaneous',
};

// `min-w-0` lets a card shrink below its longest legend label, so a long name
// wraps inside the card instead of pushing the page sideways on a phone.
function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('min-w-0 p-5', className)}>
      <h3 className="mb-5 text-xs uppercase tracking-widest text-charcoal-muted">{title}</h3>
      {children}
    </Card>
  );
}

// The height of a donut (`DONUT_SIZE` in charts.tsx), so a card keeps its
// shape whether it holds a chart, a note, a failure or a placeholder.
const CHART_HEIGHT = 'min-h-[128px]';

/** A chart's place when there is nothing to chart: one calm line, the height of a donut. */
function ChartNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        // Balanced lines, so a sentence a word too long does not leave that word alone on a second line.
        'flex flex-col items-center justify-center gap-3 text-balance rounded-lg bg-mist px-6 py-8 text-center text-sm text-charcoal-muted',
        CHART_HEIGHT,
      )}
    >
      {children}
    </div>
  );
}

/** A chart's place when its request failed: the same panel, saying so, with a way to ask again. */
function ChartFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return <BlockFailed what={what} onRetry={onRetry} className={cn('py-8', CHART_HEIGHT)} />;
}

function ChartLoading({ title }: { title: string }) {
  return (
    <ChartCard title={title}>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-5" aria-busy="true">
        {/* A ring, like the donut it stands for: the card shows through its middle. */}
        <span
          aria-hidden="true"
          className="block size-[128px] shrink-0 animate-pulse rounded-full border-[14px] border-border"
        />
        <div className="min-w-0 max-w-[22rem] flex-1 basis-56 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
        <span className="sr-only">Loading</span>
      </div>
    </ChartCard>
  );
}

/** Jobs & costs is the owner's page, so only the owner is given the way there. */
function JobsAndCostsLink({ isOwner }: { isOwner: boolean }) {
  if (!isOwner) return null;
  return (
    <TextLink href="/financials" className="shrink-0">
      Open Jobs &amp; costs
    </TextLink>
  );
}

// ── Revenue ─────────────────────────────────────────────────────────────────

const MISSING_NOUN = { 'service-line': 'service line', segment: 'client segment' } as const;

function RevenueChart({
  title, view, items, missing, month, isCurrentMonth, isOwner,
}: {
  title: string;
  view: RevenueChartView;
  items: RevenueItem[];
  /** What the unclassified jobs lack. */
  missing: 'service-line' | 'segment';
  month: string;
  isCurrentMonth: boolean;
  isOwner: boolean;
}) {
  return (
    <ChartCard title={title}>
      {view === 'chart' && <DonutChart slices={revenueSlices(items)} centreLabel="total revenue" />}
      {view === 'nudge' && (
        <ChartNote>
          {/* Only the owner can open Jobs & costs, so only the owner is told
              what to do there; everyone else is told what is missing. */}
          {isOwner ? (
            <p>
              None of the revenue in {month} has a {MISSING_NOUN[missing]} yet. Add one to each job to see the split
              here.
            </p>
          ) : (
            <p>{unclassifiedNote({ missing, month, isCurrentMonth })}</p>
          )}
          <JobsAndCostsLink isOwner={isOwner} />
        </ChartNote>
      )}
      {view === 'empty' && <ChartNote>No revenue recorded in {month}.</ChartNote>}
    </ChartCard>
  );
}

/**
 * Revenue by service line and by client segment, from one request. A chart
 * whose revenue is all unclassified would be one grey ring, so it gives way
 * to a nudge to classify the jobs; when both would, one nudge covers both.
 */
export function RevenueCharts({
  month, isCurrentMonth, isOwner,
}: {
  month: YearMonth;
  isCurrentMonth: boolean;
  isOwner: boolean;
}) {
  const { from, to } = monthRange(month);
  const block = useBlock(() => api.revenueBreakdown(from, to).then((res) => res.breakdown), [from, to]);
  const label = monthLabel(month);

  if (block.status === 'loading') {
    return (
      <>
        <ChartLoading title="Revenue by service line" />
        <ChartLoading title="Revenue by client segment" />
      </>
    );
  }

  // One request feeds both charts, so one failure and one Retry stand for both.
  // It never falls through to "No revenue recorded": that line is only for a
  // month the server answered for.
  if (block.status === 'failed') {
    return (
      <ChartCard title="Revenue by service line and client segment" className="lg:col-span-2">
        <ChartFailed what={`the revenue charts for ${label}`} onRetry={block.retry} />
      </ChartCard>
    );
  }

  const breakdown = block.data;
  const views = revenueViews(breakdown);

  if (views.combinedNudge) {
    return (
      <Card className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-4 p-5 lg:col-span-2">
        <div className="flex min-w-0 flex-1 basis-80 items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning"
          >
            <Tags className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-charcoal">
              Revenue for {label} is not classified yet
            </h3>
            <p className="mt-1 max-w-prose text-sm text-charcoal-muted">
              {isOwner ? (
                <>
                  None of the <span className="figure">{money(breakdown.totalIncomeCents)}</span> recorded has a
                  service line or a client segment. Add them to each job to see where the revenue comes from.
                </>
              ) : (
                unclassifiedNote({ missing: 'both', month: label, isCurrentMonth })
              )}
            </p>
          </div>
        </div>
        <JobsAndCostsLink isOwner={isOwner} />
      </Card>
    );
  }

  return (
    <>
      <RevenueChart
        title="Revenue by service line"
        view={views.serviceLine}
        items={breakdown.byServiceLine}
        missing="service-line"
        month={label}
        isCurrentMonth={isCurrentMonth}
        isOwner={isOwner}
      />
      <RevenueChart
        title="Revenue by client segment"
        view={views.segment}
        items={breakdown.bySegment}
        missing="segment"
        month={label}
        isCurrentMonth={isCurrentMonth}
        isOwner={isOwner}
      />
    </>
  );
}

// ── Owner only ──────────────────────────────────────────────────────────────
// Mount these two for the owner alone: mounting one is what sends its request,
// and the server refuses both to everyone else.

/** The month's job expenses by category. */
export function ExpensesChart({ month }: { month: YearMonth }) {
  const { from, to } = monthRange(month);
  const block = useBlock(() => api.financialSummary(from, to).then((res) => res.summary), [from, to]);
  const title = 'Where the money went';

  if (block.status === 'loading') return <ChartLoading title={title} />;

  return (
    <ChartCard title={title}>
      {block.status === 'failed' ? (
        <ChartFailed what={`the expenses for ${monthLabel(month)}`} onRetry={block.retry} />
      ) : (
        <DonutChart
          slices={(Object.entries(block.data.expensesByCategoryCents) as [ExpenseCategory, number][]).map(
            ([category, cents]) => ({ key: category, label: EXPENSE_LABELS[category], value: cents }),
          )}
          centreLabel="total expenses"
          emptyLabel={`No expenses recorded in ${monthLabel(month)}.`}
        />
      )}
    </ChartCard>
  );
}

/** The month's net profit by shareholder, each in the colour they have on Ownership. */
export function ProfitShareChart({ month, isCurrentMonth }: { month: YearMonth; isCurrentMonth: boolean }) {
  const { from, to } = monthRange(month);
  const block = useBlock(() => api.equity(from, to).then((res) => res.overview), [from, to]);
  const title = 'Profit share';

  if (block.status === 'loading') return <ChartLoading title={title} />;
  if (block.status === 'failed') {
    return (
      <ChartCard title={title}>
        <ChartFailed what={`the profit share for ${monthLabel(month)}`} onRetry={block.retry} />
      </ChartCard>
    );
  }

  const view = profitShareView(block.data);
  const slices = holderSlices(block.data.allocations);

  return (
    <ChartCard title={title}>
      {view === 'chart' && (
        // Every holder keeps a slice of their own: folding the smallest into
        // "Other" would take a named person off the chart.
        <DonutChart slices={slices} maxSlices={slices.length} centreLabel="net profit shared" />
      )}
      {view === 'no-profit' && (
        <ChartNote>
          {isCurrentMonth
            ? 'There is no profit to share this month.'
            : `There was no profit to share in ${monthLabel(month)}.`}
        </ChartNote>
      )}
      {view === 'no-holders' && <ChartNote>No shareholders on the cap table.</ChartNote>}
    </ChartCard>
  );
}
