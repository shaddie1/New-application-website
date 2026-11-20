import type { InvoiceDto, InvoiceLineDto, InvoiceStatus } from '@onyxhawk/types';

/** What a status means to the person reading the list. */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent, waiting for payment',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

/** The chip for an invoice: an overdue one says so, in the warning colour. */
export function invoiceChip(inv: Pick<InvoiceDto, 'status' | 'isOverdue'>): { label: string; tone: string } {
  if (inv.isOverdue) return { label: 'Overdue', tone: 'bg-danger/10 text-danger' };
  switch (inv.status) {
    case 'DRAFT': return { label: 'Draft', tone: 'bg-mist text-charcoal-muted' };
    case 'SENT': return { label: 'Sent', tone: 'bg-warning/10 text-warning' };
    case 'PAID': return { label: 'Paid', tone: 'bg-success/10 text-success' };
    case 'CANCELLED': return { label: 'Cancelled', tone: 'bg-mist text-charcoal-muted line-through' };
  }
}

/** A line as the draft form holds it: the price in whole shillings, as typed. */
export interface LineForm {
  description: string;
  quantity: string;
  unitShillings: string;
}

export const lineFormOf = (l: InvoiceLineDto): LineForm => ({
  description: l.description,
  quantity: String(l.quantity),
  unitShillings: String(l.unitCents / 100),
});

export const emptyLine = (): LineForm => ({ description: '', quantity: '1', unitShillings: '' });

/**
 * The lines to save, or what is wrong with them in plain words. Amounts are
 * worked out again by the server; these are only what the form shows.
 */
export function linesFromForm(form: LineForm[]): { lines: InvoiceLineDto[] } | { problem: string } {
  const filled = form.filter((l) => l.description.trim() || l.unitShillings.trim());
  if (filled.length === 0) return { problem: 'Add at least one line.' };
  const lines: InvoiceLineDto[] = [];
  for (const l of filled) {
    const description = l.description.trim();
    const quantity = Number(l.quantity);
    const shillings = Number(l.unitShillings.replace(/,/g, ''));
    if (!description) return { problem: 'Each line needs a description.' };
    if (!Number.isInteger(quantity) || quantity < 1) return { problem: `“${description}”: the quantity must be a whole number, 1 or more.` };
    if (!Number.isFinite(shillings) || shillings < 0 || l.unitShillings.trim() === '') {
      return { problem: `“${description}”: give the price in shillings.` };
    }
    const unitCents = Math.round(shillings * 100);
    lines.push({ description, quantity, unitCents, amountCents: quantity * unitCents });
  }
  return { lines };
}

/** The total the form's lines come to, in cents; lines not filled in count as nothing. */
export function formTotalCents(form: LineForm[]): number {
  return form.reduce((sum, l) => {
    const q = Number(l.quantity);
    const s = Number(l.unitShillings.replace(/,/g, ''));
    return Number.isFinite(q) && Number.isFinite(s) ? sum + Math.round(q * s * 100) : sum;
  }, 0);
}

/** "12 Feb 2027" from "2027-02-12". */
export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** Days as typed, "2" or "2.5", in half days; empty is 0; null when it is not a whole or half number of days. */
export function halfDaysOf(text: string): number | null {
  const t = text.trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  const half = n * 2;
  return Number.isInteger(half) ? half : null;
}

/** Half days as the days a form shows: 5 is "2.5". */
export const daysOf = (halfDays: number) => String(halfDays / 2);
