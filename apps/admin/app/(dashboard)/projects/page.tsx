'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  ClientSegment,
  PaymentFrequency,
  ProjectCheckDto,
  ProjectDto,
  ProjectEventDto,
  ProjectEventKind,
  ProjectStage,
} from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';

const STAGE_LABELS: Record<ProjectStage, string> = {
  ENQUIRY: 'Enquiry',
  SURVEY: 'Survey',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  SNAGGING: 'Snagging',
  COMPLETE: 'Complete',
  CANCELLED: 'Cancelled',
};
const STAGES = Object.keys(STAGE_LABELS) as ProjectStage[];
/** The live pipeline, in order. Complete and Cancelled sit outside it. */
const PIPELINE: ProjectStage[] = ['ENQUIRY', 'SURVEY', 'SCHEDULED', 'IN_PROGRESS', 'SNAGGING'];

const SEGMENT_LABELS: Record<ClientSegment, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  MEDICAL: 'Medical',
  DEVELOPER: 'Developer',
};
const SEGMENTS = Object.keys(SEGMENT_LABELS) as ClientSegment[];

const FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  ONE_OFF: 'One-off (whole job)',
  DAILY: 'Per day',
  WEEKLY: 'Per week',
  MONTHLY: 'Per month',
};
const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as PaymentFrequency[];

/** Short suffix for showing a rate inline, e.g. "KSh 45,000/month". */
const FREQUENCY_SUFFIX: Record<PaymentFrequency, string> = {
  ONE_OFF: '',
  DAILY: '/day',
  WEEKLY: '/week',
  MONTHLY: '/month',
};

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream-deep';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function money(cents: number) {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

/** Colour of the timeline dot, by what kind of change it was. */
const EVENT_TONE: Record<ProjectEventKind, string> = {
  CREATED: 'var(--chart-accent-deep)',
  STAGE_CHANGED: 'var(--chart-accent)',
  QUESTION_ANSWERED: 'var(--chart-positive)',
  QUESTION_ADDED: 'var(--chart-muted)',
  QUESTION_REMOVED: 'var(--chart-negative)',
  DETAILS_CHANGED: 'var(--chart-muted)',
  NOTE_CHANGED: 'var(--chart-muted)',
};

/** "3 minutes ago" for recent events, an absolute date once it stops mattering. */
function whenText(iso: string) {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return then.toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function stageTone(stage: ProjectStage) {
  if (stage === 'COMPLETE') return 'bg-success/10 text-success';
  if (stage === 'CANCELLED') return 'bg-danger/10 text-danger';
  if (stage === 'SNAGGING') return 'bg-warning/15 text-warning';
  return 'bg-cream-deep text-charcoal-muted';
}

/** Thin progress bar for a project's checklist completion. */
function ProgressBar({ percent, blocked }: { percent: number; blocked: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--chart-track)' }}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          backgroundColor: blocked ? 'var(--chart-negative)' : 'var(--chart-accent)',
        }}
      />
    </div>
  );
}

