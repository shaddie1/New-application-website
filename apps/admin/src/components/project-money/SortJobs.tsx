'use client';

import { useCallback, useEffect, useState } from 'react';
import type { JobPlaceInput, UnsortedJobDto } from '@onyxhawk/types';
import { api } from '../../lib/api';
import { PlacementPicker, refusalMessage, type PlacementProject } from './PlacementPicker';

const LOAD_FAILED = 'Could not load the jobs to sort.';
const SAVED_BUT_NOT_RELOADED = 'Your choice was saved, but the list could not be reloaded.';

function fmt(cents: number) {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
}

/** A row's starting choice: the contract the server suggests, which it does only when exactly one matches. */
function suggestedPlace(job: UnsortedJobDto): JobPlaceInput | null {
  return job.suggestedProjectId ? { placement: 'PROJECT', projectId: job.suggestedProjectId } : null;
}

/**
 * The page's contracts plus any match the page has not loaded. A suggestion is
 * pre-picked, so its contract must be in the picker for the owner to see what
 * "Save" will do.
 */
function withMatches(projects: PlacementProject[], job: UnsortedJobDto): PlacementProject[] {
  const missing = job.matches.filter((m) => !projects.some((p) => p.id === m.projectId));
  if (missing.length === 0) return projects;
  return [
    ...projects,
    ...missing.map((m) => ({ id: m.projectId, title: m.title, clientName: m.clientName, stage: m.stage })),
  ];
}

function matchNote(job: UnsortedJobDto): string | null {
  if (job.matches.length > 1) {
    return `${job.matches.length} contracts match this client. They are listed first.`;
  }
  const only = job.matches[0];
  if (!only || job.suggestedProjectId !== only.projectId) return null;
  const reason = only.by === 'PHONE' ? 'same client phone number' : 'same client name';
  return `Suggested: ${only.title} (${reason}). Not saved until you press Save.`;
}

/**
 * Every job not yet under a contract or marked one-off, oldest first. Each row
 * is saved on its own, or several are ticked and placed together. Nothing is
 * saved by choosing: a job is placed only when "Save" or "Place N jobs" is pressed.
 */
