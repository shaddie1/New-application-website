import type { EquityHistoryMonth } from '@onyxhawk/types';

import { money } from '../../lib/money';
import { enoughToDraw, foldSeries, OTHERS_KEY, type StackColumn } from '../stacked-bars';
import { COLOURED_HOLDERS, colourIndexOf } from './split';
import { BASIS_POINTS_TOTAL } from './stakes';

/**
 * The ownership history as the page draws it: series and columns for the
 * stacked chart, and rows for the table beneath it. Both carry the amounts
 * the server sent, each month's net profit split at today's stakes.
 */

export const RETAINED_KEY = '__retained';
export const OVER_KEY = '__over';

/**
 * One colour in the chart and its legend. A null colour index is a neutral
 * series, and `kind` says which: "Others" is a solid neutral, and what the
 * business retains is a hatched one, so the two are never mistaken.
 */
export type HistorySeries = {
  key: string;
  label: string;
  kind: 'holder' | 'others' | 'retained';
  colourIndex: number | null;
};

export type HistoryMonthHead = {
  /** "2026-11". */
  key: string;
  /** "Nov", for the chart's axis. */
  label: string;
  year: number;
  /** "Nov 2026", or "Nov 2026 so far" for the month still running. */
  heading: string;
  /** The month's column heading in the table, in two short lines: "Oct" over "2026", or "Nov" over "so far" for the month still running. */
  columnHead: [string, string];
  partial: boolean;
  netCents: number;
};

/**
 * One row of the table: a holder, what the business retains, or what stakes
 * over 100% hand out beyond the net profit. `cents` has one amount per month.
 */
export type HistoryRow = {
  key: string;
  label: string;
  kind: 'holder' | 'retained' | 'over';
  colourIndex: number | null;
  cents: number[];
};

export type OwnershipHistory = {
  months: HistoryMonthHead[];
  /** The chart's series: at most five holders, then "Others", then "Retained". Empty with no holders. */
  series: HistorySeries[];
  columns: StackColumn[];
  /** Every holder, never grouped. */
  rows: HistoryRow[];
  /** What today's stakes add up to. Over 10,000 the bars are taller than the net profit. */
  stakesBasisPoints: number;
  /** The chart in a sentence, for a reader who cannot see it. */
  summary: string;
};

export function shapeHistory(months: EquityHistoryMonth[]): OwnershipHistory {
  const heads: HistoryMonthHead[] = months.map((m) => ({
    key: `${m.year}-${String(m.month).padStart(2, '0')}`,
    label: m.label,
    year: m.year,
    heading: `${m.label} ${m.year}${m.partial ? ' so far' : ''}`,
    // Two short lines, so a month column is no wider than its amounts need.
    columnHead: [m.label, m.partial ? 'so far' : String(m.year)],
    partial: m.partial,
    netCents: m.netCents,
  }));

  // The same holders are in every month, in table order.
  const holders = months[0]?.shares ?? [];
  if (holders.length === 0) return { months: heads, series: [], columns: [], rows: [], stakesBasisPoints: 0, summary: '' };

  const shareOf = (m: EquityHistoryMonth, shareholderId: string) =>
    m.shares.find((s) => s.shareholderId === shareholderId)?.shareCents ?? 0;

  const rows: HistoryRow[] = holders.map((h, position) => ({
    key: h.shareholderId,
    label: h.shareholderName,
    kind: 'holder',
    colourIndex: colourIndexOf(position),
    cents: months.map((m) => shareOf(m, h.shareholderId)),
  }));

  const folded = foldSeries(
    holders.map((h) => ({ key: h.shareholderId, label: h.shareholderName })),
    months.map((m, i) => ({ key: heads[i]!.key, label: m.label, values: holders.map((h) => shareOf(m, h.shareholderId)) })),
    COLOURED_HOLDERS,
  );
  const series: HistorySeries[] = folded.series.map((s, position) =>
    s.key === OTHERS_KEY
      ? { ...s, kind: 'others', colourIndex: null }
      : { ...s, kind: 'holder', colourIndex: colourIndexOf(position) },
  );
  let columns = folded.columns;

  const stakesBasisPoints = holders.reduce((acc, h) => acc + h.basisPoints, 0);
  const unallocated = months.map((m) => m.unallocatedCents);
  if (stakesBasisPoints < BASIS_POINTS_TOTAL) {
    // Stakes short of 100% leave part of every month with nobody: the business keeps it.
    series.push({ key: RETAINED_KEY, label: 'Retained', kind: 'retained', colourIndex: null });
    columns = columns.map((c, i) => ({ ...c, values: [...c.values, unallocated[i]!] }));
    rows.push({ key: RETAINED_KEY, label: 'Retained by the business', kind: 'retained', colourIndex: null, cents: unallocated });
  } else if (stakesBasisPoints > BASIS_POINTS_TOTAL) {
    // Stakes past 100% hand out more than there is. The table says by how
    // much, so its rows still add up to the net profit; the chart draws the
    // shares alone, which is why its bars pass the net profit.
    rows.push({ key: OVER_KEY, label: 'Over-allocated', kind: 'over', colourIndex: null, cents: unallocated });
  }

  const first = heads[0]!;
  const last = heads[heads.length - 1]!;
  const summary =
    `Each month's net profit from ${first.label} ${first.year} to ${last.label} ${last.year}, ` +
    `stacked by shareholder at today's stakes. The table below gives every amount.`;

  return { months: heads, series, columns, rows, stakesBasisPoints, summary };
}

/** What is written under one month's bar. Null is nothing. */
export type MonthAxisLabel = { label: string | null; second: string | null };

