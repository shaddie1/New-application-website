'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  LaundryBreakEvenDto,
  PayPhase,
  ReadinessDto,
  UpdateLaundrySettingsInput,
  UpdateReadinessInput,
} from '@onyxhawk/types';
import { PAY_PHASE_LABEL } from '@onyxhawk/types';

import { api, ApiError } from '../lib/api';

// ── Shared ──────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span className={`text-xs ${state === 'failed' ? 'font-medium text-danger' : state === 'saved' ? 'font-medium text-success' : 'text-charcoal-muted'}`}>
      {state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved' : state === 'failed' ? '⚠ Not saved — try again' : ''}
    </span>
  );
}

/** Flash "✓ Saved" for a moment after every successful write. */
function useSaveState(): [SaveState, (s: SaveState) => void] {
  const [state, setState] = useState<SaveState>('idle');
  useEffect(() => {
    if (state !== 'saved') return;
    const t = setTimeout(() => setState('idle'), 2500);
    return () => clearTimeout(t);
  }, [state]);
  return [state, setState];
}

function messageFrom(err: unknown, fallback: string) {
  if (err instanceof ApiError) {
    const payload = err.payload as { error?: unknown } | null;
    if (typeof payload?.error === 'string') return payload.error;
    return `${fallback} (${err.status}).`;
  }
  return fallback;
}

export function kes(cents: number) {
  return `KSh ${Math.round(cents / 100).toLocaleString('en-KE')}`;
}

