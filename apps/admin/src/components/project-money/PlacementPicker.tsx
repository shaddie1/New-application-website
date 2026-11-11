'use client';

import { useId, useState } from 'react';
import type { JobDto, JobPlaceInput, ProjectDto, ProjectStage } from '@onyxhawk/types';
import { api, ApiError } from '../../lib/api';

const STAGE_LABELS: Record<ProjectStage, string> = {
  ENQUIRY: 'Enquiry',
  SURVEY: 'Survey',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  SNAGGING: 'Snagging',
  COMPLETE: 'Complete',
  CANCELLED: 'Cancelled',
};

const ONE_OFF = 'one-off';
const PROJECT_PREFIX = 'project:';

/** The projects a picker can choose from: only the fields it shows. */
export type PlacementProject = Pick<ProjectDto, 'id' | 'title' | 'clientName' | 'stage'>;

function isOpen(stage: ProjectStage) {
  return stage !== 'COMPLETE' && stage !== 'CANCELLED';
}

/** `firstIds` in the order given, then open-stage projects, then completed and cancelled ones. */
function orderProjects(projects: PlacementProject[], firstIds: string[]): PlacementProject[] {
  const first = firstIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is PlacementProject => p !== undefined);
  const rest = projects.filter((p) => !firstIds.includes(p.id));
  return [...first, ...rest.filter((p) => isOpen(p.stage)), ...rest.filter((p) => !isOpen(p.stage))];
}

function toOptionValue(value: JobPlaceInput | null): string {
  if (!value) return '';
  return value.placement === 'STANDALONE' ? ONE_OFF : `${PROJECT_PREFIX}${value.projectId}`;
}

function fromOptionValue(raw: string): JobPlaceInput | null {
  if (raw === ONE_OFF) return { placement: 'STANDALONE' };
  if (raw.startsWith(PROJECT_PREFIX)) return { placement: 'PROJECT', projectId: raw.slice(PROJECT_PREFIX.length) };
  return null;
}

/** The message the server sent with a refusal, or `fallback` when it sent none. */
export function refusalMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.payload && typeof err.payload === 'object') {
    const message = (err.payload as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

/** Where a job sits now, in the owner's words. */
export function placeLabel(job: Pick<JobDto, 'placement' | 'projectTitle'>): string {
  if (job.placement === 'PROJECT') return job.projectTitle ?? 'A contract';
  return job.placement === 'STANDALONE' ? 'One-off job' : 'Not yet sorted';
}

/**
 * Chooses a job's place: one contract, or one-off. Open contracts are listed
 * before completed and cancelled ones, and each shows its client and stage so
 * two contracts for one client can be told apart.
 */
export function PlacementPicker({
  projects, value, onChange, id, label = 'Contract', disabled, firstProjectIds = [],
}: {
  projects: PlacementProject[];
  value: JobPlaceInput | null;
  onChange: (value: JobPlaceInput | null) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
  /** Projects to list straight after "One-off job", in this order (for example, suggestions). */
  firstProjectIds?: string[];
}) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className="min-w-0">
      <label htmlFor={selectId} className="block text-xs text-text-muted mb-1">{label}</label>
      <select
        id={selectId}
        disabled={disabled}
        className="w-full min-w-0 rounded-lg border border-border bg-bg px-3 py-2 text-sm disabled:opacity-50"
        value={toOptionValue(value)}
        onChange={(e) => onChange(fromOptionValue(e.target.value))}
      >
        <option value="" disabled>Choose a contract…</option>
        <option value={ONE_OFF}>One-off job</option>
        {orderProjects(projects, firstProjectIds).map((p) => (
          <option key={p.id} value={`${PROJECT_PREFIX}${p.id}`}>
            {[p.title, p.clientName, STAGE_LABELS[p.stage]].filter(Boolean).join(' · ')}
          </option>
        ))}
      </select>
    </div>
  );
}

function samePlace(job: JobDto, place: JobPlaceInput): boolean {
  if (place.placement === 'STANDALONE') return job.placement === 'STANDALONE';
  return job.placement === 'PROJECT' && job.projectId === place.projectId;
}

/**
 * A job row's place and the control that moves it. Choosing a place moves
 * nothing: a move shifts money between contracts and cannot be undone, so it
 * happens only when "Move" is pressed.
 */
export function JobPlaceMover({
  job, projects, onMoved,
}: {
  job: JobDto;
  projects: PlacementProject[];
  onMoved: (job: JobDto) => void;
}) {
  const [choice, setChoice] = useState<JobPlaceInput | null>(null);
  const [moving, setMoving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const move = async () => {
    if (!choice) return;
    setMoving(true);
    setRefusal(null);
    try {
      const res = await api.updateJob(job.id, { place: choice });
      onMoved(res.job);
      setChoice(null);
    } catch (err) {
      setRefusal(refusalMessage(err, 'Could not move the job.'));
    } finally {
      setMoving(false);
    }
  };

  return (
    <div>
      <p className="text-xs text-text-muted">
        Contract:{' '}
        <span className={job.placement === 'UNSORTED' ? 'font-medium text-warning' : 'font-medium text-text'}>
          {placeLabel(job)}
        </span>
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56 max-w-md">
          <PlacementPicker
            label="Move to"
            projects={projects}
            value={choice}
            onChange={(next) => { setChoice(next); setRefusal(null); }}
            disabled={moving}
          />
        </div>
        <button
          type="button"
          onClick={() => void move()}
          disabled={moving || !choice || samePlace(job, choice)}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-bg-muted disabled:opacity-50"
        >
          {moving ? 'Moving…' : 'Move'}
        </button>
      </div>
      {refusal && <p role="alert" className="mt-1 text-xs text-danger">{refusal}</p>}
    </div>
  );
}
