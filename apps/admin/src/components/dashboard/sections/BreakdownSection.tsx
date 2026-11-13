'use client';

import { ChartPie, Tags } from 'lucide-react';
import type { ExpenseCategory, FinancialSummary, RevenueBreakdown } from '@onyxhawk/types';

import { cn } from '../../../lib/cn';
import { money } from '../../../lib/money';
import { DonutChart } from '../../charts';
import { Card } from '../../ui/card';
import type { BlockResult } from '../block-state';
import { BlockFailed, QUIET_PANEL, Skeleton } from '../BlockState';
import {
  breakdownCards,
  hasExpenses,
  revenueSlices,
  unclassifiedNote,
  type RevenueChartView,
  type RevenueItem,
} from '../breakdown';
import { isSameMonth, monthLabel, type YearMonth } from '../month';
import { TextLink } from '../TextLink';
import { SectionHeading } from './SectionHeading';

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
    <Card accent="breakdown" className={cn('min-w-0 p-5', className)}>
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
        QUIET_PANEL,
        // Balanced lines, so a sentence a word too long does not leave that word alone on a second line.
        'flex flex-col items-center justify-center gap-3 text-balance px-6 py-8 text-center text-sm text-charcoal-muted',
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

function ChartLoading({ title, className, chartClassName }: { title: string; className?: string; chartClassName?: string }) {
  return (
    <ChartCard title={title} className={className}>
      <div className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-5', chartClassName)} aria-busy="true">
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
      </div>
      {/* Said from outside the busy part, and by the card's own name: "Loading revenue by service line". */}
      <span role="status" className="sr-only">Loading {title.charAt(0).toLowerCase() + title.slice(1)}</span>
    </ChartCard>
  );
}

/** The way to Jobs & costs, given only to a viewer who can open that page. */
function JobsAndCostsLink({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <TextLink href="/financials" className="shrink-0">
      Open Jobs &amp; costs
    </TextLink>
  );
}

const REVENUE_TITLES = { 'service-line': 'Revenue by service line', segment: 'Revenue by client segment' } as const;
const MISSING_NOUN = { 'service-line': 'service line', segment: 'client segment' } as const;
const EXPENSES_TITLE = 'Where the money went';
/** The expenses card has a row to itself, so it takes the row's whole width. */
const FULL_ROW = 'lg:col-span-2';
/**
 * A chart in a card that takes the whole row keeps the width it has in a card
 * that takes half of it, in the middle of the card. Left to fill the row, the
 * legend's amounts end up far from the names they belong to.
 */
const CHART_IN_FULL_ROW = 'mx-auto max-w-md';

function RevenueChart({
  chart, view, items, month, isCurrentMonth, canOpenJobsAndCosts,
}: {
  /** Which split this is, and so what its unclassified jobs lack. */
  chart: 'service-line' | 'segment';
  view: RevenueChartView;
  items: RevenueItem[];
  month: string;
  isCurrentMonth: boolean;
  canOpenJobsAndCosts: boolean;
}) {
  return (
    <ChartCard title={REVENUE_TITLES[chart]}>
      {view === 'chart' && <DonutChart slices={revenueSlices(items)} centreLabel="total revenue" />}
      {view === 'nudge' && (
        <ChartNote>
          {/* Whoever can open Jobs & costs is told what to do there; everyone
              else is told what is missing, with no instruction they cannot act on. */}
          {canOpenJobsAndCosts ? (
            <p>
              None of the revenue in {month} has a {MISSING_NOUN[chart]} yet. Add one to each job to see the split
              here.
            </p>
          ) : (
            <p>{unclassifiedNote({ missing: chart, month, isCurrentMonth })}</p>
          )}
          <JobsAndCostsLink show={canOpenJobsAndCosts} />
        </ChartNote>
      )}
      {view === 'empty' && <ChartNote>No revenue recorded in {month}.</ChartNote>}
    </ChartCard>
  );
}

/**
 * Section 4, "Breakdown": the month's revenue by service line and by client
 * segment, and its expenses by category, each drawn once.
 *
 * It has two requests, handed in as two blocks, and each answers for its own
 * cards: expenses that fail to load leave the revenue charts drawn, and the
 * other way round (`breakdownCards` holds that rule). A revenue chart whose
 * revenue is all unclassified would be one grey ring, so it gives way to a
 * nudge to classify the jobs; when both would, one nudge covers both.
 */