/**
 * The labels under the chart's bars. With `every` at 1 each month is named;
 * at 2, for slots too narrow for that, every other month is, counting back
 * from the last so the running month always has its label. The second line is
 * "so far" under the running month, and the year under the first labelled
 * month and wherever the year changes.
 */
export function monthAxisLabels(months: HistoryMonthHead[], every: number): MonthAxisLabel[] {
  const last = months.length - 1;
  let yearShown: number | null = null;
  return months.map((m, i) => {
    if ((last - i) % every !== 0) return { label: null, second: null };
    const newYear = m.year !== yearShown;
    yearShown = m.year;
    return { label: m.label, second: m.partial ? 'so far' : newYear ? String(m.year) : null };
  });
}

/**
 * How the month columns of the table share the width beside the pinned
 * column: as many whole columns as fit at `minWidth` or wider, each the same
 * width, so the table can stop only where a column begins and no month is cut
 * by the pinned column. Null before the width is known.
 */
export function wholeColumns(available: number, minWidth: number, columns: number): { visible: number; width: number } | null {
  if (available <= 0 || columns <= 0) return null;
  const visible = Math.max(1, Math.min(columns, Math.floor(available / minWidth)));
  return { visible, width: available / visible };
}

/**
 * An amount in the month table: the figure alone, "15,520" or "−24,000".
 * The table states "KSh" once, above its columns, so they stay narrow and
 * more months are in view.
 */
export function amountWithoutUnit(cents: number): string {
  return money(cents).replace('KSh ', '');
}

/**
 * The months the table shows. Under a chart it is every month, an empty one
 * included, so the table and the bars line up. With too little to chart it is
 * only the months that have figures: one, or none at all.
 */
export function tableMonthIndexes(history: OwnershipHistory): number[] {
  const all = history.months.map((_, i) => i);
  if (enoughToDraw(history.columns)) return all;
  return all.filter((i) => history.months[i]!.netCents !== 0 || history.rows.some((row) => (row.cents[i] ?? 0) !== 0));
}

/** A screen narrower than this is a phone: the table's first column is a badge alone. */
const PHONE_BELOW = 640;

export function isPhone(viewportWidth: number): boolean {
  return viewportWidth < PHONE_BELOW;
}

/** Rough widths of the table's text, in pixels a character: enough to size columns that then never clip. */
const AMOUNT_CHARACTER = 8.2;
const NAME_CHARACTER = 8.4;
/** A month's heading, "Nov" over "so far", needs this much whatever the amounts under it. */
const MONTH_TEXT_AT_LEAST = 44;
/** A phone's first column: a 24px badge, or "Net", with 8px either side. Three months then fit a 360px phone. */
const BADGE_ONLY_COLUMN = 40;
/** The first column with a badge and a name: no narrower, and no wider, than these. */
const NAMED_COLUMN = { atLeast: 168, atMost: 248, shareOfFrame: 0.4, badgeAndGap: 38 };
/** A cell's padding on each side: on a phone, and from 640px. */
const MONTH_TABLE_PAD = { phone: 10, wide: 16 };

export type MonthTableColumns = {
  /** Whether the first column has room for names beside its badges. False is a badge alone. */
  named: boolean;
  /** The first column, pinned while the months scroll under it. */
  pinned: number;
  /** Every month column. */
  month: number;
  /** How many whole months are in view beside the first column. */
  visible: number;
  /** The whole table: wider than its frame when months are out of view. */
  table: number;
};

/**
 * The widths of the month table's columns, in whole pixels, for a frame of
 * `frameWidth`. From 640px the first column holds the badge and the name, on
 * one line where it can, up to two fifths of the frame. On a phone it holds a
 * badge alone, which leaves room for about three months; it keeps the names
 * only when every month fits beside them, as a single month does. The months
 * share what is left as whole columns of one width, and the first column
 * takes the few pixels left over, so the table can rest only where a month
 * begins. Null before the width is known, or with no months.
 */
export function monthTableColumns(
  frameWidth: number,
  content: {
    phone: boolean;
    months: number;
    /** The longest amount, in characters, the net profit row included. */
    amountCharacters: number;
    /** The longest name in the first column, in characters. */
    nameCharacters: number;
  },
): MonthTableColumns | null {
  const pad = content.phone ? MONTH_TABLE_PAD.phone : MONTH_TABLE_PAD.wide;
  const monthWanted = Math.max(MONTH_TEXT_AT_LEAST, Math.ceil(content.amountCharacters * AMOUNT_CHARACTER)) + 2 * pad;
  const nameWanted = Math.max(NAMED_COLUMN.atLeast, Math.ceil(content.nameCharacters * NAME_CHARACTER) + 2 * pad + NAMED_COLUMN.badgeAndGap);
  // What every month needs, and so what a phone can spare for names.
  const besideEveryMonth = frameWidth - content.months * monthWanted;
  const named = !content.phone || besideEveryMonth >= NAMED_COLUMN.atLeast;
  const pinnedWanted = !named
    ? BADGE_ONLY_COLUMN
    : Math.min(NAMED_COLUMN.atMost, nameWanted, content.phone ? besideEveryMonth : Math.floor(frameWidth * NAMED_COLUMN.shareOfFrame));

  const fit = wholeColumns(frameWidth - pinnedWanted, monthWanted, content.months);
  if (!fit) return null;
  const month = Math.floor(fit.width);
  const pinned = frameWidth - fit.visible * month;
  return { named, pinned, month, visible: fit.visible, table: pinned + content.months * month };
}
