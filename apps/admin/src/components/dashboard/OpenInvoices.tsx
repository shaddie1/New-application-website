'use client';

import { useEffect, useState } from 'react';
import type { InvoiceDto, OpenInvoicesDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { dayLabel } from '../../lib/invoices';
import { money as formatMoney } from '../../lib/money';
import { Card } from '../ui/card';
import { TextLink } from './TextLink';

const money = (cents: number) => formatMoney(cents, { whole: true });

/**
 * Invoices sent and not paid yet, overdue first, for the money roles. The
 * payment is recorded on the project's Invoices tab. Hidden when there are none.
 */
export function OpenInvoices() {
  const [data, setData] = useState<OpenInvoicesDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.openInvoices()
      .then((r) => { if (live) setData(r); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed) {
    return (
      <Card className="p-5">
        <p className="text-sm text-danger">Could not load the invoices waiting for payment.</p>
      </Card>
    );
  }
  if (!data || (data.overdue.length === 0 && data.awaiting.length === 0 && data.draftCount === 0)) return null;

  const owed = [...data.overdue, ...data.awaiting].reduce((sum, i) => sum + i.totalCents, 0);
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-serif text-lg text-charcoal">Invoices waiting for payment</h2>
        <TextLink href="/projects">Projects</TextLink>
      </div>
      {data.overdue.length + data.awaiting.length > 0 && (
        <p className="mb-3 text-sm text-charcoal-muted">
          {money(owed)} owed on {data.overdue.length + data.awaiting.length} sent{' '}
          {data.overdue.length + data.awaiting.length === 1 ? 'invoice' : 'invoices'}
          {data.overdue.length > 0 && <span className="font-medium text-danger">, {data.overdue.length} overdue</span>}.
        </p>
      )}
      <div className="space-y-4">
        {data.overdue.length > 0 && <InvoiceList title="Overdue" tone="text-danger" invoices={data.overdue} />}
        {data.awaiting.length > 0 && <InvoiceList title="Sent, not due yet" tone="text-charcoal-muted" invoices={data.awaiting} />}
        {data.draftCount > 0 && (
          <p className="text-xs text-charcoal-muted">
            {data.draftCount} draft {data.draftCount === 1 ? 'invoice' : 'invoices'} not sent yet.
          </p>
        )}
      </div>
    </Card>
  );
}

function InvoiceList({ title, tone, invoices }: { title: string; tone: string; invoices: InvoiceDto[] }) {
  return (
    <section>
      <p className={`mb-2 text-xs font-semibold uppercase tracking-widest ${tone}`}>{title}</p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {invoices.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <div className="min-w-0">
              <a href={`/invoice?id=${encodeURIComponent(i.id)}`} target="_blank" rel="noreferrer" className="font-medium text-charcoal hover:underline">
                {i.number}
              </a>
              <span className="text-charcoal-muted"> · {i.projectTitle}{i.clientName ? ` · ${i.clientName}` : ''}</span>
            </div>
            <div className="text-right">
              <span className="tabular-nums font-medium">{money(i.totalCents)}</span>
              <span className="ml-2 text-xs text-charcoal-muted">due {dayLabel(i.dueOn!)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