export function BreakdownSection({
  revenue, expenses, month, current, canOpenJobsAndCosts,
}: {
  /** Revenue by service line and by client segment, from `useRevenueBreakdown`. */
  revenue: BlockResult<RevenueBreakdown>;
  /** Expenses by category, from `useExpenseSummary`. */
  expenses: BlockResult<FinancialSummary>;
  /** The month on screen. */
  month: YearMonth;
  /** The current month in Nairobi. */
  current: YearMonth;
  /** The viewer can open Jobs & costs, where a job is given its service line and client segment. */
  canOpenJobsAndCosts: boolean;
}) {
  const label = monthLabel(month);
  const isCurrentMonth = isSameMonth(month, current);
  const breakdown = revenue.status === 'loaded' || revenue.status === 'empty' ? revenue.data : null;
  const summary = expenses.status === 'loaded' || expenses.status === 'empty' ? expenses.data : null;

  return (
    <section id="breakdown" aria-labelledby="breakdown-heading">
      <SectionHeading id="breakdown-heading" section="breakdown" icon={ChartPie} title="Breakdown" note={label} />

      {/* Part-to-whole views of the month. Each card is one grid cell and
          carries `min-w-0`, so a long legend label wraps inside its card. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {breakdownCards(revenue, expenses).map((card) => {
          if (card.card === 'revenue') {
            // One request feeds both revenue charts, so one failure and one Retry stand for both.
            if (card.state === 'failed') {
              return (
                <ChartCard key="revenue" title="Revenue by service line and client segment" className={FULL_ROW}>
                  <ChartFailed what={`the revenue charts for ${label}`} onRetry={revenue.retry} />
                </ChartCard>
              );
            }
            return (
              <Card
                key="revenue"
                accent="breakdown"
                className={cn('flex min-w-0 flex-wrap items-center gap-x-6 gap-y-4 p-5', FULL_ROW)}
              >
                <div className="flex min-w-0 flex-1 basis-80 items-start gap-4">
                  {/* Gold: something here needs attention. */}
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-attention-tint text-attention"
                  >
                    <Tags className="size-5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-charcoal">Revenue for {label} is not classified yet</h3>
                    <p className="mt-1 max-w-prose text-sm text-charcoal-muted">
                      {canOpenJobsAndCosts && breakdown ? (
                        <>
                          None of the <span className="figure">{money(breakdown.totalIncomeCents)}</span> recorded has
                          a service line or a client segment. Add them to each job to see where the revenue comes
                          from.
                        </>
                      ) : (
                        unclassifiedNote({ missing: 'both', month: label, isCurrentMonth })
                      )}
                    </p>
                  </div>
                </div>
                <JobsAndCostsLink show={canOpenJobsAndCosts} />
              </Card>
            );
          }

          if (card.card === 'expenses') {
            if (card.state === 'loading') {
              return (
                <ChartLoading
                  key="expenses"
                  title={EXPENSES_TITLE}
                  className={FULL_ROW}
                  chartClassName={CHART_IN_FULL_ROW}
                />
              );
            }
            return (
              <ChartCard key="expenses" title={EXPENSES_TITLE} className={FULL_ROW}>
                {card.state === 'failed' || !summary ? (
                  <ChartFailed what={`the expenses for ${label}`} onRetry={expenses.retry} />
                ) : !hasExpenses(summary.expensesByCategoryCents) ? (
                  <ChartNote>No expenses recorded in {label}.</ChartNote>
                ) : (
                  <div className={CHART_IN_FULL_ROW}>
                    <DonutChart
                      slices={(Object.entries(summary.expensesByCategoryCents) as [ExpenseCategory, number][]).map(
                        ([category, cents]) => ({ key: category, label: EXPENSE_LABELS[category], value: cents }),
                      )}
                      centreLabel="total expenses"
                    />
                  </div>
                )}
              </ChartCard>
            );
          }

          if (card.state === 'loading') return <ChartLoading key={card.card} title={REVENUE_TITLES[card.card]} />;
          return (
            <RevenueChart
              key={card.card}
              chart={card.card}
              view={card.state}
              items={card.card === 'service-line' ? (breakdown?.byServiceLine ?? []) : (breakdown?.bySegment ?? [])}
              month={label}
              isCurrentMonth={isCurrentMonth}
              canOpenJobsAndCosts={canOpenJobsAndCosts}
            />
          );
        })}
      </div>
    </section>
  );
}
