import { describe, expect, it } from 'vitest';

import { isSameMonth, monthLabel, monthRange, nairobiYearMonth, nextMonth, previousMonth } from './month';

describe('nairobiYearMonth', () => {
  it('reads the month from the Nairobi calendar, not the UTC one', () => {
    // 22:00 UTC on 31 October is 01:00 on 1 November in Nairobi.
    expect(nairobiYearMonth(new Date('2026-10-31T22:00:00Z'))).toEqual({ year: 2026, month: 11 });
    expect(nairobiYearMonth(new Date('2026-10-31T20:59:00Z'))).toEqual({ year: 2026, month: 10 });
  });

  it('crosses the year at midnight in Nairobi', () => {
    expect(nairobiYearMonth(new Date('2026-12-31T21:30:00Z'))).toEqual({ year: 2027, month: 1 });
  });
});

describe('previousMonth and nextMonth', () => {
  it('step one month', () => {
    expect(previousMonth({ year: 2026, month: 11 })).toEqual({ year: 2026, month: 10 });
    expect(nextMonth({ year: 2026, month: 10 })).toEqual({ year: 2026, month: 11 });
  });

  it('cross the year', () => {
    expect(previousMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
    expect(nextMonth({ year: 2025, month: 12 })).toEqual({ year: 2026, month: 1 });
  });
});

describe('isSameMonth', () => {
  it('compares year and month', () => {
    expect(isSameMonth({ year: 2026, month: 11 }, { year: 2026, month: 11 })).toBe(true);
    expect(isSameMonth({ year: 2026, month: 11 }, { year: 2025, month: 11 })).toBe(false);
    expect(isSameMonth({ year: 2026, month: 11 }, { year: 2026, month: 10 })).toBe(false);
  });
});

describe('monthRange', () => {
  it('runs from the first to the last day of the month', () => {
    expect(monthRange({ year: 2026, month: 11 })).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange({ year: 2026, month: 1 })).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('knows a leap February from an ordinary one', () => {
    expect(monthRange({ year: 2028, month: 2 }).to).toBe('2028-02-29');
    expect(monthRange({ year: 2027, month: 2 }).to).toBe('2027-02-28');
  });
});

describe('monthLabel', () => {
  it('names the month and the year', () => {
    expect(monthLabel({ year: 2026, month: 11 })).toBe('November 2026');
    expect(monthLabel({ year: 2027, month: 1 })).toBe('January 2027');
  });
});
