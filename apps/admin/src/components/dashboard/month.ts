/** The month on screen, and the steps the Dashboard's month selector takes. */
export type YearMonth = { year: number; month: number }; // month is 1 to 12

/** The month `now` falls in on the Nairobi calendar, which is the business's. */
export function nairobiYearMonth(now: Date): YearMonth {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // YYYY-MM-DD
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

export function previousMonth({ year, month }: YearMonth): YearMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth({ year, month }: YearMonth): YearMonth {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function isSameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** The month's first and last day as YYYY-MM-DD, for the requests that take a range. */
export function monthRange({ year, month }: YearMonth): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/** "November 2026". */
export function monthLabel({ year, month }: YearMonth): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}
