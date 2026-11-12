'use client';

import { useState } from 'react';
import { Target } from 'lucide-react';

import { api } from '../../lib/api';
import { changeLabel, marginPointsChange, overviewChanges, type ReceivedOverview } from '../../lib/change';
import { money } from '../../lib/money';
import { AchievementRing, AchievementRow, Sparkline, StatTile } from '../charts';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { BlockFailed, Skeleton } from './BlockState';
import { isSameMonth, monthLabel, type YearMonth } from './month';
import { TargetsForm } from './TargetsForm';
import { TextLinkButton } from './TextLink';
import { maySetTargets, overviewTargets, targetsView } from './targets';
import { useBlock } from './useBlock';

const cardTitle = 'text-xs uppercase tracking-widest text-charcoal-muted';
const jobs = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;
/** A whole percentage, with a true minus sign for a month that lost money. */
const percent = (n: number) => {
  const whole = Math.round(n);
  return `${whole < 0 ? '−' : ''}${Math.abs(whole)}%`;
};

/**
 * The month's four headline figures and its targets, from one overview
 * request. The tiles, their change chips and their sparklines all read that
 * one answer, so they cannot disagree with each other.
 */
export function MonthFigures({
  month, current, user,
}: {
  month: YearMonth;
  /** The current month in Nairobi. */
  current: YearMonth;
  user: { isOwner?: boolean; role: string };
}) {
  const block = useBlock<ReceivedOverview>(
    () => api.overview(month.year, month.month).then((res) => res.overview),
    [month.year, month.month],
  );
  const [formOpen, setFormOpen] = useState(false);
  const label = monthLabel(month);

  // One request carries the tiles and the targets, so when it fails both are
  // absent and the message names both. Nothing here is ever shown as zero or
  // as "none set" unless the server said so.
  if (block.status === 'failed') {
    return (
      <Card className="p-3">
        <BlockFailed
          what={`the figures and targets for ${label}`}
          onRetry={block.retry}
          className="min-h-28"
        />
      </Card>
    );
  }

  if (block.status === 'loading') {
    return (
      <div aria-busy="true">
        <span className="sr-only">Loading the figures and targets for {label}</span>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {['Revenue', 'Net profit', 'Jobs completed', 'Margin'].map((tile) => (
            // The tile's two shapes: figure left and sparkline right on a
            // phone, one column from 640px (see `StatTile`). The bars add up
            // to the height of a loaded tile, so the row below keeps its place.
            <Card
              key={tile}
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
        <Card className="mt-4 px-5 py-4">
          <Skeleton className="h-5 w-48" />
        </Card>
      </div>
    );
  }

  const overview = block.data;
  const changes = overviewChanges(overview);
  const compared = changeLabel(changes.mode);
  const series = overview.series ?? [];
  // The month is still running, so the last point of every sparkline is a part-month.
  const partMonthLast = overview.comparison?.mode === 'same-period';

  const targets = overviewTargets(overview);
  const onCurrentMonth = isSameMonth(month, current);
  const view = targetsView({ values: targets, isCurrentMonth: onCurrentMonth, maySet: maySetTargets(user) });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
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
          // A phone stacks the text and a full-width button; from 640px they
          // share one row and the button keeps to the right edge.
          <Card className="flex flex-col gap-x-6 gap-y-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3.5">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-gold/50 bg-gold/10 text-navy"
              >
                <Target className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-charcoal">No targets for {label} yet</h3>
                <p className="mt-0.5 text-sm text-charcoal-muted">
                  Set a revenue, net profit or jobs target and follow it through the month.
                </p>
              </div>
            </div>
            <Button onClick={() => setFormOpen(true)} className="w-full shrink-0 sm:w-auto">
              Set monthly targets
            </Button>
          </Card>
        )}

        {view.kind === 'read-only' && (
          <Card className="px-5 py-4 text-sm text-charcoal-muted">
            {onCurrentMonth ? `No targets have been set for ${label} yet.` : `No targets were set for ${label}.`}
          </Card>
        )}

        {view.kind === 'rings' && (
          <Card className="p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h3 className={cardTitle}>Monthly targets</h3>
              {view.canEdit && <TextLinkButton onClick={() => setFormOpen(true)}>Edit targets</TextLinkButton>}
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

      <TargetsForm
        open={formOpen}
        onOpenChange={setFormOpen}
        month={month}
        values={targets}
        onSaved={block.retry}
      />
    </>
  );
}
