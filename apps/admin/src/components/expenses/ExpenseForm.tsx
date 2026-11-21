'use client';

import { useId, useState } from 'react';
import type { CreateExpenseInput, ExpenseCategory, ExpenseDto } from '@onyxhawk/types';
import {
  DETAIL_NOT_KEPT,
  EXPENSE_UNITS,
  amountState,
  blankExpenseForm,
  detailNotKept,
  lineDetailText,
  readExpenseForm,
} from '../../lib/expenseLine';
import { money } from '../../lib/money';
import { refusalMessage } from '../project-money/PlacementPicker';

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  MATERIALS: 'Materials',
  TRANSPORT: 'Transport',
  EMPLOYEE_PAY: 'Employee pay',
  LUNCH: 'Lunch',
  MISCELLANEOUS: 'Miscellaneous',
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ExpenseCategory[];

function todayIso() { return new Date().toISOString().slice(0, 10); }

const LABEL = 'block text-xs text-text-muted mb-1';
const INPUT = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm';

/**
 * The form that adds one expense to a job: on the owner's Jobs & costs page
 * and on a supervisor's job report. An expense is either one amount typed by
 * hand, or a quantity and a price for one, whose amount is worked out here and
 * cannot be typed over. `onAdd` saves it and gives back what was saved; a
 * refusal it throws is shown under the form in the server's own words.
 */
export function ExpenseForm({ onAdd }: { onAdd: (input: CreateExpenseInput) => Promise<ExpenseDto> }) {
  const id = useId();
  const [form, setForm] = useState(() => blankExpenseForm(todayIso()));
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const set = (change: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...change }));
    setRefusal(null);
  };
  const amount = amountState(form);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const read = readExpenseForm(form);
    if ('error' in read) {
      setRefusal(read.error);
      return;
    }
    setSaving(true);
    setRefusal(null);
    try {
      const saved = await onAdd(read.input);
      setForm(blankExpenseForm(todayIso()));
      if (detailNotKept(read.input, saved)) setRefusal(DETAIL_NOT_KEPT);
    } catch (err) {
      setRefusal(refusalMessage(err, 'Could not add the expense. Check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="px-5 py-4 border-t border-border bg-bg-muted/30 grid grid-cols-2 md:grid-cols-4 gap-3"
    >
      <div>
        <label htmlFor={`${id}-category`} className={LABEL}>Category</label>
        <select
          id={`${id}-category`}
          className={INPUT}
          value={form.category}
          onChange={(e) => set({ category: e.target.value as ExpenseCategory })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-date`} className={LABEL}>Date</label>
        <input
          id={`${id}-date`}
          type="date"
          required
          className={INPUT}
          value={form.date}
          onChange={(e) => set({ date: e.target.value })}
        />
      </div>
      <div className="col-span-2">
        <label htmlFor={`${id}-item`} className={LABEL}>Item or description (optional)</label>
        <input
          id={`${id}-item`}
          type="text"
          maxLength={500}
          placeholder="e.g. Bleach, or Matatu to Karen"
          className={INPUT}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor={`${id}-quantity`} className={LABEL}>Quantity (optional)</label>
        <input
          id={`${id}-quantity`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 4"
          className={INPUT}
          value={form.quantity}
          onChange={(e) => set({ quantity: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${id}-unit`} className={LABEL}>Unit (optional)</label>
        <input
          id={`${id}-unit`}
          type="text"
          maxLength={30}
          list={`${id}-units`}
          autoComplete="off"
          placeholder="e.g. litres"
          className={INPUT}
          value={form.unit}
          onChange={(e) => set({ unit: e.target.value })}
        />
        <datalist id={`${id}-units`}>
          {EXPENSE_UNITS.map((u) => <option key={u} value={u} />)}
        </datalist>
      </div>
      <div>
        <label htmlFor={`${id}-price`} className={LABEL}>Price for one (KSh)</label>
        <input
          id={`${id}-price`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 250"
          className={INPUT}
          value={form.priceKes}
          onChange={(e) => set({ priceKes: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${id}-amount`} className={LABEL}>
          {amount.kind === 'typed' ? 'Amount (KSh)' : 'Amount (worked out)'}
        </label>
        {amount.kind === 'typed' ? (
          <input
            id={`${id}-amount`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 200"
            className={INPUT}
            value={form.amountKes}
            onChange={(e) => set({ amountKes: e.target.value })}
          />
        ) : (
          // Quantity times price: shown, never typed, so the two cannot disagree.
          <output
            id={`${id}-amount`}
            htmlFor={`${id}-quantity ${id}-price`}
            className={`${INPUT} block bg-bg-muted font-medium tabular-nums`}
          >
            {amount.kind === 'worked' ? money(amount.cents) : '—'}
          </output>
        )}
      </div>
      <p className="col-span-full -mt-1 text-xs text-text-muted">
        {amount.kind === 'worked'
          ? `${lineDetailText({ ...amount, unit: form.unit.trim() })} = ${money(amount.cents)}`
          : 'Bought by the piece? Fill in the quantity and the price for one, and the amount is worked out for you. For a single sum, leave them empty and type the amount.'}
      </p>

      <div className="col-span-2">
        <label htmlFor={`${id}-receipt`} className={LABEL}>Receipt number (optional)</label>
        <input
          id={`${id}-receipt`}
          type="text"
          maxLength={200}
          autoComplete="off"
          placeholder="M-Pesa code or receipt no."
          className={INPUT}
          value={form.receiptRef}
          onChange={(e) => set({ receiptRef: e.target.value })}
        />
      </div>
      <div className="col-span-2 flex items-end justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-navy text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Adding…' : '+ Add expense'}
        </button>
      </div>
      {refusal && <p role="alert" className="col-span-full text-sm text-danger">{refusal}</p>}
    </form>
  );
}
