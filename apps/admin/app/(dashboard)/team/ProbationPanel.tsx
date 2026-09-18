'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PROBATION_DECISION_LABEL,
  PROBATION_ROLE_LABEL,
  type KpiRowDto,
  type ProbationDecision,
  type ProbationDto,
  type ProbationRole,
  type ProbationScorecardDto,
  type ReportingEventDto,
  type WorkplanEventDto,
  type WorkplanStatus,
  type WorkplanTaskDto,
  type WorkplanTaskType,
} from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';

// ── Labels & tokens ──────────────────────────────────────────────────────────

/** The sheet's five-value dropdown. */
const STATUS_LABEL: Record<WorkplanStatus, string> = {
  NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', DONE: 'Done', BLOCKED: 'Blocked', HELD: 'Held',
};
const STATUSES = Object.keys(STATUS_LABEL) as WorkplanStatus[];

/** Bar colours by status — the sheet's own visual key. */
const STATUS_BAR: Record<WorkplanStatus, string> = {
  NOT_STARTED: 'var(--chart-muted)',
  IN_PROGRESS: 'var(--chart-accent)',
  DONE: 'var(--chart-positive)',
  BLOCKED: 'var(--chart-negative)',
  HELD: 'var(--chart-accent-deep)',
};
const STATUS_CHIP: Record<WorkplanStatus, string> = {
  NOT_STARTED: 'bg-cream-deep text-charcoal-muted',
  IN_PROGRESS: 'bg-gold-bright/20 text-bronze',
  DONE: 'bg-success/10 text-success',
  BLOCKED: 'bg-danger/10 text-danger',
  HELD: 'bg-warning/15 text-warning',
};
/** S / T / ST / D on the sheet. */
const TYPE_LABEL: Record<WorkplanTaskType, string> = { STAGE: 'S', TASK: 'T', ONGOING: 'ST', DELIVERABLE: 'D' };
const TYPE_TITLE: Record<WorkplanTaskType, string> = { STAGE: 'Stage', TASK: 'Task', ONGOING: 'Ongoing (standing) task', DELIVERABLE: 'Deliverable' };

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed';
const tab = (on: boolean) =>
  `border-b-2 px-3 py-2 text-sm ${on ? 'border-gold-deep font-medium text-gold-deep' : 'border-transparent text-charcoal-muted hover:text-charcoal'}`;

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

const DAY_PX = 5;

function dateOnly(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}
function when(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function monthLabel(ym: string) {
  return new Date(`${ym}-01T12:00:00`).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
}
function pct(fraction: number) {
  return `${Math.round(fraction * 1000) / 10}%`;
}
/** Percent-type KPIs are stored as fractions (0.9); show a month as %. */
function isPercentKpi(k: KpiRowDto) {
  return /\(%\)/.test(k.kpiName);
}
function fmtValue(k: KpiRowDto, v: number | undefined) {
  if (v === undefined) return '—';
  return isPercentKpi(k) ? pct(v) : String(Math.round(v * 100) / 100);
}
/** The Σ columns follow the sheet: a plain sum of the fractions (0.9 + 0.9 + 0.9 = 2.7), never "270%". */
function fmtSum(v: number) {
  return String(Math.round(v * 100) / 100);
}
function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { error?: unknown } | null;
    if (payload && typeof payload.error === 'string') return `${payload.error} (${err.status})`;
    return `${fallback} (${err.status})`;
  }
  return fallback;
}
const daysBetween = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ── Panel ────────────────────────────────────────────────────────────────────

