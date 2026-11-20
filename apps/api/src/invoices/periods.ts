/**
 * Billing periods and the lines an invoice suggests for each, following the
 * project's Payment setting (the owner's choice, 20 November 2026):
 *
 *   One-off (whole job)  one invoice for the whole job, at the agreed value
 *   Per month            one invoice per calendar month, at the monthly rate
 *   Per week             one invoice per week (Monday to Sunday), at the weekly rate
 *   Per day              one invoice per week, at the day rate for each service day
 *
 * A repeating project's deep cleans add a line at their own price in the
 * period they fall in. A skipped visit is not charged. Periods are clipped to
 * the contract's start and end. All dates are calendar dates (YYYY-MM-DD).
 */
import { addDays, isoWeekday, plannedVisits, type ProjectSchedule } from '../projects/schedule.js';

export type PaymentFrequency = 'ONE_OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface BillingProject {
  title: string;
  paymentFrequency: PaymentFrequency;
  /** The whole job (one-off) or the rate per period. Null: not agreed yet, so lines start at zero. */
  valueCents: number | null;
  deepCleanPriceCents: number | null;
  schedule: ProjectSchedule;
}

export interface BillingPeriod {
  start: string;
  end: string;
  label: string;
}

export interface SuggestedLine {
  description: string;
  quantity: number;
  unitCents: number;
  amountCents: number;
}

/** The most periods listed at once, newest kept: a long contract with no end still lists quickly. */
export const MAX_PERIODS = 36;

const MONTH_FMT: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric', timeZone: 'UTC' };
const DAY_FMT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
const DAY_YEAR_FMT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (date: string, opts: Intl.DateTimeFormatOptions) => utc(date).toLocaleDateString('en-GB', opts);

function monthStart(date: string): string {
  const d = utc(date);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

function monthEnd(date: string): string {
  const d = utc(date);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

const maxDate = (a: string, b: string) => (a > b ? a : b);
const minDate = (a: string, b: string) => (a < b ? a : b);

/** "23–29 Nov 2026", or across months "30 Nov – 6 Dec 2026". */
function rangeLabel(start: string, end: string): string {
  if (start === end) return fmt(start, DAY_YEAR_FMT);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth
    ? `${utc(start).getUTCDate()}–${fmt(end, DAY_YEAR_FMT)}`
    : `${fmt(start, DAY_FMT)} – ${fmt(end, DAY_YEAR_FMT)}`;
}

/**
 * Every billing period from the project's start up to the one holding `upTo`
 * (usually today), oldest first, at most MAX_PERIODS (the newest). A project
 * with no start date has none: there is nothing to bill from yet.
 */
export function billingPeriods(p: BillingProject, upTo: string): BillingPeriod[] {
  const start = p.schedule.startDate;
  if (!start) return [];
  const end = p.schedule.endDate && p.schedule.endDate >= start ? p.schedule.endDate : null;

  if (p.paymentFrequency === 'ONE_OFF') {
    const last = end ?? start;
    return [{ start, end: last, label: start === last ? fmt(start, DAY_YEAR_FMT) : rangeLabel(start, last) }];
  }

  const stop = end ? minDate(end, upTo) : upTo;
  if (stop < start) return [];
  const out: BillingPeriod[] = [];

  if (p.paymentFrequency === 'MONTHLY') {
    for (let m = monthStart(start); m <= stop; m = addDays(monthEnd(m), 1)) {
      out.push({ start: maxDate(m, start), end: end ? minDate(monthEnd(m), end) : monthEnd(m), label: fmt(m, MONTH_FMT) });
    }
  } else {
    // Weekly and daily rates are both billed by the week, Monday to Sunday.
    for (let w = addDays(start, 1 - isoWeekday(start)); w <= stop; w = addDays(w, 7)) {
      const s = maxDate(w, start);
      const e = end ? minDate(addDays(w, 6), end) : addDays(w, 6);
      out.push({ start: s, end: e, label: rangeLabel(s, e) });
    }
  }
  return out.slice(-MAX_PERIODS);
}

/** A stored invoice's period, named the way billingPeriods names it. */
export function periodLabel(frequency: PaymentFrequency, start: string, end: string): string {
  return frequency === 'MONTHLY' ? fmt(start, MONTH_FMT) : rangeLabel(start, end);
}

/**
 * The periods an invoice can be made for: every one up to today, and the next
 * one too, since a contract is often invoiced in advance. Newest first.
 */
export function invoiceablePeriods(p: BillingProject, today: string): BillingPeriod[] {
  const periods = billingPeriods(p, today);
  const last = periods[periods.length - 1];
  if (last && p.paymentFrequency !== 'ONE_OFF') {
    const next = billingPeriods(p, addDays(last.end, 1));
    const ahead = next[next.length - 1];
    if (ahead && ahead.start > last.end) periods.push(ahead);
  }
  if (periods.length === 0 && p.schedule.startDate && p.paymentFrequency !== 'ONE_OFF') {
    // Starts later: its first period can already be invoiced.
    periods.push(...billingPeriods(p, p.schedule.startDate));
  }
  return periods.reverse();
}

/** The service days in a period that count for a day rate: every planned visit not skipped. */
function chargeableVisits(p: BillingProject, period: BillingPeriod, skipped: Set<string>) {
  return plannedVisits(p.schedule, period.start, period.end).filter((v) => !skipped.has(v.date));
}

/**
 * The lines an invoice for this period starts with. They can be changed while
 * the invoice is a draft (a part month, a discount, an extra). `skipped` holds
 * the dates of visits marked skipped, which are not charged.
 */
export function suggestedLines(p: BillingProject, period: BillingPeriod, skipped: Set<string> = new Set()): SuggestedLine[] {
  const rate = p.valueCents ?? 0;
  const line = (description: string, quantity: number, unitCents: number): SuggestedLine => ({
    description, quantity, unitCents, amountCents: quantity * unitCents,
  });
  const lines: SuggestedLine[] = [];

  switch (p.paymentFrequency) {
    case 'ONE_OFF':
      lines.push(line(p.title, 1, rate));
      break;
    case 'MONTHLY':
      lines.push(line(`Cleaning service, ${period.label}`, 1, rate));
      break;
    case 'WEEKLY':
      lines.push(line(`Cleaning service, ${period.label}`, 1, rate));
      break;
    case 'DAILY': {
      // A repeating project counts its service days; any other counts each day of the period.
      const days =
        p.schedule.kind === 'REPEATING'
          ? chargeableVisits(p, period, skipped).length
          : Math.round((utc(period.end).getTime() - utc(period.start).getTime()) / 86_400_000) + 1;
      lines.push(line(`Cleaning service, ${days} ${days === 1 ? 'day' : 'days'} (${period.label})`, days, rate));
      break;
    }
  }

  if (p.schedule.kind === 'REPEATING' && p.deepCleanPriceCents !== null) {
    const deep = chargeableVisits(p, period, skipped).filter((v) => v.isDeepClean);
    if (deep.length > 0) {
      const dates = deep.map((v) => fmt(v.date, DAY_FMT)).join(', ');
      lines.push(line(`Deep clean (${dates})`, deep.length, p.deepCleanPriceCents));
    }
  }
  return lines;
}

/** The days a client has to pay, from the day the invoice is sent (owner's choice). */
export const PAYMENT_TERMS_DAYS = 14;
