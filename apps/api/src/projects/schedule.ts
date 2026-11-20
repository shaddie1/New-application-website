/**
 * A project's service schedule, and the visit dates it gives. Visits are worked
 * out from the schedule rather than stored, so changing the schedule moves every
 * visit that has not happened yet. All dates are calendar dates (YYYY-MM-DD).
 */

export type ProjectKind = 'ONCE' | 'REPEATING';
export type RepeatUnit = 'WEEK' | 'MONTH';

export interface ProjectSchedule {
  kind: ProjectKind;
  /** The service date of a one-off project; the first day of a repeating one. */
  startDate: string | null;
  /** Last day a repeating project can have a visit. Null: it runs until stopped. */
  endDate: string | null;
  repeatEvery: number | null;
  repeatUnit: RepeatUnit | null;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  serviceDays: number[];
  /** Monthly repeats only: 1–4 = that week of the month, 5 = the last. */
  weekOfMonth: number | null;
  /** A deep clean every this many months after the start month. */
  deepCleanEveryMonths: number | null;
}

export interface PlannedVisit {
  date: string;
  isDeepClean: boolean;
}

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ORDINALS = ['', '1st', '2nd', '3rd', '4th', 'last'];

/** The longest span one request may list, so a schedule without an end cannot run forever. */
export const MAX_SPAN_DAYS = 400;

const DAY_MS = 86_400_000;

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return iso(new Date(toUtc(date).getTime() + days * DAY_MS));
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  return ((toUtc(date).getUTCDay() + 6) % 7) + 1;
}

function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

