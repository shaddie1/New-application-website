/**
 * Invoices for a project's billing periods: shaping them for the back office,
 * numbering them, and what a project's periods would be charged.
 */
import { Prisma } from '@prisma/client';
import type { BillingPeriodDto, InvoiceDto } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { nairobiToday } from '../projects/schedule.js';
import { scheduleOf } from '../projects/visits.js';
import {
  invoiceablePeriods,
  periodLabel,
  suggestedLines,
  type BillingPeriod,
  type BillingProject,
  type PaymentFrequency,
} from './periods.js';

export const invoiceInclude = {
  lines: { orderBy: { sortOrder: 'asc' as const } },
  project: {
    select: { title: true, clientName: true, clientPhone: true, siteLocation: true, paymentFrequency: true },
  },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function toInvoiceDto(row: InvoiceRow, today: string = nairobiToday()): InvoiceDto {
  const periodStart = day(row.periodStart)!;
  const periodEnd = day(row.periodEnd)!;
  const dueOn = day(row.dueOn);
  return {
    id: row.id,
    number: row.number,
    projectId: row.projectId,
    projectTitle: row.project.title,
    clientName: row.project.clientName,
    clientPhone: row.project.clientPhone,
    siteLocation: row.project.siteLocation,
    periodStart,
    periodEnd,
    periodLabel: periodLabel(row.project.paymentFrequency as PaymentFrequency, periodStart, periodEnd),
    status: row.status,
    lines: row.lines.map((l) => ({
      description: l.description, quantity: l.quantity, unitCents: l.unitCents, amountCents: l.amountCents,
    })),
    totalCents: row.totalCents,
    note: row.note,
    sentOn: day(row.sentOn),
    dueOn,
    paidOn: day(row.paidOn),
    paymentRef: row.paymentRef,
    isOverdue: row.status === 'SENT' && dueOn !== null && dueOn < today,
    jobId: row.jobId,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

type ProjectForBilling = Parameters<typeof scheduleOf>[0] & {
  title: string;
  paymentFrequency: string;
  valueCents: number | null;
  deepCleanPriceCents: number | null;
};

export function billingProjectOf(p: ProjectForBilling): BillingProject {
  return {
    title: p.title,
    paymentFrequency: p.paymentFrequency as PaymentFrequency,
    valueCents: p.valueCents,
    deepCleanPriceCents: p.deepCleanPriceCents,
    schedule: scheduleOf(p),
  };
}

/** The dates of a project's visits marked skipped in a period: those are not charged. */
export async function skippedDays(projectId: string, period: BillingPeriod): Promise<Set<string>> {
  const rows = await prisma.projectVisit.findMany({
    where: {
      projectId,
      status: 'SKIPPED',
      date: { gte: new Date(period.start), lte: new Date(period.end) },
    },
    select: { date: true },
  });
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}

/** The lines a new invoice for this period starts with. */
export async function linesFor(project: BillingProject & { id: string }, period: BillingPeriod) {
  return suggestedLines(project, period, await skippedDays(project.id, period));
}

/** Every period that can be invoiced, newest first, with the invoice already made for it. */
export async function periodsWithInvoices(
  project: BillingProject & { id: string },
  invoices: { id: string; status: string; periodStart: Date }[],
  today: string = nairobiToday(),
): Promise<BillingPeriodDto[]> {
  const byStart = new Map<string, string>();
  for (const inv of invoices) {
    if (inv.status !== 'CANCELLED') byStart.set(inv.periodStart.toISOString().slice(0, 10), inv.id);
  }
  const periods = invoiceablePeriods(project, today);
  // One query for the skipped days of every period, then split them up.
  const skipped = periods.length
    ? await skippedDays(project.id, { start: periods[periods.length - 1]!.start, end: periods[0]!.end, label: '' })
    : new Set<string>();
  return periods.map((period) => ({
    ...period,
    suggestedTotalCents: suggestedLines(project, period, skipped).reduce((sum, l) => sum + l.amountCents, 0),
    invoiceId: byStart.get(period.start) ?? null,
  }));
}

/**
 * The next invoice number for the year, inside the transaction that makes the
 * invoice, so two invoices never share one: OH-2026-0001, OH-2026-0002, …
 */
export async function nextInvoiceNumber(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const counter = await tx.invoiceCounter.upsert({
    where: { year },
    create: { year, last: 1 },
    update: { last: { increment: 1 } },
  });
  return `OH-${year}-${String(counter.last).padStart(4, '0')}`;
}

/** "KSh 12,500". */
export function shillings(cents: number): string {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}
