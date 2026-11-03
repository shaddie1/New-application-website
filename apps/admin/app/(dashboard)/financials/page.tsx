'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AllTimeTotals,
  ClientSegment,
  ExpenseCategory,
  ExpenseDto,
  FinancialSummary,
  JobDto,
  JobStatus,
  MonthlyTrendItem,
} from '@onyxhawk/types';
import { ColumnChart, RankedBars, signedMoney, type ColumnPoint, type ColumnSeries } from '../../../src/components/charts';
import {
  DataTable,
  TableToolbar,
  useTableControls,
  type Column,
  type CsvExport,
} from '../../../src/components/DataTable';
import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { csvMoney } from '../../../src/lib/csv';

// How many months of history the Monthly trends tab can show at once.
const TREND_RANGES = [6, 12, 24];

const SEGMENT_LABELS: Record<ClientSegment, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  MEDICAL: 'Medical',
  DEVELOPER: 'Developer',
};
const SEGMENTS = Object.keys(SEGMENT_LABELS) as ClientSegment[];

/** Nairobi areas we work in most — free text is still allowed. */
const REGIONS = ['Westlands', 'Karen', 'Kilimani', 'Lavington', 'Kileleshwa', 'Runda', 'Roysambu', 'CBD'];

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

const STATUS_LABELS: Record<JobStatus, string> = {
  OWNER_ENTRY: 'Owner entry',
  APPROVED: 'Approved',
  PENDING: 'Pending',
};

const serviceLineText = (job: JobDto) => job.serviceLineCode?.replace(/_/g, ' ') ?? null;

/**
 * The Jobs and Submissions card lists: what their search box matches, what
 * their sort choice offers and the job half of each CSV line. No column draws
 * a cell; the cards draw themselves.
 */
const JOB_COLUMNS: Column<JobDto>[] = [
  { header: 'Date', sort: (j) => j.date, search: (j) => j.date, csv: (j) => j.date, csvHeader: 'Job date' },
  { header: 'Title', sort: (j) => j.title, search: (j) => j.title, csv: (j) => j.title, csvHeader: 'Job' },
  { header: 'Status', search: (j) => STATUS_LABELS[j.status], csv: (j) => STATUS_LABELS[j.status] },
  {
    header: 'Reported by',
    sort: (j) => j.reportedByName,
    search: (j) => j.reportedByName,
    csv: (j) => j.reportedByName,
  },
  { header: 'Client', sort: (j) => j.clientName, search: (j) => j.clientName, csv: (j) => j.clientName },
  { header: 'Client phone', search: (j) => j.clientPhone, csv: (j) => j.clientPhone },
  { header: 'Location', search: (j) => j.clientLocation, csv: (j) => j.clientLocation },
  { header: 'Service line', search: serviceLineText, csv: serviceLineText },
  {
    header: 'Segment',
    search: (j) => (j.clientSegment ? SEGMENT_LABELS[j.clientSegment] : null),
    csv: (j) => (j.clientSegment ? SEGMENT_LABELS[j.clientSegment] : null),
  },
  { header: 'Region', search: (j) => j.region, csv: (j) => j.region },
  { header: 'Notes', search: (j) => j.notes, csv: (j) => j.notes },
  { header: 'Charged', csv: (j) => csvMoney(j.incomeCents), csvHeader: 'Charged (KSh)' },
  { header: 'Discount', csv: (j) => csvMoney(j.discountCents), csvHeader: 'Discount (KSh)' },
  {
    header: 'Income',
    sort: (j) => j.actualIncomeCents,
    csv: (j) => csvMoney(j.actualIncomeCents),
    csvHeader: 'Income (KSh)',
  },
  {
    header: 'Expenses',
    sort: (j) => j.totalExpensesCents,
    csv: (j) => csvMoney(j.totalExpensesCents),
    csvHeader: 'Job expenses (KSh)',
  },
  { header: 'Net profit', sort: (j) => j.netCents, csv: (j) => csvMoney(j.netCents), csvHeader: 'Job net profit (KSh)' },
  // Newline-joined so a search can't match across the end of one description and the start of the next.
  { header: 'Expense descriptions', search: (j) => j.expenses.map((ex) => ex.description ?? '').join('\n') },
];

type ExpenseLine = { job: JobDto; expense: ExpenseDto | null };

