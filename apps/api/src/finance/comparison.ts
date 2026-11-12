import type { ComparisonMode } from '@onyxhawk/types';

/** Calendar days, both inclusive, as YYYY-MM-DD. */
export interface DayRange {
  from: string;
  to: string;
}

export interface ComparisonWindow {
  mode: ComparisonMode;
  /** The day of the month both sides stop at (the previous side sooner, if its month is shorter); null for whole months. */
  cutoffDay: number | null;
  current: DayRange;
  previous: DayRange;
}

/** Today's calendar date in Nairobi, as YYYY-MM-DD, whatever the server's clock is set to. */
export function nairobiToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

const pad = (n: number) => String(n).padStart(2, '0');

const lastDayOf = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Days 1 to `lastDay` of a month. */
const daysOf = (year: number, month: number, lastDay: number): DayRange => ({
  from: `${year}-${pad(month)}-01`,
  to: `${year}-${pad(month)}-${pad(lastDay)}`,
});

/** The whole of one calendar month (`month` is 1 to 12). */
export function monthDays(year: number, month: number): DayRange {
  return daysOf(year, month, lastDayOf(year, month));
}

/**
 * The two ranges a month's change figures compare. When the month holds
 * `today`, it is still running: days 1 to today are set against the same days
 * of the month before, stopping at that month's last day when it is shorter.
 * Any other month, past or future, is compared whole with the whole month
 * before it.
 */
export function comparisonWindow(year: number, month: number, today: string): ComparisonWindow {
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number) as [number, number, number];
  const before = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

  if (year !== todayYear || month !== todayMonth) {
    return {
      mode: 'full-month',
      cutoffDay: null,
      current: monthDays(year, month),
      previous: monthDays(before.year, before.month),
    };
  }
  return {
    mode: 'same-period',
    cutoffDay: todayDay,
    current: daysOf(year, month, todayDay),
    previous: daysOf(before.year, before.month, Math.min(todayDay, lastDayOf(before.year, before.month))),
  };
}

/**
 * A range as bounds for a date column. Job and cost dates are calendar dates
 * stored at midnight UTC, so the bounds are UTC too: built from local time
 * they would shift by the server's offset.
 */
export function utcBounds(range: DayRange): { from: Date; to: Date } {
  return {
    from: new Date(`${range.from}T00:00:00.000Z`),
    to: new Date(`${range.to}T23:59:59.999Z`),
  };
}
