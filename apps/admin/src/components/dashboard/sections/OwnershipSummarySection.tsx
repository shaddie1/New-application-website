'use client';

import Link from 'next/link';
import { TriangleAlert, UsersRound } from 'lucide-react';
import type { OwnershipSummary } from '@onyxhawk/types';

import { cn } from '../../../lib/cn';
import { money } from '../../../lib/money';
import { InitialsBadge, RetainedBadge } from '../../ownership/InitialsBadge';
import { SplitBar } from '../../ownership/SplitBar';
import { Button } from '../../ui/button';
import { Card, SECTION_TILE } from '../../ui/card';
import type { BlockResult } from '../block-state';
import { BlockFailed, Skeleton } from '../BlockState';
import { monthLabel, type YearMonth } from '../month';
import { TextLink } from '../TextLink';
import { ownershipSummaryView, type OwnershipSummaryView, type SummaryRow } from './ownership-summary';
import { SectionHeading } from './SectionHeading';

const ALL_TIME = 'All time, to date';
const cardTitle = 'text-xs uppercase tracking-widest text-charcoal-muted';

// The rows have two layouts, chosen by the card's own width (it is a size
// container), not the screen's, so they also hold beside a side menu:
//
//   under 36rem   two lines to a holder: the name with the stake at the far
//                 end, then the two shares, each under its own small label;
//   from 36rem    four columns under one row of headings.
//
// One set of cells serves both, placed by the grid. The class names are
// written whole so that Tailwind finds them.
const rowGrid =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6 [@container_(min-width:36rem)]:grid-cols-[minmax(0,1fr)_5rem_10rem_10rem]';
const number = 'figure whitespace-nowrap text-right';
/** The month's share: under the name on the left in the narrow layout, a right-aligned column in the wide one. */
const monthNumber = 'figure whitespace-nowrap [@container_(min-width:36rem)]:text-right';
/** A share's label above it, in the narrow layout only: the wide one has the row of headings. */
const cellLabel = 'block text-[11px] font-normal text-charcoal-muted [@container_(min-width:36rem)]:hidden';
/** A loss is red; any other amount is plain ink. */
const signed = (cents: number) => (cents < 0 ? 'text-danger' : 'text-charcoal');

/**
 * Section 5, the ownership summary: how the month's net profit is split
 * between the shareholders, and each holder's share to date. It is read-only:
 * stakes and holders are changed on the Ownership page, which the viewer who
 * manages ownership is given a link to.
 *
 * It shows the net profit being split and nothing it is made of. A shareholder
 * with no other section sees no revenue, expenses or job counts here.
 */
export function OwnershipSummarySection({
  summary, month, current, canManageOwnership,
}: {
  /** The month's split, from `useOwnershipSummary`. */
  summary: BlockResult<OwnershipSummary>;
  /** The month on screen. */
  month: YearMonth;
  /** The current month in Nairobi. */
  current: YearMonth;
  /** The viewer adds, edits and removes shareholders: the owner. */
  canManageOwnership: boolean;
}) {
  const label = monthLabel(month);

  return (
    <section id="ownership" aria-labelledby="ownership-heading">
      <SectionHeading id="ownership-heading" section="ownership" icon={UsersRound} title="Ownership" note={label}>
        {canManageOwnership && <TextLink href="/equity">Manage ownership</TextLink>}
      </SectionHeading>

      {summary.status === 'failed' && (
        <Card accent="ownership" className="p-3">
          <BlockFailed what={`the ownership summary for ${label}`} onRetry={summary.retry} className="min-h-28" />
        </Card>
      )}

      {summary.status === 'loading' && (
        <>
          {/* Said from outside the busy card: a screen reader may hold back what is inside it. */}
          <span role="status" className="sr-only">Loading the ownership summary for {label}</span>
          <Card accent="ownership" className="p-5 sm:p-6" aria-busy="true">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-5 h-11 w-full rounded-lg" />
            <Skeleton className="mt-6 h-4 w-2/3" />
            <Skeleton className="mt-4 h-4 w-1/2" />
            <Skeleton className="mt-4 h-4 w-3/5" />
          </Card>
        </>
      )}

      {(summary.status === 'loaded' || summary.status === 'empty') && (
        <Summary view={ownershipSummaryView(summary.data, { current, canManageOwnership })} />
      )}
    </section>
  );
}

