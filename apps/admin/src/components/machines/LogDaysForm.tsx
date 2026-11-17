'use client';

import { useEffect, useId, useState } from 'react';
import type { MachineDetailDto, MachineJobOptionDto, MachineJobPickerDto, MachineLineDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { money } from '../../lib/money';
import { formatDay } from '../ownership/wording';
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  DeclaredWarning, describedField, field, Field, fieldLabel, FormFooter, Refusal, useDeclaredPeriods, useSave, Warning,
} from './FormParts';
import { amountPreview, declaredPeriodWarning, fieldDays, parseDays } from './forms';
import { LoadFailed } from './MachineTable';
import { daysText } from './wording';

const DAYS_HINT = 'In halves: 0.5 is a morning, 2.5 is two and a half days.';

type Answer = { machine: MachineDetailDto };

/** A job as the picker lists it: its date, then its contract when it sits under one. */
const jobNote = (job: MachineJobOptionDto) => [formatDay(job.date), job.projectTitle].filter(Boolean).join(' · ');

/**
 * The days a machine worked on one of the company's jobs. The owner finds the
 * job, enters the days and sees the amount before saving. The line takes the
 * job's date, and the amount is a cost of that job.
 */
export function LogDaysForm({
  machine: m, onSaved, onClose,
}: {
  machine: MachineDetailDto;
  onSaved: (machine: MachineDetailDto) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  // The last answer stays on screen while the next search is on its way.
  const [picker, setPicker] = useState<MachineJobPickerDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Kept whole, so the job stays picked when a later search no longer lists it.
  const [picked, setPicked] = useState<MachineJobOptionDto | null>(null);
  const [days, setDays] = useState('');
  const [tried, setTried] = useState(false);
  const { saving, refusal, save } = useSave<Answer>((r) => { onSaved(r.machine); onClose(); });

  useEffect(() => {
    let live = true;
    setFailed(false);
    // The first list is asked for at once; a search waits for a pause in the typing.
    const timer = setTimeout(() => {
      api
        .machineJobs(m.id, search.trim())
        .then((r) => { if (live) setPicker(r.picker); })
        .catch(() => { if (live) setFailed(true); });
    }, search === '' ? 0 : 300);
    return () => { live = false; clearTimeout(timer); };
  }, [m.id, search, attempt]);

  // A machine has one line per job, so a job that has one is corrected, not logged again.
  const logged = new Map(m.lines.map((l) => [l.jobId, l]));

  const daysRead = parseDays(days);
  const jobProblem = tried && !picked ? 'Pick the job.' : null;
  const daysProblem = tried || days.trim() !== '' ? (daysRead.ok ? null : daysRead.reason) : null;
  const preview = amountPreview(days, m.dailyRateCents);
  const daysHint = preview ? `${preview}. It comes off the job’s profit and goes into the pot.` : DAYS_HINT;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!picked || !daysRead.ok) return;
    void save(
      () => api.logMachineDays(m.id, { jobId: picked.jobId, halfDays: daysRead.halfDays }),
      'Could not log the days. Try again.',
    );
  };

  return (
    <form className="contents" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Log days on a job</DialogTitle>
        <DialogDescription>
          {m.name} earns {money(m.dailyRateCents)} a day. Jobs you entered or approved, dated on or
          after {formatDay(m.startDay)}, can take its days.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>

        <Field id={`${id}-search`} label="Find the job">
          <input
            id={`${id}-search`}
            type="search"
            autoComplete="off"
            placeholder="Search by job or contract"
            className={field}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            // Enter here is the end of a search, not a press of "Log days".
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          />
        </Field>

        <fieldset aria-describedby={jobProblem ? `${id}-job-reason` : undefined}>
          <legend className={fieldLabel}>Job</legend>
          {failed ? (
            <LoadFailed what="the jobs" onRetry={() => setAttempt((a) => a + 1)} />
          ) : !picker ? (
            <p className="rounded-lg border border-border px-3 py-4 text-center text-sm text-charcoal-muted">Loading jobs…</p>
          ) : picker.jobs.length === 0 ? (
            <p className="rounded-lg border border-border px-3 py-4 text-center text-sm text-charcoal-muted">
              {search.trim() ? 'No job matches that search.' : 'No job can take this machine’s days yet.'}
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-border text-sm">
              {picker.jobs.map((job) => {
                const line = logged.get(job.jobId);
                return (
                  <li key={job.jobId} className="border-b border-line last:border-b-0">
                    <label className={`flex items-start gap-3 px-3 py-2 ${line ? 'opacity-60' : 'cursor-pointer hover:bg-mist'}`}>
                      <input
                        type="radio"
                        name={`${id}-job`}
                        className="mt-1"
                        disabled={line !== undefined}
                        checked={picked?.jobId === job.jobId}
                        onChange={() => setPicked(job)}
                      />
                      <span className="min-w-0">
                        <span className="block break-words font-medium">{job.title}</span>
                        <span className="block break-words text-xs text-text-muted">
                          {jobNote(job)}
                          {line && ` · Already has ${daysText(line.halfDays)}: edit that line instead`}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {picked && (
            <p className="mt-1 break-words text-xs text-charcoal">
              Picked: <span className="font-medium">{picked.title}</span>, {jobNote(picked)}
            </p>
          )}
          {jobProblem && <p id={`${id}-job-reason`} className="mt-1 text-xs text-danger">{jobProblem}</p>}
        </fieldset>

        <Field id={`${id}-days`} label="Days" problem={daysProblem} hint={daysHint}>
          <input
            {...describedField(`${id}-days`, daysProblem, daysHint)}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 2.5"
            className={field}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>

        {/* The declared periods come with the list of jobs, so they are here before a job can be picked. */}
        <Warning>{picked && picker ? declaredPeriodWarning(picked.date, picker.declaredPeriods) : null}</Warning>
      </DialogBody>

      <FormFooter saving={saving} label="Log days" />
    </form>
  );
}

/** Correct the days on a line. The line keeps its job and the rate it was logged at. */
export function EditDaysForm({
  machine: m, line, onSaved, onClose,
}: {
  machine: MachineDetailDto;
  line: MachineLineDto;
  onSaved: (machine: MachineDetailDto) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [days, setDays] = useState(fieldDays(line.halfDays));
  const declared = useDeclaredPeriods(m.id);
  const { saving, refusal, save } = useSave<Answer>((r) => { onSaved(r.machine); onClose(); });

  const daysRead = parseDays(days);
  const daysProblem = daysRead.ok ? null : daysRead.reason;
  const changed = daysRead.ok && daysRead.halfDays !== line.halfDays;
  const daysHint = amountPreview(days, line.rateCents) ?? DAYS_HINT;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!daysRead.ok || !changed) return;
    void save(() => api.editMachineDays(line.id, { halfDays: daysRead.halfDays }), 'Could not save the days. Try again.');
  };

  return (
    <form className="contents" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Edit days</DialogTitle>
        <DialogDescription>
          {line.jobTitle}, {formatDay(line.date)}. This line keeps the rate it was logged at, {money(line.rateCents)} a day.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>
        <Field id={`${id}-days`} label="Days" problem={daysProblem} hint={daysHint}>
          <input
            {...describedField(`${id}-days`, daysProblem, daysHint)}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={field}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>
        <DeclaredWarning date={line.date} periods={declared.periods} failed={declared.failed} onRetry={declared.retry} />
      </DialogBody>

      {/* Not saved until the declared payouts have been checked, so the warning is seen first. */}
      <FormFooter saving={saving} disabled={!changed || declared.checking} />
    </form>
  );
}
