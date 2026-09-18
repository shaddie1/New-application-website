'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AreaRate, CleanLevel, ItemRate, QuoteRates } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { canViewEstimate } from '../../../src/lib/roles';

const CLEAN_LEVEL_LABELS: Record<CleanLevel, string> = {
  ROUTINE: 'Routine',
  DEEP: 'Deep',
  VACUUM_ONLY: 'Vacuum only',
};
const CLEAN_LEVELS = Object.keys(CLEAN_LEVEL_LABELS) as CleanLevel[];

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream-deep';

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * The rates card behind every estimate. One record, edited as a whole and
 * saved with one button — an estimate must never be computed against a
 * half-edited card. Money is shown in KSh and stored in cents; percentages
 * are shown as % and stored as fractions.
 */
export default function RatesPage() {
  const session = useRequireAdmin();
  const [draft, setDraft] = useState<QuoteRates | null>(null);
  const [saved, setSaved] = useState<QuoteRates | null>(null);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedByName: string | null }>({ updatedAt: null, updatedByName: null });
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.quoteRates();
      setDraft(res.rates);
      setSaved(res.rates);
      setMeta({ updatedAt: res.updatedAt, updatedByName: res.updatedByName });
      setForbidden(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(err instanceof ApiError ? `Could not load rates (${err.status}).` : 'Could not load rates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    if (!draft) return;
    setSaveState('saving');
    setError(null);
    try {
      const res = await api.saveQuoteRates(draft);
      setDraft(res.rates);
      setSaved(res.rates);
      setMeta({ updatedAt: res.updatedAt, updatedByName: res.updatedByName });
      setSaveState('saved');
    } catch (err) {
      setSaveState('failed');
      setError(messageFrom(err, 'Could not save the rates.'));
    }
  };

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;

  if (forbidden || !canViewEstimate(session)) {
    return (
      <div className="rounded-xl border border-line bg-white p-8 text-center">
        <h1 className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>Owner and finance only</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-charcoal-muted">
          The rates card sets pay, margins and market prices. It is visible to the owner, admins, the financial
          manager and the COO.
        </p>
      </div>
    );
  }

  const set = <K extends keyof QuoteRates>(key: K, value: QuoteRates[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Quote rates</h1>
          <p className="mt-1 text-sm text-charcoal-muted">
            Pay, time policy, transport, market prices and production rates — everything an estimate is built from.
            {meta.updatedAt
              ? ` Last saved by ${meta.updatedByName ?? 'unknown'} on ${new Date(meta.updatedAt).toLocaleDateString('en-KE')}.`
              : ' Showing the workbook defaults; nothing has been saved yet.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              saveState === 'failed' ? 'text-xs font-medium text-danger'
              : saveState === 'saving' ? 'text-xs text-charcoal-muted'
              : saveState === 'saved' ? 'text-xs font-medium text-success'
              : dirty ? 'text-xs text-warning' : 'text-xs text-charcoal-muted'
            }
          >
            {saveState === 'saving' ? 'Saving…'
              : saveState === 'saved' ? '✓ Saved'
              : saveState === 'failed' ? '⚠ Not saved — try again'
              : dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <button className={btnGhost} disabled={!dirty} onClick={() => setDraft(saved)}>Discard</button>
          <button className={btn} disabled={!dirty || saveState === 'saving'} onClick={() => void save()}>
            Save rates
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      {loading || !draft ? (
        <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">Loading…</div>
      ) : (
        <div className="space-y-6">
          <Section title="A. Pay, time and pricing policy">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Money label="Cleaner pay per day" value={draft.cleanerPayPerDayCents} onChange={(v) => set('cleanerPayPerDayCents', v)} />
              <Money label="Supervisor pay per day" value={draft.supervisorPayPerDayCents} onChange={(v) => set('supervisorPayPerDayCents', v)} />
              <Money label="Legal minimum wage per day" hint="Compliant-pay check only" value={draft.legalMinWagePerDayCents} onChange={(v) => set('legalMinWagePerDayCents', v)} />
              <Num label="Productive hours per person per day" value={draft.productiveHoursPerPersonPerDay} step={0.5} onChange={(v) => set('productiveHoursPerPersonPerDay', v)} />
              <Num label="Largest crew per job day" value={draft.largestCrewPerJobDay} step={1} onChange={(v) => set('largestCrewPerJobDay', Math.round(v))} />
              <Num label="Set-up and close-out hours" value={draft.setupCloseOutHours} step={0.25} onChange={(v) => set('setupCloseOutHours', v)} />
              <Pct label="Movement allowance" value={draft.movementAllowancePct} onChange={(v) => set('movementAllowancePct', v)} />
              <Pct label="Equipment wear" value={draft.equipmentWearPct} onChange={(v) => set('equipmentWearPct', v)} />
              <Pct label="Contingency" value={draft.contingencyPct} onChange={(v) => set('contingencyPct', v)} />
              <Pct label="Target margin" value={draft.targetMarginPct} onChange={(v) => set('targetMarginPct', v)} />
              <Pct label="Minimum margin" hint="Quotes below this are blocked" value={draft.minimumMarginPct} onChange={(v) => set('minimumMarginPct', v)} />
              <Pct label="Commission (trainee-sourced)" hint="On net profit per visit" value={draft.commissionPct} onChange={(v) => set('commissionPct', v)} />
              <Num label="Round prices to (KSh)" value={draft.roundToKes} step={50} onChange={(v) => set('roundToKes', Math.max(1, Math.round(v)))} />
              <Text label="Quotation contact phone" value={draft.quoteContactPhone} onChange={(v) => set('quoteContactPhone', v)} />
              <Text label="Quotation contact email" value={draft.quoteContactEmail} onChange={(v) => set('quoteContactEmail', v)} />
            </div>
          </Section>

          <Section title="B. Transport per job day by distance zone">
            <div className="grid gap-3 sm:grid-cols-3">
              <Money label="Zone 1 — up to 10 km" value={draft.transportByZoneCents.ZONE1} onChange={(v) => set('transportByZoneCents', { ...draft.transportByZoneCents, ZONE1: v })} />
              <Money label="Zone 2 — 10 to 25 km" value={draft.transportByZoneCents.ZONE2} onChange={(v) => set('transportByZoneCents', { ...draft.transportByZoneCents, ZONE2: v })} />
              <Money label="Zone 3 — over 25 km" value={draft.transportByZoneCents.ZONE3} onChange={(v) => set('transportByZoneCents', { ...draft.transportByZoneCents, ZONE3: v })} />
            </div>
          </Section>

          <Section title="C. Soil level → hours multiplier">
            <div className="grid gap-3 sm:grid-cols-3">
              <Num label="Light" hint="Daily/weekly clean, little traffic" value={draft.soilMultiplier.LIGHT} step={0.05} onChange={(v) => set('soilMultiplier', { ...draft.soilMultiplier, LIGHT: v })} />
              <Num label="Normal" hint="Weekly/fortnightly, normal traffic" value={draft.soilMultiplier.NORMAL} step={0.05} onChange={(v) => set('soilMultiplier', { ...draft.soilMultiplier, NORMAL: v })} />
              <Num label="Heavy" hint="Monthly or less, heavy traffic, first clean" value={draft.soilMultiplier.HEAVY} step={0.05} onChange={(v) => set('soilMultiplier', { ...draft.soilMultiplier, HEAVY: v })} />
            </div>
          </Section>

          <Section title="D. Service frequency → visits per month and discount">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-charcoal-muted">
                  <th className="py-2 pr-3 font-normal">Label</th>
                  <th className="py-2 pr-3 font-normal">Visits / month</th>
                  <th className="py-2 pr-3 font-normal">Discount %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.frequencyTable.map((f, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-2 pr-3"><input className={input} value={f.label} onChange={(e) => set('frequencyTable', replaceAt(draft.frequencyTable, i, { ...f, label: e.target.value }))} /></td>
                    <td className="py-2 pr-3"><input type="number" min={1} step={1} className={input} value={f.visitsPerMonth} onChange={(e) => set('frequencyTable', replaceAt(draft.frequencyTable, i, { ...f, visitsPerMonth: Math.max(1, Math.round(num(e.target.value))) }))} /></td>
                    <td className="py-2 pr-3"><input type="number" min={0} max={100} step={1} className={input} value={toPct(f.discountPct)} onChange={(e) => set('frequencyTable', replaceAt(draft.frequencyTable, i, { ...f, discountPct: fromPct(e.target.value) }))} /></td>
                    <td className="py-2 text-right"><button className="text-xs text-danger hover:underline" onClick={() => set('frequencyTable', draft.frequencyTable.filter((_, j) => j !== i))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className={`${btnGhost} mt-3`} onClick={() => set('frequencyTable', [...draft.frequencyTable, { label: '', visitsPerMonth: 1, discountPct: 0 }])}>+ Add frequency</button>
          </Section>

          <Section title="E. Room size presets (m²)">
            <div className="grid gap-3 sm:grid-cols-4">
              {(['SMALL', 'MEDIUM', 'LARGE', 'VERY_LARGE'] as const).map((k) => (
                <Num key={k} label={k === 'VERY_LARGE' ? 'Very large' : k.charAt(0) + k.slice(1).toLowerCase()} value={draft.roomSizePresetsM2[k]} step={5}
                  onChange={(v) => set('roomSizePresetsM2', { ...draft.roomSizePresetsM2, [k]: v })} />
              ))}
            </div>
            <p className="mt-2 text-xs text-charcoal-muted">“Measured” uses the m² entered on the survey.</p>
          </Section>

          <Section title="F. Area production rates, consumables and market prices">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-charcoal-muted">
                    <th className="py-2 pr-3 font-normal">Area type</th>
                    <th className="py-2 pr-3 font-normal">Clean level</th>
                    <th className="py-2 pr-3 font-normal">m² / person-hour</th>
                    <th className="py-2 pr-3 font-normal">Consumables KSh/m²</th>
                    <th className="py-2 pr-3 font-normal">Market low KSh/m²</th>
                    <th className="py-2 pr-3 font-normal">Market high KSh/m²</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {draft.areaRates.map((r, i) => (
                    <AreaRow key={i} rate={r}
                      onChange={(next) => set('areaRates', replaceAt(draft.areaRates, i, next))}
                      onRemove={() => set('areaRates', draft.areaRates.filter((_, j) => j !== i))} />
                  ))}
                </tbody>
              </table>
            </div>
            <button className={`${btnGhost} mt-3`} onClick={() => set('areaRates', [...draft.areaRates, { areaType: '', cleanLevel: 'ROUTINE', m2PerPersonHour: 100, consumablesPerM2Cents: 0, marketLowPerM2Cents: 0, marketHighPerM2Cents: 0 }])}>+ Add area rate</button>
          </Section>

          <Section title="G. Items counted on site">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-charcoal-muted">
                    <th className="py-2 pr-3 font-normal">Item type</th>
                    <th className="py-2 pr-3 font-normal">Minutes / unit</th>
                    <th className="py-2 pr-3 font-normal">Consumables KSh/unit</th>
                    <th className="py-2 pr-3 font-normal">Market low KSh/unit</th>
                    <th className="py-2 pr-3 font-normal">Market high KSh/unit</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {draft.itemRates.map((r, i) => (
                    <ItemRow key={i} rate={r}
                      onChange={(next) => set('itemRates', replaceAt(draft.itemRates, i, next))}
                      onRemove={() => set('itemRates', draft.itemRates.filter((_, j) => j !== i))} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-charcoal-muted">A market price of 0 means the item is included in the area price.</p>
            <button className={`${btnGhost} mt-3`} onClick={() => set('itemRates', [...draft.itemRates, { itemType: '', minutesPerUnit: 5, consumablesPerUnitCents: 0, marketLowPerUnitCents: 0, marketHighPerUnitCents: 0 }])}>+ Add item rate</button>
          </Section>

          <Section title="H. Work descriptions printed on the client quotation">
            <div className="grid gap-3 sm:grid-cols-2">
              {(['ROUTINE', 'DEEP', 'VACUUM_ONLY', 'ITEM'] as const).map((k) => (
                <div key={k}>
                  <label className="mb-1 block text-xs text-charcoal-muted">{k === 'ITEM' ? 'Items' : CLEAN_LEVEL_LABELS[k]}</label>
                  <textarea rows={3} className={input} value={draft.workDescriptions[k]}
                    onChange={(e) => set('workDescriptions', { ...draft.workDescriptions, [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </Section>

          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            <button className={btnGhost} disabled={!dirty} onClick={() => setDraft(saved)}>Discard</button>
            <button className={btn} disabled={!dirty || saveState === 'saving'} onClick={() => void save()}>
              {saveState === 'saving' ? 'Saving…' : 'Save rates'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function AreaRow({ rate, onChange, onRemove }: { rate: AreaRate; onChange: (r: AreaRate) => void; onRemove: () => void }) {
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3"><input className={input} value={rate.areaType} onChange={(e) => onChange({ ...rate, areaType: e.target.value })} /></td>
      <td className="py-2 pr-3">
        <select className={input} value={rate.cleanLevel} onChange={(e) => onChange({ ...rate, cleanLevel: e.target.value as CleanLevel })}>
          {CLEAN_LEVELS.map((l) => <option key={l} value={l}>{CLEAN_LEVEL_LABELS[l]}</option>)}
        </select>
      </td>
      <td className="py-2 pr-3"><input type="number" min={1} step={5} className={input} value={rate.m2PerPersonHour} onChange={(e) => onChange({ ...rate, m2PerPersonHour: num(e.target.value) })} /></td>
      <td className="py-2 pr-3"><input type="number" min={0} step={0.1} className={input} value={toKes(rate.consumablesPerM2Cents)} onChange={(e) => onChange({ ...rate, consumablesPerM2Cents: fromKes(e.target.value) })} /></td>
      <td className="py-2 pr-3"><input type="number" min={0} step={1} className={input} value={toKes(rate.marketLowPerM2Cents)} onChange={(e) => onChange({ ...rate, marketLowPerM2Cents: fromKes(e.target.value) })} /></td>
      <td className="py-2 pr-3"><input type="number" min={0} step={1} className={input} value={toKes(rate.marketHighPerM2Cents)} onChange={(e) => onChange({ ...rate, marketHighPerM2Cents: fromKes(e.target.value) })} /></td>
      <td className="py-2 text-right"><button className="text-xs text-danger hover:underline" onClick={onRemove}>Remove</button></td>
    </tr>
  );
}

function ItemRow({ rate, onChange, onRemove }: { rate: ItemRate; onChange: (r: ItemRate) => void; onRemove: () => void }) {
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3"><input className={input} value={rate.itemType} onChange={(e) => onChange({ ...rate, itemType: e.target.value })} /></td>
      <td className="py-2 pr-3"><input type="number" min={0.1} step={0.5} className={input} value={rate.minutesPerUnit} onChange={(e) => onChange({ ...rate, minutesPerUnit: num(e.target.value) })} /></td>
      <td className="py-2 pr-3"><input type="number" min={0} step={1} className={input} value={toKes(rate.consumablesPerUnitCents)} onChange={(e) => onChange({ ...rate, consumablesPerUnitCents: fromKes(e.target.value) })} /></td>
      <td className="py-2 pr-3"><input type="number" min={0} step={1} className={input} value={toKes(rate.marketLowPerUnitCents)} onChange={(e) => onChange({ ...rate, marketLowPerUnitCents: fromKes(e.target.value) })} /></td>
      <td className="py-2 pr-3"><input type="number" min={0} step={1} className={input} value={toKes(rate.marketHighPerUnitCents)} onChange={(e) => onChange({ ...rate, marketHighPerUnitCents: fromKes(e.target.value) })} /></td>
      <td className="py-2 text-right"><button className="text-xs text-danger hover:underline" onClick={onRemove}>Remove</button></td>
    </tr>
  );
}

// ── Fields ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">{title}</h2>
      {children}
    </section>
  );
}

function Labelled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-charcoal-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-charcoal-muted">{hint}</p>}
    </div>
  );
}

function Money({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (cents: number) => void }) {
  return (
    <Labelled label={`${label} (KSh)`} hint={hint}>
      <input type="number" min={0} step={0.01} className={input} value={toKes(value)} onChange={(e) => onChange(fromKes(e.target.value))} />
    </Labelled>
  );
}

function Pct({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (fraction: number) => void }) {
  return (
    <Labelled label={`${label} (%)`} hint={hint}>
      <input type="number" min={0} max={100} step={0.5} className={input} value={toPct(value)} onChange={(e) => onChange(fromPct(e.target.value))} />
    </Labelled>
  );
}

function Num({ label, hint, value, step, onChange }: { label: string; hint?: string; value: number; step: number; onChange: (n: number) => void }) {
  return (
    <Labelled label={label} hint={hint}>
      <input type="number" min={0} step={step} className={input} value={value} onChange={(e) => onChange(num(e.target.value))} />
    </Labelled>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <Labelled label={label}>
      <input className={input} value={value} onChange={(e) => onChange(e.target.value)} />
    </Labelled>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const num = (s: string) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : 0);
const toKes = (cents: number) => Math.round(cents) / 100;
const fromKes = (s: string) => Math.max(0, Math.round(num(s) * 100));
const toPct = (fraction: number) => Math.round(fraction * 10000) / 100;
const fromPct = (s: string) => Math.min(1, Math.max(0, num(s) / 100));
const replaceAt = <T,>(list: T[], i: number, next: T) => list.map((x, j) => (j === i ? next : x));

function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { error?: unknown } | null;
    if (payload && typeof payload.error === 'string') return `${payload.error} (${err.status})`;
    if (payload && typeof payload.error === 'object' && payload.error) {
      // zod flatten(): { formErrors: string[], fieldErrors: Record<string, string[]> }
      const flat = payload.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
      const first =
        flat.formErrors?.[0] ??
        Object.entries(flat.fieldErrors ?? {}).map(([k, v]) => `${k}: ${v.join(', ')}`)[0];
      if (first) return `${first} (${err.status})`;
    }
    return `${fallback} (${err.status})`;
  }
  return fallback;
}