/** Export CSV for the card lists: one line per expense with its job, and one line for a job with none. */
const JOB_CSV_LINES: NonNullable<CsvExport<JobDto, ExpenseLine>['lines']> = {
  of: (job) => (job.expenses.length > 0 ? job.expenses.map((expense) => ({ job, expense })) : [{ job, expense: null }]),
  columns: [
    ...JOB_COLUMNS.flatMap((c) => {
      const csv = c.csv;
      return csv ? [{ header: c.csvHeader ?? c.header, value: (line: ExpenseLine) => csv(line.job) }] : [];
    }),
    { header: 'Expense date', value: (line) => line.expense?.date },
    { header: 'Expense category', value: (line) => (line.expense ? CATEGORY_LABELS[line.expense.category] : null) },
    { header: 'Expense description', value: (line) => line.expense?.description },
    { header: 'Expense amount (KSh)', value: (line) => (line.expense ? csvMoney(line.expense.amountCents) : null) },
  ],
};

/** A job's or submission's expense lines; sortable headers, reached by the list's own search and CSV. */
const EXPENSE_COLUMNS: Column<ExpenseDto>[] = [
  { header: 'Date', className: 'text-text-muted', cell: (ex) => ex.date, sort: (ex) => ex.date },
  { header: 'Category', cell: (ex) => CATEGORY_LABELS[ex.category], sort: (ex) => CATEGORY_LABELS[ex.category] },
  {
    header: 'Description',
    className: 'text-text-muted',
    cell: (ex) => ex.description ?? '—',
    sort: (ex) => ex.description,
  },
  { header: 'Amount', right: true, className: 'font-medium', cell: (ex) => fmt(ex.amountCents), sort: (ex) => ex.amountCents },
];

const monthKey = (t: MonthlyTrendItem) => `${t.year}-${String(t.month).padStart(2, '0')}`;
const monthName = (t: MonthlyTrendItem, month: 'long' | 'short') =>
  new Date(t.year, t.month - 1, 1).toLocaleDateString('en-KE', month === 'long' ? { month, year: 'numeric' } : { month });

const TREND_SERIES: readonly [ColumnSeries, ColumnSeries] = [
  { key: 'income', label: 'Income' },
  { key: 'net', label: 'Net profit' },
];

