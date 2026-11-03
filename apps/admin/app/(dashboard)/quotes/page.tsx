'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  AdminQuoteRequestDto,
  CleanLevel,
  ClientPriceBasis,
  ClientQuotationDto,
  CostingAmount,
  CostingBoughtMachine,
  CostingHiredMachine,
  CostingOwnedMachineInput,
  CreateBuilderQuoteInput,
  DistanceZone,
  QuoteBuilderAssetDto,
  QuoteBuilderOptions,
  QuoteCostingDto,
  QuoteCostingInput,
  QuoteFrequency,
  QuoteRatesDto,
  QuoteStatus,
  QuoteSurveyAreaInput,
  QuoteSurveyInput,
  QuoteSurveyItemInput,
  RoomSizePreset,
  ServiceLineCode,
  SoilLevel,
  StoredQuoteEstimateOutput,
} from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useConfirm } from '../../../src/components/ui/confirm-dialog';
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
const btn = 'rounded-lg bg-navy text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-mist disabled:opacity-50 disabled:cursor-not-allowed';
const tab = (on: boolean) =>
  `border-b-2 px-3 py-2 text-sm ${on ? 'border-aqua font-medium text-navy' : 'border-transparent text-charcoal-muted hover:text-charcoal'}`;

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
function visitsText(visits: number) {
  return `${visits} visit${visits === 1 ? '' : 's'} / month`;
}
/** The approved price the way the client agreed it: per month when monthly, else per visit. */
function approvedPrice(q: AdminQuoteRequestDto) {
  return q.approvedPriceBasis === 'MONTH' && q.approvedMonthlyValueCents != null
    ? `${money(q.approvedMonthlyValueCents)} per month`
    : `${money(q.approvedPricePerVisitCents ?? 0)} per visit`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const session = useRequireAdmin();
  const showEstimate = canViewEstimate(session);
  const approver = canApproveEstimate(session);

  const [filter, setFilter] = useState<'' | QuoteStatus>('');
  const [quotes, setQuotes] = useState<AdminQuoteRequestDto[] | null>(null);
  const [options, setOptions] = useState<QuoteBuilderOptions | null>(null);
  const [rates, setRates] = useState<QuoteRatesDto | null>(null);
  const [assets, setAssets] = useState<QuoteBuilderAssetDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<AdminQuoteRequestDto | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** A quote just started here: its card opens on the Estimate tab. */
  const [started, setStarted] = useState<string | null>(null);

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
    api.quoteRates().then(setRates).catch(() => undefined);
    api.quoteBuilderAssets().then((r) => setAssets(r.assets)).catch(() => undefined);
  }, [showEstimate]);

  const patchQuote = (updated: AdminQuoteRequestDto) =>
    setQuotes((prev) => prev?.map((q) => (q.id === updated.id ? updated : q)) ?? null);

  const openStarted = (created: AdminQuoteRequestDto) => {
    setCreating(false);
    setStarted(created.id);
    setExpanded(created.id);
    setQuotes((prev) => [created, ...(prev ?? []).filter((q) => q.id !== created.id)]);
    // Refresh the list; a filter that would hide the new quote is cleared, which reloads it.
    if (filter && filter !== created.status) setFilter('');
    else void load();
  };

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Quote requests</h1>
          <p className="mt-1 text-sm text-charcoal-muted">
            Survey the site, build the estimate, get it approved, then send the client quotation.
          </p>
        </div>
        {showEstimate && (
          <div className="flex items-center gap-2">
            <button onClick={() => setCreating(true)} className="rounded-lg bg-navy px-3 py-1.5 text-sm font-semibold text-white">
              New quote
            </button>
            <Link href="/rates" className={btnGhost}>Quote rates →</Link>
          </div>
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
            rates={rates}
            assets={assets}
            expanded={expanded === q.id}
            initialPanel={started === q.id ? 'estimate' : 'survey'}
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
      {creating && <NewQuoteModal options={options} onClose={() => setCreating(false)} onCreated={openStarted} />}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function QuoteCard({
  quote: q, options, showEstimate, approver, rates, assets, expanded, initialPanel, onToggle, onRespond, onChange, onError,
}: {
  quote: AdminQuoteRequestDto;
  options: QuoteBuilderOptions | null;
  showEstimate: boolean;
  approver: boolean;
  rates: QuoteRatesDto | null;
  assets: QuoteBuilderAssetDto[] | null;
  expanded: boolean;
  initialPanel: 'survey' | 'estimate';
  onToggle: () => void;
  onRespond: () => void;
  onChange: (q: AdminQuoteRequestDto) => void;
  onError: (msg: string | null) => void;
}) {
  const [panel, setPanel] = useState<'survey' | 'estimate' | 'quotation'>(initialPanel);
  const hasQuotation = q.approvedPricePerVisitCents != null;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-aqua-deep">{q.serviceLineName}</span>
            <StatusBadge status={q.status} />
            {q.survey && (q.survey.areas.length > 0 || q.survey.items.length > 0) && (
              <span className="rounded-full bg-mist px-2 py-0.5 text-xs text-charcoal-muted">Surveyed</span>
            )}
          </div>
          <p className="font-serif mt-1 text-lg">{q.siteType}</p>
          <p className="mt-0.5 text-sm text-charcoal-muted">
            {[q.approxSqm ? `~${q.approxSqm.toLocaleString()} m²` : null, q.floors ? `${q.floors} floors` : null, FREQ_LABEL[q.frequency]]
              .filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 text-xs text-charcoal-muted">{q.customerName} · {q.customerPhone}</p>
          {q.notes && <p className="mt-2 text-sm italic text-charcoal-muted">“{q.notes}”</p>}
          {q.quotedAmountCents != null && q.status !== 'APPROVED' && (
            <p className="mt-2 text-sm text-success">
              Quoted {q.approvedPriceBasis === 'MONTH' ? approvedPrice(q) : `${money(q.quotedAmountCents)} per visit`}
            </p>
          )}
          {q.status === 'APPROVED' && q.approvedPricePerVisitCents != null && (
            <p className="mt-2 text-sm text-success">
              Approved at {approvedPrice(q)} — ready to send to the client.
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
          <button onClick={onRespond} className="rounded-lg bg-navy px-3 py-1.5 text-sm font-semibold text-white">
            Respond
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line bg-mist px-4 py-4">
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
            <EstimatePanel quote={q} approver={approver} rates={rates} assets={assets} onChange={onChange} onError={onError} />
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
    const bad =form.areas.find((a) => a.sizePreset === 'MEASURED' && !(a.measuredM2 && a.measuredM2 > 0));
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
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
          {form.areas.length === 0 && form.items.length === 0 && (
            <span className="text-xs text-warning">
              No areas or items — the estimate prices only set-up time until you add some or the crew is set by hand in the costing.
            </span>
          )}
          <button type="submit" disabled={saveState === 'saving'} className={btn}>
            {saveState === 'saving' ? 'Saving…' : q.survey ? 'Save survey & re-estimate' : 'Save survey & estimate'}
          </button>
        </div>
      )}
    </form>
  );
}

// ── Estimate (internal) ──────────────────────────────────────────────────────

/** The stored costing as the form edits it: money in cents, an untouched override null. */
function costingForm(c: QuoteCostingDto | null): QuoteCostingInput {
  return {
    crewSize: c?.crewSize ?? null,
    jobDays: c?.jobDays ?? null,
    supervisorDays: c?.supervisorDays ?? null,
    cleanerPayPerDayCents: c?.cleanerPayPerDayCents ?? null,
    supervisorPayPerDayCents: c?.supervisorPayPerDayCents ?? null,
    lunchPerPersonPerDayCents: c?.lunchPerPersonPerDayCents ?? null,
    transportPerDayCents: c?.transportPerDayCents ?? null,
    extraMaterials: c?.extraMaterials ?? [],
    ownedMachines: (c?.ownedMachines ?? []).map((m) => ({ assetId: m.assetId, daysUsed: m.daysUsed ?? null, wearPerDayCents: m.wearPerDayCents ?? null })),
    boughtMachines: c?.boughtMachines ?? [],
    hiredMachines: c?.hiredMachines ?? [],
    upfrontPurchases: c?.upfrontPurchases ?? [],
    contractMonths: c?.contractMonths ?? null,
    clientPriceCents: c?.clientPriceCents ?? null,
    clientPriceBasis: c?.clientPriceBasis ?? null,
    clientScope: c?.clientScope ?? '',
  };
}

/** The price an estimate quotes, the way the client agreed it. */
function quotedPrice(o: StoredQuoteEstimateOutput) {
  return o.pricing.clientPriceBasis === 'MONTH'
    ? `${money(o.pricing.monthlyValueCents)} per month`
    : `${money(o.pricing.pricePerVisitCents)} per visit`;
}

function EstimatePanel({ quote: q, approver, rates, assets, onChange, onError }: {
  quote: AdminQuoteRequestDto;
  approver: boolean;
  rates: QuoteRatesDto | null;
  assets: QuoteBuilderAssetDto[] | null;
  onChange: (q: AdminQuoteRequestDto) => void;
  onError: (msg: string | null) => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<QuoteCostingInput>(() => costingForm(q.costing));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const est = q.estimate;
  // An estimate computed before costing existed has no profit or costing lines.
  const o = est?.output;
  const editable = EDITABLE.includes(q.status);
  const stale = !!est && !!rates?.updatedAt && (!est.ratesUpdatedAt || new Date(rates.updatedAt) > new Date(est.ratesUpdatedAt));
  const dirty = JSON.stringify(form) !== JSON.stringify(costingForm(q.costing));

  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  const set = (next: Partial<QuoteCostingInput>) => setForm((f) => ({ ...f, ...next }));

  // An owned machine is costed from the register; a machine since retired or deleted keeps its last copy.
  const storedAssets = new Map((q.costing?.ownedMachines ?? []).map((m) => [m.assetId, m.asset]));
  const assetOf = (id: string) => {
    const a = assets?.find((x) => x.id === id);
    if (a) return { name: a.name, life: a.usefulLifeMonths, note: '' };
    const s = storedAssets.get(id);
    if (!s) return null;
    return { name: s.name, life: s.usefulLifeMonths, note: !assets ? '' : s.deleted ? ' (deleted)' : ' (retired)' };
  };

  // What an untouched override follows: the survey for crew and days, the rates card for day rates.
  const card = rates?.rates;
  const inherited = {
    crewSize: o?.hours.surveyCrewSize,
    jobDays: o?.hours.surveyJobDays,
    supervisorDays: q.survey?.supervisorOnSite ? form.jobDays ?? o?.hours.surveyJobDays : 0,
    cleanerPayPerDayCents: card?.cleanerPayPerDayCents,
    supervisorPayPerDayCents: card?.supervisorPayPerDayCents,
    lunchPerPersonPerDayCents: card?.lunchPerPersonPerDayCents,
    transportPerDayCents: card?.transportByZoneCents[q.survey?.distanceZone ?? 'ZONE1'],
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const priced = form.clientPriceCents != null;
    if (priced && form.clientPriceBasis === 'MONTH' && !form.contractMonths) {
      setFormError('A price per month needs the contract length in months.');
      return;
    }
    const noWear = form.ownedMachines.find((m) => assetOf(m.assetId)?.life == null && m.wearPerDayCents == null);
    if (noWear) {
      setFormError(`“${assetOf(noWear.assetId)?.name ?? 'That machine'}” has no useful life in the asset register — type its wear per job day.`);
      return;
    }
    if ([...form.extraMaterials, ...form.upfrontPurchases, ...form.boughtMachines, ...form.hiredMachines].some((r) => !r.name.trim())) {
      setFormError('Give every material, purchase and machine a name.');
      return;
    }
    setSaveState('saving');
    try {
      const res = await api.saveQuoteCosting(q.id, {
        ...form,
        clientPriceBasis: priced ? form.clientPriceBasis ?? 'VISIT' : null,
        clientScope: form.clientScope?.trim() || null,
      });
      onChange(res.quoteRequest);
      setForm(costingForm(res.quoteRequest.costing)); // as stored: names trimmed, empty basis settled
      setSaveState('saved');
    } catch (err) {
      setSaveState('failed');
      setFormError(messageFrom(err, 'Could not save the costing.'));
    }
  };

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

  const submit = async () => {
    if (!o || !(await confirm({ title: `Send this estimate for COO approval at ${quotedPrice(o)}?`, confirmLabel: 'Send for approval' }))) return;
    void run('submit', { status: 'AWAITING_APPROVAL' }, () => api.submitEstimate(q.id));
  };
  const withdraw = async () => {
    if (!(await confirm({
      title: 'Withdraw the estimate?',
      description: 'It goes back to draft and the survey and costing can be edited again.',
      confirmLabel: 'Withdraw',
    }))) return;
    void run('withdraw', { status: 'SITE_VISIT_SCHEDULED' }, () => api.withdrawEstimate(q.id));
  };
  const approve = () => {
    if (!o) return;
    const note = prompt(`Approve ${quotedPrice(o)}? Optional note for the record:`);
    if (note === null) return;
    void run('approve', { status: 'APPROVED' }, () => api.approveEstimate(q.id, note.trim() || undefined));
  };
  const reject = () => {
    const note = prompt('Reason for rejecting (required):');
    if (note === null) return;
    if (!note.trim()) { onError('A rejection needs a reason.'); return; }
    void run('reject', { status: 'SITE_VISIT_SCHEDULED' }, () => api.rejectEstimate(q.id, note.trim()));
  };
  const recompute = () => void run('recompute', null, () => api.recomputeEstimate(q.id));

  const grade = o?.pricing.marginCheck;
  const gradeTone = grade === 'OK' ? 'success' : grade === 'BELOW MINIMUM' ? 'danger' : 'warning';
  const profitTone = (cents: number | null | undefined) => (cents != null && cents < 0 ? 'danger' : undefined);
  const months = o?.profit?.contractMonths ?? null;

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      {/* The client's price */}
      <fieldset disabled={!editable} className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Labelled label="Client’s price (KSh, before VAT)">
          <KesInput value={form.clientPriceCents} onChange={(v) => set({ clientPriceCents: v })}
            placeholder={o ? `Recommended ${((o.pricing.recommendedPerVisitCents ?? o.pricing.pricePerVisitCents) / 100).toLocaleString('en-KE')} per visit` : 'Empty quotes the recommended price'} />
        </Labelled>
        <Labelled label="Per">
          <select className={input} value={form.clientPriceBasis ?? 'VISIT'} onChange={(e) => set({ clientPriceBasis: e.target.value as ClientPriceBasis })}>
            <option value="VISIT">visit</option>
            <option value="MONTH" disabled={!form.contractMonths}>month{form.contractMonths ? '' : ' — set a contract length first'}</option>
          </select>
        </Labelled>
        <Labelled label="Contract length (months)">
          <CountInput min={1} value={form.contractMonths} placeholder="One-off" onChange={(v) => set({ contractMonths: v })} />
        </Labelled>
        <p className="text-xs text-charcoal-muted sm:col-span-3">
          Leave the price empty to quote the recommended price. Leave the contract length empty for a one-off job.
          {o?.pricing.clientPriceBasis === 'MONTH' && ` ${money(o.pricing.monthlyValueCents)} a month is ${money(o.pricing.pricePerVisitCents)} per visit at ${o.pricing.visitsPerMonth} visits.`}
        </p>
      </fieldset>

      {/* Expected profit */}
      {!o ? (
        <div className="rounded-lg border border-line bg-white px-4 py-6 text-center text-sm text-charcoal-muted">
          No estimate yet. Save the costing below or a site survey, and it is computed from the current rates.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {o.profit ? (
            <>
              <Stat label="Expected profit / visit" value={money(o.profit.perVisitCents)} accent tone={profitTone(o.profit.perVisitCents)}
                hint={`at ${money(o.pricing.pricePerVisitCents)} per visit${o.pricing.clientPriceCents == null ? ' (recommended)' : ''}`} />
              <Stat label="Per month" value={o.profit.perMonthCents == null ? '—' : money(o.profit.perMonthCents)} tone={profitTone(o.profit.perMonthCents)}
                hint={o.profit.perMonthCents == null ? 'One-off: the visit is the whole job' : visitsText(o.pricing.visitsPerMonth)} />
              <Stat label="Per contract" value={o.profit.perContractCents == null ? '—' : money(o.profit.perContractCents)} tone={profitTone(o.profit.perContractCents)}
                hint={months ? `${months} month${months === 1 ? '' : 's'} · before tax and overheads` : 'Before tax and overheads'} />
            </>
          ) : (
            <div className="rounded-xl border border-line bg-white p-4 text-sm text-charcoal-muted sm:col-span-2 lg:col-span-3">
              Computed before costing existed — recalculate to see expected profit.
            </div>
          )}
          <Stat label="Margin" value={pct(o.pricing.marginPct)} tone={gradeTone}
            hint={`${grade} · min ${money(o.pricing.minimumPriceCents)} · target ${money(o.pricing.targetPriceCents)}`} />
          <Stat label="Recommended price / visit" value={money(o.pricing.recommendedPerVisitCents ?? o.pricing.pricePerVisitCents)}
            hint={o.pricing.discountPct > 0 ? `${o.pricing.frequencyLabel} · ${pct(o.pricing.discountPct)} off ${money(o.pricing.recommendedPriceCents)}` : o.pricing.frequencyLabel} />
        </div>
      )}

      {est && o && (o.warnings.length > 0 || stale || est.status === 'REJECTED') && (
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
      {est && (
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
                <button type="button" className={btnGhost} disabled={!!busy} onClick={recompute}>
                  {busy === 'recompute' ? 'Recalculating…' : 'Recalculate with current rates'}
                </button>
                <button
                  type="button"
                  className={btn}
                  disabled={!!busy || dirty || est.status === 'REJECTED'}
                  onClick={submit}
                  title={dirty ? 'Save the costing first' : est.status === 'REJECTED' ? 'Recalculate or save the costing for a fresh estimate first' : undefined}
                >
                  {busy === 'submit' ? 'Sending…' : 'Send for COO approval'}
                </button>
              </>
            )}
            {(q.status === 'AWAITING_APPROVAL' || q.status === 'APPROVED') && (
              <button type="button" className={btnGhost} disabled={!!busy} onClick={withdraw}>
                {busy === 'withdraw' ? 'Withdrawing…' : q.status === 'APPROVED' ? 'Withdraw approval' : 'Withdraw'}
              </button>
            )}
            {q.status === 'AWAITING_APPROVAL' && approver && (
              <>
                <button type="button" className="rounded-lg bg-success px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50" disabled={!!busy} onClick={approve}>
                  {busy === 'approve' ? 'Approving…' : 'Approve'}
                </button>
                <button type="button" className="rounded-lg border border-danger/40 px-4 py-2 text-sm text-danger hover:bg-danger/5 disabled:opacity-50" disabled={!!busy} onClick={reject}>
                  {busy === 'reject' ? 'Rejecting…' : 'Reject'}
                </button>
              </>
            )}
            {q.status === 'AWAITING_APPROVAL' && !approver && (
              <span className="text-xs text-charcoal-muted">Waiting for the COO or owner.</span>
            )}
          </div>
        </div>
      )}

      {/* Cost questionnaire */}
      {formError && (
        <div className="flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{formError}</span>
          <button type="button" onClick={() => setFormError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      <fieldset disabled={!editable} className="space-y-4">
        <Panel title="Crew and day rates">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Override label="Cleaners per job day" min={1} value={form.crewSize} inherited={inherited.crewSize} onChange={(v) => set({ crewSize: v })} />
            <Override label="Job days per visit" min={1} value={form.jobDays} inherited={inherited.jobDays} onChange={(v) => set({ jobDays: v })} />
            <Override label="Supervisor days per visit" min={0} value={form.supervisorDays} inherited={inherited.supervisorDays} onChange={(v) => set({ supervisorDays: v })} />
            <Override label="Transport per job day (KSh)" kes value={form.transportPerDayCents} inherited={inherited.transportPerDayCents} onChange={(v) => set({ transportPerDayCents: v })} />
            <Override label="Cleaner pay per day (KSh)" kes value={form.cleanerPayPerDayCents} inherited={inherited.cleanerPayPerDayCents} onChange={(v) => set({ cleanerPayPerDayCents: v })} />
            <Override label="Supervisor pay per day (KSh)" kes value={form.supervisorPayPerDayCents} inherited={inherited.supervisorPayPerDayCents} onChange={(v) => set({ supervisorPayPerDayCents: v })} />
            <Override label="Lunch per person per day (KSh)" kes value={form.lunchPerPersonPerDayCents} inherited={inherited.lunchPerPersonPerDayCents} onChange={(v) => set({ lunchPerPersonPerDayCents: v })} />
          </div>
          <p className="mt-2 text-xs text-charcoal-muted">Empty boxes follow the site survey and the rates card; the grey figure is what they give today.</p>
        </Panel>

        <Panel title="Machines">
          <RowList
            heading="Owned (wear from the asset register)"
            addLabel="+ Owned machine"
            empty={assets?.length === 0 ? 'No machines in the asset register.' : 'None.'}
            canAdd={!!assets?.length}
            onAdd={() => set({ ownedMachines: [...form.ownedMachines, { assetId: assets![0]!.id, daysUsed: null, wearPerDayCents: null }] })}
            columns="sm:grid-cols-[3fr_1fr_1fr_auto]"
            legend="Machine · job days it works per visit · wear per job day, when the register has no useful life"
            rows={form.ownedMachines.map((m, i) => {
              const a = assetOf(m.assetId);
              const setRow = (next: Partial<CostingOwnedMachineInput>) =>
                set({ ownedMachines: form.ownedMachines.map((r, j) => (j === i ? { ...r, ...next } : r)) });
              return {
                cells: (
                  <>
                    <select className={input} value={m.assetId} onChange={(e) => setRow({ assetId: e.target.value, wearPerDayCents: null })}>
                      {a && !assets?.some((x) => x.id === m.assetId) && <option value={m.assetId}>{a.name}{a.note}</option>}
                      {(assets ?? []).map((x) => (
                        <option key={x.id} value={x.id}>{x.name} · {x.category}{x.usefulLifeMonths == null ? ' · no useful life' : ''}</option>
                      ))}
                    </select>
                    <CountInput min={1} value={m.daysUsed} placeholder="Every job day" onChange={(v) => setRow({ daysUsed: v })} />
                    {a?.life == null || m.wearPerDayCents != null
                      ? <KesInput value={m.wearPerDayCents} placeholder="Wear per job day" onChange={(v) => setRow({ wearPerDayCents: v })} />
                      : <span className="self-center text-xs text-charcoal-muted">From the register</span>}
                  </>
                ),
                error: a?.life == null && m.wearPerDayCents == null ? 'The register has no useful life for this machine — type its wear per job day.' : null,
                onRemove: () => set({ ownedMachines: form.ownedMachines.filter((_, j) => j !== i) }),
              };
            })}
          />
          <RowList
            heading="Bought for this job (spread over its life)"
            addLabel="+ Bought machine"
            onAdd={() => set({ boughtMachines: [...form.boughtMachines, { name: '', priceCents: 0, lifeMonths: 12, daysUsed: null }] })}
            columns="sm:grid-cols-[3fr_1fr_1fr_1fr_auto]"
            legend="Machine · price (KSh) · useful life (months) · job days it works per visit"
            rows={form.boughtMachines.map((m, i) => {
              const setRow = (next: Partial<CostingBoughtMachine>) =>
                set({ boughtMachines: form.boughtMachines.map((r, j) => (j === i ? { ...r, ...next } : r)) });
              return {
                cells: (
                  <>
                    <input className={input} value={m.name} placeholder="e.g. Scrubber-dryer" onChange={(e) => setRow({ name: e.target.value })} />
                    <KesInput value={m.priceCents} onChange={(v) => setRow({ priceCents: v ?? 0 })} />
                    <CountInput min={1} value={m.lifeMonths} onChange={(v) => setRow({ lifeMonths: v ?? 1 })} />
                    <CountInput min={1} value={m.daysUsed} placeholder="Every job day" onChange={(v) => setRow({ daysUsed: v })} />
                  </>
                ),
                onRemove: () => set({ boughtMachines: form.boughtMachines.filter((_, j) => j !== i) }),
              };
            })}
          />
          <RowList
            heading="Hired"
            addLabel="+ Hired machine"
            onAdd={() => set({ hiredMachines: [...form.hiredMachines, { name: '', hirePerVisitCents: 0 }] })}
            columns="sm:grid-cols-[3fr_1fr_auto]"
            legend="Machine · hire per visit (KSh)"
            rows={form.hiredMachines.map((m, i) => {
              const setRow = (next: Partial<CostingHiredMachine>) =>
                set({ hiredMachines: form.hiredMachines.map((r, j) => (j === i ? { ...r, ...next } : r)) });
              return {
                cells: (
                  <>
                    <input className={input} value={m.name} placeholder="e.g. Carpet extractor" onChange={(e) => setRow({ name: e.target.value })} />
                    <KesInput value={m.hirePerVisitCents} onChange={(v) => setRow({ hirePerVisitCents: v ?? 0 })} />
                  </>
                ),
                onRemove: () => set({ hiredMachines: form.hiredMachines.filter((_, j) => j !== i) }),
              };
            })}
          />
        </Panel>

        <Panel title="Materials and purchases">
          <AmountList
            heading="Extra materials per visit"
            addLabel="+ Material"
            legend="Material · KSh per visit"
            placeholder="e.g. Floor polish"
            rows={form.extraMaterials}
            onChange={(extraMaterials) => set({ extraMaterials })}
          />
          <AmountList
            heading="Bought upfront (spread over the contract; in full on a one-off)"
            addLabel="+ Purchase"
            legend="Item · total KSh"
            placeholder="e.g. Uniforms"
            rows={form.upfrontPurchases}
            onChange={(upfrontPurchases) => set({ upfrontPurchases })}
          />
        </Panel>

        <Panel title="Scope for the client">
          <textarea className={input} rows={3} value={form.clientScope ?? ''}
            placeholder="What the crew will clean, in the client’s words. Printed on the quotation when no rooms or items were surveyed."
            onChange={(e) => set({ clientScope: e.target.value })} />
        </Panel>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-xs text-charcoal-muted">
          {editable
            ? 'Saving the costing recomputes the estimate from the current rates.'
            : `The quote is ${STATUS_LABEL[q.status].toLowerCase()} — the costing is locked. Withdraw the estimate to edit it.`}
          {q.costing && ` Last saved by ${q.costing.updatedByName ?? 'unknown'} · ${when(q.costing.updatedAt)}.`}
        </span>
        {editable && (
          <div className="flex items-center gap-3">
            <span className={
              saveState === 'failed' ? 'text-xs font-medium text-danger'
              : saveState === 'saved' ? 'text-xs font-medium text-success'
              : 'text-xs text-charcoal-muted'
            }>
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'failed' ? '⚠ Not saved — try again' : dirty ? 'Unsaved changes' : ''}
            </span>
            <button type="submit" disabled={saveState === 'saving'} className={btn}>
              {saveState === 'saving' ? 'Saving…' : est ? 'Save costing & re-estimate' : 'Save costing & estimate'}
            </button>
          </div>
        )}
      </div>

      {/* Working */}
      {o && (
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
              {o.costs.lunchCents != null && <Row k="Lunch" v={money(o.costs.lunchCents)} />}
              <Row k="Consumables" v={money(o.costs.consumablesCents)} />
              {o.costs.extraMaterialsCents != null && <Row k="Extra materials" v={money(o.costs.extraMaterialsCents)} />}
              <Row k="Transport" v={money(o.costs.transportCents)} />
              <Row k="Equipment allowance" v={money(o.costs.equipmentWearCents)} />
              {o.costs.machineWearCents != null && <Row k="Machine wear (owned and bought)" v={money(o.costs.machineWearCents)} />}
              {o.costs.machineHireCents != null && <Row k="Machine hire" v={money(o.costs.machineHireCents)} />}
              {o.costs.upfrontCents != null && (
                <Row k={months ? 'Upfront purchases (spread)' : 'Upfront purchases'} v={money(o.costs.upfrontCents)} />
              )}
              <Row k="Direct cost" v={money(o.costs.directCostCents)} strong />
              <Row k="Contingency" v={money(o.costs.contingencyCents)} />
              <Row k="Cost base" v={money(o.costs.costBaseCents)} strong />
            </dl>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
              <Row k="Minimum price" v={money(o.pricing.minimumPriceCents)} />
              <Row k="Target price" v={money(o.pricing.targetPriceCents)} />
              <Row k="Recommended (before discount)" v={money(o.pricing.recommendedPriceCents)} />
              <Row k={`Quoted per visit (${o.pricing.frequencyLabel})`} v={money(o.pricing.pricePerVisitCents)} strong />
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
      )}
    </form>
  );
}

/** A figure that follows the survey or rates card until typed over; Reset hands it back. */
function Override({ label, value, inherited, kes, min = 0, onChange }: {
  label: string;
  value: number | null | undefined;
  /** What the survey or rates card gives: the placeholder, and shown beside a typed figure. */
  inherited: number | null | undefined;
  kes?: boolean;
  min?: number;
  onChange: (v: number | null) => void;
}) {
  const shown = inherited == null ? undefined : kes ? (inherited / 100).toLocaleString('en-KE') : String(inherited);
  return (
    <div>
      <Labelled label={label}>
        {kes
          ? <KesInput value={value} placeholder={shown} onChange={onChange} />
          : <CountInput min={min} value={value} placeholder={shown} onChange={onChange} />}
      </Labelled>
      {value != null && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-charcoal-muted">
          <span>Set by hand{shown != null ? ` · survey/rates give ${shown}` : ''}</span>
          <button type="button" className="underline hover:text-charcoal" onClick={() => onChange(null)}>Reset</button>
        </p>
      )}
    </div>
  );
}

/** KSh in the box, cents in the form; an empty box is null. */
function KesInput({ value, placeholder, onChange }: {
  value: number | null | undefined;
  placeholder?: string;
  onChange: (cents: number | null) => void;
}) {
  return (
    <input type="number" min={0} step={1} className={input} placeholder={placeholder}
      value={value == null ? '' : value / 100}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.round(parseFloat(e.target.value) * 100)) || 0)} />
  );
}