export default function ProjectsPage() {
  const session = useRequireAdmin();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [serviceLines, setServiceLines] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  /**
   * Answers save the instant they are clicked, with no submit step. That is only
   * trustworthy if it is visible, so every write reports itself here.
   */
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const [form, setForm] = useState({
    title: '', clientName: '', clientPhone: '', siteLocation: '',
    serviceLineCode: '', clientSegment: '' as '' | ClientSegment,
    startDate: todayIso(), targetEndDate: '', valueKes: '', notes: '',
    paymentFrequency: 'ONE_OFF' as PaymentFrequency,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects((await api.projects()).projects);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load projects (${err.status}).` : 'Could not load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    api.serviceLines().then((r) => setServiceLines(r.serviceLines)).catch(() => undefined);
  }, []);

  // Let the "Saved" tick fade back to the running count. A failure stays put —
  // that one has to be noticed.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.createProject({
        title: form.title.trim(),
        clientName: form.clientName.trim() || undefined,
        clientPhone: form.clientPhone.trim() || undefined,
        siteLocation: form.siteLocation.trim() || undefined,
        serviceLineCode: form.serviceLineCode || undefined,
        clientSegment: form.clientSegment || undefined,
        startDate: form.startDate || null,
        targetEndDate: form.targetEndDate || null,
        valueCents: form.valueKes ? Math.round(parseFloat(form.valueKes) * 100) : undefined,
        paymentFrequency: form.paymentFrequency,
        notes: form.notes.trim() || undefined,
      });
      setForm({ ...form, title: '', clientName: '', clientPhone: '', siteLocation: '', valueKes: '', notes: '' });
      setShowForm(false);
      setExpanded(res.project.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? `Could not create project (${err.status}).` : 'Could not create project.');
    } finally {
      setSaving(false);
    }
  };

  const patchProject = (updated: ProjectDto) =>
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));

  const answer = async (projectId: string, checkId: string, body: Parameters<typeof api.answerProjectCheck>[2]) => {
    setSaveState('saving');
    try {
      patchProject((await api.answerProjectCheck(projectId, checkId, body)).project);
      setSaveState('saved');
    } catch {
      setSaveState('failed');
      setError('Could not save that answer. Check your connection and click it again.');
    }
  };

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;

  const open = projects.filter((p) => p.stage !== 'COMPLETE' && p.stage !== 'CANCELLED');
  const closed = projects.filter((p) => p.stage === 'COMPLETE' || p.stage === 'CANCELLED');
  const shown = showClosed ? closed : open;
  const blocked = open.filter((p) => p.blockerCount > 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Projects</h1>
          <p className="mt-1 text-sm text-charcoal-muted">
            Each project carries a checklist of questions. Answering them is what moves the tracker.
          </p>
        </div>
        <button className={btn} onClick={() => { setShowForm((v) => !v); setError(null); }}>
          {showForm ? 'Cancel' : '+ New project'}
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      {blocked.length > 0 && !showClosed && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-medium text-warning">
            {blocked.length} project{blocked.length === 1 ? '' : 's'} with unresolved answers
          </span>
          <span className="text-charcoal-muted"> — {blocked.map((p) => p.title).join(', ')}</span>
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => void create(e)} className="mb-6 grid gap-3 rounded-xl border border-gold-bright/40 bg-gold-bright/[0.06] p-5 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-charcoal-muted">Project title</label>
            <input required className={input} value={form.title} placeholder="e.g. Post-construction clean — Riverside Block C"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Service line</label>
            <select className={input} value={form.serviceLineCode}
              onChange={(e) => setForm((f) => ({ ...f, serviceLineCode: e.target.value }))}>
              <option value="">Unclassified</option>
              {serviceLines.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Client</label>
            <input className={input} value={form.clientName}
              onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Client phone</label>
            <input className={input} value={form.clientPhone}
              onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Segment</label>
            <select className={input} value={form.clientSegment}
              onChange={(e) => setForm((f) => ({ ...f, clientSegment: e.target.value as '' | ClientSegment }))}>
              <option value="">Unspecified</option>
              {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-charcoal-muted">Site location</label>
            <input className={input} value={form.siteLocation} placeholder="e.g. Westlands"
              onChange={(e) => setForm((f) => ({ ...f, siteLocation: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Payment</label>
            <select className={input} value={form.paymentFrequency}
              onChange={(e) => setForm((f) => ({ ...f, paymentFrequency: e.target.value as PaymentFrequency }))}>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">
              {form.paymentFrequency === 'ONE_OFF' ? 'Agreed value (KSh)' : `Rate (KSh${FREQUENCY_SUFFIX[form.paymentFrequency]})`}
            </label>
            <input type="number" min="0" className={input} value={form.valueKes}
              onChange={(e) => setForm((f) => ({ ...f, valueKes: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Start date</label>
            <input type="date" className={input} value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Target completion</label>
            <input type="date" className={input} value={form.targetEndDate}
              onChange={(e) => setForm((f) => ({ ...f, targetEndDate: e.target.value }))} />
          </div>
          <div className="sm:col-span-3">
            <label className="mb-1 block text-xs text-charcoal-muted">Notes</label>
            <input className={input} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <p className="text-xs text-charcoal-muted sm:col-span-2">
            A standard 14-question checklist is added automatically — survey, quote, resourcing, on site, handover and
            closing. You can add your own questions to any project afterwards.
          </p>
          <div className="flex items-end justify-end sm:col-span-1">
            <button type="submit" disabled={saving} className={btn}>{saving ? 'Creating…' : 'Create project'}</button>
          </div>
        </form>
      )}

      <div className="mb-4 flex gap-1 border-b border-line">
        <button
          onClick={() => setShowClosed(false)}
          className={`border-b-2 px-4 py-2 text-sm ${!showClosed ? 'border-gold-deep font-medium text-gold-deep' : 'border-transparent text-charcoal-muted hover:text-charcoal'}`}
        >
          Open ({open.length})
        </button>
        <button
          onClick={() => setShowClosed(true)}
          className={`border-b-2 px-4 py-2 text-sm ${showClosed ? 'border-gold-deep font-medium text-gold-deep' : 'border-transparent text-charcoal-muted hover:text-charcoal'}`}
        >
          Closed ({closed.length})
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">
          {showClosed ? 'No closed projects yet.' : <>No open projects. Click <strong>+ New project</strong> to start one.</>}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              expanded={expanded === p.id}
              onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
              onStage={async (stage) => {
                setSaveState('saving');
                try {
                  patchProject((await api.updateProject(p.id, { stage })).project);
                  setSaveState('saved');
                } catch { setSaveState('failed'); setError('Could not change the stage.'); }
              }}
              onAnswer={(checkId, body) => void answer(p.id, checkId, body)}
              saveState={saveState}
              onAddQuestion={async () => {
                if (!newQuestion.trim()) return;
                setSaveState('saving');
                try {
                  patchProject((await api.addProjectCheck(p.id, { question: newQuestion.trim() })).project);
                  setNewQuestion('');
                  setSaveState('saved');
                } catch { setSaveState('failed'); setError('Could not add that question.'); }
              }}
              newQuestion={newQuestion}
              setNewQuestion={setNewQuestion}
              onDelete={async () => {
                if (!confirm(`Delete "${p.title}" and its checklist?`)) return;
                try { await api.deleteProject(p.id); await load(); }
                catch { setError('Could not delete the project.'); }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The project's history, fetched the first time the log tab is opened. */
function ActivityLog({ projectId, reloadKey }: { projectId: string; reloadKey: number }) {
  const [events, setEvents] = useState<ProjectEventDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    api
      .projectEvents(projectId)
      .then((r) => { if (live) setEvents(r.events); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [projectId, reloadKey]);

  if (failed) return <p className="py-6 text-center text-sm text-danger">Could not load the history.</p>;
  if (!events) return <p className="py-6 text-center text-sm text-charcoal-muted">Loading history…</p>;
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-charcoal-muted">
        Nothing recorded yet. Every answer, stage move and edit from here on will be listed.
      </p>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-cream"
            style={{ backgroundColor: EVENT_TONE[e.kind] }}
          />
          <p className="text-sm text-charcoal">{e.summary}</p>
          {e.detail && <p className="mt-0.5 text-xs text-charcoal-muted">{e.detail}</p>}
          <p className="mt-0.5 text-xs text-charcoal-muted">
            {e.actorName ?? 'Unknown'} · {whenText(e.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function ProjectCard({
  project: p, expanded, onToggle, onStage, onAnswer, saveState, onAddQuestion, newQuestion, setNewQuestion, onDelete,
}: {
  project: ProjectDto;
  expanded: boolean;
  onToggle: () => void;
  onStage: (stage: ProjectStage) => void;
  onAnswer: (checkId: string, body: { answer?: boolean | null; notApplicable?: boolean; note?: string | null }) => void;
  saveState: 'idle' | 'saving' | 'saved' | 'failed';
  onAddQuestion: () => void;
  newQuestion: string;
  setNewQuestion: (v: string) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'questions' | 'log'>('questions');

  // Group the checklist by its section headings.
  const sections = new Map<string, ProjectCheckDto[]>();
  for (const c of p.checklist) {
    const key = c.section ?? 'Other';
    sections.set(key, [...(sections.get(key) ?? []), c]);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-charcoal">{p.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${stageTone(p.stage)}`}>{STAGE_LABELS[p.stage]}</span>
            {p.blockerCount > 0 && (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
                {p.blockerCount} unresolved
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-charcoal-muted">
            {p.clientName && <span>{p.clientName}</span>}
            {p.siteLocation && <span>· {p.siteLocation}</span>}
            {p.startDate && <span>· from {p.startDate}</span>}
            {p.targetEndDate && <span>· due {p.targetEndDate}</span>}
            {typeof p.valueCents === 'number' && (
              <span className="font-medium text-charcoal">
                · {money(p.valueCents)}
                {FREQUENCY_SUFFIX[p.paymentFrequency]}
              </span>
            )}
            {/* Show the working, so the estimate is never a mystery number. */}
            {typeof p.estimatedTotalCents === 'number' && p.billingPeriods ? (
              <span>
                · est. {money(p.estimatedTotalCents)} over {p.billingPeriods}{' '}
                {p.paymentFrequency === 'DAILY' ? 'day' : p.paymentFrequency === 'WEEKLY' ? 'week' : 'month'}
                {p.billingPeriods === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>

          <div className="mt-3 max-w-md">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-charcoal-muted">Checklist</span>
              <span className="tabular-nums font-medium text-charcoal">
                {p.answeredCount} of {p.checklistCount} answered · {p.progressPercent}%
              </span>
            </div>
            <ProgressBar percent={p.progressPercent} blocked={p.blockerCount > 0} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <select
            value={p.stage}
            onChange={(e) => onStage(e.target.value as ProjectStage)}
            className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
          >
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
          <button className={btnGhost} onClick={onToggle}>
            {expanded ? '▲ Hide' : `▼ Questions (${p.checklistCount})`}
          </button>
        </div>
      </div>

      {/* Stage pipeline — where the project sits, at a glance. */}
      <div className="flex flex-wrap gap-1 border-t border-line px-5 py-2">
        {PIPELINE.map((s) => {
          const idx = PIPELINE.indexOf(p.stage);
          const here = PIPELINE.indexOf(s);
          const done = idx > -1 && here <= idx;
          return (
            <span
              key={s}
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                done ? 'bg-gold-bright/20 text-bronze' : 'bg-cream-deep text-charcoal-muted'
              }`}
            >
              {STAGE_LABELS[s]}
            </span>
          );
        })}
      </div>

      {expanded && (
        <div className="border-t border-line bg-cream/40 px-5 py-4">
          <div className="mb-4 flex items-center gap-1 border-b border-line">
            <button
              onClick={() => setTab('questions')}
              className={`border-b-2 px-3 py-2 text-sm ${tab === 'questions' ? 'border-gold-deep font-medium text-gold-deep' : 'border-transparent text-charcoal-muted hover:text-charcoal'}`}
            >
              Questions ({p.checklistCount})
            </button>
            <button
              onClick={() => setTab('log')}
              className={`border-b-2 px-3 py-2 text-sm ${tab === 'log' ? 'border-gold-deep font-medium text-gold-deep' : 'border-transparent text-charcoal-muted hover:text-charcoal'}`}
            >
              Activity log ({p.eventCount})
            </button>
          </div>

          {tab === 'log' ? (
            <ActivityLog projectId={p.id} reloadKey={p.eventCount} />
          ) : (
        <>
          {/* Answers write straight to the server, so say so — an admin who
              expects a submit button will otherwise assume nothing was kept. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-4 py-2 text-xs">
            <span className="text-charcoal-muted">
              Answers save the moment you click. There is nothing to submit.
            </span>
            <span
              className={
                saveState === 'failed' ? 'font-medium text-danger'
                : saveState === 'saving' ? 'text-charcoal-muted'
                : saveState === 'saved' ? 'font-medium text-success'
                : 'text-charcoal-muted'
              }
            >
              {saveState === 'saving' ? 'Saving…'
                : saveState === 'saved' ? '✓ Saved'
                : saveState === 'failed' ? '⚠ Not saved — try again'
                : `${p.answeredCount} of ${p.checklistCount} saved`}
            </span>
          </div>

          {[...sections.entries()].map(([section, items]) => (
            <div key={section} className="mb-4 last:mb-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">{section}</p>
              <ul className="space-y-2">
                {items.map((c) => (
                  <li key={c.id} className="rounded-lg border border-line bg-white px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-charcoal">{c.question}</p>
                        {c.answeredByName && c.answeredAt && (
                          <p className="mt-0.5 text-xs text-charcoal-muted">
                            {c.notApplicable ? 'Marked N/A' : c.answer ? 'Confirmed' : 'Flagged'} by {c.answeredByName} ·{' '}
                            {new Date(c.answeredAt).toLocaleDateString('en-KE')}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => onAnswer(c.id, { answer: true, notApplicable: false })}
                          className={`rounded-lg px-2.5 py-1 text-xs ${
                            c.answer === true && !c.notApplicable
                              ? 'bg-success text-white'
                              : 'border border-line text-charcoal-muted hover:bg-cream-deep'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => onAnswer(c.id, { answer: false, notApplicable: false })}
                          className={`rounded-lg px-2.5 py-1 text-xs ${
                            c.answer === false && !c.notApplicable
                              ? 'bg-danger text-white'
                              : 'border border-line text-charcoal-muted hover:bg-cream-deep'
                          }`}
                        >
                          No
                        </button>
                        <button
                          onClick={() => onAnswer(c.id, { notApplicable: true, answer: null })}
                          className={`rounded-lg px-2.5 py-1 text-xs ${
                            c.notApplicable
                              ? 'bg-charcoal text-white'
                              : 'border border-line text-charcoal-muted hover:bg-cream-deep'
                          }`}
                        >
                          N/A
                        </button>
                      </div>
                    </div>

                    {c.answer === false && !c.notApplicable && (
                      <input
                        defaultValue={c.note ?? ''}
                        placeholder="What is outstanding?"
                        onBlur={(e) => onAnswer(c.id, { note: e.target.value.trim() || null })}
                        className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="mt-4 flex gap-2 border-t border-line pt-4">
            <input
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddQuestion(); } }}
              placeholder="Add a question specific to this project"
              className={input}
            />
            <button onClick={onAddQuestion} className={btn}>Add</button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <button onClick={() => setTab('log')} className={btnGhost}>View activity log</button>
            <button onClick={onToggle} className={btn}>Done</button>
          </div>
        </>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-charcoal-muted">
            <span>Created by {p.createdByName ?? 'unknown'} · {new Date(p.createdAt).toLocaleDateString('en-KE')}</span>
            <button onClick={onDelete} className="text-danger hover:underline">Delete project</button>
          </div>
        </div>
      )}
    </div>
  );
}
