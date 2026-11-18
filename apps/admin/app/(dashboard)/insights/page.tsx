'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type {
  DashboardOverview,
  EquityOverview,
  FinancialSummary,
  MonthlyTrendItem,
  RevenueBreakdown,
} from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { changeLabel, overviewChanges } from '../../../src/lib/change';
import { costGroupRows } from '../../../src/lib/costGroups';
import { canSeeInsights, landingPath, maySetTargets } from '../../../src/lib/landing';
import { DonutChart, StatTile, TargetMeter, TrendChart, moneyShort } from '../../../src/components/charts';
import { money as formatMoney } from '../../../src/lib/money';

const money = (cents: number) => formatMoney(cents, { whole: true });

/** A titled panel around a chart, so every donut sits in the same frame. */
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <p className="mb-5 text-xs uppercase tracking-widest text-charcoal-muted">{title}</p>
      {children}
    </div>
  );
}

function monthRange(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`,
  };
}

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';

/**
 * The month's targets, figures and where the money came from and went.
 *
 *   owner                              everything
 *   admin, financial manager,          targets, the month's figures and the two
 *   shareholder                        revenue charts: what the server gives them
 *   admin, financial manager           also set the targets
 *
 * The trend, the expense split and the profit share are the owner's alone, as
 * the server's answers are; they are not asked for on anyone else's behalf.
 */
export default function InsightsPage() {
  const session = useRequireAdmin();
  const router = useRouter();
  const user = session?.user;
  const isOwner = user?.isOwner === true;
  const allowed = !!user && canSeeInsights(user);
  const canSetTargets = !!user && maySetTargets(user);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [trends, setTrends] = useState<MonthlyTrendItem[]>([]);
  const [breakdown, setBreakdown] = useState<RevenueBreakdown | null>(null);
  const [equity, setEquity] = useState<EquityOverview | null>(null);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showTargets, setShowTargets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetForm, setTargetForm] = useState({ revenueKes: '', profitKes: '', jobs: '' });

  const { from, to } = monthRange(year, month);

  // The five expense groups, and Machines when the month has machine days.
  const expenseSlices = summary
    ? costGroupRows(summary.expensesByCategoryCents, 'charts').map((group) => ({
        key: group.key, label: group.label, value: group.cents,
      }))
    : [];

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [ov, tr, br, eq, sm] = await Promise.all([
        api.overview(year, month),
        isOwner ? api.financialTrends(12) : null,
        api.revenueBreakdown(from, to),
        isOwner ? api.equity(from, to).catch(() => null) : null,
        isOwner ? api.financialSummary(from, to).catch(() => null) : null, // expense split by category
      ]);
      setOverview(ov.overview);
      setSummary(sm?.summary ?? null);
      setTrends(tr?.trends ?? []);
      setBreakdown(br.breakdown);
      setEquity(eq?.overview ?? null);
      setTargetForm({
        revenueKes: ov.overview.revenue.target ? String(ov.overview.revenue.target / 100) : '',
        profitKes: ov.overview.netProfit.target ? String(ov.overview.netProfit.target / 100) : '',
        jobs: ov.overview.jobs.target ? String(ov.overview.jobs.target) : '',
      });
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load insights (${err.status}).` : 'Could not load insights.');
    } finally {
      setLoading(false);
    }
  }, [allowed, isOwner, year, month, from, to]);

  useEffect(() => { void load(); }, [load]);

  // Anyone else goes to their own first page rather than to figures the server would refuse.
  useEffect(() => {
    if (user && !allowed) router.replace(landingPath(user));
  }, [user, allowed, router]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  };

  const saveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.setTarget({
        year,
        month,
        revenueTargetCents: Math.round((parseFloat(targetForm.revenueKes) || 0) * 100),
        netProfitTargetCents: Math.round((parseFloat(targetForm.profitKes) || 0) * 100),
        jobsTarget: Number(targetForm.jobs) || 0,
      });
      setShowTargets(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? `Could not save targets (${err.status}).` : 'Could not save targets.');
    } finally {
      setSaving(false);
    }
  };

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session || !allowed) return null;

  const trendData = trends.map((t) => ({
    label: t.label.replace(/ \d{4}$/, ''),
    incomeCents: t.incomeCents,
    netCents: t.netCents,
  }));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Insights</h1>
          <p className="mt-1 text-sm text-charcoal-muted">
            {isOwner ? 'Targets, trends and where the money comes from.' : 'Targets, the month’s figures and where the money comes from.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-mist">←</button>
          <span className="w-36 text-center text-sm font-medium">{overview?.monthLabel ?? '…'}</span>
          <button onClick={nextMonth} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-mist">→</button>
          {canSetTargets && (
            <button
              onClick={() => setShowTargets((v) => !v)}
              className="rounded-lg bg-navy px-4 py-2 text-sm text-white hover:opacity-90"
            >
              {showTargets ? 'Cancel' : 'Set targets'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      {canSetTargets && showTargets && (
        <form onSubmit={(e) => void saveTargets(e)} className="mb-6 grid gap-3 rounded-xl border border-aqua/45 bg-white p-5 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Revenue target (KSh)</label>
            <input type="number" min="0" className={input} value={targetForm.revenueKes}
              onChange={(e) => setTargetForm((f) => ({ ...f, revenueKes: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Net profit target (KSh)</label>
            <input type="number" min="0" className={input} value={targetForm.profitKes}
              onChange={(e) => setTargetForm((f) => ({ ...f, profitKes: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Jobs target</label>
            <input type="number" min="0" className={input} value={targetForm.jobs}
              onChange={(e) => setTargetForm((f) => ({ ...f, jobs: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-navy px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving…' : `Save for ${overview?.monthLabel ?? 'month'}`}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-xl border border-line bg-white py-16 text-center text-sm text-charcoal-muted">Loading…</div>
      ) : (
        <>
          {/* Targets */}
          <div className="grid gap-4 md:grid-cols-3">
            <TargetMeter label="Revenue" actual={overview?.revenue.actual ?? 0}
              target={overview?.revenue.target ?? 0} format={money} />
            <TargetMeter label="Net profit" actual={overview?.netProfit.actual ?? 0}
              target={overview?.netProfit.target ?? 0} format={money} />
            <TargetMeter label="Jobs completed" actual={overview?.jobs.actual ?? 0}
              target={overview?.jobs.target ?? 0} format={(n) => String(n)} />
          </div>

          {/* Month-on-month */}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatTile label="Revenue" value={money(overview?.revenue.actual ?? 0)}
              delta={overviewChanges(overview).revenue}
              deltaLabel={changeLabel(overviewChanges(overview).mode, moneyShort(overview?.previousRevenueCents ?? 0))} />
            <StatTile label="Net profit" value={money(overview?.netProfit.actual ?? 0)}
              delta={overviewChanges(overview).netProfit}
              deltaLabel={changeLabel(overviewChanges(overview).mode, moneyShort(overview?.previousNetCents ?? 0))} />
            <StatTile label="Jobs" value={String(overview?.jobs.actual ?? 0)}
              delta={overviewChanges(overview).jobs}
              deltaLabel={changeLabel(overviewChanges(overview).mode, String(overview?.previousJobCount ?? 0))} />
          </div>

          {/* Trend: the owner's alone */}
          {isOwner && (
            <div className="mt-6">
              <TrendChart data={trendData} />
            </div>
          )}

          {/* Part-to-whole breakdowns */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ChartCard title={`Revenue by service line — ${overview?.monthLabel ?? ''}`}>
              <DonutChart
                slices={(breakdown?.byServiceLine ?? []).map((i) => ({
                  key: i.key, label: i.label, value: i.incomeCents,
                }))}
                centreLabel="total revenue"
                emptyLabel="No classified revenue this month. Set a service line on a job to see it here."
              />
            </ChartCard>

            <ChartCard title={`Revenue by client segment — ${overview?.monthLabel ?? ''}`}>
              <DonutChart
                slices={(breakdown?.bySegment ?? []).map((i) => ({
                  key: i.key, label: i.label, value: i.incomeCents,
                }))}
                centreLabel="total revenue"
                emptyLabel="No segmented revenue this month."
              />
            </ChartCard>

            {isOwner && (
              <ChartCard title={`Where the money went — ${overview?.monthLabel ?? ''}`}>
                <DonutChart
                  slices={expenseSlices}
                  // Every group keeps a slice of its own: with Machines there are six, and
                  // folding the smallest into "Other" would take a named group off the chart.
                  maxSlices={expenseSlices.length}
                  centreLabel="total expenses"
                  emptyLabel="No expenses recorded this month."
                />
              </ChartCard>
            )}

            {equity && (
              <ChartCard title={`Profit share — ${overview?.monthLabel ?? ''}`}>
                <DonutChart
                  slices={equity.allocations.map((a) => ({
                    key: a.shareholder.id,
                    label: a.shareholder.name,
                    value: Math.max(0, a.periodShareCents),
                  }))}
                  centreLabel="net profit shared"
                  emptyLabel="No shareholders on the cap table."
                />
              </ChartCard>
            )}
          </div>

          <p className="mt-4 text-xs text-charcoal-muted">
            Any two of the donut colours can be told apart by a colour-blind reader, measured against the white
            card they sit on. Every segment is also named with its value and share, so nothing is read by colour alone.
          </p>
        </>
      )}
    </div>
  );
}
