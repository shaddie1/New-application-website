'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  COMPLIANCE_CATEGORIES,
  type CompanyReadinessFlags,
  type ComplianceChecklistDto,
  type ComplianceEventDto,
  type ComplianceItemDto,
  type CompliancePriority,
  type ComplianceStatus,
  type LaundryGoDecision,
} from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { canViewCompliance } from '../../../src/lib/roles';

// ── Labels ───────────────────────────────────────────────────────────────────

/** Exact dropdown values from the sheet. */
const PRIORITY_LABEL: Record<CompliancePriority, string> = {
  MUST_HAVE: 'Must have',
  MUST_HAVE_IF_ELIGIBLE: 'Must have (if eligible)',
  MUST_HAVE_IF_GO: 'Must have (if Go)',
  MUST_HAVE_BEFORE_HIRING: 'Must have (before hiring)',
  RECOMMENDED: 'Recommended',
  OPTIONAL: 'Optional',
};
const STATUS_LABEL: Record<ComplianceStatus, string> = {
  NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', DONE: 'Done', BLOCKED: 'Blocked', NOT_APPLICABLE: 'Not applicable',
};
const STATUSES = Object.keys(STATUS_LABEL) as ComplianceStatus[];
const GO_LABEL: Record<LaundryGoDecision, string> = { PENDING: 'Pending', GO: 'Go', NO_GO: 'No-go' };

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
function dateOnly(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}
function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { error?: unknown } | null;
    if (payload && typeof payload.error === 'string') return `${payload.error} (${err.status})`;
    return `${fallback} (${err.status})`;
  }
  return fallback;
}

function statusTone(s: ComplianceStatus) {
  if (s === 'DONE') return 'bg-success/10 text-success';
  if (s === 'BLOCKED') return 'bg-danger/10 text-danger';
  if (s === 'IN_PROGRESS') return 'bg-gold-bright/20 text-bronze';
  if (s === 'NOT_APPLICABLE') return 'bg-cream-deep text-charcoal-muted';
  return 'bg-cream-deep text-charcoal';
}
function priorityTone(p: CompliancePriority, applies: boolean) {
  if (!applies) return 'bg-cream-deep text-charcoal-muted line-through';
  if (p.startsWith('MUST_HAVE')) return 'bg-danger/10 text-danger';
  if (p === 'RECOMMENDED') return 'bg-warning/15 text-warning';
  return 'bg-cream-deep text-charcoal-muted';
}

