'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { InvoiceDto } from '@onyxhawk/types';

import { api } from '../../src/lib/api';
import { useRequireAdmin } from '../../src/lib/auth';
import { dayLabel } from '../../src/lib/invoices';
import { money as formatMoney } from '../../src/lib/money';
import { refusalMessage } from '../../src/components/project-money/PlacementPicker';

const money = (cents: number) => formatMoney(cents, { whole: false });

/** The company's details as the public website gives them (apps/web/src/content/site.ts). */
const COMPANY = {
  name: 'OnyxHawk Cleaning Service',
  addressLine: 'Hodamatt Building, Base Road, Roysambu',
  postal: 'P.O. Box 73492 – 00200, Nairobi',
  phone: '+254 702 416 697',
  email: 'info@onyxhawkcleaningservice.com',
};

/**
 * One invoice laid out to print or save as PDF (the browser's Print). Outside
 * the back-office frame, so the menu doesn't print. Opened as /invoice?id=…,
 * since the back office is plain files with no per-invoice pages.
 */
export default function InvoicePage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-charcoal-muted">Loading…</p>}>
      <InvoiceView />
    </Suspense>
  );
}

function InvoiceView() {
  const session = useRequireAdmin();
  const id = useSearchParams().get('id');
  const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    api.invoice(id)
      .then((r) => setInvoice(r.invoice))
      .catch((err) => setError(refusalMessage(err, 'Could not load this invoice.')));
  }, [session, id]);

  if (!id) return <p className="p-8 text-sm text-danger">No invoice was chosen.</p>;
  if (error) return <p className="p-8 text-sm text-danger">{error}</p>;
  if (!invoice) return <p className="p-8 text-sm text-charcoal-muted">Loading…</p>;

  const draft = invoice.status === 'DRAFT';
  return (
    <div className="min-h-screen bg-mist py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl justify-end gap-2 px-4 print:hidden">
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-navy px-4 py-2 text-sm text-white hover:opacity-90">
          Print or save as PDF
        </button>
      </div>

      <article className="mx-auto max-w-3xl bg-white px-10 py-10 shadow-sm print:max-w-none print:px-0 print:py-0 print:shadow-none">
        {draft && (
          <p className="mb-6 rounded-lg bg-warning/10 px-3 py-2 text-center text-sm text-warning print:border print:border-warning">
            Draft: not sent to the client yet.
          </p>
        )}
        {invoice.status === 'CANCELLED' && (
          <p className="mb-6 rounded-lg bg-danger/10 px-3 py-2 text-center text-sm text-danger">Cancelled: this invoice is not payable.</p>
        )}

        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-16 w-auto" />
            <div className="text-sm">
              <p className="font-serif text-lg text-charcoal">{COMPANY.name}</p>
              <p className="text-charcoal-muted">{COMPANY.addressLine}</p>
              <p className="text-charcoal-muted">{COMPANY.postal}</p>
              <p className="text-charcoal-muted">{COMPANY.phone} · {COMPANY.email}</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-serif text-2xl text-navy">Invoice</p>
            <p className="font-medium">{invoice.number}</p>
            {invoice.sentOn && <p className="text-charcoal-muted">Date: {dayLabel(invoice.sentOn)}</p>}
            {invoice.dueOn && <p className="text-charcoal-muted">Due: {dayLabel(invoice.dueOn)}</p>}
          </div>
        </header>

        <section className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-charcoal-muted">Bill to</p>
            <p className="mt-1 font-medium">{invoice.clientName ?? '—'}</p>
            {invoice.siteLocation && <p className="text-charcoal-muted">{invoice.siteLocation}</p>}
            {invoice.clientPhone && <p className="text-charcoal-muted">{invoice.clientPhone}</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-charcoal-muted">For</p>
            <p className="mt-1 font-medium">{invoice.projectTitle}</p>
            <p className="text-charcoal-muted">
              {invoice.periodLabel}
              {invoice.periodStart !== invoice.periodEnd && ` (${dayLabel(invoice.periodStart)} to ${dayLabel(invoice.periodEnd)})`}
            </p>
          </div>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-charcoal text-left text-xs uppercase tracking-wider text-charcoal-muted">
              <th className="py-2 pr-2 font-medium">Description</th>
              <th className="py-2 pr-2 text-right font-medium">Qty</th>
              <th className="py-2 pr-2 text-right font-medium">Price</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-2 pr-2">{l.description}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{l.quantity}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{money(l.unitCents)}</td>
                <td className="py-2 text-right tabular-nums">{money(l.amountCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-4 text-right font-medium">Total</td>
              <td className="pt-4 text-right text-lg font-semibold tabular-nums">{money(invoice.totalCents)}</td>
            </tr>
          </tfoot>
        </table>

        {invoice.note && <p className="mt-6 text-sm">{invoice.note}</p>}

        <footer className="mt-10 border-t border-line pt-4 text-sm text-charcoal-muted">
          {invoice.status === 'PAID' ? (
            <p className="font-medium text-success">
              Paid on {dayLabel(invoice.paidOn!)}{invoice.paymentRef ? `, ref ${invoice.paymentRef}` : ''}. Thank you.
            </p>
          ) : (
            <p>
              Please pay {invoice.dueOn ? `by ${dayLabel(invoice.dueOn)}` : 'within 14 days'} and quote {invoice.number} with your payment.
              Questions: {COMPANY.email} or {COMPANY.phone}.
            </p>
          )}
        </footer>
      </article>
    </div>
  );
}
