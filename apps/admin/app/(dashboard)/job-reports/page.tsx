'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ExpenseCategory, ExpenseDto, JobDto } from '@onyxhawk/types';
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

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  PENDING:  { label: 'Pending review', cls: 'bg-warning/15 text-warning' },
  APPROVED: { label: 'Approved',       cls: 'bg-success/15 text-success' },
};

function fmt(cents: number) {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

const blankExpenseForm = () => ({
  category: 'TRANSPORT' as ExpenseCategory,
  amountKes: '',
  description: '',
  date: todayIso(),
});

export default function JobReportsPage() {
  const session = useRequireAdmin();

  const [reports, setReports] = useState<JobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New report form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', date: todayIso(), incomeKes: '', discountKes: '',
    clientName: '', clientPhone: '', clientLocation: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  // Expanded expense form
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState(blankExpenseForm());
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.myReports();
      setReports(res.reports);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load reports (${err.status}).` : 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Submit report ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.submitReport({
        title: form.title.trim(),
        date: form.date,
        incomeCents: Math.round((parseFloat(form.incomeKes) || 0) * 100),
        discountCents: Math.round((parseFloat(form.discountKes) || 0) * 100),
        clientName: form.clientName.trim() || undefined,
        clientPhone: form.clientPhone.trim() || undefined,
        clientLocation: form.clientLocation.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setReports((prev) => [res.report, ...prev]);
      setForm({ title: '', date: todayIso(), incomeKes: '', discountKes: '', clientName: '', clientPhone: '', clientLocation: '', notes: '' });
      setShowForm(false);
      setExpandedId(res.report.id);
      setExpenseForm(blankExpenseForm());
    } catch (err) {
      setError(err instanceof ApiError ? `Could not submit report (${err.status}).` : 'Could not submit report.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete report ──────────────────────────────────────────────────────────
  const handleDelete = async (report: JobDto) => {
    if (!confirm(`Delete "${report.title}"?`)) return;
    setDeletingReportId(report.id);
    try {
      await api.deleteMyReport(report.id);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      if (expandedId === report.id) setExpandedId(null);
    } catch {
      setError('Could not delete report.');
    } finally {
      setDeletingReportId(null);
    }
  };

  // ── Add expense ────────────────────────────────────────────────────────────
  const handleAddExpense = async (e: React.FormEvent, reportId: string) => {
    e.preventDefault();
    const amountKes = parseFloat(expenseForm.amountKes);
    if (!amountKes || amountKes <= 0) return;
    setSavingExpense(true);
    setError(null);
    try {
      const res = await api.addReportExpense(reportId, {
        category: expenseForm.category,
        amountCents: Math.round(amountKes * 100),
        description: expenseForm.description.trim() || undefined,
        date: expenseForm.date,
      });
      const newExpense = res.expense;
      setReports((prev) => prev.map((r) => {
        if (r.id !== reportId) return r;
        const expenses = [newExpense, ...r.expenses];
        const totalExpensesCents = r.totalExpensesCents + newExpense.amountCents;
        return { ...r, expenses, totalExpensesCents, netCents: r.actualIncomeCents - totalExpensesCents };
      }));
      setExpenseForm(blankExpenseForm());
    } catch (err) {
      setError(err instanceof ApiError ? `Could not add expense (${err.status}).` : 'Could not add expense.');
    } finally {
      setSavingExpense(false);
    }
  };

  // ── Delete expense ─────────────────────────────────────────────────────────
  const handleDeleteExpense = async (reportId: string, expense: ExpenseDto) => {
    setDeletingExpenseId(expense.id);
    try {
      await api.deleteReportExpense(reportId, expense.id);
      setReports((prev) => prev.map((r) => {
        if (r.id !== reportId) return r;
        const expenses = r.expenses.filter((ex) => ex.id !== expense.id);
        const totalExpensesCents = r.totalExpensesCents - expense.amountCents;
        return { ...r, expenses, totalExpensesCents, netCents: r.actualIncomeCents - totalExpensesCents };
      }));
    } catch {
      setError('Could not delete expense.');
    } finally {
      setDeletingExpenseId(null);
    }
  };

  if (session === undefined) return <div className="text-text-muted">Loading…</div>;
  if (!session) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Job Reports</h1>
          <p className="text-text-muted text-sm mt-1">Submit job details after each completed job. The owner reviews and approves them.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Cancel' : '+ New report'}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}

      {/* New report form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mb-6 rounded-xl border border-gold bg-gold-soft/10 p-5 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div className="col-span-2">
            <label className="block text-xs text-text-muted mb-1">Job title</label>
            <input
              type="text"
              required
              placeholder='e.g. "Sofa wash – Karen"'
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
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
            <label className="block text-xs text-text-muted mb-1">Amount charged (KSh)</label>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 5000"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.incomeKes}
              onChange={(e) => setForm((f) => ({ ...f, incomeKes: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Discount given (KSh)</label>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 0"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.discountKes}
              onChange={(e) => setForm((f) => ({ ...f, discountKes: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Client name (optional)</label>
            <input
              type="text"
              placeholder="e.g. Jane Mwangi"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.clientName}
              onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Client phone (optional)</label>
            <input
              type="tel"
              placeholder="e.g. 0712 345 678"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.clientPhone}
              onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-text-muted mb-1">Location (optional)</label>
            <input
              type="text"
              placeholder="e.g. Karen, Nairobi"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.clientLocation}
              onChange={(e) => setForm((f) => ({ ...f, clientLocation: e.target.value }))}
            />
          </div>
          <div className="col-span-full">
            <label className="block text-xs text-text-muted mb-1">Notes (optional)</label>
            <input
              type="text"
              placeholder="e.g. Paid cash, 3-seater + 2-seater"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="col-span-full flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gold-deep text-white px-5 py-2 text-sm hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </form>
      )}

      {/* Report list */}
      {loading ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
          No reports submitted yet. Click <strong>+ New report</strong> after completing a job.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const isExpanded = expandedId === report.id;
            const isPending = report.status === 'PENDING';
            const statusMeta = STATUS_LABELS[report.status];
            return (
              <div key={report.id} className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-base">{report.title}</span>
                      <span className="text-text-muted text-xs">{report.date}</span>
                      {statusMeta && (
                        <span className={`rounded-full text-xs px-2 py-0.5 ${statusMeta.cls}`}>{statusMeta.label}</span>
                      )}
                    </div>
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
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isPending && (
                      <button
                        onClick={() => {
                          if (isExpanded) setExpandedId(null);
                          else { setExpandedId(report.id); setExpenseForm(blankExpenseForm()); }
                        }}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-bg-muted"
                      >
                        {isExpanded ? '▲ Hide' : '▼ Expenses'}
                      </button>
                    )}
                    {isPending && (
                      <button
                        onClick={() => void handleDelete(report)}
                        disabled={deletingReportId === report.id}
                        className="text-danger text-xs hover:underline disabled:opacity-40"
                      >
                        {deletingReportId === report.id ? '…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expense panel — only on pending reports */}
                {isExpanded && isPending && (
                  <div className="border-t border-border">
                    {report.expenses.length > 0 ? (
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
                          {report.expenses.map((ex) => (
                            <tr key={ex.id} className="hover:bg-bg-muted/40">
                              <td className="px-5 py-2 text-text-muted text-xs">{ex.date}</td>
                              <td className="px-5 py-2">{CATEGORY_LABELS[ex.category]}</td>
                              <td className="px-5 py-2 text-text-muted">{ex.description ?? '—'}</td>
                              <td className="px-5 py-2 text-right font-medium">{fmt(ex.amountCents)}</td>
                              <td className="px-5 py-2 text-right">
                                <button
                                  onClick={() => void handleDeleteExpense(report.id, ex)}
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
                      <p className="px-5 py-3 text-text-muted text-sm">No expenses added yet.</p>
                    )}

                    <form
                      onSubmit={(e) => void handleAddExpense(e, report.id)}
                      className="px-5 py-4 border-t border-border bg-bg-muted/30 grid grid-cols-2 md:grid-cols-4 gap-3"
                    >
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Category</label>
                        <select
                          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                          value={expenseForm.category}
                          onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
                        >
                          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
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