/** Thin progress bar for checklist completion — red when there are problems (Projects' pattern). */
function ProgressBar({ percent, problems }: { percent: number; problems: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--chart-track)' }}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: problems ? 'var(--chart-negative)' : 'var(--chart-accent)' }}
      />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const session = useRequireAdmin();
  const [data, setData] = useState<ComplianceChecklistDto | null>(null);
  const [category, setCategory] = useState<string>('Legal');
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  /**
   * Status changes save the instant they are picked. That is only
   * trustworthy if it is visible, so every write reports itself here.
   */
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const load = useCallback(async () => {
    try {
      setData(await api.compliance());
      setForbidden(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(messageFrom(err, 'Could not load the checklist'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;

  if (forbidden || !canViewCompliance(session)) {
    return (
      <div className="rounded-xl border border-line bg-white p-8 text-center">
        <h1 className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>Compliance checklist</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-charcoal-muted">
          Visible to the owner, COO, Business Development Lead, Comms and the financial manager.
        </p>
      </div>
    );
  }

  /** Every write returns the whole checklist, so the summary and blockers stay right. */
  const run = async (optimistic: ((d: ComplianceChecklistDto) => ComplianceChecklistDto) | null, call: () => Promise<ComplianceChecklistDto>, fallback: string) => {
    setSaveState('saving');
    setError(null);
    const before = data;
    if (optimistic && before) setData(optimistic(before));
    try {
      setData(await call());
      setSaveState('saved');
    } catch (err) {
      setData(before);
      setSaveState('failed');
      setError(messageFrom(err, fallback));
    }
  };

  const items = data?.items ?? [];
  const summary = data?.summary;
  const shown = items.filter((i) => i.category === category);
  const counts = Object.fromEntries(COMPLIANCE_CATEGORIES.map((c) => {
    const inCat = items.filter((i) => i.category === c && i.applies && i.status !== 'NOT_APPLICABLE');
    return [c, { done: inCat.filter((i) => i.status === 'DONE').length, total: inCat.length, blockers: items.filter((i) => i.category === c && i.isBlocker).length }];
  }));
  const blockerItems = items.filter((i) => i.isBlocker);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Compliance checklist</h1>
          <p className="mt-1 text-sm text-charcoal-muted">
            The 56 items from the compliance sheet, verbatim. Status changes save the moment you pick them and are logged.
          </p>
        </div>
        <span
          className={
            saveState === 'failed' ? 'text-xs font-medium text-danger'
            : saveState === 'saved' ? 'text-xs font-medium text-success'
            : 'text-xs text-charcoal-muted'
          }
        >
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'failed' ? '⚠ Not saved — try again' : ''}
        </span>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      {!data || !summary ? (
        <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">Loading…</div>
      ) : (
        <>
          {/* Progress + stats */}
          <div className="mb-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-xl border border-line bg-white p-5">
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="text-charcoal-muted">Checklist progress</span>
                <span className="tabular-nums font-medium text-charcoal">{summary.done} of {summary.total} done · {summary.percent}%</span>
              </div>
              <ProgressBar percent={summary.percent} problems={summary.problems > 0} />
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <Stat label="Must-haves open" value={String(summary.blockers.length)} tone={summary.blockers.length ? 'text-danger' : 'text-success'} />
                <Stat label="Overdue" value={String(summary.overdue)} tone={summary.overdue ? 'text-danger' : ''} />
                <Stat label="Remaining cost" value={money(summary.remainingCostCents)} hint="items not done / N/A" />
              </div>
            </div>
            <FlagsPanel
              flags={data.flags}
              editable={data.canEditFlags}
              onSave={(flags) => run(
                (d) => ({ ...d, flags: { ...d.flags, ...flags } }),
                () => api.setReadinessFlags(flags),
                'Could not save the readiness flags',
              )}
            />
          </div>

          {/* Blocker banner — applicable must-haves still open */}
          {blockerItems.length > 0 && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
              <span className="font-medium text-danger">
                {blockerItems.length} must-have item{blockerItems.length === 1 ? '' : 's'} not yet done
              </span>
              <span className="text-charcoal-muted">
                {' '}— {blockerItems.slice(0, 12).map((i) => `#${i.itemNo}${i.overdue ? ' (overdue)' : i.status === 'BLOCKED' ? ' (blocked)' : ''}`).join(', ')}
                {blockerItems.length > 12 ? ` and ${blockerItems.length - 12} more` : ''}.
                {' '}Conditional must-haves count only once their readiness flag is set.
              </span>
            </div>
          )}

          {/* Category tabs */}
          <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
            {COMPLIANCE_CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={tab(category === c)}>
                {c} <span className="text-xs text-charcoal-muted">{counts[c]?.done}/{counts[c]?.total}</span>
                {counts[c] && counts[c]!.blockers > 0 && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-danger align-middle" />}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {shown.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                expanded={expanded === item.id}
                onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                onStatus={(status, note) => run(
                  (d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, status } : i)) }),
                  () => api.setComplianceStatus(item.id, { status, note }),
                  'Could not change the status',
                )}
                onNote={(note) => run(null, () => api.addComplianceNote(item.id, note), 'Could not add the note')}
                onDetails={(patch) => run(null, () => api.updateComplianceItem(item.id, patch), 'Could not save the details')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-charcoal-muted">{label}</p>
      <p className={`mt-0.5 text-lg ${tone ?? ''}`} style={{ fontFamily: 'Georgia, serif' }}>{value}</p>
      {hint && <p className="text-xs text-charcoal-muted">{hint}</p>}
    </div>
  );
}

// ── Readiness flags ──────────────────────────────────────────────────────────

function FlagsPanel({ flags, editable, onSave }: {
  flags: CompanyReadinessFlags & { updatedAt: string | null; updatedByName: string | null };
  editable: boolean;
  onSave: (flags: CompanyReadinessFlags) => Promise<void>;
}) {
  const change = (next: CompanyReadinessFlags, what: string) => {
    if (!confirm(`${what} This changes which must-have items count as blockers for everyone. Continue?`)) return;
    void onSave(next);
  };
  const current: CompanyReadinessFlags = { agpoEligible: flags.agpoEligible, laundryGoDecision: flags.laundryGoDecision, hiringStarted: flags.hiringStarted };

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <p className="mb-3 text-xs uppercase tracking-widest text-charcoal-muted">Company readiness flags</p>
      <div className="space-y-2 text-sm">
        <label className="flex items-center justify-between gap-3">
          <span>AGPO eligible <span className="text-xs text-charcoal-muted">— turns on “Must have (if eligible)”</span></span>
          <input type="checkbox" checked={flags.agpoEligible} disabled={!editable}
            onChange={(e) => change({ ...current, agpoEligible: e.target.checked }, e.target.checked ? 'Mark the company AGPO-eligible?' : 'Mark the company not AGPO-eligible?')} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>Laundry decision <span className="text-xs text-charcoal-muted">— “Go” turns on “Must have (if Go)”</span></span>
          <select className="rounded-lg border border-line bg-white px-2 py-1 text-xs" value={flags.laundryGoDecision} disabled={!editable}
            onChange={(e) => change({ ...current, laundryGoDecision: e.target.value as LaundryGoDecision }, `Set the laundry decision to ${GO_LABEL[e.target.value as LaundryGoDecision]}?`)}>
            {(Object.keys(GO_LABEL) as LaundryGoDecision[]).map((k) => <option key={k} value={k}>{GO_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>Hiring started <span className="text-xs text-charcoal-muted">— turns on “Must have (before hiring)”</span></span>
          <input type="checkbox" checked={flags.hiringStarted} disabled={!editable}
            onChange={(e) => change({ ...current, hiringStarted: e.target.checked }, e.target.checked ? 'Record that hiring has started?' : 'Record that hiring has not started?')} />
        </label>
      </div>
      <p className="mt-3 text-xs text-charcoal-muted">
        {editable ? 'Owner and COO only; each change asks for confirmation.' : 'Set by the owner or COO.'}
        {flags.updatedAt ? ` Last changed by ${flags.updatedByName ?? 'unknown'} · ${when(flags.updatedAt)}.` : ''}
      </p>
    </div>
  );
}

// ── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({ item, expanded, onToggle, onStatus, onNote, onDetails }: {
  item: ComplianceItemDto;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (status: ComplianceStatus, note?: string) => Promise<void>;
  onNote: (note: string) => Promise<void>;
  onDetails: (patch: { sourceOrNote?: string | null; targetDate?: string }) => Promise<void>;
}) {
  const [panel, setPanel] = useState<'details' | 'log'>('details');
  const [blocking, setBlocking] = useState(false);
  const [blockNote, setBlockNote] = useState(item.statusNote ?? '');
  const [note, setNote] = useState('');
  const [events, setEvents] = useState<ComplianceEventDto[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!expanded || panel !== 'log') return;
    let live = true;
    setEvents(null);
    api.complianceEvents(item.id).then((r) => { if (live) setEvents(r.events); }).catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, [expanded, panel, item.id, item.eventCount]);

  const pick = async (status: ComplianceStatus) => {
    if (status === item.status) return;
    // BLOCKED needs a reason — the same pattern as a "No" answer on Projects.
    if (status === 'BLOCKED') { setBlocking(true); return; }
    setBlocking(false);
    setBusy(true);
    await onStatus(status);
    setBusy(false);
  };
  const submitBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockNote.trim()) return;
    setBusy(true);
    await onStatus('BLOCKED', blockNote.trim());
    setBusy(false);
    setBlocking(false);
  };

  return (
    <div className={`overflow-hidden rounded-xl border bg-white ${item.isBlocker && (item.overdue || item.status === 'BLOCKED') ? 'border-danger/40' : 'border-line'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-charcoal-muted">#{item.itemNo}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${priorityTone(item.priority, item.applies)}`} title={item.applies ? undefined : 'Does not apply until its readiness flag is set'}>
              {PRIORITY_LABEL[item.priority]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(item.status)}`}>{STATUS_LABEL[item.status]}</span>
            {item.overdue && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">Overdue</span>}
          </div>
          <p className="mt-1 text-sm text-charcoal">{item.itemAction}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-charcoal-muted">
            <span>Owner: {item.owner}</span>
            <span className={item.overdue ? 'font-medium text-danger' : ''}>· target {dateOnly(item.targetDate)}</span>
            {item.dateDone && <span className="text-success">· done {dateOnly(item.dateDone)}</span>}
            <span>· {money(item.costCents)} ({item.costType})</span>
            {item.status === 'BLOCKED' && item.statusNote && <span className="text-danger">· blocked: {item.statusNote}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={item.status}
            disabled={!item.editable || busy}
            onChange={(e) => void pick(e.target.value as ComplianceStatus)}
            className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs disabled:opacity-60"
            title={item.editable ? undefined : `Owned by ${item.owner} — the owner or COO can also change it`}
            aria-label={`Status of item ${item.itemNo}`}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <button className={btnGhost} onClick={onToggle}>{expanded ? '▲ Hide' : '▼ More'}</button>
        </div>
      </div>

      {blocking && (
        <form onSubmit={(e) => void submitBlock(e)} className="flex flex-wrap items-end gap-2 border-t border-danger/30 bg-danger/5 px-4 py-3">
          <label className="min-w-[240px] flex-1 text-xs text-charcoal-muted">
            What is blocking it?
            <input autoFocus required value={blockNote} onChange={(e) => setBlockNote(e.target.value)} className={`${input} mt-1`} placeholder="e.g. waiting on the broker's quote" />
          </label>
          <button type="button" className={btnGhost} onClick={() => setBlocking(false)}>Cancel</button>
          <button type="submit" disabled={busy || !blockNote.trim()} className="rounded-lg bg-danger px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">Mark blocked</button>
        </form>
      )}

      {expanded && (
        <div className="border-t border-line bg-cream/40 px-4 py-4">
          <div className="mb-3 flex items-center gap-1 border-b border-line">
            <button onClick={() => setPanel('details')} className={tab(panel === 'details')}>Details</button>
            <button onClick={() => setPanel('log')} className={tab(panel === 'log')}>Activity log ({item.eventCount})</button>
          </div>

          {panel === 'details' ? (
            <div className="space-y-3 text-sm">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[160px_1fr]">
                <dt className="text-charcoal-muted">Why it matters</dt><dd>{item.whyItMatters ?? '—'}</dd>
                <dt className="text-charcoal-muted">Source / note</dt><dd>{item.sourceOrNote ?? '—'}</dd>
                <dt className="text-charcoal-muted">Cost</dt><dd>{money(item.costCents)} · {item.costType}</dd>
                <dt className="text-charcoal-muted">Target date</dt>
                <dd>
                  {item.editable ? (
                    <input type="date" defaultValue={item.targetDate} className="rounded-lg border border-line bg-white px-2 py-1 text-xs"
                      onBlur={(e) => { if (e.target.value && e.target.value !== item.targetDate) void onDetails({ targetDate: e.target.value }); }} />
                  ) : dateOnly(item.targetDate)}
                </dd>
              </dl>
              {item.editable && (
                <div className="flex gap-2 border-t border-line pt-3">
                  <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (note.trim()) { void onNote(note.trim()); setNote(''); setPanel('log'); } } }}
                    placeholder="Add a note to the activity log" className={input} />
                  <button className={btn} disabled={!note.trim()} onClick={() => { void onNote(note.trim()); setNote(''); setPanel('log'); }}>Add</button>
                </div>
              )}
            </div>
          ) : !events ? (
            <p className="py-4 text-center text-sm text-charcoal-muted">Loading history…</p>
          ) : events.length === 0 ? (
            <p className="py-4 text-center text-sm text-charcoal-muted">Nothing recorded yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-line pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-cream"
                    style={{ backgroundColor: e.kind === 'STATUS_CHANGED' ? (e.toStatus === 'DONE' ? 'var(--chart-positive)' : e.toStatus === 'BLOCKED' ? 'var(--chart-negative)' : 'var(--chart-accent)') : e.kind === 'SEEDED' ? 'var(--chart-accent-deep)' : 'var(--chart-muted)' }} />
                  <p className="text-sm text-charcoal">{e.summary}</p>
                  {e.detail && <p className="mt-0.5 text-xs text-charcoal-muted">{e.detail}</p>}
                  <p className="mt-0.5 text-xs text-charcoal-muted">{e.actorName ?? 'System'} · {when(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
