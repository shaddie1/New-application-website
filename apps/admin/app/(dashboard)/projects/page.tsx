'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClientSegment, ProjectCheckDto, ProjectDto, ProjectStage } from '@onyxhawk/types';

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

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream-deep';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function money(cents: number) {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
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

  const [form, setForm] = useState({
    title: '', clientName: '', clientPhone: '', siteLocation: '',
    serviceLineCode: '', clientSegment: '' as '' | ClientSegment,
    startDate: todayIso(), targetEndDate: '', valueKes: '', notes: '',
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
    try {
      patchProject((await api.answerProjectCheck(projectId, checkId, body)).project);
    } catch {
      setError('Could not save that answer.');
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
            <label className="mb-1 block text-xs text-charcoal-muted">Agreed value (KSh)</label>
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
                try { patchProject((await api.updateProject(p.id, { stage })).project); }
                catch { setError('Could not change the stage.'); }
              }}
              onAnswer={(checkId, body) => void answer(p.id, checkId, body)}
              onAddQuestion={async () => {
                if (!newQuestion.trim()) return;
                try {
                  patchProject((await api.addProjectCheck(p.id, { question: newQuestion.trim() })).project);
                  setNewQuestion('');
                } catch { setError('Could not add that question.'); }
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

function ProjectCard({
  project: p, expanded, onToggle, onStage, onAnswer, onAddQuestion, newQuestion, setNewQuestion, onDelete,
}: {
  project: ProjectDto;
  expanded: boolean;
  onToggle: () => void;
  onStage: (stage: ProjectStage) => void;
  onAnswer: (checkId: string, body: { answer?: boolean | null; notApplicable?: boolean; note?: string | null }) => void;
  onAddQuestion: () => void;
  newQuestion: string;
  setNewQuestion: (v: string) => void;
  onDelete: () => void;
}) {
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
            {typeof p.valueCents === 'number' && <span>· {money(p.valueCents)}</span>}
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
              placeholder="Add a question specific to this project"
              className={input}
            />
            <button onClick={onAddQuestion} className={btn}>Add</button>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-charcoal-muted">
            <span>Created by {p.createdByName ?? 'unknown'} · {new Date(p.createdAt).toLocaleDateString('en-KE')}</span>
            <button onClick={onDelete} className="text-danger hover:underline">Delete project</button>
          </div>
        </div>
      )}
    </div>
  );
}