function Summary({ view }: { view: OwnershipSummaryView }) {
  if (view.kind === 'set-up') {
    return (
      <Card
        accent="ownership"
        className="flex flex-col gap-x-6 gap-y-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            aria-hidden="true"
            className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', SECTION_TILE.ownership)}
          >
            <UsersRound className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-charcoal">No shareholders yet</h3>
            <p className="mt-0.5 text-sm text-charcoal-muted">
              Add the holders and their stakes to see how each month’s net profit is split.
            </p>
          </div>
        </div>
        <Button asChild className="w-full shrink-0 sm:w-auto">
          <Link href="/equity">Set up ownership</Link>
        </Button>
      </Card>
    );
  }

  if (view.kind === 'no-holders') {
    return (
      <Card accent="ownership" className="px-5 py-4 text-sm text-charcoal-muted">
        No shareholders have been added yet.
      </Card>
    );
  }

  const holders = view.rows.filter((r) => r.kind === 'holder').length;

  return (
    <Card accent="ownership" className="overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className={cardTitle}>Share of net profit</h3>
          <p className="figure text-sm text-charcoal-muted">
            {holders} shareholder{holders !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="mt-4">
          <SplitBar
            netCents={view.total.monthNetCents}
            noSplitLine={view.noSplitLine}
            holders={view.bar.holders}
            unallocatedCents={view.bar.unallocatedCents}
          />
        </div>

        {/* The stakes held in an earlier month are not kept, so say whose stakes these are. */}
        {view.atTodaysStakes && (
          <p className="figure mt-3 text-sm text-charcoal-muted">{view.monthLabel}, split at today’s stakes.</p>
        )}
      </div>

      <div className="[container-type:inline-size]">
        <div role="table" aria-label={`Each shareholder’s stake and share of net profit, ${view.monthLabel} and all time to date`} className="text-sm">
          <div role="rowgroup">
            <div
              role="row"
              className={cn(
                rowGrid,
                'hidden border-y border-line bg-mist/70 py-3 text-xs font-medium uppercase tracking-widest text-charcoal-muted [@container_(min-width:36rem)]:grid',
              )}
            >
              <span role="columnheader">Shareholder</span>
              <span role="columnheader" className="text-right">Stake</span>
              <span role="columnheader" className="figure text-right">{view.monthLabel}</span>
              <span role="columnheader" className="text-right">{ALL_TIME}</span>
            </div>
          </div>

          <div role="rowgroup" className="divide-y divide-line border-t border-line [@container_(min-width:36rem)]:border-t-0">
            {view.rows.map((r) => (
              <SummaryRowCells key={r.key} row={r} monthLabel={view.monthLabel} />
            ))}
          </div>

          <div role="rowgroup">
            <div role="row" className={cn(rowGrid, 'border-t-2 border-border bg-mist/70 font-medium')}>
              <span role="rowheader" className="text-charcoal">Net profit to split</span>
              {/* Gold when the stakes do not come to 100%: they need attention. */}
              <span role="cell" className={cn(number, view.total.balanced ? 'text-charcoal' : 'text-attention')}>
                {view.total.stake}
                <span className="sr-only"> in stakes</span>
              </span>
              <span role="cell" className={cn(monthNumber, 'font-semibold', signed(view.total.monthNetCents))}>
                <span className={cellLabel}>{view.monthLabel}</span>
                {money(view.total.monthNetCents)}
              </span>
              <span role="cell" className={cn(number, 'font-semibold', signed(view.total.allTimeNetCents))}>
                <span className={cellLabel}>{ALL_TIME}</span>
                {money(view.total.allTimeNetCents)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** One holder, or what the stakes leave over: the name, the stake and the two shares. */
function SummaryRowCells({ row: r, monthLabel: month }: { row: SummaryRow; monthLabel: string }) {
  const over = r.kind === 'over-allocated';
  const leftOver = r.kind !== 'holder';
  // Gold when over-allocated: the stakes need attention, and nobody has lost money.
  const amount = (cents: number) => (over ? 'text-attention' : leftOver && cents >= 0 ? 'text-charcoal-muted' : signed(cents));

  return (
    <div role="row" className={cn(rowGrid, leftOver && 'bg-mist/40')}>
      <span role="rowheader" className="flex min-w-0 items-center gap-2.5">
        {r.kind === 'holder' && <InitialsBadge name={r.name} colourIndex={r.colourIndex} size="sm" />}
        {r.kind === 'retained' && <RetainedBadge size="sm" />}
        {over && (
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-attention-tint text-attention"
          >
            <TriangleAlert className="size-3.5" />
          </span>
        )}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              'break-words',
              r.kind === 'holder' && 'font-medium text-charcoal',
              r.kind === 'retained' && 'italic text-charcoal-muted',
              over && 'font-medium text-attention',
            )}
          >
            {r.name}
          </span>
          {r.isCompany && (
            <span className="rounded-full bg-section-ownership-tint px-2 py-0.5 text-xs text-section-ownership-deep">
              Company
            </span>
          )}
        </span>
      </span>

      <span role="cell" className={cn(number, over ? 'text-attention' : leftOver ? 'text-charcoal-muted' : 'text-charcoal')}>
        {r.stake}
        <span className="sr-only"> {leftOver ? 'of the stakes' : 'stake'}</span>
      </span>

      <span role="cell" className={cn(monthNumber, 'font-medium', amount(r.monthShareCents))}>
        <span className={cellLabel}>{month}</span>
        {money(r.monthShareCents)}
      </span>

      <span role="cell" className={cn(number, 'font-medium', amount(r.allTimeShareCents))}>
        <span className={cellLabel}>{ALL_TIME}</span>
        {money(r.allTimeShareCents)}
      </span>
    </div>
  );
}