/** The Trends table. Money uses the chart's own format so the two read the same for every month. */
const TREND_COLUMNS: Column<MonthlyTrendItem>[] = [
  {
    header: 'Month',
    cell: (t) => t.label,
    sort: monthKey,
    search: (t) => `${t.label}\n${monthName(t, 'long')}`,
    csv: (t) => t.label,
  },
  {
    header: 'Jobs',
    right: true,
    className: 'text-text-muted',
    cell: (t) => t.jobCount,
    sort: (t) => t.jobCount,
    csv: (t) => t.jobCount,
  },
  {
    header: 'Income',
    right: true,
    className: 'text-success',
    cell: (t) => signedMoney(t.incomeCents),
    sort: (t) => t.incomeCents,
    csv: (t) => csvMoney(t.incomeCents),
    csvHeader: 'Income (KSh)',
  },
  {
    header: 'Expenses',
    right: true,
    className: 'text-danger',
    cell: (t) => signedMoney(t.totalExpensesCents),
    sort: (t) => t.totalExpensesCents,
    csv: (t) => csvMoney(t.totalExpensesCents),
    csvHeader: 'Expenses (KSh)',
  },
  {
    header: 'Net profit',
    right: true,
    cell: (t) => (
      <span className={`font-medium ${t.netCents >= 0 ? 'text-success' : 'text-danger'}`}>
        {signedMoney(t.netCents)}
      </span>
    ),
    sort: (t) => t.netCents,
    csv: (t) => csvMoney(t.netCents),
    csvHeader: 'Net profit (KSh)',
  },
];

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
  const [jobForm, setJobForm] = useState({
    title: '', date: todayIso(), incomeKes: '', discountKes: '', clientName: '', clientPhone: '',
    clientLocation: '', notes: '', serviceLineCode: '', region: '', clientSegment: '' as '' | ClientSegment,
  });
  // Service lines come from the catalog rather than a hardcoded list, so the
  // options cannot drift from what the business actually sells.
  const [serviceLines, setServiceLines] = useState<{ code: string; name: string }[]>([]);
  const [savingJob, setSavingJob] = useState(false);

  // Per-job expansion + expense form
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState(blankExpenseForm());
  const [savingExpense, setSavingExpense] = useState(false);

  // Deletion state
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Search, sort and CSV for each tab's list. The charts above them always show
  // the tab's loaded data, never the searched subset.
  const jobControls = useTableControls(jobs, JOB_COLUMNS);
  const reportControls = useTableControls(pendingReports, JOB_COLUMNS);
  const trendControls = useTableControls(trends, TREND_COLUMNS);
  // The month picked on the Trends chart. It only drives the chart's readout.
  const [trendKey, setTrendKey] = useState<string | null>(null);

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

  useEffect(() => {
    api.serviceLines()
      .then((r) => setServiceLines(r.serviceLines))
      .catch(() => undefined); // classification stays optional if the catalog is unreachable
  }, []);

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
        serviceLineCode: jobForm.serviceLineCode || undefined,
        region: jobForm.region.trim() || undefined,
        clientSegment: jobForm.clientSegment || undefined,
        notes: jobForm.notes.trim() || undefined,
      });
      setJobs((prev) => [res.job, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setSummary((prev) => prev ? {
        ...prev,
        incomeCents: prev.incomeCents + res.job.actualIncomeCents,
        netCents: prev.netCents + res.job.actualIncomeCents,
      } : prev);
      setJobForm((f) => ({
        ...f, title: '', incomeKes: '', discountKes: '', clientName: '', clientPhone: '', clientLocation: '', notes: '',
      }));
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
      setSummary((prev) => {
        if (!prev) return prev;
        // Keep the category split in step with the total, so the expense bars still add up to it.
        const expensesByCategoryCents = { ...prev.expensesByCategoryCents };
        for (const ex of job.expenses) {
          expensesByCategoryCents[ex.category] = (expensesByCategoryCents[ex.category] ?? 0) - ex.amountCents;
        }
        return {
          ...prev,
          incomeCents: prev.incomeCents - job.actualIncomeCents,
          expensesByCategoryCents,
          totalExpensesCents: prev.totalExpensesCents - job.totalExpensesCents,
          netCents: prev.netCents - job.netCents,
        };
      });
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

  const trendPoints: ColumnPoint[] = trends.map((t, i) => ({
    key: monthKey(t),
    label: monthName(t, 'long'),
    shortLabel: monthName(t, 'short'),
    values: [t.incomeCents, t.netCents],
    // The trends route always ends with the current month.
    inProgress: i === trends.length - 1,
  }));
  const trendExpenses = (point: ColumnPoint) => {
    const t = trends.find((item) => monthKey(item) === point.key);
    return t ? [{ label: 'Expenses', value: signedMoney(t.totalExpensesCents) }] : [];
  };
  // Every month loaded, whatever the table's search.
  const trendTotals = trends.reduce(
    (acc, t) => ({
      jobs: acc.jobs + t.jobCount,
      income: acc.income + t.incomeCents,
      expenses: acc.expenses + t.totalExpensesCents,
      net: acc.net + t.netCents,
    }),
    { jobs: 0, income: 0, expenses: 0, net: 0 },
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
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
          <p className="mt-1 text-2xl text-aqua-light" style={{ fontFamily: 'Georgia, serif' }}>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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

      {/* Tabs. On a phone the strip scrolls on its own rather than widening the page. */}
      <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto">
        {([
          { key: 'jobs', label: `Jobs — ${monthLabel}` },
          { key: 'submissions', label: `Submissions${pendingReports.length > 0 ? ` (${pendingReports.length})` : ''}` },
          { key: 'trends', label: 'Monthly trends' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === key
                ? 'border-aqua text-navy font-medium'
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
          {!loading && summary && (
            <div className="mb-6">
              <ExpensesByCategory summary={summary} monthLabel={monthLabel} />
            </div>
          )}

          <TableToolbar
            controls={jobControls}
            csv={{ filename: `jobs-${from}-to-${to}`, lines: JOB_CSV_LINES }}
            sortChoice
            summary={`${jobs.length} job${jobs.length !== 1 ? 's' : ''} recorded`}
          >
            <button
              onClick={() => { setShowJobForm((v) => !v); }}
              className="rounded-lg bg-navy text-white px-4 py-2 text-sm hover:opacity-90 transition-opacity"
            >
              {showJobForm ? 'Cancel' : '+ New job'}
            </button>
          </TableToolbar>

          {/* New job form */}
          {showJobForm && (
            <form
              onSubmit={(e) => void handleCreateJob(e)}
              className="mb-4 rounded-xl border border-aqua/40 bg-white p-5 grid grid-cols-2 md:grid-cols-4 gap-3"
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
              {/* Classification — feeds the revenue breakdown charts on Insights. */}
              <div>
                <label className="block text-xs text-text-muted mb-1">Service line</label>
                <select
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={jobForm.serviceLineCode}
                  onChange={(e) => setJobForm((f) => ({ ...f, serviceLineCode: e.target.value }))}
                >
                  <option value="">Unclassified</option>
                  {serviceLines.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Client segment</label>
                <select
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={jobForm.clientSegment}
                  onChange={(e) =>
                    setJobForm((f) => ({ ...f, clientSegment: e.target.value as '' | ClientSegment }))
                  }
                >
                  <option value="">Unspecified</option>
                  {SEGMENTS.map((seg) => (
                    <option key={seg} value={seg}>{SEGMENT_LABELS[seg]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Region</label>
                <input
                  type="text"
                  list="job-regions"
                  placeholder="e.g. Westlands"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                  value={jobForm.region}
                  onChange={(e) => setJobForm((f) => ({ ...f, region: e.target.value }))}
                />
                <datalist id="job-regions">
                  {REGIONS.map((r) => <option key={r} value={r} />)}
                </datalist>
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
                  className="rounded-lg bg-navy text-white px-5 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {savingJob ? 'Saving…' : 'Create job'}
                </button>
              </div>
            </form>
          )}

          <JobList
            jobs={jobControls.rows}
            total={jobs.length}
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
          {!loading && pendingReports.length > 0 && (
            <TableToolbar
              controls={reportControls}
              csv={{ filename: 'pending-submissions', lines: JOB_CSV_LINES }}
              sortChoice
              summary={`${pendingReports.length} awaiting approval`}
            />
          )}
          <SubmissionList
            reports={reportControls.rows}
            total={pendingReports.length}
            loading={loading}
            approvingId={approvingId}
            decliningId={deletingJobId}
            onApprove={(r) => void handleApprove(r)}
            onDecline={(r) => void handleDecline(r)}
          />
        </div>
      )}

      {/* ── Tab: Monthly trends ────────────────────────────────────────────── */}
      {tab === 'trends' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
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
              {/* Straight in the page column: the chart sizes its own phone layout and
                  scrolls sideways inside its card when the months don't fit. */}
              <div className="mb-6">
                <ColumnChart
                  title={`Income and net profit — last ${trends.length} months`}
                  series={TREND_SERIES}
                  points={trendPoints}
                  unit="money"
                  selectedKey={trendKey}
                  onSelect={setTrendKey}
                  extraFigures={trendExpenses}
                />
              </div>

              <TableToolbar
                controls={trendControls}
                csv={{ filename: `monthly-trends-${trendPoints[0]?.key}-to-${trendPoints[trendPoints.length - 1]?.key}` }}
              />
              <DataTable
                controls={trendControls}
                rowKey={monthKey}
                footer={
                  <tr>
                    <td className="px-5 py-3 font-medium">All months</td>
                    <td className="px-5 py-3 whitespace-nowrap text-right font-medium text-text-muted">{trendTotals.jobs}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-right font-medium text-success">
                      {signedMoney(trendTotals.income)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-right font-medium text-danger">
                      {signedMoney(trendTotals.expenses)}
                    </td>
                    <td
                      className={`px-5 py-3 whitespace-nowrap text-right font-medium ${
                        trendTotals.net >= 0 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {signedMoney(trendTotals.net)}
                    </td>
                  </tr>
                }
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Expenses by category ───────────────────────────────────────────────────

/** The month's expenses split by category; the bars add up to the Total expenses card. */
function ExpensesByCategory({ summary, monthLabel }: { summary: FinancialSummary; monthLabel: string }) {
  const items = CATEGORIES
    .map((c) => ({ key: c, label: CATEGORY_LABELS[c], value: summary.expensesByCategoryCents[c] ?? 0 }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  return (
    <RankedBars
      title={`Expenses by category — ${monthLabel}`}
      items={items}
      format={fmt}
      emptyLabel={`No expenses recorded for ${monthLabel}.`}
      detail={(item, share) =>
        `${item.label}: ${fmt(item.value)}, ${(share * 100).toFixed(1)}% of ${fmt(summary.totalExpensesCents)} total expenses`
      }
    />
  );
}

// ── Expense lines inside a job or submission card ──────────────────────────

function ExpenseTable({
  expenses, className, onDelete, deletingExpenseId,
}: {
  expenses: ExpenseDto[];
  className: string;
  /** Adds a Delete action column. */
  onDelete?: (expense: ExpenseDto) => void;
  deletingExpenseId?: string | null;
}) {
  const columns: Column<ExpenseDto>[] = onDelete
    ? [
        ...EXPENSE_COLUMNS,
        {
          header: '',
          right: true,
          cell: (ex) => (
            <button
              onClick={() => onDelete(ex)}
              disabled={deletingExpenseId === ex.id}
              className="text-danger text-xs hover:underline disabled:opacity-40"
            >
              {deletingExpenseId === ex.id ? '…' : 'Delete'}
            </button>
          ),
        },
      ]
    : EXPENSE_COLUMNS;
  const controls = useTableControls(expenses, columns);
  return <DataTable controls={controls} rowKey={(ex) => ex.id} dense className={className} />;
}

// ── Job list sub-component ─────────────────────────────────────────────────

function JobList({
  jobs, total, loading, monthLabel, expandedJobId, expenseForm, savingExpense,
  deletingJobId, deletingExpenseId, onToggleExpand, onDeleteJob,
  onAddExpense, onDeleteExpense, onExpenseFormChange,
}: {
  /** The jobs to show: the month's jobs after the search, in the chosen order. */
  jobs: JobDto[];
  /** How many jobs the month has, whatever the search. */
  total: number;
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
  if (total === 0) return (
    <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
      No jobs recorded for {monthLabel}. Click <strong>+ New job</strong> to add one.
    </div>
  );
  if (jobs.length === 0) return (
    <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
      No jobs match your search.
    </div>
  );
  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const isExpanded = expandedJobId === job.id;
        const isDeleting = deletingJobId === job.id;
        return (
          <div key={job.id} className="rounded-xl border border-border bg-surface overflow-hidden">
            {/* Actions drop under the figures on a phone, so the figures keep the card's width. */}
            <div className="px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
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
                {(job.serviceLineCode || job.clientSegment || job.region) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {job.serviceLineCode && (
                      <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-muted">
                        {job.serviceLineCode.replace(/_/g, ' ')}
                      </span>
                    )}
                    {job.clientSegment && (
                      <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-muted">
                        {SEGMENT_LABELS[job.clientSegment]}
                      </span>
                    )}
                    {job.region && (
                      <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-muted">
                        {job.region}
                      </span>
                    )}
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
                  <ExpenseTable
                    expenses={job.expenses}
                    className=""
                    onDelete={(ex) => onDeleteExpense(job.id, ex)}
                    deletingExpenseId={deletingExpenseId}
                  />
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
                      className="rounded-lg bg-navy text-white px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
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

// ── Submissions list sub-component ─────────────────────────────────────────

function SubmissionList({
  reports, total, loading, approvingId, decliningId, onApprove, onDecline,
}: {
  /** The submissions to show: after the search, in the chosen order. */
  reports: JobDto[];
  /** How many submissions are pending, whatever the search. */
  total: number;
  loading: boolean;
  approvingId: string | null;
  decliningId: string | null;
  onApprove: (report: JobDto) => void;
  onDecline: (report: JobDto) => void;
}) {
  if (loading) return (
    <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">Loading…</div>
  );
  if (total === 0) return (
    <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
      No pending submissions from your team.
    </div>
  );
  if (reports.length === 0) return (
    <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
      No submissions match your search.
    </div>
  );
  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <div key={report.id} className="rounded-xl border border-border bg-surface p-5">
          {/* Approve and Decline drop under the figures on a phone. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
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
                <ExpenseTable expenses={report.expenses} className="mt-3 rounded-lg border border-border" />
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0 sm:flex-col sm:items-stretch sm:gap-2">
              <button
                onClick={() => onApprove(report)}
                disabled={approvingId === report.id}
                className="rounded-lg bg-success text-white px-4 py-1.5 text-xs hover:opacity-90 disabled:opacity-50"
              >
                {approvingId === report.id ? '…' : 'Approve'}
              </button>
              <button
                onClick={() => onDecline(report)}
                disabled={decliningId === report.id}
                className="text-danger text-xs hover:underline disabled:opacity-40 text-center"
              >
                {decliningId === report.id ? '…' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({
  label, cents, color, loading, accent,
}: {
  label: string; cents?: number; color?: string; loading?: boolean; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? 'border-aqua/40 bg-white' : 'border-border bg-surface'}`}>
      <p className="text-text-muted text-xs uppercase tracking-widest">{label}</p>
      <p className={`mt-2 text-3xl ${color ?? ''}`} style={{ fontFamily: 'Georgia, serif' }}>
        {loading || cents === undefined ? '—' : fmt(cents)}
      </p>
    </div>
  );
}