function kg(n: number) {
  return Number.isFinite(n) ? `${(Math.round(n * 10) / 10).toLocaleString('en-KE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg` : '—';
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const card = 'rounded-xl border border-line bg-white p-5';
const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream-deep disabled:opacity-50';

// ── Compliant-pay readiness ─────────────────────────────────────────────────

/**
 * The three gates from the Summary sheet. Gate 1 is the COO's monthly call;
 * gates 2 and 3 come back computed from the reserve ledger.
 */
export function ReadinessCard({ onChanged }: { onChanged?: () => void } = {}) {
  const [data, setData] = useState<ReadinessDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useSaveState();

  const load = useCallback(async () => {
    try { setData((await api.readiness()).readiness); }
    catch (err) { setError(messageFrom(err, 'Could not load the readiness gates')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (patch: UpdateReadinessInput) => {
    if (!data) return;
    const before = data;
    setData({ ...data, ...patch, gate1FirstMetMonth: patch.gate1FirstMetMonth === undefined ? data.gate1FirstMetMonth : patch.gate1FirstMetMonth });
    setSaveState('saving');
    try {
      setData((await api.updateReadiness(patch)).readiness);
      setSaveState('saved');
      onChanged?.();
    } catch (err) {
      setData(before);
      setSaveState('failed');
      setError(messageFrom(err, 'Could not save'));
    }
  };

  if (error && !data) return <div className={`${card} text-sm text-danger`}>{error}</div>;
  if (!data) return <div className={`${card} text-sm text-charcoal-muted`}>Loading readiness gates…</div>;

  const { canEdit } = data;
  const monthValue = data.gate1FirstMetMonth ? data.gate1FirstMetMonth.slice(0, 7) : '';

  const togglePhase = () => {
    const next: PayPhase = data.payPhase === 'NOW' ? 'COMPLIANT' : 'NOW';
    const warning = next === 'COMPLIANT' && !data.allMet
      ? `Not all three gates are met. Switch to ${PAY_PHASE_LABEL[next]} anyway?`
      : `Switch the company to ${PAY_PHASE_LABEL[next]}? Break-even and salary figures will follow.`;
    if (!confirm(warning)) return;
    void save({ payPhase: next });
  };

  return (
    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-charcoal-muted">Compliant-pay readiness</p>
          <p className="mt-1 text-sm text-charcoal-muted">
            {data.staffCount} staff on the compliant payroll · {kes(data.compliantFixedCostsPerMonthCents)} / month · reserve {kes(data.reserveBalanceCents)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={saveState} />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-charcoal-muted">Pay phase</span>
            {canEdit ? (
              <button
                type="button"
                onClick={togglePhase}
                aria-label={`Pay phase: ${PAY_PHASE_LABEL[data.payPhase]} — switch`}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${data.payPhase === 'COMPLIANT' ? 'border-success/40 bg-success/10 text-success' : 'border-gold-bright/60 bg-gold-bright/15 text-bronze'}`}
              >
                {PAY_PHASE_LABEL[data.payPhase]} ⇄
              </button>
            ) : (
              <span className="rounded-full border border-line px-3 py-1 text-xs font-medium">{PAY_PHASE_LABEL[data.payPhase]}</span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${data.allMet ? 'bg-success/10 text-success' : 'bg-cream-deep text-charcoal'}`}>
        {data.allMet
          ? 'All three gates met — the company is ready to move to compliant pay.'
          : `${data.gates.filter((g) => g.met).length} of 3 gates met — not yet ready for compliant pay.`}
      </div>

      <ul className="mt-4 divide-y divide-line">
        {data.gates.map((g, i) => (
          <li key={g.key} className="flex flex-wrap items-start gap-3 py-3">
            <span
              aria-label={g.met ? 'Met' : 'Not met'}
              className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${g.met ? 'bg-success text-white' : 'bg-cream-deep text-charcoal-muted'}`}
            >
              {g.met ? '✓' : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{g.label}</p>
              <p className="text-xs text-charcoal-muted">{g.detail}</p>
              {g.requiredCents !== null && g.actualCents !== null && (
                <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-cream-deep">
                  <div className={`h-full rounded-full ${g.met ? 'bg-success' : 'bg-gold-bright'}`}
                    style={{ width: `${Math.min(100, Math.round((Math.max(0, g.actualCents) / Math.max(1, g.requiredCents)) * 100))}%` }} />
                </div>
              )}
              {g.key === 'MARGIN' && canEdit && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={data.gate1MarginMet}
                      onChange={(e) => {
                        const next = e.target.checked;
                        if (!confirm(next ? 'Confirm: operating margin has been ≥ 10% for 3 consecutive months on a compliant-pay basis?' : 'Clear the margin gate?')) return;
                        void save({ gate1MarginMet: next, ...(next && !data.gate1FirstMetMonth ? { gate1FirstMetMonth: `${new Date().toISOString().slice(0, 7)}-01` } : {}) });
                      }} />
                    COO confirms the margin gate
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    First met
                    <input type="month" className="rounded border border-line px-1.5 py-0.5" value={monthValue} aria-label="Gate 1 first met month"
                      onChange={(e) => void save({ gate1FirstMetMonth: e.target.value ? `${e.target.value}-01` : null })} />
                  </label>
                </div>
              )}
              {g.key === 'SALARIES_12_MONTHS' && canEdit && (
                <label className="mt-2 inline-flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={data.laundryOperational}
                    onChange={(e) => {
                      const next = e.target.checked;
                      if (!confirm(next ? 'Count the laundry attendant on the compliant payroll (3 staff)?' : 'Drop the laundry attendant from the count (2 staff)?')) return;
                      void save({ laundryOperational: next });
                    }} />
                  Laundry operational (adds the attendant to the salary count)
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>

      {data.updatedAt && (
        <p className="mt-2 text-xs text-charcoal-muted">Last set by {data.updatedByName ?? 'unknown'} · {when(data.updatedAt)}</p>
      )}
    </div>
  );
}

// ── Laundry break-even ──────────────────────────────────────────────────────

const GO_LABEL = { PENDING: 'decision pending', GO: 'GO', NO_GO: 'NO-GO' } as const;

/** Break-even kg/day for the current pay phase, with the assumptions behind it. */
export function LaundryBreakEvenCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<LaundryBreakEvenDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useSaveState();
  const [form, setForm] = useState({ priceKes: '', consumablesPct: '', days: '', fixedNowKes: '', fixedCompliantKes: '' });

  const load = useCallback(async () => {
    try { setData((await api.laundry()).laundry); }
    catch (err) { setError(messageFrom(err, 'Could not load the laundry figures')); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  if (error && !data) return <div className={`${card} text-sm text-danger`}>{error}</div>;
  if (!data) return <div className={`${card} text-sm text-charcoal-muted`}>Loading laundry break-even…</div>;

  const s = data.settings;
  const otherPhase: PayPhase = data.payPhase === 'NOW' ? 'COMPLIANT' : 'NOW';
  const otherKg = data.payPhase === 'NOW' ? data.breakEvenKgPerDayCompliant : data.breakEvenKgPerDayNow;

  const startEdit = () => {
    setForm({
      priceKes: String(s.pricePerKgCents / 100),
      consumablesPct: String(Math.round(s.consumablesPct * 1000) / 10),
      days: String(s.workingDaysPerMonth),
      fixedNowKes: (s.fixedCostsNowCents / 100).toFixed(2),
      fixedCompliantKes: (s.fixedCostsCompliantCents / 100).toFixed(2),
    });
    setEditing(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: UpdateLaundrySettingsInput = {
      pricePerKgCents: Math.round(parseFloat(form.priceKes) * 100),
      consumablesPct: parseFloat(form.consumablesPct) / 100,
      workingDaysPerMonth: parseInt(form.days, 10),
      fixedCostsNowCents: Math.round(parseFloat(form.fixedNowKes) * 100),
      fixedCostsCompliantCents: Math.round(parseFloat(form.fixedCompliantKes) * 100),
    };
    if (Object.values(patch).some((v) => !Number.isFinite(v))) { setError('Every figure must be a number.'); return; }
    setSaveState('saving');
    try {
      setData((await api.updateLaundrySettings(patch)).laundry);
      setSaveState('saved');
      setEditing(false);
    } catch (err) {
      setSaveState('failed');
      setError(messageFrom(err, 'Could not save the laundry settings'));
    }
  };

  return (
    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-charcoal-muted">Laundry break-even</p>
          <p className="mt-1 text-sm text-charcoal-muted">
            Go decision: <span className={data.goDecision === 'GO' ? 'font-medium text-success' : data.goDecision === 'NO_GO' ? 'font-medium text-danger' : ''}>{GO_LABEL[data.goDecision]}</span>
            {data.goDecision !== 'GO' && ' · set on the Compliance checklist; the line is not sold until GO'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={saveState} />
          {data.canEditSettings && !editing && <button type="button" className={btnGhost} onClick={startEdit}>Edit assumptions</button>}
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-6">
        <div>
          <p className="text-3xl font-medium tabular-nums" style={{ fontFamily: 'Georgia, serif' }} aria-label="Break-even kg per day">{kg(data.breakEvenKgPerDay)}<span className="text-base text-charcoal-muted"> / day</span></p>
          <p className="text-xs text-charcoal-muted">{PAY_PHASE_LABEL[data.payPhase]} · {kes(data.fixedCostsCents)} fixed costs / month · {kg(data.breakEvenKgPerMonth)} / month</p>
        </div>
        <div className="text-sm text-charcoal-muted">
          <span className="text-xs uppercase tracking-widest">{PAY_PHASE_LABEL[otherPhase]}</span>
          <p className="tabular-nums">{kg(otherKg)} / day</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-charcoal-muted">
        fixed costs ÷ ({s.workingDaysPerMonth} days × KSh {s.pricePerKgCents / 100}/kg × (1 − {Math.round(s.consumablesPct * 100)}% consumables)) — contribution KSh {(data.contributionPerKgCents / 100).toFixed(0)}/kg
        {s.updatedAt && ` · assumptions set by ${s.updatedByName ?? 'unknown'}, ${when(s.updatedAt)}`}
      </p>

      {editing && (
        <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-3 rounded-lg border border-gold-bright/45 bg-gold-bright/[0.08] p-4 sm:grid-cols-3">
          <Field label="Price per kg (KSh)"><input type="number" min="1" step="1" className={input} value={form.priceKes} onChange={(e) => setForm((f) => ({ ...f, priceKes: e.target.value }))} /></Field>
          <Field label="Consumables (%)"><input type="number" min="0" max="99" step="0.1" className={input} value={form.consumablesPct} onChange={(e) => setForm((f) => ({ ...f, consumablesPct: e.target.value }))} /></Field>
          <Field label="Working days / month"><input type="number" min="1" max="31" step="1" className={input} value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} /></Field>
          <Field label="Fixed costs — Now pay (KSh / month)" hint="Rent, attendant, electricity, water/sewer, loan repayment"><input type="number" min="0" step="0.01" className={input} value={form.fixedNowKes} onChange={(e) => setForm((f) => ({ ...f, fixedNowKes: e.target.value }))} /></Field>
          <Field label="Fixed costs — Compliant pay (KSh / month)" hint="Attendant at the legal minimum plus statutory costs"><input type="number" min="0" step="0.01" className={input} value={form.fixedCompliantKes} onChange={(e) => setForm((f) => ({ ...f, fixedCompliantKes: e.target.value }))} /></Field>
          <div className="flex items-end justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" disabled={saveState === 'saving'} className="rounded-lg bg-gold-deep px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">Save assumptions</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-charcoal-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-charcoal-muted">{hint}</span>}
    </label>
  );
}
