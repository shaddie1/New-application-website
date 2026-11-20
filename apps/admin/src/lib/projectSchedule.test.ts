import { describe, expect, it } from 'vitest';

import {
  WEEKDAY_SET,
  WEEKEND_SET,
  addDays,
  emptySchedule,
  nairobiToday,
  sameDays,
  scheduleFormOf,
  scheduleInput,
  toggleDay,
  visitDateLabel,
} from './projectSchedule';

describe('scheduleInput', () => {
  it('sends only the kind for a one-off project', () => {
    expect(scheduleInput('ONCE', { ...emptySchedule(), serviceDays: [6] })).toEqual({ kind: 'ONCE' });
  });

  it('sends a weekly schedule without a week of the month or deep clean', () => {
    expect(scheduleInput('REPEATING', { ...emptySchedule(), repeatEvery: '2', serviceDays: [7, 6] })).toEqual({
      kind: 'REPEATING', repeatEvery: 2, repeatUnit: 'WEEK', serviceDays: [6, 7], weekOfMonth: null,
      deepCleanEveryMonths: null, deepCleanPriceCents: null,
    });
  });

  it('sends a monthly schedule with its week, and a deep clean in cents', () => {
    const form = {
      ...emptySchedule(), repeatUnit: 'MONTH' as const, weekOfMonth: '5', serviceDays: [6],
      hasDeepClean: true, deepCleanEveryMonths: '3', deepCleanPriceKes: '8000',
    };
    expect(scheduleInput('REPEATING', form)).toMatchObject({
      repeatUnit: 'MONTH', weekOfMonth: 5, deepCleanEveryMonths: 3, deepCleanPriceCents: 800_000,
    });
  });

  it('sends blanks as null, so the server can say what is missing', () => {
    expect(scheduleInput('REPEATING', { ...emptySchedule(), repeatEvery: ' ', hasDeepClean: true, deepCleanPriceKes: '' }))
      .toMatchObject({ repeatEvery: null, deepCleanEveryMonths: 3, deepCleanPriceCents: null });
  });
});

describe('scheduleFormOf', () => {
  it('reads a stored schedule back into the form', () => {
    expect(scheduleFormOf({
      repeatEvery: 1, repeatUnit: 'MONTH', serviceDays: [6], weekOfMonth: 2, deepCleanEveryMonths: 3, deepCleanPriceCents: 800_000,
    })).toEqual({
      repeatEvery: '1', repeatUnit: 'MONTH', serviceDays: [6], weekOfMonth: '2',
      hasDeepClean: true, deepCleanEveryMonths: '3', deepCleanPriceKes: '8000',
    });
  });

  it('fills sensible starting values for a project with no schedule', () => {
    expect(scheduleFormOf({
      repeatEvery: null, repeatUnit: null, serviceDays: [], weekOfMonth: null, deepCleanEveryMonths: null, deepCleanPriceCents: null,
    })).toEqual(emptySchedule());
  });
});

describe('days', () => {
  it('ticks and unticks a day, keeping Monday first', () => {
    expect(toggleDay([6], 1)).toEqual([1, 6]);
    expect(toggleDay([1, 6], 6)).toEqual([1]);
  });

  it('knows the Weekdays and Weekends sets', () => {
    expect(sameDays([5, 4, 3, 2, 1], WEEKDAY_SET)).toBe(true);
    expect(sameDays([6, 7], WEEKEND_SET)).toBe(true);
    expect(sameDays([6], WEEKEND_SET)).toBe(false);
  });
});

describe('dates', () => {
  it('labels a visit date and steps through days', () => {
    expect(visitDateLabel('2026-12-05')).toBe('Sat 5 Dec');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(nairobiToday(new Date('2026-11-20T22:00:00Z'))).toBe('2026-11-21');
  });
});
