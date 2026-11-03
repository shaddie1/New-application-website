import type { CompanyFigures, MyShares, MySharesMonth, ServiceLineFigures } from '@onyxhawk/types';
import type { StatComparison } from './charts';
import { money } from './charts';

/**
 * The shareholder page's period model. A period is one of the 12 months
 * shown ("YYYY-MM"), this quarter, this year or all time. The page holds one
 * period; the picker and a click on either month chart both set it, and
 * everything below the header follows it without a refetch.
 */

export type LongPeriod = 'quarter' | 'year' | 'allTime';
export type PeriodKey = string; // "YYYY-MM" | LongPeriod

export const LONG_PERIODS: readonly LongPeriod[] = ['quarter', 'year', 'allTime'];

function isLongPeriod(key: PeriodKey): key is LongPeriod {
  return (LONG_PERIODS as readonly string[]).includes(key);
}

/** How many months the charts and the picker show; the payload carries 25. */
const MONTHS_SHOWN = 12;

export interface PeriodView {
  key: PeriodKey;
  kind: 'month' | LongPeriod;
  /** Names the period in the header, the print title and tile labels, e.g. "October 2026" or "All time". */
  title: string;
  /** The same inside a sentence: "October 2026", "all time". */
  phrase: string;
  /** Still running: the month in progress, or the quarter and year that contain it. */
  inProgress: boolean;
  /** False only for a month before records began. */
  hasRecords: boolean;
  figures: CompanyFigures & { ownShareCents: number };
  byServiceLine: ServiceLineFigures[];
  /** Inclusive YYYY-MM-DD bounds for the photo filter; null for all time, which takes every job. */
  range: { from: string; to: string } | null;
  /** The month's position in `months`, for its comparisons. */
  monthIndex: number | null;
}

/** The last 12 months of the payload, oldest first; the last is the month in progress. */
export function shownMonths(data: MyShares): MySharesMonth[] {
  return data.months.slice(-MONTHS_SHOWN);
}

/** A picked period that still exists, else the month in progress (the default). */
export function resolvePeriod(data: MyShares, picked: PeriodKey | null): PeriodKey {
  if (picked && isLongPeriod(picked)) return picked;
  if (picked && shownMonths(data).some((m) => m.key === picked)) return picked;
  return data.currentMonth;
}

export function periodView(data: MyShares, key: PeriodKey): PeriodView {
  if (isLongPeriod(key)) {
    const p = data.periods[key];
    // A quarter never crosses a year, so the year is written once: "October–December 2026".
    const title =
      key === 'quarter'
        ? `${monthName((p.from ?? p.to).slice(0, 7), 'long', false)}–${monthName(p.to.slice(0, 7), 'long')}`
        : key === 'year'
          ? p.to.slice(0, 4)
          : 'All time';
    return {
      key,
      kind: key,
      title,
      phrase: key === 'allTime' ? 'all time' : title,
      inProgress: key !== 'allTime',
      hasRecords: true,
      figures: { revenueCents: p.revenueCents, netCents: p.netCents, jobs: p.jobs, ownShareCents: p.ownShareCents },
      byServiceLine: p.byServiceLine,
      range: key === 'allTime' || !p.from ? null : { from: p.from, to: p.to },
      monthIndex: null,
    };
  }

  const monthIndex = data.months.findIndex((m) => m.key === key);
  const m = data.months[monthIndex]!;
  return {
    key,
    kind: 'month',
    title: monthName(m.key, 'long'),
    phrase: monthName(m.key, 'long'),
    inProgress: m.inProgress,
    hasRecords: m.hasRecords,
    figures: { revenueCents: m.revenueCents, netCents: m.netCents, jobs: m.jobs, ownShareCents: m.ownShareCents },
    byServiceLine: m.byServiceLine,
    range: { from: `${m.key}-01`, to: lastDay(m.key) },
    monthIndex,
  };
}

