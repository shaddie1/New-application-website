'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type {
  AdminQuoteRequestDto,
  CleanLevel,
  ClientQuotationDto,
  DistanceZone,
  QuoteBuilderOptions,
  QuoteEstimateDto,
  QuoteStatus,
  QuoteSurveyAreaInput,
  QuoteSurveyInput,
  QuoteSurveyItemInput,
  RoomSizePreset,
  SoilLevel,
} from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { canApproveEstimate, canViewEstimate } from '../../../src/lib/roles';

// ── Labels ───────────────────────────────────────────────────────────────────

const FREQ_LABEL: Record<string, string> = { NONE: 'One-off', WEEKLY: 'Weekly', BIWEEKLY: 'Biweekly', MONTHLY: 'Monthly' };

/** What the customer asked for → the nearest row on the rates card's frequency table. */
const FREQ_TO_RATES_LABEL: Record<string, string> = {
  NONE: 'One-off',
  WEEKLY: 'Weekly (4 visits)',
  BIWEEKLY: 'Fortnightly (2 visits)',
  MONTHLY: 'Monthly (1 visit)',
};

const STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: 'Pending',
  SITE_VISIT_SCHEDULED: 'Visit scheduled',
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  QUOTED: 'Quoted',
  WON: 'Won',
  LOST: 'Lost',
  CANCELLED: 'Cancelled',
};
const STATUS_FILTERS: { value: '' | QuoteStatus; label: string }[] = [
  { value: '', label: 'All' },
  ...(Object.keys(STATUS_LABEL) as QuoteStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];

const ZONE_LABEL: Record<DistanceZone, string> = { ZONE1: 'Zone 1 — up to 10 km', ZONE2: 'Zone 2 — 10 to 25 km', ZONE3: 'Zone 3 — over 25 km' };
const SOIL_LABEL: Record<SoilLevel, string> = { LIGHT: 'Light — daily/weekly clean, little traffic', NORMAL: 'Normal — weekly/fortnightly', HEAVY: 'Heavy — monthly or less, first clean' };
const LEVEL_LABEL: Record<CleanLevel, string> = { ROUTINE: 'Routine', DEEP: 'Deep', VACUUM_ONLY: 'Vacuum only' };
const PRESET_LABEL: Record<RoomSizePreset, string> = { SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', VERY_LARGE: 'Very large', MEASURED: 'Measured (enter m²)' };

/** Survey and estimate can change only while the quote is still in ops' hands. */
const EDITABLE: QuoteStatus[] = ['PENDING', 'SITE_VISIT_SCHEDULED'];

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed';
const tab = (on: boolean) =>
  `border-b-2 px-3 py-2 text-sm ${on ? 'border-gold-deep font-medium text-gold-deep' : 'border-transparent text-charcoal-muted hover:text-charcoal'}`;

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function money(cents: number) {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}
function when(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function pct(fraction: number) {
  return `${Math.round(fraction * 1000) / 10}%`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

// useSearchParams needs a Suspense boundary for Next's static prerender.
export default function QuotesPage() {
  return (
    <Suspense fallback={<div className="text-charcoal-muted">Loading…</div>}>
      <QuotesPageInner />
    </Suspense>
  );
}

function QuotesPageInner() {
  const session = useRequireAdmin();
  const showEstimate = canViewEstimate(session);
  const approver = canApproveEstimate(session);

  const [filter, setFilter] = useState<'' | QuoteStatus>('');
  const [quotes, setQuotes] = useState<AdminQuoteRequestDto[] | null>(null);
  const [options, setOptions] = useState<QuoteBuilderOptions | null>(null);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<AdminQuoteRequestDto | null>(null);
  // Deep link from the pipeline's "Create quote": open that card straight away.
  const openId = useSearchParams().get('open');
  const [expanded, setExpanded] = useState<string | null>(openId);

  const load = useCallback(async () => {
    try {
      const res = await api.quotes(filter || undefined);
      setQuotes(res.quoteRequests);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load quotes (${err.status}).` : 'Could not load quotes.');
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    api.quoteBuilderOptions().then((r) => setOptions(r.options)).catch(() => setOptions(null));
  }, []);

  useEffect(() => {
    if (!showEstimate) return;
    api.quoteRates().then((r) => setRatesUpdatedAt(r.updatedAt)).catch(() => undefined);
  }, [showEstimate]);

  const patchQuote = (updated: AdminQuoteRequestDto) =>
    setQuotes((prev) => prev?.map((q) => (q.id === updated.id ? updated : q)) ?? null);

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Quote requests</h1>
          <p className="mt-1 text-sm text-charcoal-muted">
            Survey the site, build the estimate, get it approved, then send the client quotation.
          </p>
        </div>
        {showEstimate && (
          <Link href="/rates" className={btnGhost}>Quote rates →</Link>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1.5 text-sm ${filter === f.value ? 'border-charcoal bg-charcoal text-white' : 'border-line bg-white text-charcoal-muted'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}
      {!quotes && !error && <p className="mt-6 text-charcoal-muted">Loading…</p>}
      {quotes && quotes.length === 0 && <p className="mt-6 text-charcoal-muted">No quote requests match this filter.</p>}

      <div className="mt-6 space-y-3">
        {(quotes ?? []).map((q) => (
          <QuoteCard
            key={q.id}
            quote={q}
            options={options}
            showEstimate={showEstimate}
            approver={approver}
            ratesUpdatedAt={ratesUpdatedAt}
            expanded={expanded === q.id}
            onToggle={() => setExpanded(expanded === q.id ? null : q.id)}
            onRespond={() => setActive(q)}
            onChange={patchQuote}
            onError={setError}
          />
        ))}
      </div>

      {active && (
        <RespondModal
          quote={active}
          onClose={() => setActive(null)}
          onDone={(updated) => { setActive(null); patchQuote(updated); void load(); }}
        />
      )}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function QuoteCard({
  quote: q, options, showEstimate, approver, ratesUpdatedAt, expanded, onToggle, onRespond, onChange, onError,
}: {
  quote: AdminQuoteRequestDto;
  options: QuoteBuilderOptions | null;
  showEstimate: boolean;
  approver: boolean;
  ratesUpdatedAt: string | null;
  expanded: boolean;
  onToggle: () => void;
  onRespond: () => void;
  onChange: (q: AdminQuoteRequestDto) => void;
  onError: (msg: string | null) => void;
}) {
  const [panel, setPanel] = useState<'survey' | 'estimate' | 'quotation'>('survey');
  const hasQuotation = q.approvedPricePerVisitCents != null;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-gold-deep">{q.serviceLineName}</span>
            <StatusBadge status={q.status} />
            {q.survey && <span className="rounded-full bg-cream-deep px-2 py-0.5 text-xs text-charcoal-muted">Surveyed</span>}
          </div>
          <p className="mt-1 text-lg" style={{ fontFamily: 'Georgia, serif' }}>{q.siteType}</p>
          <p className="mt-0.5 text-sm text-charcoal-muted">
            {[q.approxSqm ? `~${q.approxSqm.toLocaleString()} m²` : null, q.floors ? `${q.floors} floors` : null, FREQ_LABEL[q.frequency]]
              .filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 text-xs text-charcoal-muted">{q.customerName} · {q.customerPhone}</p>
          {q.notes && <p className="mt-2 text-sm italic text-charcoal-muted">“{q.notes}”</p>}
          {q.quotedAmountCents != null && q.status !== 'APPROVED' && (
            <p className="mt-2 text-sm text-success">Quoted {money(q.quotedAmountCents)} per visit</p>
          )}
          {q.status === 'APPROVED' && q.approvedPricePerVisitCents != null && (
            <p className="mt-2 text-sm text-success">
              Approved at {money(q.approvedPricePerVisitCents)} per visit — ready to send to the client.
            </p>
          )}
          {q.status === 'AWAITING_APPROVAL' && (
            <p className="mt-2 text-sm text-warning">
              Sent for approval by {q.submittedForApprovalByName ?? 'unknown'}{q.submittedForApprovalAt ? ` · ${when(q.submittedForApprovalAt)}` : ''}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onToggle} className={btnGhost}>
            {expanded ? '▲ Hide' : '▼ Survey & estimate'}
          </button>
          <button onClick={onRespond} className="rounded-lg bg-gold-deep px-3 py-1.5 text-sm font-semibold text-white">
            Respond
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line bg-cream/40 px-4 py-4">
          <div className="mb-4 flex items-center gap-1 border-b border-line">
            <button onClick={() => setPanel('survey')} className={tab(panel === 'survey')}>Site survey</button>
            {showEstimate && (
              <button onClick={() => setPanel('estimate')} className={tab(panel === 'estimate')}>
                Estimate{q.estimate ? ` · ${q.estimate.output.pricing.marginCheck}` : ''}
              </button>
            )}
            {hasQuotation && (
              <button onClick={() => setPanel('quotation')} className={tab(panel === 'quotation')}>Client quotation</button>
            )}
          </div>

          {panel === 'survey' && (
            <SurveyPanel quote={q} options={options} onChange={onChange} />
          )}
          {panel === 'estimate' && showEstimate && (
            <EstimatePanel quote={q} approver={approver} ratesUpdatedAt={ratesUpdatedAt} onChange={onChange} onError={onError} />
          )}
          {panel === 'quotation' && hasQuotation && <QuotationPanel quoteId={q.id} />}
        </div>
      )}
    </div>
  );
}

// ── Survey ───────────────────────────────────────────────────────────────────

function defaultSurvey(q: AdminQuoteRequestDto, options: QuoteBuilderOptions | null): QuoteSurveyInput {
  const wanted = FREQ_TO_RATES_LABEL[q.frequency] ?? 'One-off';
  const labels = options?.frequencies.map((f) => f.label) ?? [];
  return {
    distanceZone: 'ZONE1',
    soilLevel: 'NORMAL',
    frequencyLabel: labels.includes(wanted) ? wanted : labels[0] ?? wanted,
    workingWindowHours: 7,
    supervisorOnSite: false,
    traineeSourced: false,
    notes: '',
    areas: [],
    items: [],
  };
}

function SurveyPanel({ quote: q, options, onChange }: {
  quote: AdminQuoteRequestDto;
  options: QuoteBuilderOptions | null;
  onChange: (q: AdminQuoteRequestDto) => void;
}) {
  const editable = EDITABLE.includes(q.status);
  const [form, setForm] = useState<QuoteSurveyInput>(() =>
    q.survey ? { ...q.survey, notes: q.survey.notes ?? '' } : defaultSurvey(q, options),
  );
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Options arrive after first render for a fresh survey — pick the frequency once they do.
  useEffect(() => {
    if (q.survey || !options) return;
    setForm((f) => (options.frequencies.some((o) => o.label === f.frequencyLabel) ? f : defaultSurvey(q, options)));
  }, [options, q]);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  const areaTypes = options?.areaTypes ?? [];
  const itemTypes = options?.itemTypes ?? [];

  const setArea = (i: number, next: Partial<QuoteSurveyAreaInput>) =>
    setForm((f) => ({ ...f, areas: f.areas.map((a, j) => (j === i ? { ...a, ...next } : a)) }));
  const setItem = (i: number, next: Partial<QuoteSurveyItemInput>) =>
    setForm((f) => ({ ...f, items: f.items.map((a, j) => (j === i ? { ...a, ...next } : a)) }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.areas.length === 0 && form.items.length === 0) {
      setError('Add at least one area or item before saving.');
      return;
    }
    const bad = form.areas.find((a) => a.sizePreset === 'MEASURED' && !(a.measuredM2 && a.measuredM2 > 0));
    if (bad) {
      setError(`Enter the measured m² for “${bad.areaType}”.`);
      return;
    }
    setSaveState('saving');
    try {
      const res = await api.saveQuoteSurvey(q.id, {
        ...form,
        notes: form.notes?.trim() || null,
        areas: form.areas.map((a) => ({ ...a, measuredM2: a.sizePreset === 'MEASURED' ? a.measuredM2 ?? null : null })),
      });
      onChange(res.quoteRequest);
      setSaveState('saved');
    } catch (err) {
      setSaveState('failed');
      setError(messageFrom(err, 'Could not save the survey.'));
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-4 py-2 text-xs">
        <span className="text-charcoal-muted">
          {editable
            ? 'Saving the survey recomputes the estimate from the current rates.'
            : `The quote is ${STATUS_LABEL[q.status].toLowerCase()} — the survey is locked. Withdraw the estimate to edit it.`}
          {q.survey && ` Last saved by ${q.survey.updatedByName ?? 'unknown'} · ${when(q.survey.updatedAt)}.`}
        </span>
        <span className={
          saveState === 'failed' ? 'font-medium text-danger'
          : saveState === 'saved' ? 'font-medium text-success'
          : 'text-charcoal-muted'
        }>
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'failed' ? '⚠ Not saved — try again' : ''}
        </span>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Labelled label="Distance zone">
          <select className={input} value={form.distanceZone} onChange={(e) => setForm((f) => ({ ...f, distanceZone: e.target.value as DistanceZone }))}>
            {(Object.keys(ZONE_LABEL) as DistanceZone[]).map((z) => <option key={z} value={z}>{ZONE_LABEL[z]}</option>)}
          </select>
        </Labelled>
        <Labelled label="Soil level">
          <select className={input} value={form.soilLevel} onChange={(e) => setForm((f) => ({ ...f, soilLevel: e.target.value as SoilLevel }))}>
            {(Object.keys(SOIL_LABEL) as SoilLevel[]).map((s) => <option key={s} value={s}>{SOIL_LABEL[s]}</option>)}
          </select>
        </Labelled>
        <Labelled label="Service frequency">
          <select className={input} value={form.frequencyLabel} onChange={(e) => setForm((f) => ({ ...f, frequencyLabel: e.target.value }))}>
            {(options?.frequencies ?? [{ label: form.frequencyLabel, visitsPerMonth: 1 }]).map((f) => (
              <option key={f.label} value={f.label}>{f.label}</option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Working window (hours per day)">
          <input type="number" min={0.5} max={24} step={0.5} className={input} value={form.workingWindowHours}
            onChange={(e) => setForm((f) => ({ ...f, workingWindowHours: parseFloat(e.target.value) || 0 }))} />
        </Labelled>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.supervisorOnSite} onChange={(e) => setForm((f) => ({ ...f, supervisorOnSite: e.target.checked }))} />
          Supervisor on site
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.traineeSourced} onChange={(e) => setForm((f) => ({ ...f, traineeSourced: e.target.checked }))} />
          Trainee-sourced lead (commission applies)
        </label>
        <div className="sm:col-span-2">
          <Labelled label="Survey notes">
            <input className={input} value={form.notes ?? ''} placeholder="Access, water/power, anything unusual"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Labelled>
        </div>
      </fieldset>

      {/* Areas */}
      <fieldset disabled={!editable}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-muted">Areas ({form.areas.length})</p>
          <button type="button" className={btnGhost} onClick={() =>
            setForm((f) => ({ ...f, areas: [...f.areas, { areaType: areaTypes[0] ?? '', cleanLevel: 'ROUTINE', roomCount: 1, sizePreset: 'MEDIUM', measuredM2: null }] }))
          }>+ Add area</button>
        </div>
        {form.areas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-charcoal-muted">No areas yet — add each room type the crew will clean.</p>
        ) : (
          <div className="space-y-2">
            {form.areas.map((a, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
                <select className={input} value={a.areaType} onChange={(e) => setArea(i, { areaType: e.target.value })}>
                  {!areaTypes.includes(a.areaType) && a.areaType && <option value={a.areaType}>{a.areaType}</option>}
                  {areaTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className={input} value={a.cleanLevel} onChange={(e) => setArea(i, { cleanLevel: e.target.value as CleanLevel })}>
                  {(Object.keys(LEVEL_LABEL) as CleanLevel[]).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                </select>
                <input type="number" min={1} step={1} className={input} value={a.roomCount} title="Room count"
                  onChange={(e) => setArea(i, { roomCount: Math.max(1, Math.round(parseFloat(e.target.value) || 1)) })} />
                <select className={input} value={a.sizePreset} onChange={(e) => setArea(i, { sizePreset: e.target.value as RoomSizePreset })}>
                  {(Object.keys(PRESET_LABEL) as RoomSizePreset[]).map((p) => (
                    <option key={p} value={p}>
                      {PRESET_LABEL[p]}{p !== 'MEASURED' && options ? ` · ${options.roomSizePresetsM2[p]} m²` : ''}
                    </option>
                  ))}
                </select>
                <input type="number" min={1} step={1} className={input} placeholder="m² per room" disabled={a.sizePreset !== 'MEASURED'}
                  value={a.sizePreset === 'MEASURED' ? a.measuredM2 ?? '' : ''}
                  onChange={(e) => setArea(i, { measuredM2: parseFloat(e.target.value) || null })} />
                <button type="button" className="text-xs text-danger hover:underline" onClick={() => setForm((f) => ({ ...f, areas: f.areas.filter((_, j) => j !== i) }))}>Remove</button>
              </div>
            ))}
            <p className="text-xs text-charcoal-muted">Columns: area type · clean level · number of rooms · size · measured m² (per room).</p>
          </div>
        )}
      </fieldset>

      {/* Items */}
      <fieldset disabled={!editable}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-charcoal-muted">Items ({form.items.length})</p>
          <button type="button" className={btnGhost} onClick={() =>
            setForm((f) => ({ ...f, items: [...f.items, { itemType: itemTypes[0] ?? '', quantity: 1 }] }))
          }>+ Add item</button>
        </div>
        {form.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-charcoal-muted">No counted items — chairs, sofas, windows, bins and the like.</p>
        ) : (
          <div className="space-y-2">
            {form.items.map((it, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-[3fr_1fr_auto]">
                <select className={input} value={it.itemType} onChange={(e) => setItem(i, { itemType: e.target.value })}>
                  {!itemTypes.includes(it.itemType) && it.itemType && <option value={it.itemType}>{it.itemType}</option>}
                  {itemTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="number" min={1} step={1} className={input} value={it.quantity} title="Quantity"
                  onChange={(e) => setItem(i, { quantity: Math.max(1, Math.round(parseFloat(e.target.value) || 1)) })} />
                <button type="button" className="text-xs text-danger hover:underline" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      {editable && (
        <div className="flex justify-end border-t border-line pt-4">
          <button type="submit" disabled={saveState === 'saving'} className={btn}>
            {saveState === 'saving' ? 'Saving…' : q.survey ? 'Save survey & re-estimate' : 'Save survey & estimate'}
          </button>
        </div>
      )}
    </form>
  );
}

// ── Estimate (internal) ──────────────────────────────────────────────────────

function EstimatePanel({ quote: q, approver, ratesUpdatedAt, onChange, onError }: {
  quote: AdminQuoteRequestDto;
  approver: boolean;
  ratesUpdatedAt: string | null;
  onChange: (q: AdminQuoteRequestDto) => void;
  onError: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const est = q.estimate;

  if (!est) {
    return (
      <div className="rounded-lg border border-line bg-white px-4 py-6 text-center text-sm text-charcoal-muted">
        No estimate yet. Save a site survey and it is computed from the current rates.
      </div>
    );
  }

  const o = est.output;
  const blocked = o.pricing.marginCheck === 'BELOW MINIMUM';
  const blockedReason = blocked
    ? `Blocked: price per visit ${money(o.pricing.pricePerVisitCents)} is below the minimum price ${money(o.pricing.minimumPriceCents)} (BELOW MINIMUM). Change the scope, frequency or rates first.`
    : null;
  const stale = !!ratesUpdatedAt && (!est.ratesUpdatedAt || new Date(ratesUpdatedAt) > new Date(est.ratesUpdatedAt));
  const editable = EDITABLE.includes(q.status);

  // Every action swaps the status in place first so the row reads right at
  // once, then settles on what the server returns; a failure puts it back.
  const run = async (key: string, optimistic: Partial<AdminQuoteRequestDto> | null, call: () => Promise<{ quoteRequest: AdminQuoteRequestDto }>) => {
    setBusy(key);
    onError(null);
    const before = q;
    if (optimistic) onChange({ ...q, ...optimistic });
    try {
      onChange((await call()).quoteRequest);
    } catch (err) {
      onChange(before);
      onError(messageFrom(err, 'That action failed.'));
    } finally {
      setBusy(null);
    }
  };

  const submit = () => {
    if (blocked) return;
    if (!confirm(`Send this estimate for COO approval at ${money(o.pricing.pricePerVisitCents)} per visit?`)) return;
    void run('submit', { status: 'AWAITING_APPROVAL' }, () => api.submitEstimate(q.id));
  };
  const withdraw = () => {
    if (!confirm('Withdraw the estimate? It goes back to draft and the survey can be edited again.')) return;
    void run('withdraw', { status: 'SITE_VISIT_SCHEDULED' }, () => api.withdrawEstimate(q.id));
  };
  const approve = () => {
    const note = prompt(`Approve ${money(o.pricing.pricePerVisitCents)} per visit? Optional note for the record:`);
    if (note === null) return;
    void run('approve', { status: 'APPROVED' }, () => api.approveEstimate(q.id, note.trim() || undefined));
  };
  const reject = () => {
    const note = prompt('Reason for rejecting (required — the surveyor sees this):');
    if (note === null) return;
    if (!note.trim()) { onError('A rejection needs a reason.'); return; }
    void run('reject', { status: 'SITE_VISIT_SCHEDULED' }, () => api.rejectEstimate(q.id, note.trim()));
  };
  const recompute = () => void run('recompute', null, () => api.recomputeEstimate(q.id));

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Recommended price / visit" value={money(o.pricing.pricePerVisitCents)} accent
          hint={o.pricing.discountPct > 0 ? `${o.pricing.frequencyLabel} · ${pct(o.pricing.discountPct)} off ${money(o.pricing.recommendedPriceCents)}` : o.pricing.frequencyLabel} />
        <Stat label="Monthly value" value={money(o.pricing.monthlyValueCents)} hint={`${o.pricing.visitsPerMonth} visit${o.pricing.visitsPerMonth === 1 ? '' : 's'} / month`} />
        <Stat label="Gross margin at quote" value={pct(o.pricing.marginPct)} hint={`min ${money(o.pricing.minimumPriceCents)} · target ${money(o.pricing.targetPriceCents)}`} />
        <div className={`rounded-xl border p-4 ${blocked ? 'border-danger/40 bg-danger/5' : o.pricing.marginCheck === 'OK' ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'}`}>
          <p className="text-xs uppercase tracking-widest text-charcoal-muted">Margin check</p>
          <p className={`mt-1 text-xl font-medium ${blocked ? 'text-danger' : o.pricing.marginCheck === 'OK' ? 'text-success' : 'text-warning'}`}>{o.pricing.marginCheck}</p>
          <p className="mt-1 text-xs text-charcoal-muted">
            Market {money(o.pricing.marketLowCents)} – {money(o.pricing.marketHighCents)}
          </p>
        </div>
      </div>

      {(o.warnings.length > 0 || stale || est.status === 'REJECTED') && (
        <div className="space-y-1 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          {est.status === 'REJECTED' && (
            <p className="font-medium text-danger">
              Rejected by {est.decidedByName ?? 'unknown'}{est.decidedAt ? ` · ${when(est.decidedAt)}` : ''}: {est.decisionNote}
            </p>
          )}
          {stale && <p className="font-medium text-warning">The rates card changed after this estimate — recalculate before sending it on.</p>}
          {o.warnings.map((w, i) => <p key={i} className="text-charcoal-muted">• {w}</p>)}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3">
        <div className="text-xs text-charcoal-muted">
          <span className="font-medium text-charcoal">{est.status.charAt(0) + est.status.slice(1).toLowerCase()}</span>
          {' · '}computed by {est.computedByName ?? 'unknown'} · {when(est.computedAt)}
          {est.status === 'SUBMITTED' && est.submittedAt && <> · sent by {est.submittedByName ?? 'unknown'} · {when(est.submittedAt)}</>}
          {est.status === 'APPROVED' && est.decidedAt && (
            <> · approved by {est.decidedByName ?? 'unknown'} · {when(est.decidedAt)}{est.decisionNote ? ` — “${est.decisionNote}”` : ''}</>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              <button className={btnGhost} disabled={!!busy} onClick={recompute}>
                {busy === 'recompute' ? 'Recalculating…' : 'Recalculate with current rates'}
              </button>
              <button
                className={btn}
                disabled={!!busy || blocked || est.status === 'REJECTED'}
                onClick={submit}
                title={blockedReason ?? (est.status === 'REJECTED' ? 'Recalculate or re-save the survey for a fresh estimate first' : undefined)}
              >
                {busy === 'submit' ? 'Sending…' : 'Send for COO approval'}
              </button>
            </>
          )}
          {(q.status === 'AWAITING_APPROVAL' || q.status === 'APPROVED') && (
            <button className={btnGhost} disabled={!!busy} onClick={withdraw}>
              {busy === 'withdraw' ? 'Withdrawing…' : q.status === 'APPROVED' ? 'Withdraw approval' : 'Withdraw'}
            </button>
          )}
          {q.status === 'AWAITING_APPROVAL' && approver && (
            <>
              <button className="rounded-lg bg-success px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50" disabled={!!busy || blocked} onClick={approve} title={blockedReason ?? undefined}>
                {busy === 'approve' ? 'Approving…' : 'Approve'}
              </button>
              <button className="rounded-lg border border-danger/40 px-4 py-2 text-sm text-danger hover:bg-danger/5 disabled:opacity-50" disabled={!!busy} onClick={reject}>
                {busy === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
            </>
          )}
          {q.status === 'AWAITING_APPROVAL' && !approver && (
            <span className="text-xs text-charcoal-muted">Waiting for the COO or owner.</span>
          )}
        </div>
      </div>
      {blockedReason && editable && (
        <p className="rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">{blockedReason}</p>
      )}

      {/* Working */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Task hours">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-charcoal-muted">
                <th className="py-1 pr-2 font-normal">Line</th>
                <th className="py-1 pr-2 text-right font-normal">Hours</th>
                <th className="py-1 pr-2 text-right font-normal">Consumables</th>
                <th className="py-1 text-right font-normal">Market</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {o.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-2">
                    <div>{l.label}</div>
                    <div className="text-xs text-charcoal-muted">{l.detail}</div>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{l.personHours.toFixed(2)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{money(l.consumablesCents)}</td>
                  <td className="py-1.5 text-right text-xs tabular-nums text-charcoal-muted">{money(l.marketLowCents)}–{money(l.marketHighCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
            <Row k={`Task hours (areas × soil ${o.hours.soilMultiplier})`} v={`${o.hours.taskHours.toFixed(2)} h`} />
            <Row k="Movement allowance" v={`${o.hours.movementAllowanceHours.toFixed(2)} h`} />
            <Row k="Set-up and close-out" v={`${o.hours.setupCloseOutHours} h`} />
            <Row k="Total person-hours" v={`${o.hours.totalPersonHours.toFixed(2)} h`} strong />
            <Row k="Hours / person / day" v={`${o.hours.hoursPerPersonPerDay} h`} />
            <Row k="Job days × cleaners" v={`${o.hours.jobDays} × ${o.hours.crewSize}${o.hours.supervisorDays ? ` + supervisor ${o.hours.supervisorDays} d` : ''}`} />
          </dl>
        </Panel>

        <Panel title="Cost build-up (per visit)">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Row k="Cleaner pay" v={money(o.costs.labourCents)} />
            <Row k="Supervisor pay" v={money(o.costs.supervisorCents)} />
            <Row k="Consumables" v={money(o.costs.consumablesCents)} />
            <Row k="Transport" v={money(o.costs.transportCents)} />
            <Row k="Equipment wear" v={money(o.costs.equipmentWearCents)} />
            <Row k="Direct cost" v={money(o.costs.directCostCents)} strong />
            <Row k="Contingency" v={money(o.costs.contingencyCents)} />
            <Row k="Cost base" v={money(o.costs.costBaseCents)} strong />
          </dl>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
            <Row k="Minimum price" v={money(o.pricing.minimumPriceCents)} />
            <Row k="Target price" v={money(o.pricing.targetPriceCents)} />
            <Row k="Recommended (before discount)" v={money(o.pricing.recommendedPriceCents)} />
            <Row k={`Per visit (${o.pricing.frequencyLabel})`} v={money(o.pricing.pricePerVisitCents)} strong />
            <Row k="Gross margin at quote" v={pct(o.pricing.marginPct)} />
            <Row k="Price − direct cost" v={money(o.commission.netProfitPerVisitCents)} />
            <Row k={o.commission.traineeSourced ? `Commission (${pct(o.commission.commissionPct)}, trainee-sourced)` : 'Commission'} v={o.commission.traineeSourced ? money(o.commission.commissionCents) : '—'} />
          </dl>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
            <Row k="Cleaner pay vs legal minimum / day" v={`${money(o.compliance.cleanerPayPerDayCents)} vs ${money(o.compliance.legalMinWagePerDayCents)} ${o.compliance.meetsLegalMinimum ? '✓' : '⚠'}`} />
            <Row k="Direct cost at compliant pay" v={money(o.compliance.legalDirectCostCents)} />
            <Row k="Margin at compliant pay" v={pct(o.compliance.legalMarginPct)} />
          </dl>
          <p className="mt-2 text-xs text-charcoal-muted">Compliant-pay row is informational and never blocks a quote.</p>
        </Panel>
      </div>
    </div>
  );
}

// ── Client quotation ─────────────────────────────────────────────────────────

function QuotationPanel({ quoteId }: { quoteId: string }) {
  const [doc, setDoc] = useState<ClientQuotationDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.clientQuotation(quoteId)
      .then((r) => { if (live) setDoc(r.quotation); })
      .catch((err) => { if (live) setError(messageFrom(err, 'Could not load the quotation.')); });
    return () => { live = false; };
  }, [quoteId]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!doc) return <p className="text-sm text-charcoal-muted">Preparing the quotation…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-charcoal-muted">Scope and price only — no internal figures. This is what the client receives.</p>
        <button className={btnGhost} onClick={() => printQuotation(doc)}>Print / save as PDF</button>
      </div>
      <div className="rounded-xl border border-line bg-white p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-charcoal-muted">OnyxHawk Cleaning Service · Quotation</p>
        <h3 className="mt-2 text-2xl" style={{ fontFamily: 'Georgia, serif' }}>{doc.siteType}</h3>
        <p className="mt-1 text-sm text-charcoal-muted">
          Prepared for {doc.customerName} · {doc.serviceLineName} · {new Date(doc.issuedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-charcoal-muted">
              <th className="py-2 pr-3 font-normal">Scope of work</th>
              <th className="py-2 font-normal">What we do</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {doc.scope.map((s, i) => (
              <tr key={i}>
                <td className="py-2 pr-3 align-top">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-charcoal-muted">{s.detail}</div>
                </td>
                <td className="py-2 align-top text-charcoal-muted">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <Stat label="Frequency" value={doc.frequencyLabel} />
          <Stat label="Price per visit" value={money(doc.pricePerVisitCents)} accent />
          <Stat label="Monthly value" value={money(doc.monthlyValueCents)} hint={`${doc.visitsPerMonth} visit${doc.visitsPerMonth === 1 ? '' : 's'} / month`} />
        </div>
        <p className="mt-4 text-xs text-charcoal-muted">
          Prices in Kenyan shillings, inclusive of labour, materials and transport. Valid for 30 days. Questions:{' '}
          {doc.contactPhone} · {doc.contactEmail}
        </p>
      </div>
    </div>
  );
}

/** A standalone printable page — keeps the dashboard chrome out of the PDF. */
function printQuotation(doc: ClientQuotationDto) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
  const rows = doc.scope.map((s) =>
    `<tr><td><strong>${esc(s.label)}</strong><br><span class="muted">${esc(s.detail)}</span></td><td class="muted">${esc(s.description)}</td></tr>`,
  ).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Quotation — ${esc(doc.siteType)}</title>
<style>
  body{font-family:Georgia,serif;color:#222;margin:48px;max-width:760px}
  .eyebrow{font:600 11px/1.4 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#777}
  h1{font-size:28px;margin:8px 0 4px}.muted{color:#666;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:24px;font-family:system-ui,sans-serif;font-size:14px}
  th{text-align:left;font-weight:500;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#777;padding:6px 8px 6px 0;border-bottom:1px solid #ddd}
  td{padding:8px 8px 8px 0;border-bottom:1px solid #eee;vertical-align:top}
  .totals{display:flex;gap:32px;margin-top:28px;padding-top:16px;border-top:1px solid #ddd;font-family:system-ui,sans-serif}
  .totals div p{margin:0}.totals .k{font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#777}.totals .v{font-size:22px;font-family:Georgia,serif;margin-top:4px}
  .foot{margin-top:28px;font:13px/1.5 system-ui,sans-serif;color:#666}
</style></head><body>
<p class="eyebrow">OnyxHawk Cleaning Service · Quotation</p>
<h1>${esc(doc.siteType)}</h1>
<p class="muted">Prepared for ${esc(doc.customerName)} · ${esc(doc.serviceLineName)} · ${new Date(doc.issuedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
<table><thead><tr><th>Scope of work</th><th>What we do</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
  <div><p class="k">Frequency</p><p class="v">${esc(doc.frequencyLabel)}</p></div>
  <div><p class="k">Price per visit</p><p class="v">${money(doc.pricePerVisitCents)}</p></div>
  <div><p class="k">Monthly value</p><p class="v">${money(doc.monthlyValueCents)}</p><p class="muted">${doc.visitsPerMonth} visit${doc.visitsPerMonth === 1 ? '' : 's'} / month</p></div>
</div>
<p class="foot">Prices in Kenyan shillings, inclusive of labour, materials and transport. Valid for 30 days.<br>${esc(doc.contactPhone)} · ${esc(doc.contactEmail)}</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

// ── Respond modal ────────────────────────────────────────────────────────────

function RespondModal({ quote, onClose, onDone }: {
  quote: AdminQuoteRequestDto;
  onClose: () => void;
  onDone: (updated: AdminQuoteRequestDto) => void;
}) {
  const awaiting = quote.status === 'AWAITING_APPROVAL';
  const canQuote = quote.approvedPricePerVisitCents != null && !awaiting;
  const [status, setStatus] = useState<QuoteStatus>(canQuote ? 'QUOTED' : awaiting ? 'LOST' : 'SITE_VISIT_SCHEDULED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const OPTIONS: { value: QuoteStatus; disabled: boolean; why?: string }[] = [
    { value: 'SITE_VISIT_SCHEDULED', disabled: awaiting, why: 'approve, reject or withdraw the estimate first' },
    { value: 'QUOTED', disabled: !canQuote, why: awaiting ? 'the estimate is awaiting approval' : 'needs an approved estimate' },
    { value: 'WON', disabled: false },
    { value: 'LOST', disabled: false },
    { value: 'CANCELLED', disabled: false },
  ];

  const submit = async () => {
    setError(null);
    if (status === 'QUOTED' && !canQuote) {
      setError('QUOTED needs an approved estimate — complete the survey and send it for COO approval.');
      return;
    }
    if (status === 'QUOTED' && !confirm(`Send the client a quotation of ${money(quote.approvedPricePerVisitCents!)} per visit?`)) return;
    setBusy(true);
    try {
      const res = await api.respondQuote(quote.id, { status });
      onDone(res.quoteRequest);
    } catch (err) {
      setError(messageFrom(err, 'Could not save the response.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-cream p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>Respond to quote</h2>
        <p className="mt-1 text-sm text-charcoal-muted">{quote.serviceLineName} · {quote.siteType}</p>

        {error && <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <label className="mt-4 block text-xs uppercase tracking-widest text-charcoal-muted">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)} className={`${input} mt-2`}>
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {STATUS_LABEL[o.value]}{o.disabled && o.why ? ` — ${o.why}` : ''}
            </option>
          ))}
        </select>

        {status === 'QUOTED' && (
          <div className="mt-4 rounded-lg border border-success/40 bg-success/5 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-charcoal-muted">Approved price per visit</p>
            <p className="mt-1 text-2xl" style={{ fontFamily: 'Georgia, serif' }}>
              {canQuote ? money(quote.approvedPricePerVisitCents!) : '—'}
            </p>
            <p className="mt-1 text-xs text-charcoal-muted">
              {canQuote
                ? `Approved by ${quote.approvedByName ?? 'unknown'}${quote.approvedAt ? ` · ${when(quote.approvedAt)}` : ''}. The client is notified with this figure.`
                : 'Prices come from the approved estimate, not typed by hand.'}
            </p>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-line py-2.5 text-charcoal">Cancel</button>
          <button onClick={() => void submit()} disabled={busy} className="flex-1 rounded-lg bg-gold-deep py-2.5 font-semibold text-white disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: QuoteStatus }) {
  const map: Record<QuoteStatus, string> = {
    PENDING: 'bg-gold-bright/20 text-bronze',
    SITE_VISIT_SCHEDULED: 'bg-cream-deep text-charcoal',
    AWAITING_APPROVAL: 'bg-warning/15 text-warning',
    APPROVED: 'bg-success/15 text-success',
    QUOTED: 'bg-success/15 text-success',
    WON: 'bg-success/15 text-success',
    LOST: 'bg-cream-deep text-charcoal-muted',
    CANCELLED: 'bg-cream-deep text-charcoal-muted',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[status]}`}>{STATUS_LABEL[status]}</span>;
}

/** The control sits inside the label so the two are associated without ids. */
function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-charcoal-muted">{label}</span>
      {children}
    </label>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">{title}</p>
      {children}
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-gold-bright/50 bg-gold-bright/10' : 'border-line bg-white'}`}>
      <p className="text-xs uppercase tracking-widest text-charcoal-muted">{label}</p>
      <p className="mt-1 text-xl" style={{ fontFamily: 'Georgia, serif' }}>{value}</p>
      {hint && <p className="mt-1 text-xs text-charcoal-muted">{hint}</p>}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <>
      <dt className={`text-charcoal-muted ${strong ? 'font-medium text-charcoal' : ''}`}>{k}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'font-medium' : ''}`}>{v}</dd>
    </>
  );
}

function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { error?: unknown } | null;
    if (payload && typeof payload.error === 'string') return `${payload.error} (${err.status})`;
    return `${fallback} (${err.status})`;
  }
  return fallback;
}
