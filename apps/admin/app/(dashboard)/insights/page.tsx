'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  DashboardOverview,
  EquityOverview,
  MonthlyTrendItem,
  RevenueBreakdown,
} from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { RankedBars, StatTile, TargetMeter, TrendChart, money, moneyShort } from '../../../src/components/charts';

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function monthRange(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`,
  };
}

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';

export default function InsightsPage() {
  const session = useRequireAdmin();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [trends, setTrends] = useState<MonthlyTrendItem[]>([]);
  const [breakdown, setBreakdown] = useState<RevenueBreakdown | null>(null);
  const [equity, setEquity] = useState<EquityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showTargets, setShowTargets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetForm, setTargetForm] = useState({ revenueKes: '', profitKes: '', jobs: '' });

  const { from, to } = monthRange(year, month);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, tr, br, eq] = await Promise.all([
        api.overview(year, month),
        api.financialTrends(12),
        api.revenueBreakdown(from, to),
        api.equity(from, to).catch(() => null), // equity is cap-table-holders only
      ]);
      setOverview(ov.overview);
      setTrends(tr.trends);
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
  }, [year, month, from, to]);

  useEffect(() => { void load(); }, [load]);

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
  if (!session) return null;

  const trendData = trends.map((t) => ({
    label: t.label.replace(/ \d{4}$/, ''),
    incomeCents: t.incomeCents,
    netCents: t.netCents,
  }));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Insights</h1>
          <p className="mt-1 text-sm text-charcoal-muted">Targets, trends and where the money comes from.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-cream-deep">←</button>
          <span className="w-36 text-center text-sm font-medium">{overview?.monthLabel ?? '…'}</span>
          <button onClick={nextMonth} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-cream-deep">→</button>
          <button
            onClick={() => setShowTargets((v) => !v)}
            className="rounded-lg bg-gold-deep px-4 py-2 text-sm text-white hover:opacity-90"
          >
            {showTargets ? 'Cancel' : 'Set targets'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      {showTargets && (
        <form onSubmit={(e) => void saveTargets(e)} className="mb-6 grid gap-3 rounded-xl border border-gold-bright/45 bg-gold-bright/[0.08] p-5 sm:grid-cols-4">
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
              className="rounded-lg bg-gold-deep px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">
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
            <StatTile label="Revenue vs last month" value={money(overview?.revenue.actual ?? 0)}
              delta={pctChange(overview?.revenue.actual ?? 0, overview?.previousRevenueCents ?? 0)}
              deltaLabel={`vs ${moneyShort(overview?.previousRevenueCents ?? 0)} last month`} />
            <StatTile label="Net profit vs last month" value={money(overview?.netProfit.actual ?? 0)}
              delta={pctChange(overview?.netProfit.actual ?? 0, overview?.previousNetCents ?? 0)}
              deltaLabel={`vs ${moneyShort(overview?.previousNetCents ?? 0)} last month`} />
            <StatTile label="Jobs vs last month" value={String(overview?.jobs.actual ?? 0)}
              delta={pctChange(overview?.jobs.actual ?? 0, overview?.previousJobCount ?? 0)}
              deltaLabel={`vs ${overview?.previousJobCount ?? 0} last month`} />
          </div>

          {/* Trend */}
          <div className="mt-6">
            <TrendChart data={trendData} />
          </div>

          {/* Breakdowns */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <RankedBars
              title={`Revenue by service line — ${overview?.monthLabel ?? ''}`}
              items={(breakdown?.byServiceLine ?? []).map((i) => ({
                key: i.key, label: i.label, value: i.incomeCents,
                sub: `${i.jobCount} job${i.jobCount === 1 ? '' : 's'}`,
              }))}
              format={money}
              emptyLabel="No classified revenue this month. Set a service line on a job to see it here."
            />
            <RankedBars
              title={`Revenue by client segment — ${overview?.monthLabel ?? ''}`}
              items={(breakdown?.bySegment ?? []).map((i) => ({
                key: i.key, label: i.label, value: i.incomeCents,
                sub: `${i.jobCount} job${i.jobCount === 1 ? '' : 's'}`,
              }))}
              format={money}
              emptyLabel="No segmented revenue this month."
            />
          </div>

          {equity && (
            <div className="mt-6">
              <RankedBars
                title={`Profit share — ${overview?.monthLabel ?? ''}`}
                items={equity.allocations.map((a) => ({
                  key: a.shareholder.id,
                  label: a.shareholder.name,
                  value: Math.max(0, a.periodShareCents),
                  sub: `${(a.shareholder.basisPoints / 100).toFixed(0)}% stake${
                    a.shareholder.title ? ` · ${a.shareholder.title}` : ''
                  }`,
                }))}
                format={money}
                emptyLabel="No shareholders on the cap table."
              />
            </div>
          )}

          <p className="mt-4 text-xs text-charcoal-muted">
            Charts use one colour on purpose: the brand’s gold and bronze are too close to tell apart as separate
            series, so length and labels carry the comparison instead.
          </p>
        </>
      )}
    </div>
  );
}
