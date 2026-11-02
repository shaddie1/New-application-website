import type { JobStatus } from '@prisma/client';
import type { CompanyFigures, MySharesComparison, MySharesMonth, MySharesPeriod, ServiceLineFigures } from '@onyxhawk/types';

import { prisma } from '../db.js';

/**
 * The company's books by month, for the shareholder page. Net profit follows
 * the Financials page exactly: jobs count when OWNER_ENTRY or APPROVED;
 * revenue is income less discount, by job date; an expense counts by its own
 * date when its job counts. Months are Nairobi calendar months, and the
 * server runs in UTC, so "now" is converted before taking the month.
 */

const COUNTED_STATUSES: JobStatus[] = ['OWNER_ENTRY', 'APPROVED'];
const BASIS_POINTS_TOTAL = 10_000;
/** The month in progress and the 24 before it: 12 shown, each with its year-earlier month. */
const MONTHS_LOADED = 25;

export type LedgerMonth = Omit<MySharesMonth, 'ownShareCents'>;
export type LedgerPeriod = Omit<MySharesPeriod, 'ownShareCents'>;

export interface Ledger {
  currentMonth: string; // YYYY-MM
  months: LedgerMonth[]; // oldest first; the last is in progress
  comparisons: { previousMonth: MySharesComparison; sameMonthLastYear: MySharesComparison };
  periods: { quarter: LedgerPeriod; year: LedgerPeriod; allTime: LedgerPeriod };
}

