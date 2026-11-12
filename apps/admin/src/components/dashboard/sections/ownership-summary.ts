import type { OwnershipSummary } from '@onyxhawk/types';

import { money } from '../../../lib/money';
import { colourIndexOf, RETAINED_SEGMENT } from '../../ownership/split';
import { BASIS_POINTS_TOTAL, formatPercentShort } from '../../ownership/stakes';
import { noSplitLine, remainderName, remainderStake } from '../../ownership/wording';
import { isSameMonth, monthLabel, type YearMonth } from '../month';

/**
 * What the Dashboard's ownership summary shows for one month's answer, kept
 * free of React so the rules can be tested without a DOM. It reads the
 * server's figures and works none out: every share and both net profits are
 * the ones the Ownership page shows.
 */

export type SummaryRow = {
  key: string;
  /** A holder, or what the stakes leave over: short of 100% it is retained, past 100% over-allocated. */
  kind: 'holder' | 'retained' | 'over-allocated';
  name: string;
  isCompany: boolean;
  /** The holder's chart colour, by their place in the table as on Ownership. Null for the neutral colour. */
  colourIndex: number | null;
  /** "40%"; for the left-over row, "10%" retained or "−20%" over. */
  stake: string;
  monthShareCents: number;
  allTimeShareCents: number;
};

export type OwnershipSummaryView =
  /** No shareholders yet, and the viewer is the one who adds them. */
  | { kind: 'set-up' }
  /** No shareholders yet, and nothing this viewer can do about it. */
  | { kind: 'no-holders' }
  | {
      kind: 'split';
      /** The month the server answered for: "November 2026". */
      monthLabel: string;
      /** A past month is split at the stakes held today, not the ones held then. */
      atTodaysStakes: boolean;
      /** What `SplitBar` draws: the holders in table order, and what the stakes leave over. */
      bar: { holders: { id: string; name: string; basisPoints: number; shareCents: number }[]; unallocatedCents: number };
      /** The line that takes the bar's place when the month has no profit to split. Null while it has. */
      noSplitLine: string | null;
      loss: boolean;
      /** One row for each holder, in table order, then the left-over row when the stakes do not total 100%. */
      rows: SummaryRow[];
      /** The net profit being split, and the stakes it is split by. */
      total: { stake: string; balanced: boolean; monthNetCents: number; allTimeNetCents: number };
    };

export function ownershipSummaryView(
  summary: OwnershipSummary,
  { current, canManageOwnership }: { /** The current month in Nairobi. */ current: YearMonth; canManageOwnership: boolean },
): OwnershipSummaryView {
  if (summary.holders.length === 0) return { kind: canManageOwnership ? 'set-up' : 'no-holders' };

  const month: YearMonth = { year: summary.year, month: summary.month };
  const isCurrentMonth = isSameMonth(month, current);
  const { totalBasisPoints } = summary;

  const rows: SummaryRow[] = summary.holders.map((h, position) => ({
    key: h.id,
    kind: 'holder',
    name: h.name,
    isCompany: h.kind === 'COMPANY',
    colourIndex: colourIndexOf(position),
    stake: formatPercentShort(h.basisPoints),
    monthShareCents: h.periodShareCents,
    allTimeShareCents: h.allTimeShareCents,
  }));

  if (totalBasisPoints !== BASIS_POINTS_TOTAL) {
    rows.push({
      key: RETAINED_SEGMENT,
      kind: totalBasisPoints > BASIS_POINTS_TOTAL ? 'over-allocated' : 'retained',
      name: remainderName(totalBasisPoints),
      isCompany: false,
      colourIndex: null,
      stake: remainderStake(totalBasisPoints),
      monthShareCents: summary.unallocatedPeriodCents,
      allTimeShareCents: summary.unallocatedAllTimeCents,
    });
  }

  return {
    kind: 'split',
    monthLabel: monthLabel(month),
    atTodaysStakes: !isCurrentMonth,
    bar: {
      holders: summary.holders.map((h) => ({
        id: h.id,
        name: h.name,
        basisPoints: h.basisPoints,
        shareCents: h.periodShareCents,
      })),
      unallocatedCents: summary.unallocatedPeriodCents,
    },
    noSplitLine: monthNoSplitLine(summary.periodNetCents, month, isCurrentMonth),
    loss: summary.periodNetCents < 0,
    rows,
    total: {
      stake: formatPercentShort(totalBasisPoints),
      balanced: totalBasisPoints === BASIS_POINTS_TOTAL,
      monthNetCents: summary.periodNetCents,
      allTimeNetCents: summary.allTimeNetCents,
    },
  };
}

/**
 * The Ownership page's line for a month with no profit to split. That page
 * only ever shows the current month, so its line says "this month"; a past
 * month is named instead.
 */
function monthNoSplitLine(netCents: number, month: YearMonth, isCurrentMonth: boolean): string | null {
  if (isCurrentMonth) return noSplitLine(netCents, 'this-month');
  if (netCents > 0) return null;
  const label = monthLabel(month);
  return netCents === 0 ? `No profit to share in ${label}` : `A loss of ${money(-netCents)} in ${label}`;
}
