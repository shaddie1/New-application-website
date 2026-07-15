'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AllTimeTotals,
  ExpenseCategory,
  ExpenseDto,
  FinancialSummary,
  JobDto,
  MonthlyTrendItem,
} from '@onyxhawk/types';
import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';

// How many months of history the Monthly trends tab can show at once.
const TREND_RANGES = [6, 12, 24];

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

type Tab = 'jobs' | 'submissions' | 'trends';

export default function FinancialsPage() {
  const session = useRequireAdmin();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>('jobs');

  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [pendingReports, setPendingReports] = useState<JobDto[]>([]);
  const [trends, setTrends] = useState<MonthlyTrendItem[]>([]);
  const [trendMonths, setTrendMonths] = useState(12);
  const [totals, setTotals] = useState<AllTimeTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New job form
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobForm, setJobForm] = useState({ title: '', date: todayIso(), incomeKes: '', discountKes: '', clientName: '', clientPhone: '', clientLocation: '', notes: '' });
  const [savingJob, setSavingJob] = useState(false);

  // Per-job expansion + expense form
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState(blankExpenseForm());
  const [savingExpense, setSavingExpense] = useState(false);

  // Deletion state
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const { from, to } = monthRange(year, month);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, jobsRes, reportsRes, trendsRes, totalsRes] = await Promise.all([
        api.financialSummary(from, to),
        api.jobs(from, to),
        api.pendingReports(),
        api.financialTrends(trendMonths),
        api.financialTotals(),
      ]);
      setSummary(sumRes.summary);
      setJobs(jobsRes.jobs);
      setPendingReports(reportsRes.reports);
      setTrends(trendsRes.trends);
      setTotals(totalsRes.totals);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load data (${err.status}).` : 'Could not load financials.');
    } finally {
      setLoading(false);
    }
  }, [from, to, trendMonths]);

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
        discountCents: Math.round((parseFloat(jobForm.discountKes) || 0) * 100),
        clientName: jobForm.clientName.trim() || undefined,
        clientPhone: jobForm.clientPhone.trim() || undefined,
        clientLocation: jobForm.clientLocation.trim() || undefined,
        notes: jobForm.notes.trim() || undefined,
      });
      setJobs((prev) => [res.job, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setSummary((prev) => prev ? {
        ...prev,
        incomeCents: prev.incomeCents + res.job.actualIncomeCents,
        netCents: prev.netCents + res.job.actualIncomeCents,
      } : prev);
      setJobForm({ title: '', date: todayIso(), incomeKes: '', discountKes: '', clientName: '', clientPhone: '', clientLocation: '', notes: '' });
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
        incomeCents: prev.incomeCents - job.actualIncomeCents,
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

  // ── Approve a pending submission ────────────────────────────────────────────
  const handleApprove = async (report: JobDto) => {
    setApprovingId(report.id);
    try {
      await api.approveReport(report.id);
      setPendingReports((prev) => prev.filter((r) => r.id !== report.id));
      // Reload the jobs list and summary to reflect the newly approved job
      const [sumRes, jobsRes] = await Promise.all([
        api.financialSummary(from, to),
        api.jobs(from, to),
      ]);
      setSummary(sumRes.summary);
      setJobs(jobsRes.jobs);
    } catch {
      setError('Could not approve report.');
    } finally {
      setApprovingId(null);
    }
  };

  // ── Decline (delete) a pending submission ───────────────────────────────────
  const handleDecline = async (report: JobDto) => {
    if (!confirm(`Decline and delete "${report.title}"?`)) return;
    setDeletingJobId(report.id);
    try {
      await api.deleteReport(report.id);
      setPendingReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch {
      setError('Could not decline report.');
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
        return { ...j, expenses, totalExpensesCents, netCents: j.actualIncomeCents - totalExpensesCents };
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
        return { ...j, expenses, totalExpensesCents, netCents: j.actualIncomeCents - totalExpensesCents };
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

      {/* All-time totals — everything the business has done so far. */}
      <div className="mb-6 rounded-xl border border-border bg-surface-dark px-5 py-4 flex flex-wrap items-center gap-x-10 gap-y-3">
        <div>
          <p className="text-text-on-dark-muted text-xs uppercase tracking-widest">Projects so far</p>
          <p className="mt-1 text-2xl text-text-on-dark" style={{ fontFamily: 'Georgia, serif' }}>
            {loading || !totals ? '—' : totals.totalProjects}
          </p>
        </div>
        <div>
          <p className="text-text-on-dark-muted text-xs uppercase tracking-widest">Income generated so far</p>
          <p className="mt-1 text-2xl text-gold" style={{ fontFamily: 'Georgia, serif' }}>
            {loading || !totals ? '—' : fmt(totals.totalIncomeCents)}
          </p>
        </div>
        <div>
          <p className="text-text-on-dark-muted text-xs uppercase tracking-widest">Net profit so far</p>
          <p className="mt-1 text-2xl text-text-on-dark" style={{ fontFamily: 'Georgia, serif' }}>
            {loading || !totals ? '—' : fmt(totals.totalNetCents)}
          </p>
        </div>
        {totals?.firstJobDate && (
          <p className="text-text-on-dark-muted text-xs ml-auto">Since {totals.firstJobDate}</p>
        )}
      </div>

      {/* Summary cards — the selected month */}
      <div className="grid grid-cols-3 gap-4 mb-6">
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

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {([
          { key: 'jobs', label: `Jobs — ${monthLabel}` },
          { key: 'submissions', label: `Submissions${pendingReports.length > 0 ? ` (${pendingReports.length})` : ''}` },
          { key: 'trends', label: 'Monthly trends' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === key
                ? 'border-gold-deep text-gold-deep font-medium'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Jobs ──────────────────────────────────────────────────────── */}
      {tab === 'jobs' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-text-muted">{jobs.length} job{jobs.length !== 1 ? 's' : ''} recorded</span>
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
              <div>
                <label className="block text-xs text-text-muted mb-1">Discount given (KSh)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 500"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={jobForm.discountKes}
                  onChange={(e) => setJobForm((f) => ({ ...f, discountKes: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Client name (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Jane Mwangi"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={jobForm.clientName}
                  onChange={(e) => setJobForm((f) => ({ ...f, clientName: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Client phone (optional)</label>
                <input
                  type="tel"
                  placeholder="e.g. 0712 345 678"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={jobForm.clientPhone}
                  onChange={(e) => setJobForm((f) => ({ ...f, clientPhone: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-text-muted mb-1">Location (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Karen, Nairobi"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={jobForm.clientLocation}
                  onChange={(e) => setJobForm((f) => ({ ...f, clientLocation: e.target.value }))}
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

          <JobList
            jobs={jobs}
            loading={loading}
            monthLabel={monthLabel}
            expandedJobId={expandedJobId}
            expenseForm={expenseForm}
            savingExpense={savingExpense}
            deletingJobId={deletingJobId}
            deletingExpenseId={deletingExpenseId}
            onToggleExpand={toggleExpand}
            onDeleteJob={(j) => void handleDeleteJob(j)}
            onAddExpense={(e, id) => void handleAddExpense(e, id)}
            onDeleteExpense={(jobId, ex) => void handleDeleteExpense(jobId, ex)}
            onExpenseFormChange={setExpenseForm}
          />
        </>
      )}

      {/* ── Tab: Submissions ───────────────────────────────────────────────── */}
      {tab === 'submissions' && (
        <div>
          {loading ? (
            <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">Loading…</div>
          ) : pendingReports.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
              No pending submissions from your team.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingReports.map((report) => (
                <div key={report.id} className="rounded-xl border border-border bg-surface p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-base">{report.title}</span>
                        <span className="text-text-muted text-xs">{report.date}</span>
                        <span className="rounded-full bg-warning/15 text-warning text-xs px-2 py-0.5">Pending</span>
                      </div>
                      {report.reportedByName && (
                        <p className="text-text-muted text-xs mt-0.5">Submitted by {report.reportedByName}</p>
                      )}
                      {(report.clientName || report.clientPhone || report.clientLocation) && (
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-text-muted">
                          {report.clientName && <span>👤 {report.clientName}</span>}
                          {report.clientPhone && <span>📞 {report.clientPhone}</span>}
                          {report.clientLocation && <span>📍 {report.clientLocation}</span>}
                        </div>
                      )}
                      {report.notes && <p className="text-text-muted text-xs mt-0.5">{report.notes}</p>}
                      <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                        <span>
                          <span className="text-text-muted text-xs">Charged </span>
                          <span className="font-medium">{fmt(report.incomeCents)}</span>
                        </span>
                        {report.discountCents > 0 && (
                          <span>
                            <span className="text-text-muted text-xs">Discount </span>
                            <span className="text-warning font-medium">{fmt(report.discountCents)}</span>
                          </span>
                        )}
                        <span>
                          <span className="text-text-muted text-xs">Income </span>
                          <span className="text-success font-medium">{fmt(report.actualIncomeCents)}</span>
                        </span>
                        <span>
                          <span className="text-text-muted text-xs">Expenses </span>
                          <span className="text-danger font-medium">{fmt(report.totalExpensesCents)}</span>
                        </span>
                        <span>
                          <span className="text-text-muted text-xs">Net </span>
                          <span className={`font-medium ${report.netCents >= 0 ? 'text-success' : 'text-danger'}`}>
                            {fmt(report.netCents)}
                          </span>
                        </span>
                      </div>
                      {report.expenses.length > 0 && (
                        <div className="mt-3 rounded-lg border border-border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-text-muted uppercase tracking-widest border-b border-border bg-bg-muted/40">
                                <th className="px-3 py-1.5 text-left font-normal">Date</th>
                                <th className="px-3 py-1.5 text-left font-normal">Category</th>
                                <th className="px-3 py-1.5 text-left font-normal">Description</th>
                                <th className="px-3 py-1.5 text-right font-normal">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {report.expenses.map((ex) => (
                                <tr key={ex.id}>
                                  <td className="px-3 py-1.5 text-text-muted">{ex.date}</td>
                                  <td className="px-3 py-1.5">{CATEGORY_LABELS[ex.category]}</td>
                                  <td className="px-3 py-1.5 text-text-muted">{ex.description ?? '—'}</td>
                                  <td className="px-3 py-1.5 text-right font-medium">{fmt(ex.amountCents)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => void handleApprove(report)}
                        disabled={approvingId === report.id}
                        className="rounded-lg bg-success text-white px-4 py-1.5 text-xs hover:opacity-90 disabled:opacity-50"
                      >
                        {approvingId === report.id ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => void handleDecline(report)}
                        disabled={deletingJobId === report.id}
                        className="text-danger text-xs hover:underline disabled:opacity-40 text-center"
                      >
                        {deletingJobId === report.id ? '…' : 'Decline'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Monthly trends ────────────────────────────────────────────── */}
      {tab === 'trends' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-text-muted">Income, expenses and profit for every month.</span>
            <div className="flex items-center gap-1">
              {TREND_RANGES.map((n) => (
                <button
                  key={n}
                  onClick={() => setTrendMonths(n)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    trendMonths === n
                      ? 'bg-surface-dark text-text-on-dark'
                      : 'border border-border text-text-muted hover:bg-bg-muted'
                  }`}
                >
                  {n} months
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">Loading…</div>
          ) : trends.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">No trend data yet.</div>
          ) : (
            <>
              {/* Mini bar-chart using proportional widths */}
              <div className="mb-6 rounded-xl border border-border bg-surface p-5">
                <p className="text-xs text-text-muted uppercase tracking-widest mb-4">
                  Income &amp; net profit — last {trends.length} months
                </p>
                <div className="space-y-3">
                  {(() => {
                    // Both bars share one scale, so income and profit stay comparable.
                    const maxAbs = Math.max(
                      ...trends.map((t) => Math.max(Math.abs(t.netCents), t.incomeCents)),
                      1,
                    );
                    return trends.map((t) => {
                      const incomePct = Math.round((t.incomeCents / maxAbs) * 100);
                      const netPct = Math.round((Math.abs(t.netCents) / maxAbs) * 100);
                      const positive = t.netCents >= 0;
                      return (
                        <div key={`${t.year}-${t.month}`} className="flex items-center gap-3">
                          <span className="text-xs text-text-muted w-16 shrink-0">{t.label}</span>
                          <div className="flex-1 space-y-1">
                            <div className="bg-bg-muted rounded-full h-2.5 overflow-hidden">
                              <div className="h-full rounded-full bg-gold" style={{ width: `${incomePct}%` }} />
                            </div>
                            <div className="bg-bg-muted rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${positive ? 'bg-success' : 'bg-danger'}`}
                                style={{ width: `${netPct}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs font-medium w-28 text-right shrink-0">
                            <span className="text-gold-deep block">{fmt(t.incomeCents)}</span>
                            <span className={positive ? 'text-success block' : 'text-danger block'}>
                              {fmt(t.netCents)}
                            </span>
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="mt-4 flex items-center gap-5 text-xs text-text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-gold" /> Income
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-success" /> Net profit
                  </span>
                </div>
              </div>

              {/* Data table */}
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-text-muted text-xs uppercase tracking-widest border-b border-border bg-bg-muted/30">
                      <th className="px-5 py-3 text-left font-normal">Month</th>
                      <th className="px-5 py-3 text-right font-normal">Jobs</th>
                      <th className="px-5 py-3 text-right font-normal">Income</th>
                      <th className="px-5 py-3 text-right font-normal">Expenses</th>
                      <th className="px-5 py-3 text-right font-normal">Net profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trends.map((t) => (
                      <tr key={`${t.year}-${t.month}`} className="hover:bg-bg-muted/30">
                        <td className="px-5 py-3">{t.label}</td>
                        <td className="px-5 py-3 text-right text-text-muted">{t.jobCount}</td>
                        <td className="px-5 py-3 text-right text-success">{fmt(t.incomeCents)}</td>
                        <td className="px-5 py-3 text-right text-danger">{fmt(t.totalExpensesCents)}</td>
                        <td className={`px-5 py-3 text-right font-medium ${t.netCents >= 0 ? 'text-success' : 'text-danger'}`}>
                          {fmt(t.netCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-bg-muted/30">
                    <tr>
                      <td className="px-5 py-3 font-medium">{trends.length}-month total</td>
                      <td className="px-5 py-3 text-right font-medium text-text-muted">
                        {trends.reduce((acc, t) => acc + t.jobCount, 0)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-success">
                        {fmt(trends.reduce((acc, t) => acc + t.incomeCents, 0))}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-danger">
                        {fmt(trends.reduce((acc, t) => acc + t.totalExpensesCents, 0))}
                      </td>
                      <td className={`px-5 py-3 text-right font-medium ${trends.reduce((acc, t) => acc + t.netCents, 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                        {fmt(trends.reduce((acc, t) => acc + t.netCents, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Job list sub-component ─────────────────────────────────────────────────

function JobList({
  jobs, loading, monthLabel, expandedJobId, expenseForm, savingExpense,
  deletingJobId, deletingExpenseId, onToggleExpand, onDeleteJob,
  onAddExpense, onDeleteExpense, onExpenseFormChange,
}: {
  jobs: JobDto[];
  loading: boolean;
  monthLabel: string;
  expandedJobId: string | null;
  expenseForm: ReturnType<typeof blankExpenseForm>;
  savingExpense: boolean;
  deletingJobId: string | null;
  deletingExpenseId: string | null;
  onToggleExpand: (id: string) => void;
  onDeleteJob: (job: JobDto) => void;
  onAddExpense: (e: React.FormEvent, jobId: string) => void;
  onDeleteExpense: (jobId: string, expense: ExpenseDto) => void;
  onExpenseFormChange: React.Dispatch<React.SetStateAction<ReturnType<typeof blankExpenseForm>>>;
}) {
  if (loading) return (
    <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">Loading…</div>
  );
  if (jobs.length === 0) return (
    <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
      No jobs recorded for {monthLabel}. Click <strong>+ New job</strong> to add one.
    </div>
  );
  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const isExpanded = expandedJobId === job.id;
        const isDeleting = deletingJobId === job.id;
        return (
          <div key={job.id} className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-5 py-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-base">{job.title}</span>
                  <span className="text-text-muted text-xs">{job.date}</span>
                  {job.status === 'APPROVED' && (
                    <span className="rounded-full bg-success/15 text-success text-xs px-2 py-0.5">Approved</span>
                  )}
                  {job.reportedByName && (
                    <span className="text-text-muted text-xs">by {job.reportedByName}</span>
                  )}
                </div>
                {(job.clientName || job.clientPhone || job.clientLocation) && (
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-text-muted">
                    {job.clientName && <span>👤 {job.clientName}</span>}
                    {job.clientPhone && <span>📞 {job.clientPhone}</span>}
                    {job.clientLocation && <span>📍 {job.clientLocation}</span>}
                  </div>
                )}
                {job.notes && <p className="text-text-muted text-xs mt-0.5">{job.notes}</p>}
                <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                  <span>
                    <span className="text-text-muted text-xs">Charged </span>
                    <span className="font-medium">{fmt(job.incomeCents)}</span>
                  </span>
                  {job.discountCents > 0 && (
                    <>
                      <span className="text-border">−</span>
                      <span>
                        <span className="text-text-muted text-xs">Discount </span>
                        <span className="text-warning font-medium">{fmt(job.discountCents)}</span>
                      </span>
                      <span className="text-border">→</span>
                      <span>
                        <span className="text-text-muted text-xs">Income </span>
                        <span className="text-success font-medium">{fmt(job.actualIncomeCents)}</span>
                      </span>
                    </>
                  )}
                  {job.discountCents === 0 && (
                    <>
                      <span className="text-border">|</span>
                      <span>
                        <span className="text-text-muted text-xs">Income </span>
                        <span className="text-success font-medium">{fmt(job.actualIncomeCents)}</span>
                      </span>
                    </>
                  )}
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
                  onClick={() => onToggleExpand(job.id)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-bg-muted"
                >
                  {isExpanded ? '▲ Hide' : '▼ Expenses'}
                </button>
                <button
                  onClick={() => onDeleteJob(job)}
                  disabled={isDeleting}
                  className="text-danger text-xs hover:underline disabled:opacity-40"
                >
                  {isDeleting ? '…' : 'Delete'}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-border">
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
                              onClick={() => onDeleteExpense(job.id, ex)}
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

                <form
                  onSubmit={(e) => onAddExpense(e, job.id)}
                  className="px-5 py-4 border-t border-border bg-bg-muted/30 grid grid-cols-2 md:grid-cols-4 gap-3"
                >
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Category</label>
                    <select
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                      value={expenseForm.category}
                      onChange={(e) => onExpenseFormChange((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
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
                      onChange={(e) => onExpenseFormChange((f) => ({ ...f, amountKes: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Date</label>
                    <input
                      type="date"
                      required
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                      value={expenseForm.date}
                      onChange={(e) => onExpenseFormChange((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Description (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Matatu to Karen"
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                      value={expenseForm.description}
                      onChange={(e) => onExpenseFormChange((f) => ({ ...f, description: e.target.value }))}
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