/** A whole number of people, days or months; an empty box is null. */
function CountInput({ value, min, placeholder, onChange }: {
  value: number | null | undefined;
  min: number;
  placeholder?: string;
  onChange: (n: number | null) => void;
}) {
  return (
    <input type="number" min={min} step={1} className={input} placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(min, Math.round(parseFloat(e.target.value)) || min))} />
  );
}

/** A heading, its rows with a Remove each, and an add button — the shape every costing list shares. */
function RowList({ heading, addLabel, onAdd, canAdd = true, empty = 'None.', columns, legend, rows }: {
  heading: string;
  addLabel: string;
  onAdd: () => void;
  canAdd?: boolean;
  empty?: string;
  columns: string;
  legend: string;
  rows: { cells: React.ReactNode; error?: string | null; onRemove: () => void }[];
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-charcoal-muted">{heading} ({rows.length})</p>
        <button type="button" className={btnGhost} disabled={!canAdd} onClick={onAdd}>{addLabel}</button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-charcoal-muted">{empty}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className={`rounded-lg border bg-white p-2 ${r.error ? 'border-danger/50' : 'border-line'}`}>
              <div className={`grid gap-2 ${columns}`}>
                {r.cells}
                <button type="button" className="text-xs text-danger hover:underline" onClick={r.onRemove}>Remove</button>
              </div>
              {r.error && <p className="mt-1 text-xs text-danger">{r.error}</p>}
            </div>
          ))}
          <p className="text-xs text-charcoal-muted">Columns: {legend}.</p>
        </div>
      )}
    </div>
  );
}