export function ProbationPanel() {
  const [data, setData] = useState<ProbationDto | null>(null);
  const [view, setView] = useState<'workplan' | 'calendar' | 'scorecard'>('workplan');
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const load = useCallback(async () => {
    try { setData(await api.probation()); setForbidden(false); }
    catch (err) { if (err instanceof ApiError && err.status === 403) setForbidden(true); else setError(messageFrom(err, 'Could not load the probation tracker')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  /** Every write returns the whole tracker, so scores and outcomes stay right. */
  const run = async (optimistic: ((d: ProbationDto) => ProbationDto) | null, call: () => Promise<ProbationDto>, fallback: string) => {
    setSaveState('saving');
    setError(null);
    const before = data;
    if (optimistic && before) setData(optimistic(before));
    try { setData(await call()); setSaveState('saved'); }
    catch (err) { setData(before); setSaveState('failed'); setError(messageFrom(err, fallback)); }
  };

  if (forbidden) {
    return <div className="rounded-xl border border-line bg-white p-8 text-center text-sm text-charcoal-muted">The probation tracker is visible to the COO, the CEO and the two trainees.</div>;
  }
  if (!data) return <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">Loading…</div>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-charcoal-muted">
          Probation {dateOnly(data.probationStart)} – {dateOnly(data.probationEnd)} {data.probationEnd.slice(0, 4)} · decision letter by {dateOnly(data.decisionLetterBy)} {data.decisionLetterBy.slice(0, 4)}.
          {data.access.roles.length === 1 ? ` Your workplan: ${PROBATION_ROLE_LABEL[data.access.roles[0]!]}.` : ' Both trainees.'}
        </p>
        <span className={`text-xs ${saveState === 'failed' ? 'font-medium text-danger' : saveState === 'saved' ? 'font-medium text-success' : 'text-charcoal-muted'}`}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'failed' ? '⚠ Not saved — try again' : ''}
        </span>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
        <button onClick={() => setView('workplan')} className={tab(view === 'workplan')}>Workplan</button>
        <button onClick={() => setView('calendar')} className={tab(view === 'calendar')}>Reporting calendar</button>
        {data.access.canSeeScorecard && <button onClick={() => setView('scorecard')} className={tab(view === 'scorecard')}>KPI scorecard</button>}
      </div>

      {view === 'workplan' && (
        <Workplan data={data} onStatus={(task, status, note) => run(
          (d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) }),
          () => api.setWorkplanStatus(task.id, { status, note }),
          'Could not change the task status',
        )} />
      )}
      {view === 'calendar' && (
        <Calendar events={data.calendar} editable={data.access.canEditCalendar} onMark={(e, patch) => run(
          (d) => ({ ...d, calendar: d.calendar.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) }),
          () => api.markReportingEvent(e.id, patch),
          'Could not update the calendar',
        )} />
      )}
      {view === 'scorecard' && data.scorecards && (
        <div className="space-y-6">
          {data.scorecards.map((sc) => (
            <Scorecard key={sc.role} card={sc} access={data.access}
              onActual={(kpi, month, actual) => run(null, () => api.setKpiActual(kpi.id, { month, actual }), 'Could not save the actual')}
              onTarget={(kpi, month, target) => run(null, () => api.setKpiTarget(kpi.id, { month, target }), 'Could not save the target')}
              onAddMonth={(month) => run(null, () => api.addKpiMonth(sc.role, month), 'Could not add the month')}
              onBreach={(flag, note) => run(null, () => api.setCriticalBreach(sc.role, { criticalBreach: flag, note }), 'Could not set the breach flag')}
              onDecide={(decision, note) => run(null, () => api.setFinalDecision(sc.role, { finalDecision: decision, note }), 'Could not record the decision')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Workplan (Gantt) ─────────────────────────────────────────────────────────

function Workplan({ data, onStatus }: { data: ProbationDto; onStatus: (task: WorkplanTaskDto, status: WorkplanStatus, note?: string) => Promise<void> }) {
  const [role, setRole] = useState<ProbationRole>(data.access.roles[0]!);
  const tasks = data.tasks.filter((t) => t.role === role);

  // The timeline runs from the first start to the last end, week-aligned (Monday).
  const { start, days, weeks, months } = useMemo(() => {
    const dated = tasks.filter((t) => t.startDate && t.endDate);
    const min = dated.reduce((a, t) => (t.startDate! < a ? t.startDate! : a), dated[0]?.startDate ?? data.probationStart);
    const max = dated.reduce((a, t) => (t.endDate! > a ? t.endDate! : a), dated[0]?.endDate ?? data.decisionLetterBy);
    const monday = addDays(min, -((new Date(`${min}T00:00:00Z`).getUTCDay() + 6) % 7));
    const total = daysBetween(monday, max) + 1;
    const days = Array.from({ length: total }, (_, i) => addDays(monday, i));
    const weeks = days.filter((_, i) => i % 7 === 0);
    const months: { key: string; offset: number; span: number }[] = [];
    for (const [i, d] of days.entries()) {
      const key = d.slice(0, 7);
      const last = months[months.length - 1];
      if (last && last.key === key) last.span++; else months.push({ key, offset: i, span: 1 });
    }
    return { start: monday, days, weeks, months };
  }, [tasks, data.probationStart, data.decisionLetterBy]);

  const done = tasks.filter((t) => t.type !== 'STAGE' && t.status === 'DONE').length;
  const countable = tasks.filter((t) => t.type !== 'STAGE').length;
  const blocked = tasks.filter((t) => t.status === 'BLOCKED').length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {data.access.roles.map((r) => (
            <button key={r} onClick={() => setRole(r)}
              className={`rounded-full border px-3 py-1.5 text-sm ${role === r ? 'border-charcoal bg-charcoal text-white' : 'border-line bg-white text-charcoal-muted'}`}>
              {r === 'COMMS' ? 'Comms' : 'BD'} <span className="text-xs opacity-70">· {PROBATION_ROLE_LABEL[r]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-charcoal-muted">
          <span className="tabular-nums">{done} of {countable} done{blocked ? ` · ${blocked} blocked` : ''}</span>
          {STATUSES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ backgroundColor: STATUS_BAR[s] }} />{STATUS_LABEL[s]}</span>
          ))}
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-3 rounded-sm bg-cream-deep" />Weekend</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        {/* Fixed text columns so the Gantt keeps its width instead of being squeezed off-screen by long activity text. */}
        <table className="w-full table-fixed text-sm" style={{ minWidth: 640 + days.length * DAY_PX }}>
          <colgroup>
            <col style={{ width: 56 }} /><col style={{ width: 220 }} /><col style={{ width: 84 }} /><col style={{ width: 130 }} /><col style={{ width: 150 }} /><col />
          </colgroup>
          <thead>
            <tr className="border-b border-line bg-cream/60 text-left text-xs uppercase tracking-widest text-charcoal-muted">
              <th className="px-3 py-2 font-normal">No.</th>
              <th className="px-3 py-2 font-normal">Activity</th>
              <th className="px-3 py-2 font-normal">Dates</th>
              <th className="px-3 py-2 font-normal">Output required</th>
              <th className="px-3 py-2 font-normal">Status</th>
              <th className="px-0 py-0 font-normal">
                <div className="relative" style={{ width: days.length * DAY_PX, height: 34 }}>
                  {months.map((m) => (
                    <span key={m.key} className="absolute top-0 border-l border-line pl-1 text-[10px] normal-case tracking-normal" style={{ left: m.offset * DAY_PX, width: m.span * DAY_PX }}>{m.span * DAY_PX >= 48 ? monthLabel(m.key) : ''}</span>
                  ))}
                  {weeks.map((w, i) => (
                    <span key={w} className="absolute bottom-0 border-l border-line pl-0.5 text-[9px] normal-case tracking-normal text-charcoal-muted" style={{ left: i * 7 * DAY_PX }}>{i % 2 === 0 ? dateOnly(w) : ''}</span>
                  ))}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} start={start} days={days} onStatus={onStatus} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaskRow({ task: t, start, days, onStatus }: { task: WorkplanTaskDto; start: string; days: string[]; onStatus: (task: WorkplanTaskDto, status: WorkplanStatus, note?: string) => Promise<void> }) {
  const [showLog, setShowLog] = useState(false);
  const [events, setEvents] = useState<WorkplanEventDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const stage = t.type === 'STAGE';

  useEffect(() => {
    if (!showLog) return;
    let live = true;
    setEvents(null);
    api.workplanEvents(t.id).then((r) => { if (live) setEvents(r.events); }).catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, [showLog, t.id, t.eventCount]);

  const left = t.startDate ? daysBetween(start, t.startDate) * DAY_PX : null;
  const width = t.startDate && t.endDate ? (daysBetween(t.startDate, t.endDate) + 1) * DAY_PX : null;

  const pick = async (status: WorkplanStatus) => {
    if (status === t.status) return;
    let note: string | undefined;
    if (status === 'BLOCKED' || status === 'HELD') {
      const answer = prompt(`Why is ${t.taskNo} ${STATUS_LABEL[status].toLowerCase()}? (optional note for the log)`);
      if (answer === null) return;
      note = answer.trim() || undefined;
    }
    setBusy(true);
    await onStatus(t, status, note);
    setBusy(false);
  };

  return (
    <>
      <tr className={stage ? 'bg-charcoal/[0.04]' : t.overdue ? 'bg-danger/[0.04]' : ''}>
        <td className={`whitespace-nowrap px-3 py-2 align-top font-mono text-xs ${stage ? 'font-semibold text-charcoal' : 'text-charcoal-muted'}`}>
          {t.taskNo} <span className="ml-1 rounded bg-cream-deep px-1 text-[10px] font-sans" title={TYPE_TITLE[t.type]}>{TYPE_LABEL[t.type]}</span>
        </td>
        <td className={`px-3 py-2 align-top ${stage ? 'font-semibold uppercase tracking-wide text-charcoal' : ''}`} style={{ minWidth: 320 }}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span>{t.activity}</span>
            {t.isDecisionGate && <span className="rounded-full bg-gold-bright/20 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-bronze">Decision gate</span>}
            {t.overdue && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-danger">Overdue</span>}
          </div>
          {!stage && t.category && <div className="mt-0.5 text-xs text-charcoal-muted">{t.category}</div>}
        </td>
        <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-charcoal-muted">
          {t.startDate && t.endDate ? (t.startDate === t.endDate ? dateOnly(t.startDate) : `${dateOnly(t.startDate)} – ${dateOnly(t.endDate)}`) : '—'}
        </td>
        <td className="px-3 py-2 align-top text-xs text-charcoal-muted" style={{ minWidth: 220 }}>{stage ? '' : t.outputRequired ?? '—'}</td>
        <td className="whitespace-nowrap px-3 py-2 align-top">
          {stage ? null : t.editable ? (
            <select value={t.status} disabled={busy} onChange={(e) => void pick(e.target.value as WorkplanStatus)} aria-label={`Status of ${t.taskNo}`}
              className="rounded-lg border border-line bg-white px-2 py-1 text-xs">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          ) : (
            <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CHIP[t.status]}`}>{STATUS_LABEL[t.status]}</span>
          )}
          {!stage && (
            <button onClick={() => setShowLog((v) => !v)} className="ml-2 text-[11px] text-charcoal-muted hover:underline" title="Activity log">{t.eventCount} ev.</button>
          )}
        </td>
        <td className="px-0 py-0 align-top">
          <div className="relative" style={{ width: days.length * DAY_PX, height: 30 }}>
            {days.map((d, i) => {
              const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
              return (dow === 0 || dow === 6) ? <span key={d} className="absolute top-0 h-full bg-cream-deep/70" style={{ left: i * DAY_PX, width: DAY_PX }} /> : null;
            })}
            {left !== null && width !== null && (
              <span
                className={`absolute rounded ${stage ? 'top-[11px] h-2' : 'top-[7px] h-4'}`}
                style={{ left, width, backgroundColor: stage ? 'var(--chart-accent-deep)' : STATUS_BAR[t.status], opacity: stage ? 0.55 : 1 }}
                title={`${t.taskNo} · ${t.startDate} → ${t.endDate}`}
              />
            )}
          </div>
        </td>
      </tr>
      {showLog && !stage && (
        <tr className="bg-cream/40">
          <td colSpan={6} className="px-4 py-3">
            {!events ? <p className="text-xs text-charcoal-muted">Loading history…</p> : events.length === 0 ? <p className="text-xs text-charcoal-muted">Nothing recorded yet.</p> : (
              <ol className="relative space-y-3 border-l border-line pl-5">
                {events.map((e) => (
                  <li key={e.id} className="relative text-xs">
                    <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-cream" style={{ backgroundColor: e.toStatus ? STATUS_BAR[e.toStatus] : 'var(--chart-muted)' }} />
                    <p className="text-sm text-charcoal">{e.summary}</p>
                    {e.detail && <p className="text-charcoal-muted">{e.detail}</p>}
                    <p className="text-charcoal-muted">{e.actorName ?? 'System'} · {when(e.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Reporting calendar ───────────────────────────────────────────────────────

function Calendar({ events, editable, onMark }: { events: ReportingEventDto[]; editable: boolean; onMark: (e: ReportingEventDto, patch: { submitted?: boolean; reviewed?: boolean }) => Promise<void> }) {
  const overdue = events.filter((e) => e.overdue);
  return (
    <div>
      {overdue.length > 0 && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <span className="font-medium text-danger">{overdue.length} report{overdue.length === 1 ? '' : 's'} overdue</span>
          <span className="text-charcoal-muted"> — {overdue.map((e) => `${e.event} (${dateOnly(e.date)})`).join(', ')}</span>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-cream/60 text-left text-xs uppercase tracking-widest text-charcoal-muted">
              <th className="px-4 py-3 font-normal">Date</th>
              <th className="px-4 py-3 font-normal">Event</th>
              <th className="px-4 py-3 font-normal">Who</th>
              <th className="px-4 py-3 font-normal">Due</th>
              <th className="px-4 py-3 font-normal">Reviewer</th>
              <th className="px-4 py-3 font-normal">Submitted</th>
              <th className="px-4 py-3 font-normal">Reviewed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {events.map((e) => (
              <tr key={e.id} className={e.overdue ? 'bg-danger/[0.04]' : e.submitted && e.reviewed ? 'bg-success/[0.04]' : ''}>
                <td className="whitespace-nowrap px-4 py-2 text-xs"><span className="text-charcoal-muted">{e.day}</span> {dateOnly(e.date)} {e.date.slice(0, 4)}</td>
                <td className="px-4 py-2">
                  {e.event}
                  {e.overdue && <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">Overdue</span>}
                </td>
                <td className="px-4 py-2 text-xs text-charcoal-muted">{e.who}</td>
                <td className="px-4 py-2 text-xs text-charcoal-muted">{e.due}</td>
                <td className="px-4 py-2 text-xs text-charcoal-muted">{e.reviewer}</td>
                <td className="px-4 py-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={e.submitted} disabled={!editable} aria-label={`Submitted: ${e.event}`} onChange={(ev) => void onMark(e, { submitted: ev.target.checked })} />
                    {e.submittedAt ? <span className="text-charcoal-muted" title={e.submittedByName ?? ''}>{when(e.submittedAt)}</span> : null}
                  </label>
                </td>
                <td className="px-4 py-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={e.reviewed} disabled={!editable} aria-label={`Reviewed: ${e.event}`} onChange={(ev) => void onMark(e, { reviewed: ev.target.checked })} />
                    {e.reviewedAt ? <span className="text-charcoal-muted" title={e.reviewedByName ?? ''}>{when(e.reviewedAt)}</span> : null}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!editable && <p className="mt-2 text-xs text-charcoal-muted">Submitted and reviewed are marked by the COO.</p>}
    </div>
  );
}

// ── KPI scorecard ────────────────────────────────────────────────────────────

function Scorecard({ card, access, onActual, onTarget, onAddMonth, onBreach, onDecide }: {
  card: ProbationScorecardDto;
  access: ProbationDto['access'];
  onActual: (kpi: KpiRowDto, month: string, actual: number | null) => Promise<void>;
  onTarget: (kpi: KpiRowDto, month: string, target: number) => Promise<void>;
  onAddMonth: (month: string) => Promise<void>;
  onBreach: (flag: boolean, note?: string) => Promise<void>;
  onDecide: (decision: ProbationDecision | null, note?: string) => Promise<void>;
}) {
  const tone = card.outcome === 'CONFIRM' ? 'border-success/40 bg-success/5 text-success' : card.outcome === 'EXTEND_ONE_MONTH' ? 'border-warning/40 bg-warning/10 text-warning' : 'border-danger/40 bg-danger/5 text-danger';

  const addMonth = () => {
    const month = prompt('Add a month for an extension (YYYY-MM):', card.months.length ? nextMonth(card.months[card.months.length - 1]!) : '2027-01');
    if (!month) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { alert('Use YYYY-MM, e.g. 2027-01'); return; }
    void onAddMonth(month);
  };
  const toggleBreach = () => {
    const next = !card.criticalBreach;
    if (!confirm(next ? `Flag a critical breach for the ${PROBATION_ROLE_LABEL[card.role]}? The outcome becomes "Not confirmed" regardless of score.` : 'Clear the critical-breach flag?')) return;
    const note = next ? prompt('What was the breach? (for the record)') ?? undefined : undefined;
    void onBreach(next, note || undefined);
  };
  const decide = (value: string) => {
    const decision = (value || null) as ProbationDecision | null;
    if (!confirm(decision ? `Record the final decision “${PROBATION_DECISION_LABEL[decision]}” for the ${PROBATION_ROLE_LABEL[card.role]}?` : 'Clear the recorded decision?')) return;
    const note = decision ? prompt('Note for the decision letter (optional):') ?? undefined : undefined;
    void onDecide(decision, note || undefined);
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg" style={{ fontFamily: 'Georgia, serif' }}>{PROBATION_ROLE_LABEL[card.role]}</h3>
          <p className="text-xs text-charcoal-muted">score = weight × min(1, Σactuals ÷ Σtargets); a KPI with no target scores its weight on any actual. Outcome: ≥ 70% confirm · ≥ 55% extend 1 month · below not confirmed.</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 text-right ${tone}`}>
          <p className="text-xs uppercase tracking-widest opacity-80">Weighted score</p>
          <p className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>{pct(card.weightedScore)}</p>
          <p className="text-sm font-medium">{PROBATION_DECISION_LABEL[card.outcome]}{card.criticalBreach ? ' · critical breach' : ''}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-charcoal-muted">
              <th className="py-2 pr-3 font-normal">KPI</th>
              <th className="py-2 pr-3 text-right font-normal">Weight</th>
              {card.months.map((m) => <th key={m} className="py-2 pr-3 text-right font-normal">{monthLabel(m)}<br /><span className="text-[10px] normal-case tracking-normal">target / actual</span></th>)}
              <th className="py-2 pr-3 text-right font-normal">Σ target</th>
              <th className="py-2 pr-3 text-right font-normal">Σ actual</th>
              <th className="py-2 text-right font-normal">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {card.kpis.map((k) => (
              <tr key={k.id}>
                <td className="py-1.5 pr-3">{k.kpiName}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-charcoal-muted">{k.weight}</td>
                {card.months.map((m) => (
                  <td key={m} className="py-1.5 pr-3 text-right tabular-nums">
                    {access.canEditActuals ? (
                      <span className="inline-flex items-center gap-1">
                        <input type="number" step="any" min={0} defaultValue={k.targets[m] ?? 0} aria-label={`Target ${k.kpiName} ${m}`}
                          className="w-14 rounded border border-line bg-cream/60 px-1 py-0.5 text-right text-xs text-charcoal-muted"
                          onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== (k.targets[m] ?? 0)) void onTarget(k, m, v); }} />
                        <span className="text-charcoal-muted">/</span>
                        <input type="number" step="any" min={0} defaultValue={k.actuals[m] ?? ''} placeholder="—" aria-label={`Actual ${k.kpiName} ${m}`}
                          className="w-14 rounded border border-line bg-white px-1 py-0.5 text-right text-xs"
                          onBlur={(e) => { const raw = e.target.value.trim(); const v = raw === '' ? null : parseFloat(raw); if (v === null ? k.actuals[m] !== undefined : Number.isFinite(v) && v !== k.actuals[m]) void onActual(k, m, v); }} />
                      </span>
                    ) : (
                      <span><span className="text-charcoal-muted">{fmtValue(k, k.targets[m])}</span> / {fmtValue(k, k.actuals[m])}</span>
                    )}
                  </td>
                ))}
                <td className="py-1.5 pr-3 text-right tabular-nums text-charcoal-muted">{fmtSum(k.sumTargets)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtSum(k.sumActuals)}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">{Math.round(k.score * 100) / 100}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-line">
            <tr>
              <td className="py-2 pr-3 font-medium">Total</td>
              <td className="py-2 pr-3 text-right tabular-nums font-medium">{card.totalWeight}</td>
              <td colSpan={card.months.length + 2} />
              <td className="py-2 text-right tabular-nums font-medium">{Math.round(card.kpis.reduce((a, k) => a + k.score, 0) * 100) / 100} · {pct(card.weightedScore)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {access.canEditActuals && <button className={btnGhost} onClick={addMonth}>+ Add month (extension)</button>}
          {access.canSetBreach && (
            <button className={card.criticalBreach ? 'rounded-lg bg-danger px-3 py-1.5 text-xs text-white hover:opacity-90' : btnGhost} onClick={toggleBreach}>
              {card.criticalBreach ? 'Critical breach flagged — clear' : 'Flag critical breach…'}
            </button>
          )}
          {access.canEditActuals && <span className="text-xs text-charcoal-muted">Actuals and targets save on blur.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-charcoal-muted">Final decision (CEO):</span>
          {access.canDecide ? (
            <select className="rounded-lg border border-line bg-white px-3 py-2 text-sm" value={card.finalDecision ?? ''} onChange={(e) => decide(e.target.value)} aria-label={`Final decision ${card.role}`}>
              <option value="">Not yet decided</option>
              {(Object.keys(PROBATION_DECISION_LABEL) as ProbationDecision[]).map((d) => <option key={d} value={d}>{PROBATION_DECISION_LABEL[d]}</option>)}
            </select>
          ) : (
            <span className="font-medium">{card.finalDecision ? PROBATION_DECISION_LABEL[card.finalDecision] : 'Not yet decided'}</span>
          )}
          {card.decidedAt && <span className="text-xs text-charcoal-muted">by {card.decidedByName ?? 'unknown'} · {when(card.decidedAt)}{card.finalDecisionNote ? ` — “${card.finalDecisionNote}”` : ''}</span>}
        </div>
      </div>
    </div>
  );
}

function nextMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
