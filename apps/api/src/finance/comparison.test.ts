import { afterEach, describe, expect, it, vi } from 'vitest';

import { comparisonWindow, monthDays, nairobiToday, utcBounds } from './comparison.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('comparisonWindow', () => {
  it('compares days 1 to today with the same days of the month before when the month is the current one (AE1)', () => {
    expect(comparisonWindow(2026, 11, '2026-11-12')).toEqual({
      mode: 'same-period',
      cutoffDay: 12,
      current: { from: '2026-11-01', to: '2026-11-12' },
      previous: { from: '2026-10-01', to: '2026-10-12' },
    });
  });

  it('stops the previous range at the last day of a shorter month (AE2)', () => {
    expect(comparisonWindow(2026, 3, '2026-03-31')).toEqual({
      mode: 'same-period',
      cutoffDay: 31,
      current: { from: '2026-03-01', to: '2026-03-31' },
      previous: { from: '2026-02-01', to: '2026-02-28' },
    });
  });

  it('stops the previous range at 29 February in a leap year (AE2)', () => {
    const window = comparisonWindow(2028, 3, '2028-03-31');

    expect(window.previous).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(window.cutoffDay).toBe(31);
  });

  it('compares one day with one day on the first of the month', () => {
    expect(comparisonWindow(2026, 11, '2026-11-01')).toEqual({
      mode: 'same-period',
      cutoffDay: 1,
      current: { from: '2026-11-01', to: '2026-11-01' },
      previous: { from: '2026-10-01', to: '2026-10-01' },
    });
  });

  it('reaches back to December of the year before in January', () => {
    expect(comparisonWindow(2027, 1, '2027-01-15')).toEqual({
      mode: 'same-period',
      cutoffDay: 15,
      current: { from: '2027-01-01', to: '2027-01-15' },
      previous: { from: '2026-12-01', to: '2026-12-15' },
    });
  });

  it('compares whole month with whole month for a month already over (AE4)', () => {
    expect(comparisonWindow(2026, 9, '2026-11-12')).toEqual({
      mode: 'full-month',
      cutoffDay: null,
      current: { from: '2026-09-01', to: '2026-09-30' },
      previous: { from: '2026-08-01', to: '2026-08-31' },
    });
  });

  it('compares whole month with whole month for a month still to come', () => {
    expect(comparisonWindow(2026, 12, '2026-11-12')).toEqual({
      mode: 'full-month',
      cutoffDay: null,
      current: { from: '2026-12-01', to: '2026-12-31' },
      previous: { from: '2026-11-01', to: '2026-11-30' },
    });
  });

  it('treats the same month of another year as a different month', () => {
    const window = comparisonWindow(2025, 11, '2026-11-12');

    expect(window.mode).toBe('full-month');
    expect(window.previous).toEqual({ from: '2025-10-01', to: '2025-10-31' });
  });

  it('makes November the current month once it is 1 November in Nairobi, whatever the UTC date (AE3)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T22:00:00.000Z')); // 01:00 on 1 November in Nairobi

    expect(nairobiToday()).toBe('2026-11-01');
    expect(comparisonWindow(2026, 11, nairobiToday())).toEqual({
      mode: 'same-period',
      cutoffDay: 1,
      current: { from: '2026-11-01', to: '2026-11-01' },
      previous: { from: '2026-10-01', to: '2026-10-01' },
    });
  });
});

describe('nairobiToday', () => {
  it('still reads the Nairobi date just before midnight there', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T20:59:00.000Z')); // 23:59 on 31 October in Nairobi

    expect(nairobiToday()).toBe('2026-10-31');
  });
});

describe('monthDays', () => {
  it('runs from the first day of the month to its last', () => {
    expect(monthDays(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthDays(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthDays(2026, 12)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('utcBounds', () => {
  /** A date as the database gives a job or a cost: midnight UTC of its calendar day. */
  const stored = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
  const inside = (ymd: string, bounds: { from: Date; to: Date }) => stored(ymd) >= bounds.from && stored(ymd) <= bounds.to;

  it('spans the first instant of the first day to the last instant of the last day, in UTC', () => {
    const bounds = utcBounds({ from: '2026-10-01', to: '2026-10-12' });

    expect(bounds.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(bounds.to.toISOString()).toBe('2026-10-12T23:59:59.999Z');
  });

  it('holds every stored day of the range and neither neighbour, on any server clock', () => {
    const bounds = utcBounds({ from: '2026-11-01', to: '2026-11-12' });

    expect(inside('2026-10-31', bounds)).toBe(false);
    expect(inside('2026-11-01', bounds)).toBe(true);
    expect(inside('2026-11-12', bounds)).toBe(true);
    expect(inside('2026-11-13', bounds)).toBe(false);
  });
});
