'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  AdminStats,
  DashboardOverview,
  EquityOverview,
  ExpenseCategory,
  FinancialSummary,
  RevenueBreakdown,
} from '@onyxhawk/types';
import { api, ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import {
  AchievementRing,
  AchievementRow,
  DonutChart,
  StatTile,
  money,
} from '../../src/components/charts';

const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  MATERIALS: 'Materials',
  TRANSPORT: 'Transport',
  EMPLOYEE_PAY: 'Employee pay',
  LUNCH: 'Lunch',
  MISCELLANEOUS: 'Miscellaneous',
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <p className="mb-5 text-xs uppercase tracking-widest text-charcoal-muted">{title}</p>
      {children}
    </div>
  );
}

// Finance data is not served to every staff role, so only ask for it when the
// signed-in user is actually allowed it — otherwise the request 403s.
const FINANCE_ROLES = ['ADMIN', 'FINANCIAL_MANAGER', 'SHAREHOLDER'];

type OtpRow = { phone: string; codePlain: string; createdAt: string; expiresAt: string };

export default function DashboardPage() {
  const { session } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .stats()
      .then((res) => setStats(res.stats))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? `Could not load stats (${err.status}).` : 'Could not load stats.'),
      );
  }, []);

  const canSeeFinance =
    !!session && (session.user.isOwner || FINANCE_ROLES.includes(session.user.role));

  return (
    <div>
      <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>
        Today at a glance
      </h1>

      {error && <div className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Awaiting payment" value={stats?.pendingPayment} href="/bookings?status=PENDING_PAYMENT" />
        <StatCard label="Confirmed" value={stats?.confirmed} href="/bookings?status=CONFIRMED" />
        <StatCard label="In progress" value={stats?.inProgress} href="/bookings" />
        <StatCard label="Pending quotes" value={stats?.pendingQuotes} href="/quotes" accent />
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <Link href="/bookings" className="rounded-xl border border-border bg-surface p-5 hover:border-gold">
          <h2 className="text-xl" style={{ fontFamily: 'Georgia, serif' }}>Bookings</h2>
          <p className="text-text-muted text-sm mt-1">Review schedule, assign crews and leads.</p>
        </Link>
        <Link href="/quotes" className="rounded-xl border border-border bg-surface p-5 hover:border-gold">
          <h2 className="text-xl" style={{ fontFamily: 'Georgia, serif' }}>Quote requests</h2>
          <p className="text-text-muted text-sm mt-1">Respond to walkthrough requests with a price.</p>
        </Link>
      </div>

      {canSeeFinance && <FinanceSnapshot />}

      {/* Live OTP panel — visible to owner in non-production only */}
      {session?.user.isOwner && <LiveOtpPanel />}
    </div>
  );
}

