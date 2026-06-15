'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ExpenseCategory, ExpenseDto, FinancialSummary } from '@onyxhawk/types';
import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  MATERIALS: 'Materials',
  TRANSPORT: 'Transport',
  EMPLOYEE_PAY: 'Employee pay',
  LUNCH: 'Lunch',
  MISCELLANEOUS: 'Miscellaneous',
};

const CATEGORIES: ExpenseCategory[] = [
  'MATERIALS',
  'TRANSPORT',
  'EMPLOYEE_PAY',
  'LUNCH',
  'MISCELLANEOUS',
];

function fmt(cents: number) {
  const kes = cents / 100;
  return `KSh ${kes.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function monthRange(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${pad(month)}-${lastDay}`;
  return { from, to };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function FinancialsPage() {
  const session = useRequireAdmin();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    category: ExpenseCategory;
    amountKes: string;
    description: string;
    date: string;
  }>({ category: 'MATERIALS', amountKes: '', description: '', date: todayIso() });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { from, to } = monthRange(year, month);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, expensesRes] = await Promise.all([
        api.financialSummary(from, to),
        api.expenses(from, to),
      ]);
      setSummary(summaryRes.summary);
      setExpenses(expensesRes.expenses);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load data (${err.status}).` : 'Could not load financials.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-KE', {
    month: 'long',
    year: 'numeric',
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountKes = parseFloat(form.amountKes);
    if (!amountKes || amountKes <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.createExpense({
        category: form.category,
        amountCents: Math.round(amountKes * 100),
        description: form.description.trim() || undefined,
        date: form.date,
      });
      setExpenses((prev) => [res.expense, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setSummary((prev) => {
        if (!prev) return prev;
        const added = res.expense.amountCents;
        return {
          ...prev,
          expensesByCategoryCents: {
            ...prev.expensesByCategoryCents,
            [form.category]: (prev.expensesByCategoryCents[form.category] ?? 0) + added,
          },
          totalExpensesCents: prev.totalExpensesCents + added,
          netCents: prev.netCents - added,
        };
      });
      setForm({ category: 'MATERIALS', amountKes: '', description: '', date: todayIso() });
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? `Save failed (${err.status}).` : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, amountCents: number, category: ExpenseCategory) => {
    setDeleting(id);
    try {
      await api.deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      setSummary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          expensesByCategoryCents: {
            ...prev.expensesByCategoryCents,
            [category]: Math.max(0, (prev.expensesByCategoryCents[category] ?? 0) - amountCents),
          },
          totalExpensesCents: Math.max(0, prev.totalExpensesCents - amountCents),
          netCents: prev.netCents + amountCents,
        };
      });
    } catch {
      setError('Could not delete expense.');
    } finally {
      setDeleting(null);
    }
  };

  if (session === undefined) {
    return <div className="text-text-muted">Loading…</div>;
  }
  if (!session) return null;
  if (!session.user.isOwner) {
    return <div className="rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">Owner access required.</div>;
  }

  const totalExpenses = summary?.totalExpensesCents ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>
          Financials
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg-muted"
          >
            ←
          </button>
          <span className="text-sm font-medium w-36 text-center">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg-muted"
          >
            →
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <SummaryCard label="Income" cents={summary?.incomeCents} color="text-success" loading={loading} />
        <SummaryCard label="Total expenses" cents={summary?.totalExpensesCents} color="text-danger" loading={loading} />
        <SummaryCard
          label="Net profit"
          cents={summary?.netCents}
          color={!summary || summary.netCents >= 0 ? 'text-success' : 'text-danger'}
          loading={loading}
          accent
        />
      </div>

      {/* Expense breakdown by category */}
      <div className="rounded-xl border border-border bg-surface mb-8">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-lg" style={{ fontFamily: 'Georgia, serif' }}>
            Expenses by category
          </h2>
        </div>
        <div className="divide-y divide-border">
          {CATEGORIES.map((cat) => {
            const amt = summary?.expensesByCategoryCents[cat] ?? 0;
            const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
            return (
              <div key={cat} className="px-5 py-3 flex items-center gap-4">
                <span className="text-sm text-text-muted" style={{ minWidth: '9rem' }}>
                  {CATEGORY_LABELS[cat]}
                </span>
                <div className="flex-1 h-2 bg-bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm font-medium" style={{ minWidth: '7rem', textAlign: 'right' }}>
                  {loading ? '—' : fmt(amt)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expense entries header + add button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg" style={{ fontFamily: 'Georgia, serif' }}>
          Expense entries
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Cancel' : '+ Add expense'}
        </button>
      </div>

      {/* Add expense form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="mb-4 rounded-xl border border-border bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div>
            <label className="block text-xs text-text-muted mb-1">Category</label>
            <select
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Amount (KSh)</label>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 500"
              required
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.amountKes}
              onChange={(e) => setForm((f) => ({ ...f, amountKes: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Date</label>
            <input
              type="date"
              required
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Description (optional)</label>
            <input
              type="text"
              placeholder="e.g. Cleaning supplies"
              maxLength={500}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="col-span-full flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gold-deep text-white px-5 py-2 text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving…' : 'Save expense'}
            </button>
          </div>
        </form>
      )}

      {/* Expense list */}
      {loading ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
          Loading…
        </div>
      ) : expenses.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
          No expenses recorded for {monthLabel}.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-xs uppercase tracking-widest">
                <th className="px-5 py-3 text-left font-normal">Date</th>
                <th className="px-5 py-3 text-left font-normal">Category</th>
                <th className="px-5 py-3 text-left font-normal">Description</th>
                <th className="px-5 py-3 text-right font-normal">Amount</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-bg-muted/50">
                  <td className="px-5 py-3 text-text-muted">{e.date}</td>
                  <td className="px-5 py-3">{CATEGORY_LABELS[e.category]}</td>
                  <td className="px-5 py-3 text-text-muted">{e.description ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-medium">{fmt(e.amountCents)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => void handleDelete(e.id, e.amountCents, e.category)}
                      disabled={deleting === e.id}
                      className="text-danger text-xs hover:underline disabled:opacity-40"
                    >
                      {deleting === e.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  cents,
  color,
  loading,
  accent,
}: {
  label: string;
  cents?: number;
  color?: string;
  loading?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        accent ? 'border-gold bg-gold-soft/20' : 'border-border bg-surface'
      }`}
    >
      <p className="text-text-muted text-xs uppercase tracking-widest">{label}</p>
      <p className={`mt-2 text-3xl ${color ?? ''}`} style={{ fontFamily: 'Georgia, serif' }}>
        {loading || cents === undefined ? '—' : fmt(cents)}
      </p>
    </div>
  );
}
