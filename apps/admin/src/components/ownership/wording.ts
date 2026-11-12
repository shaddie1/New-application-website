import { money } from '../../lib/money';
import type { OwnershipScope } from './scope';
import { BASIS_POINTS_TOTAL, formatPercentShort } from './stakes';

/** The sentences on the Ownership page that depend on the scope or the figures. */

/** U+2212, the true minus sign, as `money` writes it. */
const MINUS = '−';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-01-20" as "20 Jan 2026". The date is read as written, with no time zone involved. */
export function formatDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || month === undefined) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

/** What the figures cover, under the headline. `monthLabel` is the current month, such as "November 2026". */
export function scopeLine(scope: OwnershipScope, firstJobDate: string | null, monthLabel: string): string {
  if (scope === 'this-month') return `This month, ${monthLabel}`;
  return firstJobDate ? `All time, since ${formatDay(firstJobDate)}` : 'All time';
}

/**
 * The one line that takes the share bar's place when there is no profit to
 * split: none at all, or a loss. Null while there is a profit.
 */
export function noSplitLine(netCents: number, scope: OwnershipScope): string | null {
  if (netCents > 0) return null;
  if (netCents === 0) return scope === 'this-month' ? 'No profit to share this month' : 'No profit to share yet';
  return `A loss of ${money(-netCents)} ${scope === 'this-month' ? 'this month' : 'all time'}`;
}

/**
 * The heading of the table's share column in its two parts, "Share," and what
 * it covers. A narrow column puts the second part on a line of its own.
 */
export function shareHeadingParts(scope: OwnershipScope, monthLabel: string): [string, string] {
  return ['Share,', scope === 'this-month' ? monthLabel : 'all time'];
}

/**
 * The name of the row for what the stakes leave over. Short of 100% the
 * business keeps the rest; past 100% nothing is kept, the stakes hand out
 * more than there is.
 */
export function remainderName(totalBasisPoints: number): string {
  return totalBasisPoints > BASIS_POINTS_TOTAL ? 'Over-allocated' : 'Retained by the business';
}

/** That row's stake: "10%" retained, or "−20%" when the stakes pass 100% by 20. */
export function remainderStake(totalBasisPoints: number): string {
  const over = totalBasisPoints - BASIS_POINTS_TOTAL;
  return over > 0 ? `${MINUS}${formatPercentShort(over)}` : formatPercentShort(-over);
}

/**
 * The line above the history when the stakes pass 100%: each bar stacks the
 * holders' shares, which then come to more than the month's net profit.
 * Null at 100% or under.
 */
export function overAllocatedLine(totalBasisPoints: number): string | null {
  if (totalBasisPoints <= BASIS_POINTS_TOTAL) return null;
  return `The stakes add up to ${formatPercentShort(totalBasisPoints)}, more than 100%, so each month’s bar exceeds its net profit.`;
}

/** The unit of every amount in the month table, said once above it and once in its caption. */
export const AMOUNTS_UNIT = 'Amounts in KSh';

/**
 * The words around the month table. `monthHeadings` are the months it shows,
 * such as "Nov 2026 so far". The note points to the chart only when one is
 * drawn above the table, and asks for scrolling only when months are out of
 * view; a table of one month is headed with that month.
 */
export function monthTableWording(
  monthHeadings: string[],
  { chart, scrolls }: { chart: boolean; scrolls: boolean },
): { heading: string; note: string; caption: string } {
  const covers = monthHeadings.length === 1 ? monthHeadings[0]! : 'month by month';
  const note = [
    chart ? 'The same amounts as the chart, at today’s stakes.' : 'At today’s stakes.',
    ...(scrolls ? ['Scroll sideways for earlier months.'] : []),
  ].join(' ');
  return {
    heading: `Each holder’s share, ${covers}`,
    note,
    caption: `Each holder’s share of net profit, ${covers}, at today’s stakes. ${AMOUNTS_UNIT}.`,
  };
}
