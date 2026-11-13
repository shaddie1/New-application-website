'use client';

import { useState } from 'react';
import { CalendarDays, RotateCw, Target } from 'lucide-react';

import { changeLabel, marginPointsChange, overviewChanges, type ReceivedOverview } from '../../../lib/change';
import { money } from '../../../lib/money';
import { AchievementRing, AchievementRow, Sparkline, StatTile } from '../../charts';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import type { BlockResult } from '../block-state';
import { BlockFailed, Skeleton } from '../BlockState';
import { isSameMonth, monthLabel, type YearMonth } from '../month';
import { TargetsForm } from '../TargetsForm';
import { TextLinkButton } from '../TextLink';
import {
  nextMonthTargets,
  overviewTargets,
  targetsView,
  type NextMonthTargets,
  type SavedTargets,
} from '../targets';
import { SectionHeading } from './SectionHeading';

const cardTitle = 'text-xs uppercase tracking-widest text-charcoal-muted';
const jobs = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;
/** A whole percentage, with a true minus sign for a month that lost money. */
const percent = (n: number) => {
  const whole = Math.round(n);
  return `${whole < 0 ? '−' : ''}${Math.abs(whole)}%`;
};
/** The tile sparklines show the six months ending at the month on screen, however many the overview carries. */
const SPARKLINE_MONTHS = 6;

/**
 * Section 2, "This month": the month's four headline figures and its targets,
 * from one overview answer handed in. The tiles, their change chips and their
 * sparklines all read that one answer, so they cannot disagree with each other.
 *
 * An account that may set targets (`canSetTargets`, the server's answer) is
 * offered the form on any month that has none, and can edit the ones a month
 * has. On the current month it can also open the same form for next month,
 * filled from `savedTargets`.
 */
export function MonthSection({
  overview, savedTargets, month, current, canSetTargets,
}: {
  /** The month's figures and targets, from `useMonthOverview`. */
  overview: BlockResult<ReceivedOverview>;
  /** Every month's saved targets, from `useSavedTargets`: where next month's are read from. */
  savedTargets: BlockResult<SavedTargets[]>;
  /** The month on screen. */
  month: YearMonth;
  /** The current month in Nairobi. */
  current: YearMonth;
  canSetTargets: boolean;
}) {
  const onCurrentMonth = isSameMonth(month, current);

  return (
    <section id="month" aria-labelledby="month-heading">
      <SectionHeading
        id="month-heading"
        section="month"
        icon={CalendarDays}
        title={monthLabel(month)}
        note={onCurrentMonth ? 'so far' : undefined}
      />
      <MonthBody
        overview={overview}
        savedTargets={savedTargets}
        month={month}
        current={current}
        onCurrentMonth={onCurrentMonth}
        canSetTargets={canSetTargets}
      />
    </section>
  );
}

