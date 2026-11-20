import { describe, expect, it } from 'vitest';

import {
  describeSchedule,
  isoWeekday,
  nairobiHour,
  nairobiToday,
  plannedVisits,
  scheduleProblem,
  type ProjectSchedule,
} from './schedule.js';

const repeating = (over: Partial<ProjectSchedule>): ProjectSchedule => ({
  kind: 'REPEATING',
  startDate: '2026-11-20', // a Friday
  endDate: null,
  repeatEvery: 1,
  repeatUnit: 'WEEK',
  serviceDays: [6],
  weekOfMonth: null,
  deepCleanEveryMonths: null,
  ...over,
});

const dates = (s: ProjectSchedule, from: string, to: string) => plannedVisits(s, from, to).map((v) => v.date);
const deep = (s: ProjectSchedule, from: string, to: string) =>
  plannedVisits(s, from, to).filter((v) => v.isDeepClean).map((v) => v.date);

describe('isoWeekday', () => {
  it('counts Monday as 1 and Sunday as 7', () => {
    expect(isoWeekday('2026-11-23')).toBe(1);
    expect(isoWeekday('2026-11-20')).toBe(5);
    expect(isoWeekday('2026-11-22')).toBe(7);
  });
});

describe('plannedVisits for a one-off project', () => {
  const once: ProjectSchedule = { ...repeating({}), kind: 'ONCE', startDate: '2026-12-03' };

  it('gives one visit, on the start date', () => {
    expect(plannedVisits(once, '2026-12-01', '2026-12-31')).toEqual([{ date: '2026-12-03', isDeepClean: false }]);
  });

  it('gives nothing outside the range, or without a date', () => {
    expect(dates(once, '2026-12-04', '2026-12-31')).toEqual([]);
    expect(dates({ ...once, startDate: null }, '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

describe('plannedVisits every few weeks', () => {
  it('gives every weekday of the week', () => {
    const s = repeating({ serviceDays: [1, 2, 3, 4, 5] });
    expect(dates(s, '2026-11-23', '2026-11-29')).toEqual([
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
    ]);
  });

  it('skips the weeks in between, counting from the start week', () => {
    const s = repeating({ repeatEvery: 2, serviceDays: [6] });
    expect(dates(s, '2026-11-01', '2026-12-31')).toEqual(['2026-11-21', '2026-12-05', '2026-12-19']);
  });

  it('never gives a visit before the start or after the end', () => {
    const s = repeating({ serviceDays: [3, 6], endDate: '2026-12-02' });
    expect(dates(s, '2026-11-01', '2027-01-31')).toEqual(['2026-11-21', '2026-11-25', '2026-11-28', '2026-12-02']);
  });
});

describe('plannedVisits every few months', () => {
  it('gives the 2nd Saturday of each month from the start', () => {
    const s = repeating({ repeatUnit: 'MONTH', weekOfMonth: 2 });
    // 14 November is before the start, so the first is in December.
    expect(dates(s, '2026-11-01', '2027-01-31')).toEqual(['2026-12-12', '2027-01-09']);
  });

  it('gives the last Saturday of the month', () => {
    const s = repeating({ repeatUnit: 'MONTH', weekOfMonth: 5 });
    expect(dates(s, '2026-12-01', '2027-01-31')).toEqual(['2026-12-26', '2027-01-30']);
  });

  it('skips the months in between, counting from the start month', () => {
    const s = repeating({ repeatUnit: 'MONTH', repeatEvery: 2, weekOfMonth: 1, serviceDays: [1] });
    expect(dates(s, '2026-11-01', '2027-04-30')).toEqual(['2027-01-04', '2027-03-01']);
  });

  it('gives each chosen day in that week, in date order', () => {
    const s = repeating({ repeatUnit: 'MONTH', weekOfMonth: 1, serviceDays: [6, 2] });
    expect(dates(s, '2026-12-01', '2026-12-31')).toEqual(['2026-12-01', '2026-12-05']);
  });
});

describe('deep cleans', () => {
  it('makes the first visit after every 3 months a deep clean', () => {
    const s = repeating({ deepCleanEveryMonths: 3 });
    // Started in November, so the first deep clean is the first visit in February.
    expect(deep(s, '2026-11-01', '2027-06-30')).toEqual(['2027-02-06', '2027-05-01']);
  });

  it('still knows the deep clean happened when the range starts after it', () => {
    const s = repeating({ deepCleanEveryMonths: 3 });
    expect(deep(s, '2027-02-10', '2027-03-31')).toEqual([]);
    expect(deep(s, '2027-01-25', '2027-02-20')).toEqual(['2027-02-06']);
  });

  it('moves to the next visit when the due month has none', () => {
    const s = repeating({ repeatUnit: 'MONTH', repeatEvery: 2, weekOfMonth: 1, serviceDays: [1], deepCleanEveryMonths: 3 });
    // Visits fall in January and March; the deep clean due in February goes to March.
    expect(deep(s, '2026-11-01', '2027-04-30')).toEqual(['2027-03-01']);
  });
});

describe('scheduleProblem', () => {
  it('accepts a one-off project with no schedule', () => {
    expect(scheduleProblem({ ...repeating({}), kind: 'ONCE', startDate: null })).toBeNull();
  });

  it('accepts a finished repeating schedule', () => {
    expect(scheduleProblem(repeating({}))).toBeNull();
    expect(scheduleProblem(repeating({ deepCleanEveryMonths: 3 }), 800_000)).toBeNull();
  });

  it('says what is missing, in plain words', () => {
    expect(scheduleProblem(repeating({ startDate: null }))).toBe('A repeating project needs a start date.');
    expect(scheduleProblem(repeating({ endDate: '2026-11-01' }))).toBe('The contract can’t end before it starts.');
    expect(scheduleProblem(repeating({ repeatUnit: null }))).toBe('Choose whether it repeats every few weeks or every few months.');
    expect(scheduleProblem(repeating({ repeatEvery: 0 }))).toBe('Repeat every 1 to 52 weeks.');
    expect(scheduleProblem(repeating({ repeatUnit: 'MONTH', repeatEvery: 13, weekOfMonth: 1 }))).toBe('Repeat every 1 to 12 months.');
    expect(scheduleProblem(repeating({ serviceDays: [] }))).toBe('Pick at least one service day.');
    expect(scheduleProblem(repeating({ repeatUnit: 'MONTH' }))).toBe('For a monthly service, choose which week of the month.');
    expect(scheduleProblem(repeating({ deepCleanEveryMonths: 3 }))).toBe('Give the deep clean its price.');
    expect(scheduleProblem(repeating({ deepCleanEveryMonths: 30 }), 1)).toBe('A deep clean can be every 1 to 24 months.');
  });
});

describe('describeSchedule', () => {
  it('reads like a sentence', () => {
    expect(describeSchedule(repeating({ serviceDays: [1, 2, 3, 4, 5] }))).toBe('Every week on weekdays');
    expect(describeSchedule(repeating({ repeatEvery: 2, serviceDays: [7, 6] }))).toBe('Every 2 weeks on weekends');
    expect(describeSchedule(repeating({ serviceDays: [5, 1, 3] }))).toBe('Every week on Mon, Wed and Fri');
    expect(describeSchedule(repeating({ repeatUnit: 'MONTH', weekOfMonth: 2 }))).toBe('Every month on the 2nd Saturday');
    expect(describeSchedule(repeating({ repeatUnit: 'MONTH', repeatEvery: 3, weekOfMonth: 5, serviceDays: [1] })))
      .toBe('Every 3 months on the last Monday');
    expect(describeSchedule(repeating({ deepCleanEveryMonths: 3 }))).toBe('Every week on Sat, deep clean every 3 months');
    expect(describeSchedule({ ...repeating({}), kind: 'ONCE', startDate: '2026-12-03' })).toBe('One-off, on 2026-12-03');
  });
});

describe('Nairobi time', () => {
  it('is three hours ahead of UTC', () => {
    expect(nairobiToday(new Date('2026-11-20T22:00:00Z'))).toBe('2026-11-21');
    expect(nairobiToday(new Date('2026-11-20T20:59:00Z'))).toBe('2026-11-20');
    expect(nairobiHour(new Date('2026-11-20T04:00:00Z'))).toBe(7);
  });
});