function monthIndex(date: string): number {
  const d = toUtc(date);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** The date of the nth (1–4) or last (5) given weekday in a month, as a month index. */
function nthWeekdayOfMonth(month: number, weekday: number, nth: number): string {
  const year = Math.floor(month / 12);
  const m = month % 12;
  if (nth === 5) {
    const last = iso(new Date(Date.UTC(year, m + 1, 0)));
    const back = (isoWeekday(last) - weekday + 7) % 7;
    return addDays(last, -back);
  }
  const first = iso(new Date(Date.UTC(year, m, 1)));
  const ahead = (weekday - isoWeekday(first) + 7) % 7;
  return addDays(first, ahead + (nth - 1) * 7);
}

/**
 * What is wrong with a schedule, in words for the person filling in the form, or
 * null when it can be used. A one-off project only needs nothing; its schedule
 * fields are ignored.
 */
export function scheduleProblem(s: ProjectSchedule, deepCleanPriceCents: number | null = null): string | null {
  if (s.kind === 'ONCE') return null;
  if (!s.startDate) return 'A repeating project needs a start date.';
  if (s.endDate && s.endDate < s.startDate) return 'The contract can’t end before it starts.';
  if (!s.repeatUnit) return 'Choose whether it repeats every few weeks or every few months.';
  const maxEvery = s.repeatUnit === 'WEEK' ? 52 : 12;
  if (!s.repeatEvery || !Number.isInteger(s.repeatEvery) || s.repeatEvery < 1 || s.repeatEvery > maxEvery) {
    return s.repeatUnit === 'WEEK'
      ? 'Repeat every 1 to 52 weeks.'
      : 'Repeat every 1 to 12 months.';
  }
  if (s.serviceDays.length === 0) return 'Pick at least one service day.';
  if (s.serviceDays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return 'Service days must be Monday to Sunday.';
  if (s.repeatUnit === 'MONTH' && (!s.weekOfMonth || s.weekOfMonth < 1 || s.weekOfMonth > 5)) {
    return 'For a monthly service, choose which week of the month.';
  }
  if (s.deepCleanEveryMonths !== null) {
    if (!Number.isInteger(s.deepCleanEveryMonths) || s.deepCleanEveryMonths < 1 || s.deepCleanEveryMonths > 24) {
      return 'A deep clean can be every 1 to 24 months.';
    }
    if (deepCleanPriceCents === null) return 'Give the deep clean its price.';
  }
  return null;
}

/**
 * Every visit the schedule gives from `from` to `to`, both included, in date
 * order. A one-off project has one visit, on its start date. Assumes the
 * schedule passes scheduleProblem; an unusable one gives no visits.
 */
export function plannedVisits(s: ProjectSchedule, from: string, to: string): PlannedVisit[] {
  if (!s.startDate || to < from) return [];
  if (s.kind === 'ONCE') {
    return s.startDate >= from && s.startDate <= to ? [{ date: s.startDate, isDeepClean: false }] : [];
  }
  if (scheduleProblem(s, 0) !== null) return [];

  const start = s.startDate;
  const lo = from > start ? from : start;
  let hi = s.endDate && s.endDate < to ? s.endDate : to;
  if (daysBetween(lo, hi) > MAX_SPAN_DAYS) hi = addDays(lo, MAX_SPAN_DAYS);
  if (hi < lo) return [];

  const every = s.repeatEvery!;
  const days = new Set(s.serviceDays);
  const dates: string[] = [];

  // Deep cleans run in windows of N months from the start month: the first
  // visit in each window after the first is the deep clean, so it still happens
  // when its month has no visit. Finding it means searching from the start of
  // lo's window, even when that is before `from`.
  const startMonth = monthIndex(start);
  const deepEvery = s.deepCleanEveryMonths;
  const searchFrom = (() => {
    if (!deepEvery) return lo;
    const windowStart = startMonth + Math.floor((monthIndex(lo) - startMonth) / deepEvery) * deepEvery;
    const first = iso(new Date(Date.UTC(Math.floor(windowStart / 12), windowStart % 12, 1)));
    return first > start ? first : start;
  })();

  if (s.repeatUnit === 'WEEK') {
    const anchor = mondayOf(start);
    for (let d = searchFrom; d <= hi; d = addDays(d, 1)) {
      if (!days.has(isoWeekday(d))) continue;
      const weeks = Math.floor(daysBetween(anchor, mondayOf(d)) / 7);
      if (weeks % every === 0) dates.push(d);
    }
  } else {
    for (let m = monthIndex(searchFrom); m <= monthIndex(hi); m++) {
      if ((m - startMonth) % every !== 0) continue;
      for (const day of days) {
        const d = nthWeekdayOfMonth(m, day, s.weekOfMonth!);
        if (d >= searchFrom && d <= hi) dates.push(d);
      }
    }
    dates.sort();
  }

  const windowsSeen = new Set<number>();
  const visits: PlannedVisit[] = dates.map((date) => {
    if (!deepEvery) return { date, isDeepClean: false };
    const window = Math.floor((monthIndex(date) - startMonth) / deepEvery);
    const isDeepClean = window > 0 && !windowsSeen.has(window);
    windowsSeen.add(window);
    return { date, isDeepClean };
  });
  return visits.filter((v) => v.date >= lo);
}

function listOf(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The service days in words: "weekdays", "weekends", or "Mon, Wed and Fri". */
function daysText(serviceDays: number[]): string {
  const sorted = [...new Set(serviceDays)].sort((a, b) => a - b);
  const key = sorted.join(',');
  if (key === '1,2,3,4,5') return 'weekdays';
  if (key === '6,7') return 'weekends';
  if (key === '1,2,3,4,5,6,7') return 'every day';
  return listOf(sorted.map((d) => WEEKDAY_SHORT[d - 1]!));
}

/** A schedule in one line, e.g. "Every week on weekdays" or "Every month on the 2nd Saturday". */
export function describeSchedule(s: ProjectSchedule): string {
  if (s.kind === 'ONCE') return s.startDate ? `One-off, on ${s.startDate}` : 'One-off';
  if (scheduleProblem(s, 0) !== null) return 'Repeating (schedule not finished)';
  const every = s.repeatEvery!;
  const unit = s.repeatUnit === 'WEEK' ? 'week' : 'month';
  const head = every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`;
  let text: string;
  if (s.repeatUnit === 'WEEK') {
    text = `${head} on ${daysText(s.serviceDays)}`;
  } else {
    const names = [...new Set(s.serviceDays)].sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d - 1]!);
    text = `${head} on the ${ORDINALS[s.weekOfMonth!]} ${listOf(names)}`;
  }
  if (s.deepCleanEveryMonths) {
    const n = s.deepCleanEveryMonths;
    text += `, deep clean every ${n === 1 ? 'month' : `${n} months`}`;
  }
  return text;
}

/** Today's date in Nairobi (UTC+3, no daylight saving). */
export function nairobiToday(now: Date = new Date()): string {
  return iso(new Date(now.getTime() + 3 * 3_600_000));
}

/** The hour of the day in Nairobi, 0–23. */
export function nairobiHour(now: Date = new Date()): number {
  return new Date(now.getTime() + 3 * 3_600_000).getUTCHours();
}
