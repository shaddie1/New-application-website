'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminQuoteRequestDto, QuoteStatus } from '@onyxhawk/types';
import { api, ApiError } from '../../../src/lib/api';

const FREQ_LABEL: Record<string, string> = {
  NONE: 'One-off',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Biweekly',
  MONTHLY: 'Monthly',
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<AdminQuoteRequestDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<AdminQuoteRequestDto | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.quotes();
      setQuotes(res.quoteRequests);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load quotes (${err.status}).` : 'Could not load quotes.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Quote requests</h1>
      <p className="text-text-muted text-sm mt-1">Respond with a price or schedule a site visit.</p>

      {error && <div className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}
      {!quotes && !error && <p className="mt-6 text-text-muted">Loading…</p>}
      {quotes && quotes.length === 0 && <p className="mt-6 text-text-muted">No quote requests yet.</p>}

      <div className="mt-6 space-y-3">
        {(quotes ?? []).map((q) => (
          <div key={q.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-gold-deep text-xs uppercase tracking-widest">{q.serviceLineName}</span>
                  <StatusBadge status={q.status} />
                </div>
                <p className="text-lg mt-1" style={{ fontFamily: 'Georgia, serif' }}>{q.siteType}</p>
                <p className="text-text-muted text-sm mt-0.5">
                  {[
                    q.approxSqm ? `~${q.approxSqm.toLocaleString()} m²` : null,
                    q.floors ? `${q.floors} floors` : null,
                    FREQ_LABEL[q.frequency],
                  ].filter(Boolean).join(' · ')}
                </p>
                <p className="text-text-muted text-xs mt-1">{q.customerName} · {q.customerPhone}</p>
                {q.notes && <p className="text-text-muted text-sm mt-2 italic">“{q.notes}”</p>}
                {q.quotedAmountCents != null && (
                  <p className="text-success text-sm mt-2">Quoted KSh {(q.quotedAmountCents / 100).toLocaleString()}</p>
                )}
              </div>
              <button
                onClick={() => setActive(q)}
                className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-surface-dark"
              >
                Respond
              </button>
            </div>
          </div>
        ))}
      </div>

      {active && (
        <RespondModal
          quote={active}
          onClose={() => setActive(null)}
          onDone={() => { setActive(null); void load(); }}
        />
      )}
    </div>
  );
}

function RespondModal({
  quote,
  onClose,
  onDone,
}: {
  quote: AdminQuoteRequestDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<QuoteStatus>('QUOTED');
  const [amount, setAmount] = useState(quote.quotedAmountCents != null ? String(quote.quotedAmountCents / 100) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (status === 'QUOTED' && !amount.trim()) {
      setError('Enter a quote amount in KSh.');
      return;
    }
    setBusy(true);
    try {
      await api.respondQuote(quote.id, {
        status,
        quotedAmountCents: status === 'QUOTED' ? Math.round(Number(amount.replace(/[^0-9.]/g, '')) * 100) : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
        ? String((err.payload as { error: unknown }).error)
        : 'Could not save the response.');
    } finally {
      setBusy(false);
    }
  };

  const STATUSES: QuoteStatus[] = ['QUOTED', 'SITE_VISIT_SCHEDULED', 'WON', 'LOST', 'CANCELLED'];

  return (
    <div className="fixed inset-0 bg-surface-dark/50 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-bg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>Respond to quote</h2>
        <p className="text-text-muted text-sm mt-1">{quote.serviceLineName} · {quote.siteType}</p>

        {error && <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-danger text-sm">{error}</div>}

        <label className="block mt-4 text-text-muted text-xs uppercase tracking-widest">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as QuoteStatus)}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-text"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>

        {status === 'QUOTED' && (
          <>
            <label className="block mt-4 text-text-muted text-xs uppercase tracking-widest">Quote amount (KSh)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="45000"
              inputMode="numeric"
              className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-text"
            />
          </>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2.5 text-text">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-gold py-2.5 font-semibold text-surface-dark disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: QuoteStatus }) {
  const map: Record<QuoteStatus, string> = {
    PENDING: 'bg-gold-soft text-gold-deep',
    SITE_VISIT_SCHEDULED: 'bg-service-office/20 text-service-office',
    QUOTED: 'bg-success/15 text-success',
    WON: 'bg-success/15 text-success',
    LOST: 'bg-bg-muted text-text-muted',
    CANCELLED: 'bg-bg-muted text-text-muted',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[status]}`}>{status.replace(/_/g, ' ')}</span>;
}
