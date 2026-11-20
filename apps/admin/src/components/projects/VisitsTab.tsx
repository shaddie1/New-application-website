'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProjectDto, ProjectKind, ProjectVisitDto } from '@onyxhawk/types';

import { api, ApiError } from '../../lib/api';
import { addDays, nairobiToday, scheduleFormOf, scheduleInput, type ScheduleForm } from '../../lib/projectSchedule';
import { refusalMessage } from '../project-money/PlacementPicker';
import { Segmented } from '../ui/segmented';
import { ScheduleFields } from './ScheduleFields';
import { VisitRow } from './VisitRow';

/** How far back and ahead the tab lists visits. The server answers at most 93 days at once. */
const DAYS_BACK = 28;
const DAYS_AHEAD = 63;

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-navy text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-mist';

/**
 * A project's schedule and its visits: the last four weeks and the next nine,
 * each with Done / Skipped buttons, and a form to change the schedule.
 */
export function VisitsTab({ project: p, onProjectChanged }: { project: ProjectDto; onProjectChanged: (p: ProjectDto) => void }) {
  const [visits, setVisits] = useState<ProjectVisitDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);

  const today = nairobiToday();
  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await api.projectVisits(addDays(today, -DAYS_BACK), addDays(today, DAYS_AHEAD));
      setVisits(res.visits.filter((v) => v.projectId === p.id));
    } catch {
      setFailed(true);
    }
  }, [p.id, today]);

  // Reload when the schedule changes, which updatedAt follows.
  useEffect(() => { void load(); }, [load, p.updatedAt]);

  const replace = (v: ProjectVisitDto) =>
    setVisits((prev) => prev?.map((x) => (x.date === v.date ? v : x)) ?? prev);

  const past = (visits ?? []).filter((v) => v.date < today);
  const upcoming = (visits ?? []).filter((v) => v.date >= today);
  // Past visits nobody marked are the ones to catch up on, so they come first.
  const unmarkedPast = past.filter((v) => v.status === 'PLANNED');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-charcoal">{p.scheduleSummary}</p>
          <p className="mt-0.5 text-xs text-charcoal-muted">
            {p.kind === 'REPEATING'
              ? `From ${p.startDate ?? '—'}${p.targetEndDate ? ` to ${p.targetEndDate}` : ', until stopped'}`
              : p.startDate ? 'One visit, on the service date.' : 'Set a service date to plan the visit.'}
            {p.deepCleanPriceCents !== null && ` · deep clean KSh ${(p.deepCleanPriceCents / 100).toLocaleString('en-KE')}`}
          </p>
        </div>
        {!editing && <button type="button" className={btnGhost} onClick={() => setEditing(true)}>Change schedule</button>}
      </div>

      {editing && <ScheduleEditor project={p} onSaved={(u) => { onProjectChanged(u); setEditing(false); }} onCancel={() => setEditing(false)} />}

      {failed ? (
        <p className="py-4 text-center text-sm text-danger">
          Could not load the visits. <button type="button" className="underline" onClick={() => void load()}>Try again</button>
        </p>
      ) : visits === null ? (
        <p className="py-4 text-center text-sm text-charcoal-muted">Loading visits…</p>
      ) : (
        <>
          {unmarkedPast.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-warning">Not marked yet</p>
              <ul className="space-y-2">
                {unmarkedPast.map((v) => <VisitRow key={v.date} visit={v} showProject={false} onChanged={replace} />)}
              </ul>
            </section>
          )}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">Coming up (next 9 weeks)</p>
            {upcoming.length === 0 ? (
              <p className="rounded-lg border border-line bg-white px-4 py-4 text-center text-sm text-charcoal-muted">No visits planned in the next 9 weeks.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((v) => <VisitRow key={v.date} visit={v} showProject={false} onChanged={replace} />)}
              </ul>
            )}
          </section>
          {past.length > unmarkedPast.length && (
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">Last 4 weeks</p>
              <ul className="space-y-2">
                {past.filter((v) => v.status !== 'PLANNED').reverse().map((v) => (
                  <VisitRow key={v.date} visit={v} showProject={false} onChanged={replace} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Change a project's kind, dates and schedule. */
function ScheduleEditor({ project: p, onSaved, onCancel }: { project: ProjectDto; onSaved: (p: ProjectDto) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<ProjectKind>(p.kind);
  const [startDate, setStartDate] = useState(p.startDate ?? '');
  const [endDate, setEndDate] = useState(p.targetEndDate ?? '');
  const [form, setForm] = useState<ScheduleForm>(() => scheduleFormOf(p));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateProject(p.id, {
        ...scheduleInput(kind, form),
        startDate: startDate || null,
        targetEndDate: endDate || null,
      });
      onSaved(res.project);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? refusalMessage(err, 'Could not save the schedule.') : 'Could not save the schedule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-aqua/40 bg-white p-4">
      <Segmented
        legend="One-off or repeating"
        name={`kind-${p.id}`}
        options={[{ value: 'ONCE', label: 'One-off' }, { value: 'REPEATING', label: 'Repeating' }]}
        value={kind}
        onChange={setKind}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-charcoal-muted" htmlFor={`start-${p.id}`}>
            {kind === 'REPEATING' ? 'Contract starts' : 'Service date'}
          </label>
          <input id={`start-${p.id}`} type="date" className={input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-charcoal-muted" htmlFor={`end-${p.id}`}>
            {kind === 'REPEATING' ? 'Contract ends (blank: until stopped)' : 'Target completion'}
          </label>
          <input id={`end-${p.id}`} type="date" className={input} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      {kind === 'REPEATING' && <ScheduleFields value={form} onChange={setForm} startDate={startDate} endDate={endDate} />}
      {kind !== p.kind && (
        <p className="text-xs text-charcoal-muted">
          The questions stay as they are. Add or remove questions on the Questions tab if the new kind needs others.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onCancel}>Cancel</button>
        <button type="button" className={btn} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save schedule'}</button>
      </div>
    </div>
  );
}
