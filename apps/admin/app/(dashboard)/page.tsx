'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { AdminStats, DashboardOverview, MonthlyTrendItem } from '@onyxhawk/types';
import { api, ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { StatTile, TargetMeter, TrendChart, money } from '../../src/components/charts';

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
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [trends, setTrends] = useState<MonthlyTrendItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    Promise.all([api.overview(now.getFullYear(), now.getMonth() + 1), api.financialTrends(12)])
      .then(([o, t]) => {
        setOverview(o.overview);
        setTrends(t.trends);
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

  const trendData = trends.map((t) => ({
    label: t.label,
    incomeCents: t.incomeCents,
    netCents: t.netCents,
  }));

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

      <div className="grid gap-4 md:grid-cols-3">
        <TargetMeter
          label="Revenue"
          actual={overview.revenue.actual}
          target={overview.revenue.target}
          format={money}
        />
        <TargetMeter
          label="Net profit"
          actual={overview.netProfit.actual}
          target={overview.netProfit.target}
          format={money}
        />
        <StatTile
          label="Jobs completed"
          value={String(overview.jobs.actual)}
          delta={pctChange(overview.jobs.actual, overview.previousJobCount)}
          deltaLabel="vs last month"
        />
      </div>

      <div className="mt-4 rounded-xl border border-line bg-white p-5">
        <p className="mb-4 text-xs uppercase tracking-widest text-charcoal-muted">
          Income &amp; net profit — last 12 months
        </p>
        <TrendChart data={trendData} />
      </div>
    </section>
  );
}
