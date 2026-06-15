'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ExpenseCategory, ExpenseDto, FinancialSummary, JobDto } from '@onyxhawk/types';
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
  'MATERIALS', 'TRANSPORT', 'EMPLOYEE_PAY', 'LUNCH', 'MISCELLANEOUS',
];

function fmt(cents: number) {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
}

function monthRange(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${year}-${pad(month)}-01`;
  const to = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
  return { from, to };
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

const blankExpenseForm = () => ({
  category: 'TRANSPORT' as ExpenseCategory,
  amountKes: '',
  description: '',
  date: todayIso(),
});

export default function FinancialsPage() {
  const session = useRequireAdmin();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New job form
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobForm, setJobForm] = useState({ title: '', date: todayIso(), incomeKes: '', notes: '' });
  const [savingJob, setSavingJob] = useState(false);

  // Per-job expansion + expense form
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState(blankExpenseForm());
  const [savingExpense, setSavingExpense] = useState(false);

  // Deletion state
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  const { from, to } = monthRange(year, month);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, jobsRes] = await Promise.all([
        api.financialSummary(from, to),
        api.jobs(from, to),
      ]);
      setSummary(sumRes.summary);
      setJobs(jobsRes.jobs);
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
    month: 'long', year: 'numeric',
  });

  // ── Create job ─────────────────────────────────────────────────────────────
  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const incomeKes = parseFloat(jobForm.incomeKes);
    if (!jobForm.title.trim()) return;
    setSavingJob(true);
    setError(null);
    try {
      const res = await api.createJob({
        title: jobForm.title.trim(),
        date: jobForm.date,
        incomeCents: Math.round((incomeKes || 0) * 100),
        notes: jobForm.notes.trim() || undefined,
      });
      setJobs((prev) => [res.job, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setSummary((prev) => prev ? {
        ...prev,
        incomeCents: prev.incomeCents + res.job.incomeCents,
        netCents: prev.netCents + res.job.incomeCents,
      } : prev);
      setJobForm({ title: '', date: todayIso(), incomeKes: '', notes: '' });
      setShowJobForm(false);
      setExpandedJobId(res.job.id);
      setExpenseForm(blankExpenseForm());
    } catch (err) {
      setError(err instanceof ApiError ? `Could not save job (${err.status}).` : 'Could not save job.');
    } finally {
      setSavingJob(false);
    }
  };

  // ── Delete job ─────────────────────────────────────────────────────────────
  const handleDeleteJob = async (job: JobDto) => {
    if (!confirm(`Delete "${job.title}" and all its expenses?`)) return;
    setDeletingJobId(job.id);
    try {
      await api.deleteJob(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      setSummary((prev) => prev ? {
        ...prev,
        incomeCents: prev.incomeCents - job.incomeCents,
        totalExpensesCents: prev.totalExpensesCents - job.totalExpensesCents,
        netCents: prev.netCents - job.netCents,
      } : prev);
      if (expandedJobId === job.id) setExpandedJobId(null);
    } catch {
      setError('Could not delete job.');
    } finally {
      setDeletingJobId(null);
    }
  };

  // ── Add expense to job ─────────────────────────────────────────────────────
  const handleAddExpense = async (e: React.FormEvent, jobId: string) => {
    e.preventDefault();
    const amountKes = parseFloat(expenseForm.amountKes);
    if (!amountKes || amountKes <= 0) return;
    setSavingExpense(true);
    setError(null);
    try {
      const res = await api.addJobExpense(jobId, {
        category: expenseForm.category,
        amountCents: Math.round(amountKes * 100),
        description: expenseForm.description.trim() || undefined,
        date: expenseForm.date,
      });
      const newExpense = res.expense;
      setJobs((prev) => prev.map((j) => {
        if (j.id !== jobId) return j;
        const expenses = [newExpense, ...j.expenses];
        const totalExpensesCents = j.totalExpensesCents + newExpense.amountCents;
        return { ...j, expenses, totalExpensesCents, netCents: j.incomeCents - totalExpensesCents };
      }));
      setSummary((prev) => prev ? {
        ...prev,
        expensesByCategoryCents: {
          ...prev.expensesByCategoryCents,
          [newExpense.category]: (prev.expensesByCategoryCents[newExpense.category] ?? 0) + newExpense.amountCents,
        },
        totalExpensesCents: prev.totalExpensesCents + newExpense.amountCents,
        netCents: prev.netCents - newExpense.amountCents,
      } : prev);
      setExpenseForm(blankExpenseForm());
    } catch (err) {
      setError(err instanceof ApiError ? `Could not add expense (${err.status}).` : 'Could not add expense.');
    } finally {
      setSavingExpense(false);
    }
  };

  // ── Delete expense ─────────────────────────────────────────────────────────
  const handleDeleteExpense = async (jobId: string, expense: ExpenseDto) => {
    setDeletingExpenseId(expense.id);
    try {
      await api.deleteJobExpense(jobId, expense.id);
      setJobs((prev) => prev.map((j) => {
        if (j.id !== jobId) return j;
        const expenses = j.expenses.filter((ex) => ex.id !== expense.id);
        const totalExpensesCents = j.totalExpensesCents - expense.amountCents;
        return { ...j, expenses, totalExpensesCents, netCents: j.incomeCents - totalExpensesCents };
      }));
      setSummary((prev) => prev ? {
        ...prev,
        expensesByCategoryCents: {
          ...prev.expensesByCategoryCents,
          [expense.category]: Math.max(0, (prev.expensesByCategoryCents[expense.category] ?? 0) - expense.amountCents),
        },
        totalExpensesCents: Math.max(0, prev.totalExpensesCents - expense.amountCents),
        netCents: prev.netCents + expense.amountCents,
      } : prev);
    } catch {
      setError('Could not delete expense.');
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const toggleExpand = (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
    } else {
      setExpandedJobId(jobId);
      setExpenseForm(blankExpenseForm());
    }
  };

  if (session === undefined) return <div className="text-text-muted">Loading…</div>;
  if (!session) return null;
  if (!session.user.isOwner) {
    return <div className="rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">Owner access required.</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Financials</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg-muted">←</button>
          <span className="text-sm font-medium w-36 text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg-muted">→</button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
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

      {/* Jobs section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg" style={{ fontFamily: 'Georgia, serif' }}>Jobs — {monthLabel}</h2>
        <button
          onClick={() => { setShowJobForm((v) => !v); }}
          className="rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 transition-opacity"
        >
          {showJobForm ? 'Cancel' : '+ New job'}
        </button>
      </div>

      {/* New job form */}
      {showJobForm && (
        <form
          onSubmit={(e) => void handleCreateJob(e)}
          className="mb-4 rounded-xl border border-gold bg-gold-soft/10 p-5 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div className="col-span-2">
            <label className="block text-xs text-text-muted mb-1">Job title</label>
            <input
              type="text"
              required
              placeholder='e.g. "Sofa wash – Karen, Kilimani"'
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={jobForm.title}
              onChange={(e) => setJobForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Date</label>
            <input
              type="date"
              required
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={jobForm.date}
              onChange={(e) => setJobForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Income charged (KSh)</label>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 5000"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={jobForm.incomeKes}
              onChange={(e) => setJobForm((f) => ({ ...f, incomeKes: e.target.value }))}
            />
          </div>
          <div className="col-span-full">
            <label className="block text-xs text-text-muted mb-1">Notes (optional)</label>
            <input
              type="text"
              placeholder="e.g. 3-seater + 2-seater, paid cash"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={jobForm.notes}
              onChange={(e) => setJobForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="col-span-full flex justify-end">
            <button
              type="submit"
              disabled={savingJob}
              className="rounded-lg bg-gold-deep text-white px-5 py-2 text-sm hover:opacity-90 disabled:opacity-50"
            >
              {savingJob ? 'Saving…' : 'Create job'}
            </button>
          </div>
        </form>
      )}

      {/* Job list */}
      {loading ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
          No jobs recorded for {monthLabel}. Click <strong>+ New job</strong> to add one.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isExpanded = expandedJobId === job.id;
            const isDeleting = deletingJobId === job.id;
            return (
              <div key={job.id} className="rounded-xl border border-border bg-surface overflow-hidden">
                {/* Job header */}
                <div className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-base">{job.title}</span>
                      <span className="text-text-muted text-xs">{job.date}</span>
                    </div>
                    {job.notes && <p className="text-text-muted text-xs mt-0.5">{job.notes}</p>}
                    {/* Per-job P&L mini stats */}
                    <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                      <span>
                        <span className="text-text-muted text-xs">Income </span>
                        <span className="text-success font-medium">{fmt(job.incomeCents)}</span>
                      </span>
                      <span className="text-border">|</span>
                      <span>
                        <span className="text-text-muted text-xs">Expenses </span>
                        <span className="text-danger font-medium">{fmt(job.totalExpensesCents)}</span>
                      </span>
                      <span className="text-border">|</span>
                      <span>
                        <span className="text-text-muted text-xs">Net </span>
                        <span className={`font-medium ${job.netCents >= 0 ? 'text-success' : 'text-danger'}`}>
                          {fmt(job.netCents)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleExpand(job.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-bg-muted"
                    >
                      {isExpanded ? '▲ Hide' : '▼ Expenses'}
                    </button>
                    <button
                      onClick={() => void handleDeleteJob(job)}
                      disabled={isDeleting}
                      className="text-danger text-xs hover:underline disabled:opacity-40"
                    >
                      {isDeleting ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>

                {/* Expanded: expense list + add form */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Expense rows */}
                    {job.expenses.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-text-muted text-xs uppercase tracking-widest border-b border-border">
                            <th className="px-5 py-2 text-left font-normal">Date</th>
                            <th className="px-5 py-2 text-left font-normal">Category</th>
                            <th className="px-5 py-2 text-left font-normal">Description</th>
                            <th className="px-5 py-2 text-right font-normal">Amount</th>
                            <th className="px-5 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {job.expenses.map((ex) => (
                            <tr key={ex.id} className="hover:bg-bg-muted/40">
                              <td className="px-5 py-2 text-text-muted text-xs">{ex.date}</td>
                              <td className="px-5 py-2">{CATEGORY_LABELS[ex.category]}</td>
                              <td className="px-5 py-2 text-text-muted">{ex.description ?? '—'}</td>
                              <td className="px-5 py-2 text-right font-medium">{fmt(ex.amountCents)}</td>
                              <td className="px-5 py-2 text-right">
                                <button
                                  onClick={() => void handleDeleteExpense(job.id, ex)}
                                  disabled={deletingExpenseId === ex.id}
                                  className="text-danger text-xs hover:underline disabled:opacity-40"
                                >
                                  {deletingExpenseId === ex.id ? '…' : 'Delete'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="px-5 py-3 text-text-muted text-sm">No expenses yet.</p>
                    )}

                    {/* Add expense form */}
                    <form
                      onSubmit={(e) => void handleAddExpense(e, job.id)}
                      className="px-5 py-4 border-t border-border bg-bg-muted/30 grid grid-cols-2 md:grid-cols-4 gap-3"
                    >
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Category</label>
                        <select
                          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                          value={expenseForm.category}
                          onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Amount (KSh)</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="e.g. 200"
                          required
                          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                          value={expenseForm.amountKes}
                          onChange={(e) => setExpenseForm((f) => ({ ...f, amountKes: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Date</label>
                        <input
                          type="date"
                          required
                          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                          value={expenseForm.date}
                          onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Description (optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. Matatu to Karen"
                          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                          value={expenseForm.description}
                          onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-full flex justify-end">
                        <button
                          type="submit"
                          disabled={savingExpense}
                          className="rounded-lg bg-gold-deep text-white px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
                        >
                          {savingExpense ? 'Adding…' : '+ Add expense'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label, cents, color, loading, accent,
}: {
  label: string; cents?: number; color?: string; loading?: boolean; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? 'border-gold bg-gold-soft/20' : 'border-border bg-surface'}`}>
      <p className="text-text-muted text-xs uppercase tracking-widest">{label}</p>
      <p className={`mt-2 text-3xl ${color ?? ''}`} style={{ fontFamily: 'Georgia, serif' }}>
        {loading || cents === undefined ? '—' : fmt(cents)}
      </p>
    </div>
  );
}
