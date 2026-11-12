'use client';

import { useId, useRef, useState } from 'react';
import type { ShareholderDto, ShareholderKind } from '@onyxhawk/types';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { refusalMessage } from '../project-money/PlacementPicker';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm-dialog';
import {
  Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  balanceText, blankRow, confirmationSummary, formatPercent, readStakesForm, rowsFor, type StakeRow,
} from './stakes';

const field = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm';
const fieldLabel = 'block text-xs text-text-muted mb-1';
const reason = 'mt-1 text-xs text-danger';

/**
 * The one place stakes change: every holder in one form, saved together and
 * only at exactly 100.00%. The rules live in `stakes.ts`; this draws them.
 */
export function EditStakes({
  open, onOpenChange, holders, onStakesChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current holders, in table order. Read when the form opens. */
  holders: ShareholderDto[];
  /**
   * Called when the stored stakes are no longer what the page shows: after a
   * save, and after a save refused because someone else changed them first.
   */
  onStakesChanged: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-2xl">
        {/* Mounted afresh each time the dialog opens, so it starts from the current holders. */}
        <StakesForm holders={holders} onStakesChanged={onStakesChanged} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function StakesForm({
  holders, onStakesChanged, onClose,
}: {
  holders: ShareholderDto[];
  onStakesChanged: () => void;
  onClose: () => void;
}) {
  const askConfirm = useConfirm();
  const id = useId();
  const newRows = useRef(0);
  const newKey = () => `new-${(newRows.current += 1)}`;
  // An empty cap table opens with one blank row to fill in.
  const startingRows = (current: ShareholderDto[]) => (current.length > 0 ? rowsFor(current) : [blankRow(newKey())]);

  // The holders the form opened with: what the server compares its stored stakes against.
  const [opened, setOpened] = useState(holders);
  const [rows, setRows] = useState<StakeRow[]>(() => startingRows(holders));
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set from the first press of Save until its answer, confirmation included.
  const busy = useRef(false);

  const form = readStakesForm(opened, rows);
  const balance = balanceText(form.balance);

  const change = (key: string, patch: Partial<StakeRow>) =>
    setRows((all) => all.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const loadCurrentStakes = async (sentence: string) => {
    try {
      const { shareholders } = await api.shareholders();
      setOpened(shareholders);
      setRows(startingRows(shareholders));
      setRefusal(`${sentence} This form now shows the current stakes.`);
    } catch {
      setRefusal(`${sentence} The current stakes could not be loaded. Close this form and open it again.`);
    }
    onStakesChanged();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = form.input;
    if (busy.current || !input) return;
    busy.current = true;
    try {
      const { changes, notes } = confirmationSummary(form.differences);
      const confirmed = await askConfirm({
        title: 'Save these stakes?',
        // Spans, not a list: the confirmation's description is one paragraph.
        description: (
          <>
            {changes.map((line, i) => <span key={`change-${i}`} className="block font-medium text-charcoal">{line}</span>)}
            {notes.map((line, i) => <span key={`note-${i}`} className="mt-2 block">{line}</span>)}
          </>
        ),
        confirmLabel: 'Save stakes',
        destructive: form.differences.some((d) => d.kind === 'removed'),
      });
      if (!confirmed) return;

      setSaving(true);
      setRefusal(null);
      try {
        await api.replaceStakes(input);
      } catch (err) {
        const sentence = refusalMessage(err, 'Could not save the stakes. Try again.');
        // Someone else saved first: nothing was written, and the form starts over from their stakes.
        if (err instanceof ApiError && err.status === 409) await loadCurrentStakes(sentence);
        else setRefusal(sentence);
        return;
      }
      onStakesChanged();
      onClose();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <form className="contents" onSubmit={(e) => void save(e)} noValidate>
      <DialogHeader>
        <DialogTitle>Edit stakes</DialogTitle>
        <DialogDescription>
          Stakes must add up to exactly 100%. Nothing changes until you save.
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        {refusal && (
          <div role="alert" className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{refusal}</div>
        )}

        <ul className="space-y-3">
          {rows.map((row) => {
            const problems = form.problems[row.key] ?? {};
            const stakeId = `${id}-stake-${row.key}`;
            const nameId = `${id}-name-${row.key}`;
            const who = row.name.trim() || 'new shareholder';

            const stakeField = (
              <div className="w-28 shrink-0">
                <label htmlFor={stakeId} className={fieldLabel}>
                  Stake (%)<span className="sr-only"> of {who}</span>
                </label>
                <input
                  id={stakeId}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="e.g. 30"
                  disabled={row.removed}
                  aria-invalid={problems.stake ? true : undefined}
                  aria-describedby={problems.stake ? `${stakeId}-reason` : undefined}
                  className={cn(field, 'text-right', row.removed && 'line-through opacity-60')}
                  value={row.stake}
                  onChange={(e) => change(row.key, { stake: e.target.value })}
                />
              </div>
            );

            return (
              <li key={row.key} className={cn('rounded-lg border border-border p-3', row.removed && 'bg-bg-muted/30')}>
                {row.id !== null ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1 self-center">
                      <p className={cn('font-medium', row.removed && 'text-text-muted line-through')}>{row.name}</p>
                      <p className="text-xs text-text-muted">
                        {row.removed
                          ? 'Will be removed when you save.'
                          : [row.title, row.kind === 'COMPANY' ? 'Company' : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {stakeField}
                    {row.removed ? (
                      <Button type="button" variant="outline" onClick={() => change(row.key, { removed: false })}>
                        Undo<span className="sr-only"> removing {row.name}</span>
                      </Button>
                    ) : (
                      <Button type="button" variant="ghost" onClick={() => change(row.key, { removed: true })}>
                        Remove<span className="sr-only"> {row.name}</span>
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={nameId} className={fieldLabel}>Name</label>
                      <input
                        id={nameId}
                        type="text"
                        autoComplete="off"
                        maxLength={200}
                        placeholder="e.g. Jane Mwangi"
                        aria-invalid={problems.name ? true : undefined}
                        aria-describedby={problems.name ? `${nameId}-reason` : undefined}
                        className={field}
                        value={row.name}
                        onChange={(e) => change(row.key, { name: e.target.value })}
                      />
                      {problems.name && <p id={`${nameId}-reason`} className={reason}>{problems.name}</p>}
                    </div>
                    <div>
                      <label htmlFor={`${id}-title-${row.key}`} className={fieldLabel}>Title (optional)</label>
                      <input
                        id={`${id}-title-${row.key}`}
                        type="text"
                        autoComplete="off"
                        maxLength={100}
                        placeholder="e.g. Director, COO"
                        className={field}
                        value={row.title}
                        onChange={(e) => change(row.key, { title: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`${id}-kind-${row.key}`} className={fieldLabel}>Type</label>
                        <select
                          id={`${id}-kind-${row.key}`}
                          className={field}
                          value={row.kind}
                          onChange={(e) => change(row.key, { kind: e.target.value as ShareholderKind })}
                        >
                          <option value="INDIVIDUAL">Individual</option>
                          <option value="COMPANY">Company</option>
                        </select>
                      </div>
                      {stakeField}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
                      >
                        Remove<span className="sr-only"> {who}</span>
                      </Button>
                    </div>
                  </div>
                )}
                {problems.stake && <p id={`${stakeId}-reason`} className={cn(reason, 'text-right')}>{problems.stake}</p>}
              </li>
            );
          })}
        </ul>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setRows((all) => [...all, blankRow(newKey())])}
        >
          + Add shareholder
        </Button>
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
        <div aria-live="polite" className="text-sm sm:order-first sm:mr-auto">
          <p className="font-medium">
            Total {formatPercent(form.totalBasisPoints)}
            {balance && <span className="text-warning"> · {balance}</span>}
          </p>
          {form.blockedReason && <p id={`${id}-blocked`} className="text-xs text-text-muted">{form.blockedReason}</p>}
        </div>
      </DialogFooter>
    </form>
  );
}
