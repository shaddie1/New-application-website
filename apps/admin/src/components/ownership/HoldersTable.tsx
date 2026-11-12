'use client';

import { MoreHorizontal, Pencil, Percent, TriangleAlert } from 'lucide-react';
import type { ShareholderDto } from '@onyxhawk/types';

import { cn } from '../../lib/cn';
import { money } from '../../lib/money';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { InitialsBadge, RetainedBadge } from './InitialsBadge';
import type { ScopeFigures } from './scope';
import { colourIndexOf } from './split';
import { BASIS_POINTS_TOTAL, formatPercentShort as pct } from './stakes';
import { remainderName, remainderStake } from './wording';

// The table has three layouts, chosen by its own width (it is a size
// container), not the screen's, so it also holds beside a side menu:
//
//   under 30rem   no Stake column: each stake sits under its amount, and
//                 every row fits a phone with nothing to scroll;
//   30 to 42rem   the four columns, drawn tight;
//   from 42rem    the four columns with room, and the share heading on one line.
//
// From 30rem the columns have fixed widths, so nothing moves when the scope
// changes the share heading and the amounts. The two wider layouts are
// written as separate ranges, so no class has to win over another.

const nameCell = 'py-3 pl-5 pr-0 sm:pl-6 [@container_(min-width:30rem)]:pr-4 [@container_(min-width:42rem)]:py-3.5';
const stakeCell = 'hidden px-3 py-3 [@container_(min-width:30rem)]:table-cell [@container_(min-width:42rem)]:px-6';
const amountCell =
  'py-3 pl-1 pr-1 [@container_(min-width:30rem)_and_(max-width:41.99rem)]:px-3 [@container_(min-width:42rem)]:px-6';
const menuCell = 'py-2 pr-2 text-right sm:pr-3';
const number = 'figure whitespace-nowrap text-right';
const badgeRow = 'flex items-center gap-2 [@container_(min-width:30rem)]:gap-3';
// The badge grows with the layout: 24px, then 28px, then 36px.
const badgeSize =
  '[@container_(min-width:30rem)_and_(max-width:41.99rem)]:h-7 [@container_(min-width:30rem)_and_(max-width:41.99rem)]:w-7 [@container_(min-width:30rem)_and_(max-width:41.99rem)]:text-[10px] [@container_(min-width:42rem)]:h-9 [@container_(min-width:42rem)]:w-9 [@container_(min-width:42rem)]:text-xs';
/** A loss is red; any other amount is plain ink. */
const signed = (cents: number) => (cents < 0 ? 'text-danger' : 'text-charcoal');

/** A stake under its amount: the narrow layout's stand-in for the Stake column. */
function StakeBelow({ stake, said, className }: { stake: string; said: string; className?: string }) {
  return (
    <span className={cn('mt-0.5 block text-xs font-normal text-charcoal-muted [@container_(min-width:30rem)]:hidden', className)}>
      {stake}
      <span className="sr-only"> {said}</span>
    </span>
  );
}

/**
 * Every holder with their stake and their share for the chosen scope, what
 * the stakes leave over, and the net profit being split.
 */
