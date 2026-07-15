'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EquityOverview, ShareholderDto, ShareholderKind } from '@onyxhawk/types';
import { colors } from '@onyxhawk/ui-tokens';
import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';

const BASIS_POINTS_TOTAL = 10_000;

// Colours for the cap-table bar, cycled in table order.
const SLICE_COLORS = [
  colors.surfaceDark,
  colors.goldDeep,
  colors.gold,
  colors.serviceOffice,
  colors.serviceResidential,
  colors.servicePostBuild,
  colors.serviceFumigation,
  colors.serviceHospital,
];

function sliceColor(index: number) {
  return SLICE_COLORS[index % SLICE_COLORS.length]!;
}

function fmt(cents: number) {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
}

// 4000 → "40%", 3333 → "33.33%"
function pct(basisPoints: number) {
  const value = basisPoints / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

function monthRange(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`,
  };
}

const blankForm = () => ({ name: '', title: '', kind: 'INDIVIDUAL' as ShareholderKind, percent: '' });
type Form = ReturnType<typeof blankForm>;

const formFor = (s: ShareholderDto): Form => ({
  name: s.name,
  title: s.title ?? '',
  kind: s.kind,
  percent: String(s.basisPoints / 100),
});

// "40" / "33.33" → basis points. Returns null when the input is not a usable percentage.
function toBasisPoints(percent: string): number | null {
  const value = parseFloat(percent);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100);
}

export default function EquityPage() {
  const session = useRequireAdmin();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [overview, setOverview] = useState<EquityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Form>(blankForm());
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<Form>(blankForm());
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { from, to } = monthRange(year, month);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.equity(from, to);
      setOverview(res.overview);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load ownership (${err.status}).` : 'Could not load ownership.');
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

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const basisPoints = toBasisPoints(addForm.percent);
    if (!addForm.name.trim() || basisPoints === null) {
      setError('Enter a name and a stake between 0 and 100%.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.addShareholder({
        name: addForm.name.trim(),
        title: addForm.title.trim() || null,
        kind: addForm.kind,
        basisPoints,
      });
      setAddForm(blankForm());
      setShowAddForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? `Could not add shareholder (${err.status}).` : 'Could not add shareholder.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const basisPoints = toBasisPoints(editForm.percent);
    if (!editForm.name.trim() || basisPoints === null) {
      setError('Enter a name and a stake between 0 and 100%.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateShareholder(id, {
        name: editForm.name.trim(),
        title: editForm.title.trim() || null,
        kind: editForm.kind,
        basisPoints,
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? `Could not save changes (${err.status}).` : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (s: ShareholderDto) => {
    if (!confirm(`Remove ${s.name} from the cap table?`)) return;
    setRemovingId(s.id);
    setError(null);
    try {
      await api.removeShareholder(s.id);
      await load();
    } catch {
      setError('Could not remove shareholder.');
    } finally {
      setRemovingId(null);
    }
  };

  if (session === undefined) return <div className="text-text-muted">Loading…</div>;
  if (!session) return null;
  if (!session.user.isOwner) {
    return <div className="rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">Owner access required.</div>;
  }

  const allTime = overview?.allTime;
  const allocations = overview?.allocations ?? [];
  const totalBasisPoints = overview?.totalBasisPoints ?? 0;
  const capTableBalanced = totalBasisPoints === BASIS_POINTS_TOTAL;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Ownership</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg-muted">←</button>
          <span className="text-sm font-medium w-36 text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg-muted">→</button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}

      {/* ── All-time totals ──────────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xs text-text-muted uppercase tracking-widest">Since day one</h2>
          {allTime?.firstJobDate && (
            <span className="text-xs text-text-muted">
              First project {allTime.firstJobDate} · latest {allTime.lastJobDate}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total projects" value={loading || !allTime ? '—' : String(allTime.totalProjects)} />
          <StatCard label="Income generated" value={loading || !allTime ? '—' : fmt(allTime.totalIncomeCents)} color="text-success" />
          <StatCard label="Total expenses" value={loading || !allTime ? '—' : fmt(allTime.totalExpensesCents)} color="text-danger" />
          <StatCard
            label="Net profit"
            value={loading || !allTime ? '—' : fmt(allTime.totalNetCents)}
            color={!allTime || allTime.totalNetCents >= 0 ? 'text-success' : 'text-danger'}
            accent
          />
        </div>
      </section>

      {/* ── Cap table split bar ──────────────────────────────────────────────── */}
      {!loading && allocations.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-surface p-5">
          <p className="text-xs text-text-muted uppercase tracking-widest mb-4">Share split</p>
          <div className="flex h-6 w-full overflow-hidden rounded-full bg-bg-muted">
            {allocations.map((a, i) => (
              <div
                key={a.shareholder.id}
                title={`${a.shareholder.name} — ${pct(a.shareholder.basisPoints)}`}
                style={{
                  width: `${(a.shareholder.basisPoints / BASIS_POINTS_TOTAL) * 100}%`,
                  backgroundColor: sliceColor(i),
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {allocations.map((a, i) => (
              <div key={a.shareholder.id} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: sliceColor(i) }} />
                <span>{a.shareholder.name}</span>
                <span className="text-text-muted">{pct(a.shareholder.basisPoints)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cap table doesn't add up — say so plainly rather than quietly mis-splitting. */}
      {!loading && overview && !capTableBalanced && (
        <div className="mb-6 rounded-lg bg-warning/10 border border-warning/30 px-4 py-3 text-sm">
          <p className="text-warning font-medium">
            The stakes add up to {pct(totalBasisPoints)}, not 100%.
          </p>
          <p className="text-text-muted mt-1">
            {totalBasisPoints < BASIS_POINTS_TOTAL
              ? `The remaining ${pct(BASIS_POINTS_TOTAL - totalBasisPoints)} (${fmt(overview.unallocatedAllTimeCents)} all-time) is shown as retained by the business.`
              : 'Shares are being over-allocated — the payouts below total more than the profit. Adjust the percentages so they sum to 100%.'}
          </p>
        </div>
      )}

      {/* ── Shareholder table ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-text-muted">
          {allocations.length} shareholder{allocations.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => { setShowAddForm((v) => !v); setError(null); }}
          className="rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 transition-opacity"
        >
          {showAddForm ? 'Cancel' : '+ Add shareholder'}
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="mb-4 rounded-xl border border-gold bg-gold-soft/10 p-5 grid grid-cols-1 md:grid-cols-4 gap-3"
        >
          <div className="md:col-span-2">
            <label className="block text-xs text-text-muted mb-1">Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Jane Mwangi"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Title (optional)</label>
            <input
              type="text"
              placeholder="e.g. Director, COO"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={addForm.title}
              onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Type</label>
            <select
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={addForm.kind}
              onChange={(e) => setAddForm((f) => ({ ...f, kind: e.target.value as ShareholderKind }))}
            >
              <option value="INDIVIDUAL">Individual</option>
              <option value="COMPANY">Company</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Stake (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              placeholder="e.g. 30"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={addForm.percent}
              onChange={(e) => setAddForm((f) => ({ ...f, percent: e.target.value }))}
            />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gold-deep text-white px-5 py-2 text-sm hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add shareholder'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">Loading…</div>
      ) : allocations.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">
          No shareholders yet. Click <strong>+ Add shareholder</strong> to build the cap table.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-xs uppercase tracking-widest border-b border-border bg-bg-muted/30">
                <th className="px-5 py-3 text-left font-normal">Shareholder</th>
                <th className="px-5 py-3 text-right font-normal">Stake</th>
                <th className="px-5 py-3 text-right font-normal">Share of {monthLabel}</th>
                <th className="px-5 py-3 text-right font-normal">Share all-time</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allocations.map((a, i) => {
                const s = a.shareholder;
                const isEditing = editingId === s.id;

                if (isEditing) {
                  return (
                    <tr key={s.id} className="bg-gold-soft/10">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Name"
                            className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm"
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          />
                          <input
                            type="text"
                            placeholder="Title"
                            className="w-28 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm"
                            value={editForm.title}
                            onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                          />
                          <select
                            className="rounded-lg border border-border bg-bg px-2 py-1.5 text-sm"
                            value={editForm.kind}
                            onChange={(e) => setEditForm((f) => ({ ...f, kind: e.target.value as ShareholderKind }))}
                          >
                            <option value="INDIVIDUAL">Individual</option>
                            <option value="COMPANY">Company</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          className="w-24 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-right"
                          value={editForm.percent}
                          onChange={(e) => setEditForm((f) => ({ ...f, percent: e.target.value }))}
                        />
                      </td>
                      <td className="px-5 py-3 text-right text-text-muted">—</td>
                      <td className="px-5 py-3 text-right text-text-muted">—</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => void handleSaveEdit(s.id)}
                            disabled={saving}
                            className="rounded-lg bg-gold-deep text-white px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-50"
                          >
                            {saving ? '…' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setError(null); }}
                            className="text-text-muted text-xs hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={s.id} className="hover:bg-bg-muted/30">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: sliceColor(i) }} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{s.name}</span>
                            {s.kind === 'COMPANY' && (
                              <span className="rounded-full bg-bg-muted text-text-muted text-xs px-2 py-0.5">Company</span>
                            )}
                          </div>
                          {(s.title || s.userName) && (
                            <p className="text-text-muted text-xs mt-0.5">
                              {[s.title, s.userName].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-medium">{pct(s.basisPoints)}</td>
                    <td className={`px-5 py-3 text-right ${a.periodShareCents >= 0 ? 'text-success' : 'text-danger'}`}>
                      {fmt(a.periodShareCents)}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium ${a.allTimeShareCents >= 0 ? 'text-success' : 'text-danger'}`}>
                      {fmt(a.allTimeShareCents)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => { setEditingId(s.id); setEditForm(formFor(s)); setError(null); }}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-bg-muted"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleRemove(s)}
                          disabled={removingId === s.id}
                          className="text-danger text-xs hover:underline disabled:opacity-40"
                        >
                          {removingId === s.id ? '…' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Only meaningful when the stakes don't cover 100%. */}
              {overview && overview.unallocatedAllTimeCents !== 0 && (
                <tr className="bg-bg-muted/20">
                  <td className="px-5 py-3 text-text-muted italic">Retained by the business</td>
                  <td className="px-5 py-3 text-right text-text-muted">
                    {pct(BASIS_POINTS_TOTAL - totalBasisPoints)}
                  </td>
                  <td className="px-5 py-3 text-right text-text-muted">{fmt(overview.unallocatedPeriodCents)}</td>
                  <td className="px-5 py-3 text-right text-text-muted">{fmt(overview.unallocatedAllTimeCents)}</td>
                  <td />
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-border bg-bg-muted/30">
              <tr>
                <td className="px-5 py-3 font-medium">Net profit to split</td>
                <td className={`px-5 py-3 text-right font-medium ${capTableBalanced ? '' : 'text-warning'}`}>
                  {pct(totalBasisPoints)}
                </td>
                <td className={`px-5 py-3 text-right font-medium ${(overview?.periodNetCents ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                  {overview ? fmt(overview.periodNetCents) : '—'}
                </td>
                <td className={`px-5 py-3 text-right font-medium ${(allTime?.totalNetCents ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                  {allTime ? fmt(allTime.totalNetCents) : '—'}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-text-muted">
        Shares are calculated on net profit — income after expenses — for approved jobs only.
      </p>
    </div>
  );
}

function StatCard({
  label, value, color, accent,
}: {
  label: string; value: string; color?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? 'border-gold bg-gold-soft/20' : 'border-border bg-surface'}`}>
      <p className="text-text-muted text-xs uppercase tracking-widest">{label}</p>
      <p className={`mt-2 text-2xl ${color ?? ''}`} style={{ fontFamily: 'Georgia, serif' }}>{value}</p>
    </div>
  );
}
