'use client';

import { useCallback, useEffect, useState } from 'react';
import type { InvoiceDto, PaymentFrequency, ProjectDto, ProjectInvoicesDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import {
  dayLabel,
  emptyLine,
  formTotalCents,
  invoiceChip,
  lineFormOf,
  linesFromForm,
  type LineForm,
} from '../../lib/invoices';
import { money as formatMoney } from '../../lib/money';
import { nairobiToday } from '../../lib/projectSchedule';
import { refusalMessage } from '../project-money/PlacementPicker';

const money = (cents: number) => formatMoney(cents, { whole: true });

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-navy text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-mist disabled:opacity-50';
const btnDanger = 'rounded-lg border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/5 disabled:opacity-50';

const HOW_BILLED: Record<PaymentFrequency, string> = {
  ONE_OFF: 'one invoice for the whole job',
  MONTHLY: 'one invoice a month',
  WEEKLY: 'one invoice a week',
  DAILY: 'one invoice a week, for the days worked',
};

/**
 * A project's invoices: one per billing period, as its Payment setting says.
 * Make it, check the lines, mark it sent; when the client pays, record it and
 * the amount goes into Jobs & costs under this project.
 */
export function InvoicesTab({ project: p, canRecordPayment }: { project: ProjectDto; canRecordPayment: boolean }) {
  const [data, setData] = useState<ProjectInvoicesDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await api.projectInvoices(p.id));
    } catch {
      setFailed(true);
    }
  }, [p.id]);

  useEffect(() => { void load(); }, [load, p.updatedAt]);

  const make = async (start: string, end: string) => {
    setMaking(start);
    setError(null);
    try {
      const res = await api.createInvoice({ projectId: p.id, periodStart: start, periodEnd: end });
      await load();
      setOpenId(res.invoice.id);
    } catch (err) {
      setError(refusalMessage(err, 'Could not make the invoice.'));
    } finally {
      setMaking(null);
    }
  };

  const changed = (inv: InvoiceDto | null, id: string) => {
    void load();
    if (!inv) setOpenId((cur) => (cur === id ? null : cur));
  };

  if (failed) {
    return (
      <p className="py-4 text-center text-sm text-danger">
        Could not load the invoices. <button type="button" className="underline" onClick={() => void load()}>Try again</button>
      </p>
    );
  }
  if (!data) return <p className="py-4 text-center text-sm text-charcoal-muted">Loading invoices…</p>;

  const byId = new Map(data.invoices.map((i) => [i.id, i]));
  const cancelled = data.invoices.filter((i) => i.status === 'CANCELLED');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-white px-4 py-3 text-xs text-charcoal-muted">
        <p>
          This project is billed {HOW_BILLED[p.paymentFrequency]}
          {typeof p.valueCents === 'number' ? ` at ${money(p.valueCents)}` : ''}
          {p.deepCleanPriceCents !== null ? `, plus ${money(p.deepCleanPriceCents)} for each deep clean` : ''}.
          {' '}The client has 14 days to pay from the day an invoice is sent.
        </p>
        <p className="mt-1">
          When an invoice is marked paid, its amount is added to Jobs &amp; costs under this project. Don’t enter that payment there as well.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {data.periods.length === 0 ? (
        <p className="rounded-lg border border-line bg-white px-4 py-4 text-center text-sm text-charcoal-muted">
          Give the project a start date (or service date) to invoice it.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.periods.map((period) => {
            const inv = period.invoiceId ? byId.get(period.invoiceId) : undefined;
            const chip = inv ? invoiceChip(inv) : null;
            return (
              <li key={period.start} className="rounded-lg border border-line bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-charcoal">{period.label}</p>
                    <p className="text-xs text-charcoal-muted">
                      {inv
                        ? `${inv.number} · ${money(inv.totalCents)}${inv.dueOn && inv.status === 'SENT' ? ` · due ${dayLabel(inv.dueOn)}` : ''}${inv.paidOn ? ` · paid ${dayLabel(inv.paidOn)}` : ''}`
                        : `Not invoiced · would come to ${money(period.suggestedTotalCents)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {chip && <span className={`rounded-full px-2 py-0.5 text-xs ${chip.tone}`}>{chip.label}</span>}
                    {inv ? (
                      <button type="button" className={btnGhost} onClick={() => setOpenId(openId === inv.id ? null : inv.id)}>
                        {openId === inv.id ? 'Close' : 'Open'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={making !== null}
                        onClick={() => void make(period.start, period.end)}
                      >
                        {making === period.start ? 'Making…' : 'Make invoice'}
                      </button>
                    )}
                  </div>
                </div>
                {inv && openId === inv.id && (
                  <InvoicePanel
                    // A fresh form whenever the stored invoice changes.
                    key={JSON.stringify([inv.status, inv.lines, inv.note])}
                    invoice={inv}
                    canRecordPayment={canRecordPayment}
                    onChanged={(next) => changed(next, inv.id)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cancelled.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">Cancelled</p>
          <ul className="space-y-1 text-xs text-charcoal-muted">
            {cancelled.map((i) => (
              <li key={i.id}>
                {i.number} · {i.periodLabel} · {money(i.totalCents)}{' '}
                <a className="underline" href={`/invoice?id=${encodeURIComponent(i.id)}`} target="_blank" rel="noreferrer">View</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** One invoice opened: its lines, and what can be done next. */
function InvoicePanel({
  invoice: inv,
  canRecordPayment,
  onChanged,
}: {
  invoice: InvoiceDto;
  canRecordPayment: boolean;
  /** The invoice after the change, or null when it was deleted. */
  onChanged: (inv: InvoiceDto | null) => void;
}) {
  const today = nairobiToday();
  const [lines, setLines] = useState<LineForm[]>(() => inv.lines.map(lineFormOf));
  const [note, setNote] = useState(inv.note ?? '');
  const [sentOn, setSentOn] = useState(today);
  const [paidOn, setPaidOn] = useState(today);
  const [paymentRef, setPaymentRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = inv.status === 'DRAFT';
  const dirty =
    draft &&
    (note !== (inv.note ?? '') ||
      JSON.stringify(lines) !== JSON.stringify(inv.lines.map(lineFormOf)));

  const act = async (run: () => Promise<{ invoice: InvoiceDto } | { ok: true }>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await run();
      onChanged('invoice' in res ? res.invoice : null);
    } catch (err) {
      setError(refusalMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () => {
    const parsed = linesFromForm(lines);
    if ('problem' in parsed) {
      setError(parsed.problem);
      return Promise.resolve();
    }
    return act(() => api.updateInvoice(inv.id, { lines: parsed.lines, note: note.trim() || null }), 'Could not save the invoice.');
  };

  const setLine = (i: number, patch: Partial<LineForm>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3 border-t border-line bg-mist/40 px-4 py-3">
      {draft ? (
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_5rem_8rem_7rem_2rem] gap-2 text-[11px] uppercase tracking-wider text-charcoal-muted sm:grid">
            <span>Description</span><span>Qty</span><span>Price (KSh)</span><span className="text-right">Amount</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_5rem_8rem_7rem_2rem]">
              <input aria-label="Description" className={input} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              <input aria-label="Quantity" className={input} inputMode="numeric" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <input aria-label="Price in shillings" className={input} inputMode="decimal" value={l.unitShillings} onChange={(e) => setLine(i, { unitShillings: e.target.value })} />
              <span className="self-center text-right text-sm tabular-nums">{money(formTotalCents([l]))}</span>
              <button type="button" aria-label="Remove this line" className="text-charcoal-muted hover:text-danger" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className={btnGhost} onClick={() => setLines((prev) => [...prev, emptyLine()])}>Add a line</button>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted" htmlFor={`note-${inv.id}`}>Note on the invoice (optional)</label>
            <input id={`note-${inv.id}`} className={input} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-line/60">
                <td className="py-1.5 pr-2">{l.description}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-charcoal-muted">{l.quantity} × {money(l.unitCents)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(l.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-baseline justify-between text-sm">
        <span className="text-charcoal-muted">Total</span>
        <span className="font-semibold tabular-nums">{money(draft ? formTotalCents(lines) : inv.totalCents)}</span>
      </div>

      {inv.status === 'SENT' && (
        <p className={`text-xs ${inv.isOverdue ? 'font-medium text-danger' : 'text-charcoal-muted'}`}>
          Sent {dayLabel(inv.sentOn!)}, due {dayLabel(inv.dueOn!)}{inv.isOverdue ? ': overdue, follow it up with the client.' : '.'}
        </p>
      )}
      {inv.status === 'PAID' && (
        <p className="text-xs text-success">
          Paid {dayLabel(inv.paidOn!)}{inv.paymentRef ? `, ref ${inv.paymentRef}` : ''}. Added to Jobs &amp; costs under this project.
        </p>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <a className={btnGhost} href={`/invoice?id=${encodeURIComponent(inv.id)}`} target="_blank" rel="noreferrer">
          View and print
        </a>

        {draft && (
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" className={btnDanger} disabled={busy} onClick={() => void act(() => api.deleteInvoice(inv.id), 'Could not delete the draft.')}>
              Delete draft
            </button>
            {dirty ? (
              <button type="button" className={btn} disabled={busy} onClick={() => void saveDraft()}>{busy ? 'Saving…' : 'Save changes'}</button>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs text-charcoal-muted" htmlFor={`sent-${inv.id}`}>Sent on</label>
                  <input id={`sent-${inv.id}`} type="date" max={today} className={input} value={sentOn} onChange={(e) => setSentOn(e.target.value)} />
                </div>
                <button type="button" className={btn} disabled={busy} onClick={() => void act(() => api.sendInvoice(inv.id, sentOn), 'Could not mark it sent.')}>
                  Mark sent
                </button>
              </>
            )}
          </div>
        )}

        {inv.status === 'SENT' && (
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" className={btnGhost} disabled={busy} onClick={() => void act(() => api.invoiceBackToDraft(inv.id), 'Could not set it back to a draft.')}>
              Back to draft
            </button>
            <button type="button" className={btnDanger} disabled={busy} onClick={() => void act(() => api.cancelInvoice(inv.id), 'Could not cancel it.')}>
              Cancel invoice
            </button>
            {canRecordPayment ? (
              <>
                <div>
                  <label className="mb-1 block text-xs text-charcoal-muted" htmlFor={`paid-${inv.id}`}>Paid on</label>
                  <input id={`paid-${inv.id}`} type="date" max={today} className={input} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-charcoal-muted" htmlFor={`ref-${inv.id}`}>M-Pesa or bank ref (optional)</label>
                  <input id={`ref-${inv.id}`} className={input} value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
                </div>
                <button
                  type="button"
                  className={btn}
                  disabled={busy}
                  onClick={() => void act(() => api.payInvoice(inv.id, { paidOn, paymentRef: paymentRef.trim() || null }), 'Could not record the payment.')}
                >
                  Record payment
                </button>
              </>
            ) : (
              <span className="text-xs text-charcoal-muted">The owner or an admin records the payment.</span>
            )}
          </div>
        )}

        {inv.status === 'PAID' && canRecordPayment && (
          <button type="button" className={btnGhost} disabled={busy} onClick={() => void act(() => api.unpayInvoice(inv.id), 'Could not undo the payment.')}>
            Mark not paid (takes it off Jobs &amp; costs)
          </button>
        )}
      </div>
    </div>
  );
}