export async function loadLedger(now: Date): Promise<Ledger> {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // YYYY-MM-DD
  const currentMonth = today.slice(0, 7);
  const keys = Array.from({ length: MONTHS_LOADED }, (_, i) => addMonths(currentMonth, i - (MONTHS_LOADED - 1)));

  const counted = { status: { in: COUNTED_STATUSES } };
  // Job and expense dates are calendar dates, stored as UTC midnight.
  const window = { gte: new Date(`${keys[0]}-01`), lt: new Date(`${addMonths(currentMonth, 1)}-01`) };

  const [jobs, expenses, jobTotals, expenseTotals, lineTotals, catalog] = await Promise.all([
    prisma.job.findMany({
      where: { date: window, ...counted },
      select: { date: true, incomeCents: true, discountCents: true, serviceLineCode: true },
    }),
    prisma.expense.findMany({
      where: { date: window, job: counted },
      select: { date: true, amountCents: true },
    }),
    prisma.job.aggregate({
      where: counted,
      _sum: { incomeCents: true, discountCents: true },
      _min: { date: true },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({ where: { job: counted }, _sum: { amountCents: true } }),
    prisma.job.groupBy({
      by: ['serviceLineCode'],
      where: counted,
      _sum: { incomeCents: true, discountCents: true },
      _count: { _all: true },
    }),
    prisma.serviceLine.findMany({ select: { code: true, name: true } }),
  ]);

  const names = new Map(catalog.map((l) => [l.code, l.name]));
  const jobRows = jobs.map((j) => ({
    day: isoDate(j.date),
    code: j.serviceLineCode,
    revenueCents: j.incomeCents - j.discountCents,
    jobs: 1,
  }));
  const expenseRows = expenses.map((e) => ({ day: isoDate(e.date), amountCents: e.amountCents }));

  const firstJobDate = jobTotals._min.date ? isoDate(jobTotals._min.date) : null;
  const hasRecords = (key: string) => firstJobDate !== null && key >= firstJobDate.slice(0, 7);

  // Both take YYYY-MM-DD bounds, inclusive, over the loaded window.
  const within = (from: string, to: string) => ({ day }: { day: string }) => day >= from && day <= to;
  const figures = (from: string, to: string): CompanyFigures => {
    const periodJobs = jobRows.filter(within(from, to));
    const revenueCents = sum(periodJobs.map((j) => j.revenueCents));
    const expensesCents = sum(expenseRows.filter(within(from, to)).map((e) => e.amountCents));
    return { revenueCents, netCents: revenueCents - expensesCents, jobs: periodJobs.length };
  };
  const lines = (from: string, to: string) => byServiceLine(jobRows.filter(within(from, to)), names);

  const months = keys.map((key): LedgerMonth => {
    const from = `${key}-01`;
    const to = lastDay(key);
    return {
      key,
      label: monthLabel(key),
      inProgress: key === currentMonth,
      hasRecords: hasRecords(key),
      ...figures(from, to),
      byServiceLine: lines(from, to),
    };
  });
  const span = (firstKey: string, lastKey: string): LedgerPeriod => {
    const from = `${firstKey}-01`;
    const to = lastDay(lastKey);
    return { from, to, ...figures(from, to), byServiceLine: lines(from, to) };
  };

  // The month in progress is compared with the same days of the earlier month,
  // capped at that month's length (5 April with 1–5 March; 31 March with all of February).
  const dayOfMonth = Number(today.slice(8, 10));
  const sameDays = (key: string): MySharesComparison => {
    const from = `${key}-01`;
    const to = `${key}-${pad(Math.min(dayOfMonth, daysIn(key)))}`;
    return { key, from, to, hasRecords: hasRecords(key), ...figures(from, to) };
  };

  const month = Number(currentMonth.slice(5, 7));
  const quarterStart = addMonths(currentMonth, -((month - 1) % 3));
  const year = currentMonth.slice(0, 4);

  const allTimeRevenue = (jobTotals._sum.incomeCents ?? 0) - (jobTotals._sum.discountCents ?? 0);
  const allTime: LedgerPeriod = {
    from: firstJobDate,
    to: today,
    revenueCents: allTimeRevenue,
    netCents: allTimeRevenue - (expenseTotals._sum.amountCents ?? 0),
    jobs: jobTotals._count._all,
    byServiceLine: byServiceLine(
      lineTotals.map((g) => ({
        code: g.serviceLineCode,
        revenueCents: (g._sum.incomeCents ?? 0) - (g._sum.discountCents ?? 0),
        jobs: g._count._all,
      })),
      names,
    ),
  };

  return {
    currentMonth,
    months,
    comparisons: {
      previousMonth: sameDays(addMonths(currentMonth, -1)),
      sameMonthLastYear: sameDays(addMonths(currentMonth, -12)),
    },
    periods: {
      quarter: span(quarterStart, addMonths(quarterStart, 2)),
      year: span(`${year}-01`, `${year}-12`),
      allTime,
    },
  };
}

/**
 * Split `netCents` across stakes in basis points, in whole cents, as the
 * Equity page does: the leftover cents from rounding go to the largest
 * fractional parts, so the shares add up exactly. A loss is split the same way.
 */
export function allocate(netCents: number, stakes: number[]): number[] {
  const total = stakes.reduce((acc, bp) => acc + bp, 0);
  if (stakes.length === 0 || total === 0) return stakes.map(() => 0);

  // What the stakes cover; anything short of 100% stays with the business.
  const distributable = Math.round((netCents * total) / BASIS_POINTS_TOTAL);
  const exact = stakes.map((bp) => (netCents * bp) / BASIS_POINTS_TOTAL);
  const shares = exact.map((v) => Math.floor(v));

  const leftover = distributable - sum(shares);
  const byFraction = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < leftover; k += 1) {
    const target = byFraction[k % byFraction.length]!;
    shares[target.i] = shares[target.i]! + 1;
  }
  return shares;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type LineTally = { code: string | null; revenueCents: number; jobs: number };

/** Revenue and jobs per service line, highest revenue first. */
function byServiceLine(rows: LineTally[], names: Map<string, string>): ServiceLineFigures[] {
  const lines = new Map<string | null, ServiceLineFigures>();
  for (const row of rows) {
    const line = lines.get(row.code) ?? {
      code: row.code,
      name: row.code === null ? 'Unclassified' : (names.get(row.code) ?? humanise(row.code)),
      revenueCents: 0,
      jobs: 0,
    };
    line.revenueCents += row.revenueCents;
    line.jobs += row.jobs;
    lines.set(row.code, line);
  }
  return [...lines.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);
const pad = (n: number) => String(n).padStart(2, '0');

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "2026-04" plus `n` months. */
function addMonths(key: string, n: number): string {
  const index = Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1 + n;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

function daysIn(key: string): number {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
}

function lastDay(key: string): string {
  return `${key}-${pad(daysIn(key))}`;
}

/** "2026-04" → "Apr 2026". */
function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00.000Z`).toLocaleDateString('en-KE', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "post_build" → "Post build". */
function humanise(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
