'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DeclaredPeriodDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { refusalMessage } from '../project-money/PlacementPicker';
import { Button } from '../ui/button';
import { DialogClose, DialogFooter } from '../ui/dialog';
import { declaredPeriodWarning, nairobiDay } from './forms';

/** The pieces the owner's forms on the Machines page share. */

export const field = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm disabled:opacity-60';
export const fieldLabel = 'mb-1 block text-xs text-text-muted';
const note = 'mt-1 text-xs text-text-muted';
const wrong = 'mt-1 text-xs text-danger';

/** Today on the Nairobi calendar, YYYY-MM-DD: what a form's date starts as. */
export function todayIso(): string {
  return nairobiDay(new Date());
}

/** The id and the attributes that tie an input to what is written under it. */
export function describedField(id: string, problem: string | null | undefined, hint?: ReactNode) {
  const described = [problem ? `${id}-reason` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ');
  return {
    id,
    'aria-invalid': problem ? (true as const) : undefined,
    'aria-describedby': described || undefined,
  };
}

/** A label, its field, and under it what is wrong with what was typed and the field's hint. */
export function Field({
  id, label, problem, hint, children,
}: {
  /** The input's id: pass the input `describedField(id, problem, hint)`. */
  id: string;
  label: ReactNode;
  problem?: string | null;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={fieldLabel}>{label}</label>
      {children}
      {problem && <p id={`${id}-reason`} className={wrong}>{problem}</p>}
      {hint && <p id={`${id}-hint`} className={note}>{hint}</p>}
    </div>
  );
}

/** Why the server refused, in its own words. */
export function Refusal({ children }: { children: string | null }) {
  if (!children) return null;
  return <div role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{children}</div>;
}

/** Something the owner should know before saving. It does not stop the save. */
export function Warning({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <div role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-charcoal">
      <span className="font-semibold">Before you save: </span>
      {children}
    </div>
  );
}

/** Cancel and the save button, which is off while its request is in flight. */
export function FormFooter({
  saving, disabled, label = 'Save',
}: {
  saving: boolean;
  /** Off for another reason: nothing to save yet, or a check still loading. */
  disabled?: boolean;
  label?: string;
}) {
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Cancel</Button>
      </DialogClose>
      <Button type="submit" disabled={saving || disabled}>{saving ? 'Saving…' : label}</Button>
    </DialogFooter>
  );
}

/**
 * One save at a time: a second press while the first request is in flight
 * does nothing. A refusal is kept in the server's words, or `fallback` when
 * the server gave none.
 */
export function useSave<T>(onSaved: (answer: T) => void) {
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const busy = useRef(false);

  const save = async (send: () => Promise<T>, fallback: string) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setRefusal(null);
    let answer: T;
    try {
      answer = await send();
    } catch (err) {
      setRefusal(refusalMessage(err, fallback));
      return;
    } finally {
      busy.current = false;
      setSaving(false);
    }
    onSaved(answer);
  };

  return { saving, refusal, save };
}

/**
 * The periods whose payout is already declared, for a form that has no job
 * picker of its own. They come with the machine's job picker. `checking` is
 * true until they have arrived or the request has failed.
 */
export function useDeclaredPeriods(machineId: string) {
  const [periods, setPeriods] = useState<DeclaredPeriodDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    api
      .machineJobs(machineId, '')
      .then((r) => { if (live) setPeriods(r.picker.declaredPeriods); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [machineId, attempt]);

  return { periods, failed, checking: periods === null && !failed, retry: () => setAttempt((a) => a + 1) };
}

/**
 * The warning for a date inside a declared payout's period (R30). When the
 * periods could not be loaded it says the check was not made, so no warning
 * is never mistaken for "not declared".
 */
export function DeclaredWarning({
  date, periods, failed, onRetry,
}: {
  /** The job's date or the hire's start date, YYYY-MM-DD. Blank while none is chosen. */
  date: string;
  periods: DeclaredPeriodDto[] | null;
  failed: boolean;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-sm">
        <span className="text-danger">Could not check whether this date is inside a declared payout.</span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button>
      </div>
    );
  }
  return <Warning>{periods ? declaredPeriodWarning(date, periods) : null}</Warning>;
}