function LiveOtpPanel() {
  const [codes, setCodes] = useState<OtpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000),
      );
      const res = await Promise.race([api.recentOtps(), timeout]);
      setCodes(res.codes);
      setLastRefresh(new Date());
    } catch {
      // Timeout, network error, or API unavailable — keep existing codes
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    intervalRef.current = setInterval(() => void refresh(), 8000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="mt-10 rounded-xl border border-gold/40 bg-gold-soft/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Dev · Live OTP Codes</p>
          <p className="text-lg mt-0.5" style={{ fontFamily: 'Georgia, serif' }}>
            Active verification codes
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="text-xs text-text-muted underline hover:text-gold-deep disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : lastRefresh ? `Last: ${lastRefresh.toLocaleTimeString()}` : 'Refresh'}
        </button>
      </div>

      {loading && codes.length === 0 && (
        <p className="text-text-muted text-sm">Checking for active codes…</p>
      )}

      {!loading && codes.length === 0 && (
        <p className="text-text-muted text-sm italic">
          No active codes right now — request an OTP from the mobile app to see it here.
        </p>
      )}

      {codes.length > 0 && (
        <div className="space-y-2">
          {codes.map((row, i) => (
            <OtpRowCard key={i} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function OtpRowCard({ row }: { row: OtpRow }) {
  const [copied, setCopied] = useState(false);
  const expiresIn = Math.max(0, Math.round((new Date(row.expiresAt).getTime() - Date.now()) / 1000 / 60));

  const copy = () => {
    void navigator.clipboard.writeText(row.codePlain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-text-muted text-xs truncate">{row.phone}</p>
        <p className="font-mono text-2xl tracking-[0.35em] text-gold-deep mt-0.5">{row.codePlain}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-text-muted text-xs">Expires in {expiresIn}m</p>
        <button
          onClick={copy}
          className="mt-1 text-xs font-medium text-gold-deep underline hover:no-underline"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, href, accent }: { label: string; value?: number; href: string; accent?: boolean }) {
  return (
    <Link href={href} className={`rounded-xl border p-5 ${accent ? 'border-gold bg-gold-soft/20' : 'border-border bg-surface'}`}>
      <p className="text-text-muted text-xs uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-3xl" style={{ fontFamily: 'Georgia, serif' }}>
        {value ?? '—'}
      </p>
    </Link>
  );
}

/** Percent change, or null when there is no previous figure to compare against. */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

/**
 * Headline financials on the landing page: this month against target, and the
 * 12-month shape of the business. The full breakdowns live on Insights.
 */
function FinanceSnapshot() {
  const router = useRouter();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [breakdown, setBreakdown] = useState<RevenueBreakdown | null>(null);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [equity, setEquity] = useState<EquityOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const pad = (n: number) => String(n).padStart(2, '0');
    const from = `${y}-${pad(m)}-01`;
    const to = `${y}-${pad(m)}-${new Date(y, m, 0).getDate()}`;

    Promise.all([
      api.overview(y, m),
      api.revenueBreakdown(from, to).catch(() => null),
      api.financialSummary(from, to).catch(() => null),
      api.equity(from, to).catch(() => null), // cap-table holders only
    ])
      .then(([o, b, sm, eq]) => {
        setOverview(o.overview);
        setBreakdown(b?.breakdown ?? null);
        setSummary(sm?.summary ?? null);
        setEquity(eq?.overview ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-10 rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">
        Loading financials…
      </div>
    );
  }
  if (!overview) return null;

  const expenseSlices = summary
    ? (Object.entries(summary.expensesByCategoryCents) as [ExpenseCategory, number][]).map(
        ([category, cents]) => ({ key: category, label: EXPENSE_LABELS[category], value: cents }),
      )
    : [];

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>
          This month
        </h2>
        <Link href="/insights" className="text-sm font-medium text-bronze hover:underline">
          Full insights →
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatTile
            label="Revenue"
            value={money(overview.revenue.actual)}
            delta={pctChange(overview.revenue.actual, overview.previousRevenueCents)}
            deltaLabel="vs last month"
            context="Income from approved jobs this month"
            progressPercent={overview.revenue.target > 0 ? overview.revenue.percent : null}
            progressLabel={
              overview.revenue.target > 0
                ? `${overview.revenue.percent}% of ${money(overview.revenue.target)} target`
                : undefined
            }
          />
          <StatTile
            label="Net profit"
            value={money(overview.netProfit.actual)}
            delta={pctChange(overview.netProfit.actual, overview.previousNetCents)}
            deltaLabel="vs last month"
            context="After job expenses, before any reserve"
            progressPercent={overview.netProfit.target > 0 ? overview.netProfit.percent : null}
            progressLabel={
              overview.netProfit.target > 0
                ? `${overview.netProfit.percent}% of ${money(overview.netProfit.target)} target`
                : undefined
            }
          />
          <StatTile
            label="Jobs completed"
            value={String(overview.jobs.actual)}
            delta={pctChange(overview.jobs.actual, overview.previousJobCount)}
            deltaLabel="vs last month"
            context="Approved jobs recorded this month"
            progressPercent={overview.jobs.target > 0 ? overview.jobs.percent : null}
            progressLabel={
              overview.jobs.target > 0 ? `${overview.jobs.actual} of ${overview.jobs.target} planned` : undefined
            }
          />
          <StatTile
            label="Margin"
            value={
              overview.revenue.actual > 0
                ? `${Math.round((overview.netProfit.actual / overview.revenue.actual) * 100)}%`
                : '—'
            }
            context="Net profit as a share of revenue"
          />
        </div>

        {/* Rings replace the old flat "no target set" bar: with no target they
            render an empty track carrying the action, not dead space. */}
        <AchievementRow>
          <AchievementRing
            label="Revenue"
            percent={overview.revenue.target > 0 ? overview.revenue.percent : null}
            caption="of monthly target"
            onSetTarget={() => router.push('/insights')}
          />
          <AchievementRing
            label="Net profit"
            percent={overview.netProfit.target > 0 ? overview.netProfit.percent : null}
            caption="of monthly target"
            onSetTarget={() => router.push('/insights')}
          />
          <AchievementRing
            label="Jobs"
            percent={overview.jobs.target > 0 ? overview.jobs.percent : null}
            caption="of jobs planned"
            onSetTarget={() => router.push('/insights')}
          />
        </AchievementRow>
      </div>

      {/* The 12-month trend chart was here. Removed from the dashboard: with a
          single month of recorded data it renders as one spike in a row of
          zeros, which reads as broken rather than informative. The chart still
          lives on Insights, where a sparse series is expected while history
          accumulates. */}

      {/* Part-to-whole views of the month */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue by service line">
          <DonutChart
            slices={(breakdown?.byServiceLine ?? []).map((i) => ({
              key: i.key, label: i.label, value: i.incomeCents,
            }))}
            centreLabel="total revenue"
            emptyLabel="No classified revenue yet. Set a service line when you record a job."
          />
        </ChartCard>

        <ChartCard title="Where the money went">
          <DonutChart
            slices={expenseSlices}
            centreLabel="total expenses"
            emptyLabel="No expenses recorded this month."
          />
        </ChartCard>

        <ChartCard title="Revenue by client segment">
          <DonutChart
            slices={(breakdown?.bySegment ?? []).map((i) => ({
              key: i.key, label: i.label, value: i.incomeCents,
            }))}
            centreLabel="total revenue"
            emptyLabel="No segmented revenue yet."
          />
        </ChartCard>

        {equity && (
          <ChartCard title="Profit share">
            <DonutChart
              slices={equity.allocations.map((a) => ({
                key: a.shareholder.id,
                label: `${a.shareholder.name} (${(a.shareholder.basisPoints / 100).toFixed(0)}%)`,
                value: Math.max(0, a.periodShareCents),
              }))}
              centreLabel="net profit shared"
              emptyLabel="No shareholders on the cap table."
            />
          </ChartCard>
        )}
      </div>
    </section>
  );
}
