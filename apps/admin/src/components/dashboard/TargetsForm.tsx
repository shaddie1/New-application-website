'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { api, ApiError } from '../../lib/api';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { monthLabel, type YearMonth } from './month';
import { parseTargetsForm, targetsFormFields, type TargetsFormFields, type TargetValues } from './targets';

const FIELDS: { name: keyof TargetsFormFields; label: string; unit?: string; inputMode: 'decimal' | 'numeric' }[] = [
  { name: 'revenue', label: 'Revenue', unit: 'KSh', inputMode: 'decimal' },
  { name: 'netProfit', label: 'Net profit', unit: 'KSh', inputMode: 'decimal' },
  { name: 'jobs', label: 'Jobs completed', inputMode: 'numeric' },
];

/**
 * The one form for a month's three targets. It opens with what is saved, so
 * setting targets and editing them are the same form.
 */
export function TargetsForm({
  open, onOpenChange, month, values, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: YearMonth;
  /** The month's saved targets; null when it has none. */
  values: TargetValues | null;
  /** Called after a save, once the dialog has closed. */
  onSaved: () => void;
}) {
  const id = useId();
  const [fields, setFields] = useState<TargetsFormFields>(() => targetsFormFields(values));
  const [errors, setErrors] = useState<Partial<Record<keyof TargetsFormFields, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Every opening starts from what is saved, not from what was last typed.
  useEffect(() => {
    if (!open) return;
    setFields(targetsFormFields(values));
    setErrors({});
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A save the form refuses puts focus in the first field that is wrong. It
  // waits for the errors to be drawn, so the field is announced with its reason.
  const refused = useRef(false);
  useEffect(() => {
    if (!refused.current) return;
    refused.current = false;
    const first = FIELDS.find((field) => errors[field.name]);
    if (first) document.getElementById(`${id}-${first.name}`)?.focus();
  }, [errors, id]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseTargetsForm(fields);
    if (!parsed.ok) {
      refused.current = true;
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSaveError(null);
    setSaving(true);
    try {
      await api.setTarget({
        year: month.year,
        month: month.month,
        revenueTargetCents: parsed.targets.revenueCents,
        netProfitTargetCents: parsed.targets.netProfitCents,
        jobsTarget: parsed.targets.jobs,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? `Could not save the targets (${err.status}). Nothing was changed.`
          : 'Could not save the targets. Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The dialog itself opens with focus in the first field (Revenue) and
          hands it back to the button that opened it: see ui/dialog.tsx. */}
      <DialogContent>
        <form className="contents" onSubmit={(e) => void save(e)} noValidate>
          <DialogHeader>
            <DialogTitle>Monthly targets</DialogTitle>
            <DialogDescription>
              Targets for {monthLabel(month)}. Leave a field blank, or enter 0, for no target.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-5">
            {FIELDS.map((field) => {
              const inputId = `${id}-${field.name}`;
              const error = errors[field.name];
              return (
                <div key={field.name}>
                  <label htmlFor={inputId} className="block text-sm font-medium text-charcoal">
                    {field.label}
                    {field.unit && <span className="sr-only"> in Kenya shillings</span>}
                  </label>
                  {/* The unit sits inside the input's own box, so the box the
                      focus ring goes round is the whole field. */}
                  <div className="relative mt-1.5">
                    {field.unit && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-charcoal-muted"
                      >
                        {field.unit}
                      </span>
                    )}
                    <input
                      id={inputId}
                      type="text"
                      inputMode={field.inputMode}
                      autoComplete="off"
                      placeholder="No target"
                      value={fields[field.name]}
                      onChange={(e) => setFields((f) => ({ ...f, [field.name]: e.target.value }))}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${inputId}-error` : undefined}
                      className={`figure w-full rounded-lg border bg-bg py-2.5 pr-3 text-sm text-charcoal placeholder:text-charcoal-muted/70 ${
                        field.unit ? 'pl-12' : 'pl-3'
                      } ${error ? 'border-danger' : 'border-border'}`}
                    />
                  </div>
                  {error && (
                    <p id={`${inputId}-error`} className="mt-1.5 text-xs text-danger">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}

            {saveError && (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {saveError}
              </p>
            )}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save targets'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