export function HoldersTable({
  figures, totalBasisPoints, shareHeadingLines, onEditDetails, onEditStakes,
}: {
  figures: ScopeFigures;
  totalBasisPoints: number;
  /** The share column's heading in its two parts: "Share," and the scope it covers. */
  shareHeadingLines: [string, string];
  onEditDetails: (holder: ShareholderDto) => void;
  onEditStakes: () => void;
}) {
  const balanced = totalBasisPoints === BASIS_POINTS_TOTAL;
  const over = totalBasisPoints > BASIS_POINTS_TOTAL;
  return (
    <div className="[container-type:inline-size]">
      {/* Nothing here is wider than its frame; the frame scrolls only if a name or an amount is far longer than any expected. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm [@container_(min-width:30rem)]:table-fixed">
          <caption className="sr-only">Shareholders, their stakes and their share of the net profit</caption>
          <colgroup>
            <col />
            <col className="hidden [@container_(min-width:30rem)]:table-column [@container_(min-width:30rem)_and_(max-width:41.99rem)]:w-16 [@container_(min-width:42rem)]:w-28" />
            <col className="[@container_(min-width:30rem)_and_(max-width:41.99rem)]:w-[9.5rem] [@container_(min-width:42rem)]:w-64" />
            <col className="w-11 [@container_(min-width:30rem)_and_(max-width:41.99rem)]:w-12 [@container_(min-width:42rem)]:w-14" />
          </colgroup>
          <thead>
            <tr className="border-y border-line bg-mist/70 text-xs uppercase tracking-widest text-charcoal-muted">
              {/* Under 30rem this column takes all the width the amounts leave. */}
              <th scope="col" className={cn(nameCell, 'w-full text-left align-top font-medium [@container_(min-width:30rem)]:w-auto [@container_(min-width:42rem)]:py-3')}>
                Shareholder
              </th>
              <th scope="col" className={cn(stakeCell, 'text-right align-top font-medium')}>Stake</th>
              {/* Under 30rem it is at least as wide as either scope's heading, so it does not move with the scope. */}
              <th scope="col" className={cn(amountCell, 'figure min-w-[6.125rem] text-right align-top font-medium [@container_(min-width:30rem)]:min-w-0')}>
                <span className="whitespace-nowrap">{shareHeadingLines[0]}</span>{' '}
                <span className="block whitespace-nowrap text-[11px] normal-case tracking-normal [@container_(min-width:42rem)]:inline [@container_(min-width:42rem)]:text-xs [@container_(min-width:42rem)]:uppercase [@container_(min-width:42rem)]:tracking-widest">
                  {shareHeadingLines[1]}
                </span>
              </th>
              <th scope="col" className="py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {figures.holders.map(({ shareholder: s, shareCents }, position) => (
              <tr key={s.id} className="transition-colors hover:bg-mist/50">
                <th scope="row" className={cn(nameCell, 'text-left font-normal')}>
                  <div className={badgeRow}>
                    <InitialsBadge name={s.name} colourIndex={colourIndexOf(position)} size="xs" className={badgeSize} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="break-words font-medium text-charcoal">{s.name}</span>
                        {s.kind === 'COMPANY' && (
                          <span className="rounded-full border border-gold/70 px-2 py-0.5 text-xs text-charcoal-muted">Company</span>
                        )}
                      </div>
                      {(s.title || s.userName) && (
                        <p className="mt-0.5 text-xs text-charcoal-muted">{[s.title, s.userName].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  </div>
                </th>
                <td className={cn(stakeCell, number, 'text-charcoal')}>{pct(s.basisPoints)}</td>
                <td className={cn(amountCell, number)}>
                  <span className={cn('font-medium', signed(shareCents))}>{money(shareCents)}</span>
                  <StakeBelow stake={pct(s.basisPoints)} said="stake" />
                </td>
                <td className={menuCell}>
                  <RowMenu name={s.name} onEditDetails={() => onEditDetails(s)} onEditStakes={onEditStakes} />
                </td>
              </tr>
            ))}

            {/* Only when the stakes do not come to 100%: what is left over, or what is handed out beyond the profit. */}
            {figures.unallocatedCents !== 0 && (
              <tr className="bg-mist/40">
                <th scope="row" className={cn(nameCell, 'text-left font-normal')}>
                  <div className={badgeRow}>
                    {over ? (
                      <span
                        aria-hidden="true"
                        className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning', badgeSize)}
                      >
                        <TriangleAlert className="size-3.5" />
                      </span>
                    ) : (
                      <RetainedBadge size="xs" className={badgeSize} />
                    )}
                    <span className={over ? 'font-medium text-warning' : 'italic text-charcoal-muted'}>{remainderName(totalBasisPoints)}</span>
                  </div>
                </th>
                {/* Amber when over-allocated: the stakes need attention, and nobody has lost money. */}
                <td className={cn(stakeCell, number, over ? 'text-warning' : 'text-charcoal-muted')}>{remainderStake(totalBasisPoints)}</td>
                <td className={cn(amountCell, number, over ? 'text-warning' : figures.unallocatedCents < 0 ? 'text-danger' : 'text-charcoal-muted')}>
                  {money(figures.unallocatedCents)}
                  <StakeBelow stake={remainderStake(totalBasisPoints)} said="of the stakes" className={over ? 'text-warning' : undefined} />
                </td>
                <td />
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-mist/70">
              <th scope="row" className={cn(nameCell, 'text-left font-medium text-charcoal')}>Net profit to split</th>
              <td className={cn(stakeCell, number, 'font-medium', balanced ? 'text-charcoal' : 'text-warning')}>{pct(totalBasisPoints)}</td>
              <td className={cn(amountCell, number)}>
                <span className={cn('font-semibold', signed(figures.footerNetCents))}>{money(figures.footerNetCents)}</span>
                <StakeBelow stake={pct(totalBasisPoints)} said="in stakes" className={balanced ? undefined : 'font-medium text-warning'} />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/**
 * A holder's actions, behind one "more" button. Both open a dialog.
 *
 * The menu hangs under its own button, their right edges in line, so it is
 * plainly that row's: it may cover the rows and the total beneath it, and it
 * opens upward only when the screen has no room below. While it is open the
 * button stays tinted, which marks the row the menu belongs to.
 */
function RowMenu({
  name, onEditDetails, onEditStakes,
}: {
  name: string;
  onEditDetails: () => void;
  onEditStakes: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${name}`}
          className="data-[state=open]:bg-navy-soft data-[state=open]:text-navy"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        <DropdownMenuItem onSelect={onEditDetails}>
          <Pencil aria-hidden="true" />
          Edit details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEditStakes}>
          <Percent aria-hidden="true" />
          Edit stakes
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
