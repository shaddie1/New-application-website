import type { ProjectDto, ProjectKind, ProjectScheduleInput, RepeatUnit } from '@onyxhawk/types';

/** The schedule part of a project form, as typed (numbers stay text until sent). */
export interface ScheduleForm {
  repeatEvery: string;
  repeatUnit: RepeatUnit;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  serviceDays: number[];
  /** '1'–'4', or '5' for the last week. */
  weekOfMonth: string;
  hasDeepClean: boolean;
  deepCleanEveryMonths: string;
  deepCleanPriceKes: string;
}

export const WEEKDAYS: { day: number; short: string; name: string }[] = [
  { day: 1, short: 'Mon', name: 'Monday' },
  { day: 2, short: 'Tue', name: 'Tuesday' },
  { day: 3, short: 'Wed', name: 'Wednesday' },
  { day: 4, short: 'Thu', name: 'Thursday' },
  { day: 5, short: 'Fri', name: 'Friday' },
  { day: 6, short: 'Sat', name: 'Saturday' },
  { day: 7, short: 'Sun', name: 'Sunday' },
];

export const WEEK_OF_MONTH: { value: string; label: string }[] = [
  { value: '1', label: '1st week' },
  { value: '2', label: '2nd week' },
  { value: '3', label: '3rd week' },
  { value: '4', label: '4th week' },
  { value: '5', label: 'Last week' },
];

export const WEEKDAY_SET = [1, 2, 3, 4, 5];
export const WEEKEND_SET = [6, 7];

export function emptySchedule(): ScheduleForm {
  return {
    repeatEvery: '1',
    repeatUnit: 'WEEK',
    serviceDays: [],
    weekOfMonth: '1',
    hasDeepClean: false,
    deepCleanEveryMonths: '3',
    deepCleanPriceKes: '',
  };
}

/** A project's stored schedule, ready to edit. */
export function scheduleFormOf(p: Pick<ProjectDto, 'repeatEvery' | 'repeatUnit' | 'serviceDays' | 'weekOfMonth' | 'deepCleanEveryMonths' | 'deepCleanPriceCents'>): ScheduleForm {
  const blank = emptySchedule();
  return {
    repeatEvery: p.repeatEvery ? String(p.repeatEvery) : blank.repeatEvery,
    repeatUnit: p.repeatUnit ?? blank.repeatUnit,
    serviceDays: [...p.serviceDays],
    weekOfMonth: p.weekOfMonth ? String(p.weekOfMonth) : blank.weekOfMonth,
    hasDeepClean: p.deepCleanEveryMonths !== null,
    deepCleanEveryMonths: p.deepCleanEveryMonths ? String(p.deepCleanEveryMonths) : blank.deepCleanEveryMonths,
    deepCleanPriceKes: p.deepCleanPriceCents !== null ? String(p.deepCleanPriceCents / 100) : '',
  };
}

function wholeOrNull(text: string): number | null {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(n) ? Math.round(n) : null;
}

/** What the server is sent for a project of this kind. A one-off project sends no schedule. */
export function scheduleInput(kind: ProjectKind, form: ScheduleForm): ProjectScheduleInput {
  if (kind === 'ONCE') return { kind };
  const price = wholeOrNull(form.deepCleanPriceKes);
  return {
    kind,
    repeatEvery: wholeOrNull(form.repeatEvery),
    repeatUnit: form.repeatUnit,
    serviceDays: [...form.serviceDays].sort((a, b) => a - b),
    weekOfMonth: form.repeatUnit === 'MONTH' ? wholeOrNull(form.weekOfMonth) : null,
    deepCleanEveryMonths: form.hasDeepClean ? wholeOrNull(form.deepCleanEveryMonths) : null,
    deepCleanPriceCents: form.hasDeepClean && price !== null ? price * 100 : null,
  };
}

/** Tick or untick one day. */
export function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

/** Whether exactly this set of days is ticked, for lighting up the Weekdays / Weekends shortcuts. */
export function sameDays(days: number[], set: number[]): boolean {
  return days.length === set.length && set.every((d) => days.includes(d));
}

/** "Sat 5 Dec", for listing visits. */
export function visitDateLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/** Today's date in Nairobi, YYYY-MM-DD. */
export function nairobiToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

/** A date some days from another, YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