/** The picker's label for a long period, e.g. "This quarter (Oct–Dec 2026)". */
export function longPeriodOption(data: MyShares, key: LongPeriod): string {
  const p = data.periods[key];
  if (key === 'quarter') {
    const from = (p.from ?? p.to).slice(0, 7);
    return `This quarter (${monthName(from, 'short', false)}–${monthName(p.to.slice(0, 7), 'short')})`;
  }
  if (key === 'year') return `This year (${p.to.slice(0, 4)})`;
  return 'All time';
}

/** "2026-10" → "October 2026", "Oct 2026", or without the year. */
export function monthName(key: string, style: 'long' | 'short', withYear = true): string {
  const date = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
  return date.toLocaleDateString('en-KE', {
    month: style,
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

// ── Change figures ────────────────────────────────────────────────────────────

type Comparable = CompanyFigures & { hasRecords: boolean };

/** Percent change; null ("Not available") when the earlier figure has no records or is zero against a non-zero one. */
function percentChange(current: number, earlier: Comparable | undefined, pick: (f: CompanyFigures) => number) {
  if (!earlier?.hasRecords) return null;
  const before = pick(earlier);
  if (before === 0) return current === 0 ? 0 : null;
  return Math.round(((current - before) / Math.abs(before)) * 100);
}

export interface PeriodChanges {
  revenue: StatComparison[];
  net: StatComparison[];
  jobs: StatComparison[];
}

/**
 * Change lines for a month period; undefined for quarter, year and all time,
 * whose tiles carry no comparison line. The month in progress compares
 * with the same days of the earlier months; a closed month compares
 * whole months, `months[i-1]` and the year-earlier `months[i-12]`. A month
 * without records reads "Not available", never 0%. Net profit changes
 * in KSh, since a percentage across a loss and a profit misleads.
 */
export function periodChanges(data: MyShares, view: PeriodView): PeriodChanges | undefined {
  if (view.kind !== 'month' || view.monthIndex === null) return undefined;
  const month = data.months[view.monthIndex]!;

  const against: { figures: Comparable | undefined; label: string }[] = month.inProgress
    ? [
        { figures: data.comparisons.previousMonth, label: 'vs the same days last month' },
        { figures: data.comparisons.sameMonthLastYear, label: 'vs the same days a year ago' },
      ]
    : [
        { figures: data.months[view.monthIndex - 1], label: `vs ${monthName(addMonths(month.key, -1), 'short')}` },
        { figures: data.months[view.monthIndex - 12], label: `vs ${monthName(addMonths(month.key, -12), 'short')}` },
      ];

  return {
    revenue: against.map((a) => ({
      label: a.label,
      delta: percentChange(month.revenueCents, a.figures, (f) => f.revenueCents),
    })),
    net: against.map((a) => ({
      label: a.label,
      delta: a.figures?.hasRecords ? month.netCents - a.figures.netCents : null,
      format: money,
    })),
    jobs: against.map((a) => ({ label: a.label, delta: percentChange(month.jobs, a.figures, (f) => f.jobs) })),
  };
}

function addMonths(key: string, n: number): string {
  const index = Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1 + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** "2026-02" → "2026-02-28". */
function lastDay(key: string): string {
  const days = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
  return `${key}-${String(days).padStart(2, '0')}`;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Basis points as a percentage: 2500 → "25%", 3333 → "33.33%". */
export function stakePercent(basisPoints: number): string {
  return `${(basisPoints / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}%`;
}

/** A moment on the Nairobi clock, where the books are kept: "3 Nov 2026, 14:05". */
export function nairobiTime(at: Date | string): string {
  return new Date(at).toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Nairobi',
  });
}

/** The Nairobi calendar date of a moment: "12 Mar 2026". */
export function nairobiDate(at: string): string {
  return new Date(at).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  });
}

/** A calendar date as written: "2026-03-12" → "12 Mar 2026". */
export function calendarDate(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