function AmountList({ heading, addLabel, legend, placeholder, rows, onChange }: {
  heading: string;
  addLabel: string;
  legend: string;
  placeholder: string;
  rows: CostingAmount[];
  onChange: (rows: CostingAmount[]) => void;
}) {
  return (
    <RowList
      heading={heading}
      addLabel={addLabel}
      onAdd={() => onChange([...rows, { name: '', amountCents: 0 }])}
      columns="sm:grid-cols-[3fr_1fr_auto]"
      legend={legend}
      rows={rows.map((r, i) => {
        const setRow = (next: Partial<CostingAmount>) => onChange(rows.map((x, j) => (j === i ? { ...x, ...next } : x)));
        return {
          cells: (
            <>
              <input className={input} value={r.name} placeholder={placeholder} onChange={(e) => setRow({ name: e.target.value })} />
              <KesInput value={r.amountCents} onChange={(v) => setRow({ amountCents: v ?? 0 })} />
            </>
          ),
          onRemove: () => onChange(rows.filter((_, j) => j !== i)),
        };
      })}
    />
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
        <h3 className="font-serif mt-2 text-2xl">{doc.siteType}</h3>
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
          {doc.priceBasis === 'MONTH' ? (
            <>
              <Stat label="Price per month" value={money(doc.monthlyValueCents)} hint={visitsText(doc.visitsPerMonth)} accent />
              <Stat label="Per visit" value={money(doc.pricePerVisitCents)} />
            </>
          ) : (
            <>
              <Stat label="Price per visit" value={money(doc.pricePerVisitCents)} accent />
              <Stat label="Monthly value" value={money(doc.monthlyValueCents)} hint={visitsText(doc.visitsPerMonth)} />
            </>
          )}
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
  const perVisit = `<p class="v">${money(doc.pricePerVisitCents)}</p>`;
  const perMonth = `<p class="v">${money(doc.monthlyValueCents)}</p><p class="muted">${visitsText(doc.visitsPerMonth)}</p>`;
  const price = doc.priceBasis === 'MONTH'
    ? `<div><p class="k">Price per month</p>${perMonth}</div>\n  <div><p class="k">Per visit</p>${perVisit}</div>`
    : `<div><p class="k">Price per visit</p>${perVisit}</div>\n  <div><p class="k">Monthly value</p>${perMonth}</div>`;
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
  ${price}
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
  const confirm = useConfirm();
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
    if (status === 'QUOTED' && !(await confirm({ title: `Send the client a quotation of ${approvedPrice(quote)}?`, confirmLabel: 'Send quotation' }))) return;
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
        <h2 className="font-serif text-2xl">Respond to quote</h2>
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
            <p className="text-xs uppercase tracking-widest text-charcoal-muted">Approved price</p>
            <p className="font-serif mt-1 text-2xl">
              {canQuote ? approvedPrice(quote) : '—'}
            </p>
            <p className="mt-1 text-xs text-charcoal-muted">
              {canQuote
                ? `Approved by ${quote.approvedByName ?? 'unknown'}${quote.approvedAt ? ` · ${when(quote.approvedAt)}` : ''}. The client is notified with this figure.`
                : 'The price comes from the approved estimate.'}
            </p>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2.5 text-text">Cancel</button>
          <button onClick={() => void submit()} disabled={busy} className="flex-1 rounded-lg bg-navy py-2.5 font-semibold text-white disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New quote ────────────────────────────────────────────────────────────────

/** The service lines the quote builder takes a quote for. */
const QUOTABLE_LINES: ServiceLineCode[] = ['residential', 'office', 'hospital', 'post_build', 'fumigation'];

function NewQuoteModal({ options, onClose, onCreated }: {
  options: QuoteBuilderOptions | null;
  onClose: () => void;
  onCreated: (created: AdminQuoteRequestDto) => void;
}) {
  const [lines, setLines] = useState<{ code: string; name: string }[] | null>(null);
  const [form, setForm] = useState<CreateBuilderQuoteInput>({
    customerName: '',
    customerPhone: '',
    serviceLineCode: 'office',
    siteType: '',
    frequency: 'WEEKLY',
    frequencyLabel: FREQ_TO_RATES_LABEL.WEEKLY ?? '',
    scopeNotes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.serviceLines()
      .then((r) => setLines(r.serviceLines.filter((l) => (QUOTABLE_LINES as string[]).includes(l.code))))
      .catch((err) => setError(messageFrom(err, 'Could not load the service lines.')));
  }, []);

  // Until the lists arrive, or if the default is not on them, the first entry stands in.
  const labels = options?.frequencies.map((f) => f.label) ?? [];
  const frequencyLabel = labels.includes(form.frequencyLabel) ? form.frequencyLabel : labels[0] ?? form.frequencyLabel;
  const serviceLineCode = lines?.some((l) => l.code === form.serviceLineCode) ? form.serviceLineCode : lines?.[0]?.code as ServiceLineCode | undefined;

  const set = (next: Partial<CreateBuilderQuoteInput>) => setForm((f) => ({ ...f, ...next }));
  // "How often" moves the visits to its row on the rates card; the visits can still be picked by hand.
  const setFrequency = (frequency: QuoteFrequency) => {
    const wanted = FREQ_TO_RATES_LABEL[frequency];
    set({ frequency, ...(wanted && labels.includes(wanted) ? { frequencyLabel: wanted } : {}) });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.customerName.trim() || !form.customerPhone.trim() || !form.siteType.trim() || !serviceLineCode) {
      setError('Enter the client’s name, phone, service line and site.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.createBuilderQuote({ ...form, serviceLineCode, frequencyLabel, scopeNotes: form.scopeNotes?.trim() || null });
      onCreated(res.quoteRequest);
    } catch (err) {
      setError(messageFrom(err, 'Could not start the quote.'));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 px-4" onClick={onClose}>
      <form onSubmit={(e) => void submit(e)} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-cream p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-2xl">New quote</h2>
        <p className="mt-1 text-sm text-charcoal-muted">For a client who called, was referred or sent a tender. It opens with a site visit scheduled.</p>

        {error && <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Labelled label="Client’s name">
            <input className={input} value={form.customerName} onChange={(e) => set({ customerName: e.target.value })} />
          </Labelled>
          <Labelled label="Phone">
            <input className={input} type="tel" value={form.customerPhone} placeholder="0712 345 678" onChange={(e) => set({ customerPhone: e.target.value })} />
          </Labelled>
          <Labelled label="Service line">
            <select className={input} value={serviceLineCode ?? ''} disabled={!lines} onChange={(e) => set({ serviceLineCode: e.target.value as ServiceLineCode })}>
              {!lines && <option value="">Loading…</option>}
              {(lines ?? []).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </Labelled>
          <Labelled label="Site or organisation">
            <input className={input} value={form.siteType} placeholder="e.g. Equity Bank, Ngong Road branch" onChange={(e) => set({ siteType: e.target.value })} />
          </Labelled>
          <Labelled label="How often">
            <select className={input} value={form.frequency} onChange={(e) => setFrequency(e.target.value as QuoteFrequency)}>
              {Object.entries(FREQ_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Labelled>
          <Labelled label="Visits per month">
            <select className={input} value={frequencyLabel} onChange={(e) => set({ frequencyLabel: e.target.value })}>
              {(labels.length ? labels : [frequencyLabel]).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Labelled>
          <div className="sm:col-span-2">
            <Labelled label="Scope / notes (client sees this)">
              <textarea className={input} rows={3} value={form.scopeNotes ?? ''} placeholder="What the crew will clean"
                onChange={(e) => set({ scopeNotes: e.target.value })} />
            </Labelled>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-line py-2.5 text-charcoal">Cancel</button>
          <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-navy py-2.5 font-semibold text-white disabled:opacity-50">
            {busy ? 'Starting…' : 'Start quote'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: QuoteStatus }) {
  const map: Record<QuoteStatus, string> = {
    PENDING: 'bg-warning/15 text-warning',
    SITE_VISIT_SCHEDULED: 'bg-service-office/20 text-service-office',
    AWAITING_APPROVAL: 'bg-warning/15 text-warning',
    APPROVED: 'bg-success/15 text-success',
    QUOTED: 'bg-success/15 text-success',
    WON: 'bg-success/15 text-success',
    LOST: 'bg-mist text-charcoal-muted',
    CANCELLED: 'bg-mist text-charcoal-muted',
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

function Stat({ label, value, hint, accent, tone }: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const toneText = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' };
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-aqua/40 bg-aqua-soft' : 'border-line bg-white'}`}>
      <p className="text-xs uppercase tracking-widest text-charcoal-muted">{label}</p>
      <p className={`font-serif mt-1 text-xl ${tone ? toneText[tone] : ''}`}>{value}</p>
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
    const error = (err.payload as { error?: unknown } | null)?.error;
    if (typeof error === 'string') return `${error} (${err.status})`;
    // A validation failure comes back flattened: { formErrors: [...], fieldErrors: { field: [...] } }.
    if (error && typeof error === 'object') {
      const { formErrors, fieldErrors } = error as { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> };
      const first = formErrors?.[0] ?? Object.values(fieldErrors ?? {}).flat()[0];
      if (first) return `${first} (${err.status})`;
    }
    return `${fallback} (${err.status})`;
  }
  return fallback;
}
