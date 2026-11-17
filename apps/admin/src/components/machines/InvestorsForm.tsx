'use client';

import { useId, useRef, useState } from 'react';
import type { MachineDetailDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { money } from '../../lib/money';
import { Button } from '../ui/button';
import { DialogBody, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { describedField, field, Field, Refusal, useSave, Warning } from './FormParts';
import { blankInvestorRow, investorRowsFor, readInvestorsForm, type InvestorRow } from './forms';

/**
 * Who paid for a machine: every investor in one form, saved together as the
 * whole list. The rules live in `forms.ts`; this draws them. Offered only for
 * a machine with a price and no payment recorded.
 */
export function InvestorsForm({
  machine: m, onSaved, onClose,
}: {
  machine: MachineDetailDto;
  onSaved: (machine: MachineDetailDto) => void;
  onClose: () => void;
}) {
  const id = useId();
  const newRows = useRef(0);
  const newKey = () => `new-${(newRows.current += 1)}`;
  // A machine with no investors opens with one blank row to fill in.
  const [rows, setRows] = useState<InvestorRow[]>(() =>
    m.investors.length > 0 ? investorRowsFor(m.investors) : [blankInvestorRow(newKey())],
  );
  const { saving, refusal, save } = useSave<{ machine: MachineDetailDto }>((r) => { onSaved(r.machine); onClose(); });

  const form = readInvestorsForm(m, rows);

  const change = (key: string, patch: Partial<InvestorRow>) =>
    setRows((all) => all.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = form.input;
    if (!input) return;
    void save(() => api.replaceMachineInvestors(m.id, input), 'Could not save the investors. Try again.');
  };

  return (
    <form className="contents" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Investors</DialogTitle>
        <DialogDescription>
          The price is {money(m.priceCents)}. Each investor’s share is what they put in over the price, and the
          company keeps the part no investor covered.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-line px-4 py-6 text-center text-sm text-charcoal-muted">No investors.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => {
              const problems = form.problems[row.key] ?? {};
              const share = form.shares[row.key];
              const shareHint = share ? `${share} of the price` : undefined;
              const who = row.name.trim() || 'new investor';
              return (
                <li key={row.key} className="rounded-lg border border-border p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-start">
                    <Field id={`${id}-name-${row.key}`} label="Name" problem={problems.name}>
                      <input
                        {...describedField(`${id}-name-${row.key}`, problems.name)}
                        type="text"
                        autoComplete="off"
                        maxLength={200}
                        placeholder="e.g. Jane Mwangi"
                        className={field}
                        value={row.name}
                        onChange={(e) => change(row.key, { name: e.target.value })}
                      />
                    </Field>
                    <Field
                      id={`${id}-amount-${row.key}`}
                      label={<>Put in (KSh)<span className="sr-only"> by {who}</span></>}
                      problem={problems.amount}
                      hint={shareHint}
                    >
                      <input
                        {...describedField(`${id}-amount-${row.key}`, problems.amount, shareHint)}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="e.g. 156000"
                        className={`${field} text-right`}
                        value={row.amount}
                        onChange={(e) => change(row.key, { amount: e.target.value })}
                      />
                    </Field>
                    {/* Level with the fields, which sit under a one-line label. */}
                    <Button
                      type="button"
                      variant="ghost"
                      className="justify-self-start sm:mt-5"
                      onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
                    >
                      Remove<span className="sr-only"> {who}</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Button type="button" variant="outline" size="sm" onClick={() => setRows((all) => [...all, blankInvestorRow(newKey())])}>
          + Add an investor
        </Button>

        <Warning>{form.warning}</Warning>
      </DialogBody>

      <DialogFooter className="sm:items-center">
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            type="submit"
            disabled={saving || form.blockedReason !== null}
            aria-describedby={form.blockedReason ? `${id}-blocked` : undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {/* First in reading order from 640px, above the buttons below that. */}
        <div aria-live="polite" className="min-w-0 text-sm sm:order-first sm:mr-auto">
          <p className="font-medium">Investors’ total {money(form.totalCents)}</p>
          {form.companyLine && <p className="text-xs text-text-muted">{form.companyLine}</p>}
          {form.blockedReason && <p id={`${id}-blocked`} className="text-xs text-text-muted">{form.blockedReason}</p>}
        </div>
      </DialogFooter>
    </form>
  );
}