export function SortJobs({
  projects, onCountChange,
}: {
  projects: PlacementProject[];
  /** Told how many jobs remain after every load. Pass a stable function, such as a state setter. */
  onCountChange: (count: number) => void;
}) {
  // null until the first load finishes, and again after a load fails.
  const [jobs, setJobs] = useState<UnsortedJobDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Only what the owner chose by hand; a row without an entry shows its suggestion.
  const [choices, setChoices] = useState<Record<string, JobPlaceInput>>({});
  const [ticked, setTicked] = useState<string[]>([]);
  const [sharedPlace, setSharedPlace] = useState<JobPlaceInput | null>(null);
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [placingTicked, setPlacingTicked] = useState(false);
  const [rowRefusal, setRowRefusal] = useState<{ jobId: string; message: string } | null>(null);
  const [tickedRefusal, setTickedRefusal] = useState<string | null>(null);

  const load = useCallback(async (failureMessage: string) => {
    setLoadError(null);
    try {
      const res = await api.unsortedJobs();
      setJobs(res.jobs);
      onCountChange(res.jobs.length);
    } catch {
      setJobs(null);
      setLoadError(failureMessage);
    }
  }, [onCountChange]);

  useEffect(() => { void load(LOAD_FAILED); }, [load]);

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm">
        <p className="text-danger">{loadError}</p>
        <button
          type="button"
          onClick={() => void load(LOAD_FAILED)}
          className="mt-3 rounded-lg border border-border px-4 py-2 text-sm hover:bg-bg-muted"
        >
          Try again
        </button>
      </div>
    );
  }
  if (jobs === null) {
    return (
      <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
        Loading the jobs to sort…
      </div>
    );
  }
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
        Nothing left to sort
      </div>
    );
  }

  const busy = savingJobId !== null || placingTicked;
  // Read from the list, so a job that has left the list is never sent.
  const tickedIds = jobs.filter((j) => ticked.includes(j.jobId)).map((j) => j.jobId);

  const toggleTick = (jobId: string) => {
    setTickedRefusal(null);
    setTicked((prev) => (prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]));
  };

  const saveRow = async (job: UnsortedJobDto, place: JobPlaceInput) => {
    setSavingJobId(job.jobId);
    setRowRefusal(null);
    try {
      await api.placeJobs({ jobIds: [job.jobId], place });
    } catch (err) {
      setRowRefusal({ jobId: job.jobId, message: refusalMessage(err, 'Could not save this job.') });
      setSavingJobId(null);
      return;
    }
    await load(SAVED_BUT_NOT_RELOADED);
    setSavingJobId(null);
  };

  const placeTicked = async () => {
    if (!sharedPlace || tickedIds.length === 0) return;
    setPlacingTicked(true);
    setTickedRefusal(null);
    try {
      await api.placeJobs({ jobIds: tickedIds, place: sharedPlace });
    } catch (err) {
      setTickedRefusal(refusalMessage(err, 'Could not place these jobs.'));
      setPlacingTicked(false);
      return;
    }
    setTicked([]);
    setSharedPlace(null);
    await load(SAVED_BUT_NOT_RELOADED);
    setPlacingTicked(false);
  };

  return (
    <div>
      <p className="mb-3 text-sm text-text-muted">
        {jobs.length} job{jobs.length !== 1 ? 's' : ''} to sort, oldest first. Save one at a time, or tick several to place them together.
      </p>

      {tickedIds.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 rounded-xl border border-aqua/40 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-56 max-w-md">
              <PlacementPicker
                label={`Contract for the ${tickedIds.length} ticked job${tickedIds.length !== 1 ? 's' : ''}`}
                projects={projects}
                value={sharedPlace}
                onChange={(place) => { setSharedPlace(place); setTickedRefusal(null); }}
                disabled={busy}
              />
            </div>
            <button
              type="button"
              onClick={() => void placeTicked()}
              disabled={busy || !sharedPlace}
              className="rounded-lg bg-navy text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
            >
              {placingTicked ? 'Placing…' : `Place ${tickedIds.length} job${tickedIds.length !== 1 ? 's' : ''}`}
            </button>
          </div>
          {tickedRefusal && <p role="alert" className="mt-2 text-xs text-danger">{tickedRefusal}</p>}
        </div>
      )}

      <ul className="space-y-3">
        {jobs.map((job) => {
          const isTicked = ticked.includes(job.jobId);
          const choice = choices[job.jobId] ?? suggestedPlace(job);
          const note = isTicked ? 'Ticked: it goes where you choose for the ticked jobs.' : matchNote(job);
          return (
            <li
              key={job.jobId}
              className={`rounded-xl border bg-surface p-4 sm:p-5 ${isTicked ? 'border-aqua' : 'border-border'}`}
            >
              <div className="flex items-start gap-3">
                <label className="-m-2 shrink-0 p-2">
                  <input
                    type="checkbox"
                    className="block h-5 w-5"
                    checked={isTicked}
                    onChange={() => toggleTick(job.jobId)}
                    disabled={busy}
                    aria-label={`Tick ${job.title}, ${job.date}, to place it together with other jobs`}
                  />
                </label>
                <div className="min-w-0 flex-1 md:flex md:items-start md:gap-6">
                  <div className="min-w-0 md:flex-1">
                    <p className="font-medium text-base break-words">{job.title}</p>
                    <p className="mt-0.5 text-xs text-text-muted break-words">
                      {job.date}{job.clientName ? ` · ${job.clientName}` : ''}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="text-text-muted text-xs">Charged </span>
                      <span className="font-medium">{fmt(job.chargedCents)}</span>
                    </p>
                  </div>
                  <div className="mt-3 min-w-0 md:mt-0 md:w-96 md:shrink-0">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-0 flex-1 basis-56">
                        <PlacementPicker
                          label={`Contract for ${job.title}, ${job.date}`}
                          projects={withMatches(projects, job)}
                          firstProjectIds={job.matches.map((m) => m.projectId)}
                          value={choice}
                          onChange={(place) => {
                            if (!place) return;
                            setChoices((prev) => ({ ...prev, [job.jobId]: place }));
                            if (rowRefusal?.jobId === job.jobId) setRowRefusal(null);
                          }}
                          disabled={busy || isTicked}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => { if (choice) void saveRow(job, choice); }}
                        disabled={busy || isTicked || !choice}
                        className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-bg-muted disabled:opacity-50"
                      >
                        {savingJobId === job.jobId ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                    {note && <p className="mt-1 text-xs text-text-muted break-words">{note}</p>}
                    {rowRefusal?.jobId === job.jobId && (
                      <p role="alert" className="mt-1 text-xs text-danger">{rowRefusal.message}</p>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