function MonthBody({
  overview: block, savedTargets, month, current, onCurrentMonth, canSetTargets,
}: {
  overview: BlockResult<ReceivedOverview>;
  savedTargets: BlockResult<SavedTargets[]>;
  month: YearMonth;
  current: YearMonth;
  onCurrentMonth: boolean;
  canSetTargets: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [nextFormOpen, setNextFormOpen] = useState(false);
  const label = monthLabel(month);

  // One request carries the tiles and the targets, so when it fails both are
  // absent and the message names both. Nothing here is ever shown as zero or
  // as "none set" unless the server said so.
  if (block.status === 'failed') {
    return (
      <Card accent="month" className="p-3">
        <BlockFailed what={`the figures and targets for ${label}`} onRetry={block.retry} className="min-h-28" />
      </Card>
    );
  }

  if (block.status === 'loading') {
    return (
      <>
        {/* Said from outside the busy part: a screen reader may hold back what is inside it. */}
        <span role="status" className="sr-only">Loading the figures and targets for {label}</span>
        <div aria-busy="true">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {['Revenue', 'Net profit', 'Jobs completed', 'Margin'].map((tile) => (
              // The tile's two shapes: figure left and sparkline right on a
              // phone, one column from 640px (see `StatTile`). The bars add up
              // to the height of a loaded tile, so the row below keeps its place.
              <Card
                key={tile}
                accent="month"
                className="grid min-w-0 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-center gap-x-3 p-4 sm:block sm:p-5"
              >
                <div className="min-w-0">
                  <p className={cardTitle}>{tile}</p>
                  <Skeleton className="mt-2 h-7 w-28 sm:mt-3 sm:h-8 sm:w-32" />
                  <Skeleton className="mt-2.5 h-5 w-24 rounded-full sm:mt-3" />
                  <Skeleton className="mt-2 h-4 w-32 sm:hidden" />
                </div>
                <Skeleton className="h-10 w-full sm:mt-5 sm:h-14" />
                <Skeleton className="mt-3.5 hidden h-3.5 w-36 sm:block" />
              </Card>
            ))}
          </div>
          <Card accent="month" className="mt-4 px-5 py-4">
            <Skeleton className="h-5 w-48" />
          </Card>
        </div>
      </>
    );
  }

  const overview = block.data;
  const changes = overviewChanges(overview);
  const compared = changeLabel(changes.mode);
  const series = (overview.series ?? []).slice(-SPARKLINE_MONTHS);
  // The month is still running, so the last point of every sparkline is a part-month.
  const partMonthLast = overview.comparison?.mode === 'same-period';

  const targets = overviewTargets(overview);
  const view = targetsView({ values: targets, canSetTargets });
  const next = nextMonthTargets({ canSetTargets, isCurrentMonth: onCurrentMonth, current, saved: savedTargets });
  const nextAction = (
    <NextMonthAction next={next} onOpen={() => setNextFormOpen(true)} onRetry={savedTargets.retry} />
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          accent="month"
          label="Revenue"
          value={money(overview.revenue.actual)}
          delta={changes.revenue}
          deltaLabel={compared}
          sparkline={
            <Sparkline
              label="Revenue"
              months={series.map((m) => ({ label: m.label, value: m.revenueCents }))}
              partMonthLast={partMonthLast}
              format={money}
            />
          }
          context="Income from approved jobs"
        />
        <StatTile
          accent="month"
          label="Net profit"
          value={money(overview.netProfit.actual)}
          loss={overview.netProfit.actual < 0}
          delta={changes.netProfit}
          deltaLabel={compared}
          sparkline={
            <Sparkline
              label="Net profit"
              months={series.map((m) => ({ label: m.label, value: m.netCents }))}
              partMonthLast={partMonthLast}
              format={money}
            />
          }
          context="After job costs, before any reserve"
        />
        <StatTile
          accent="month"
          label="Jobs completed"
          value={String(overview.jobs.actual)}
          delta={changes.jobs}
          deltaLabel={compared}
          sparkline={
            <Sparkline
              label="Jobs completed"
              months={series.map((m) => ({ label: m.label, value: m.jobCount }))}
              partMonthLast={partMonthLast}
              format={jobs}
            />
          }
          context="Approved jobs recorded"
        />
        <StatTile
          accent="month"
          label="Margin"
          value={
            overview.revenue.actual > 0 ? percent((overview.netProfit.actual / overview.revenue.actual) * 100) : '—'
          }
          loss={overview.revenue.actual > 0 && overview.netProfit.actual < 0}
          // A margin is itself a percentage, so its change is counted in
          // percentage points ("6 pts"): "6%" would read as 6% of the margin.
          delta={marginPointsChange(overview)}
          deltaUnit="pts"
          deltaLabel={compared}
          sparkline={
            <Sparkline
              label="Margin"
              // A month with no revenue has no margin: a gap, not 0%.
              months={series.map((m) => ({
                label: m.label,
                value: m.revenueCents > 0 ? (m.netCents / m.revenueCents) * 100 : null,
              }))}
              partMonthLast={partMonthLast}
              format={percent}
              gapLabel="no revenue"
            />
          }
          context="Net profit as a share of revenue"
        />
      </div>

      <div className="mt-4">
        {view.kind === 'prompt' && (
          // A phone stacks the text, a full-width button and, under it, the
          // way to next month; from 640px they share one row and the button
          // keeps to the right edge.
          <Card
            accent="month"
            className="flex flex-col gap-x-6 gap-y-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3.5">
              {/* Gold is the colour for a target. */}
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-attention-tint text-attention"
              >
                <Target className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-charcoal">
                  {onCurrentMonth ? `No targets for ${label} yet` : `No targets were set for ${label}`}
                </h3>
                <p className="mt-0.5 text-sm text-charcoal-muted">
                  {onCurrentMonth
                    ? 'Set a revenue, net profit or jobs target and follow it through the month.'
                    : 'Set a revenue, net profit or jobs target to measure the month against.'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col-reverse items-center gap-x-5 gap-y-3 sm:flex-row">
              {nextAction}
              <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
                Set monthly targets
              </Button>
            </div>
          </Card>
        )}

        {view.kind === 'read-only' && (
          <Card accent="month" className="px-5 py-4 text-sm text-charcoal-muted">
            {onCurrentMonth ? `No targets have been set for ${label} yet.` : `No targets were set for ${label}.`}
          </Card>
        )}

        {view.kind === 'rings' && (
          <Card accent="month" className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
              <h3 className={cardTitle}>Monthly targets</h3>
              {view.canEdit && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {nextAction}
                  <TextLinkButton onClick={() => setFormOpen(true)}>Edit targets</TextLinkButton>
                </div>
              )}
            </div>
            <AchievementRow>
              <AchievementRing
                label="Revenue"
                percent={view.set.revenue ? overview.revenue.percent : null}
                caption={
                  view.set.revenue
                    ? `${money(overview.revenue.actual)} of ${money(overview.revenue.target)}`
                    : 'No target'
                }
              />
              <AchievementRing
                label="Net profit"
                percent={view.set.netProfit ? overview.netProfit.percent : null}
                caption={
                  view.set.netProfit
                    ? `${money(overview.netProfit.actual)} of ${money(overview.netProfit.target)}`
                    : 'No target'
                }
              />
              <AchievementRing
                label="Jobs completed"
                percent={view.set.jobs ? overview.jobs.percent : null}
                caption={view.set.jobs ? `${overview.jobs.actual} of ${jobs(overview.jobs.target)}` : 'No target'}
              />
            </AchievementRow>
          </Card>
        )}
      </div>

      {canSetTargets && (
        <TargetsForm open={formOpen} onOpenChange={setFormOpen} month={month} values={targets} onSaved={block.retry} />
      )}
      {/* Next month's form opens with the figures saved for next month as of
          when the page loaded. */}
      {next.kind === 'ready' && (
        <TargetsForm
          open={nextFormOpen}
          onOpenChange={setNextFormOpen}
          month={next.month}
          values={next.values}
          onSaved={savedTargets.retry}
        />
      )}
    </>
  );
}

/**
 * The way to next month's targets, offered on the current month. While the
 * saved targets load its place is held; if they could not be read it says so
 * and offers to ask again, and no form opens.
 */
function NextMonthAction({
  next, onOpen, onRetry,
}: {
  next: NextMonthTargets;
  onOpen: () => void;
  onRetry: () => void;
}) {
  if (next.kind === 'hidden') return null;
  if (next.kind === 'loading') {
    return (
      <>
        <span aria-busy="true">
          <Skeleton className="h-5 w-44" />
        </span>
        <span role="status" className="sr-only">Loading next month’s targets</span>
      </>
    );
  }
  if (next.kind === 'failed') {
    return (
      <span role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-charcoal-muted">
        Could not load next month’s targets.
        <Button variant="outline" size="sm" onClick={onRetry} aria-label="Retry loading next month’s targets">
          <RotateCw aria-hidden="true" />
          Retry
        </Button>
      </span>
    );
  }
  return <TextLinkButton onClick={onOpen}>Set next month’s targets</TextLinkButton>;
}
