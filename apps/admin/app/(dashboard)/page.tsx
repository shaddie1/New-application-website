'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { greeting } from '../../src/lib/greeting';
import {
  useAttention,
  useExpenseSummary,
  useMonthOverview,
  useOwnershipSummary,
  useRevenueBreakdown,
  useSavedTargets,
  useTrend,
} from '../../src/components/dashboard/hooks';
import { MonthSelector } from '../../src/components/dashboard/MonthSelector';
import { nairobiYearMonth, type YearMonth } from '../../src/components/dashboard/month';
import { AttentionSection } from '../../src/components/dashboard/sections/AttentionSection';
import { BreakdownSection } from '../../src/components/dashboard/sections/BreakdownSection';
import { MonthSection } from '../../src/components/dashboard/sections/MonthSection';
import { OwnershipSummarySection } from '../../src/components/dashboard/sections/OwnershipSummarySection';
import { TrendSection } from '../../src/components/dashboard/sections/TrendSection';
import { Button } from '../../src/components/ui/button';
import { Card } from '../../src/components/ui/card';

// Finance data is not served to every staff role, so only ask for it when the
// signed-in user is actually allowed it — otherwise the request 403s.
const FINANCE_ROLES = ['ADMIN', 'FINANCIAL_MANAGER', 'SHAREHOLDER'];

type OtpRow = { phone: string; email: string | null; purpose: string; codePlain: string; createdAt: string; expiresAt: string };

/**
 * The landing page, top to bottom: a greeting and the month selector; what
 * needs attention right now; the month's figures and targets; the trend to
 * that month; where the month's money came from and went; how its profit is
 * split. Every section draws the blocks it is handed and loads, fails and
 * retries by itself. A section the signed-in role may not see is absent, not
 * empty:
 *
 *   everyone signed in      needs attention
 *   owner and finance roles the month, the trend and the breakdown
 *   owner only              the ownership summary
 *
 * Each section's request is made by a small wrapper below, which is mounted
 * only for those who see the section, so nothing is asked for on behalf of an
 * account that may not have it.
 */
export default function DashboardPage() {
  const { session } = useAuth();
  // One reading of the clock for the whole visit, so the greeting, the date
  // and the month the selector stops at cannot disagree.
  const [now] = useState(() => new Date());
  const [current] = useState<YearMonth>(() => nairobiYearMonth(now));
  // The month on screen. It drives the figures, targets, trend, breakdown and
  // ownership summary; "Needs attention" always shows the present.
  const [month, setMonth] = useState<YearMonth>(current);

  const user = session?.user;
  const isOwner = user?.isOwner === true;
  const canSeeFinance = !!user && (isOwner || FINANCE_ROLES.includes(user.role));

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl text-charcoal">{greeting(now, user?.fullName)}</h1>
          <p className="mt-1 text-sm text-charcoal-muted">
            {now.toLocaleDateString('en-GB', {
              timeZone: 'Africa/Nairobi',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        {/* The selector moves the month's figures, so it is there only for those who see them. */}
        {canSeeFinance && <MonthSelector value={month} current={current} onChange={setMonth} />}
      </header>

      <div className="mt-8 space-y-10">
        <Attention />
        {canSeeFinance && (
          <>
            <MonthAndTrend month={month} current={current} />
            <Breakdown month={month} current={current} canOpenJobsAndCosts={isOwner} />
          </>
        )}
        {isOwner && <OwnershipSummary month={month} current={current} />}
      </div>

      {/* Dev sign-in codes: the server decides whether this exists (404 when dev tools are off). */}
      {isOwner && <LiveOtpPanel />}
    </div>
  );
}

// ── A section and its request ───────────────────────────────────────────────
// Each wrapper calls its section's hook once and hands the block down.
// Mounting a wrapper is what sends the request.

function Attention() {
  return <AttentionSection stats={useAttention()} />;
}

/**
 * Sections 2 and 3 read one overview answer, so one call of its hook feeds
 * both. Everyone shown the month may set its targets; the server refuses a
 * save from anyone else.
 */
function MonthAndTrend({ month, current }: { month: YearMonth; current: YearMonth }) {
  const overview = useMonthOverview(month);
  const trend = useTrend(overview);
  const savedTargets = useSavedTargets();
  return (
    <>
      <MonthSection overview={overview} savedTargets={savedTargets} month={month} current={current} canSetTargets />
      <TrendSection trend={trend} month={month} />
    </>
  );
}

function Breakdown({
  month, current, canOpenJobsAndCosts,
}: {
  month: YearMonth;
  current: YearMonth;
  canOpenJobsAndCosts: boolean;
}) {
  return (
    <BreakdownSection
      revenue={useRevenueBreakdown(month)}
      expenses={useExpenseSummary(month)}
      month={month}
      current={current}
      canOpenJobsAndCosts={canOpenJobsAndCosts}
    />
  );
}

/** Mounted for the owner alone, who is also the one who manages ownership. */
function OwnershipSummary({ month, current }: { month: YearMonth; current: YearMonth }) {
  return <OwnershipSummarySection summary={useOwnershipSummary(month)} month={month} current={current} canManageOwnership />;
}

function LiveOtpPanel() {
  // null until the server answers; false when dev tools are off or it cannot be reached.
  const [enabled, setEnabled] = useState<boolean | null>(null);
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
    let cancelled = false;
    // Ask once. Only an answer turns the panel on and starts the polling; a
    // 404 (dev tools off) or an unreachable server leaves it hidden and silent.
    api
      .recentOtps()
      .then((res) => {
        if (cancelled) return;
        setCodes(res.codes);
        setLastRefresh(new Date());
        setLoading(false);
        setEnabled(true);
        intervalRef.current = setInterval(() => void refresh(), 8000);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!enabled) return null;

  return (
    <Card className="mt-10 border-dashed border-border-strong p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-xs uppercase tracking-widest text-charcoal-muted">Development only</p>
          <h2 className="mt-0.5 font-serif text-lg text-charcoal">Active sign-in codes</h2>
        </div>
        {/* The time is a fact and the button is the action: two things, so
            the time is plain text and only "Refresh" can be pressed. */}
        <div className="flex items-center gap-1.5">
          {lastRefresh && (
            <span className="figure text-xs text-charcoal-muted">Last: {lastRefresh.toLocaleTimeString()}</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading} aria-busy={loading}>
            <RotateCw aria-hidden="true" className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && codes.length === 0 && (
        <p className="text-sm text-charcoal-muted">Checking for active codes…</p>
      )}

      {!loading && codes.length === 0 && (
        <p className="text-sm text-charcoal-muted">
          No active codes right now. Request a code from the login page or the mobile app to see it here.
        </p>
      )}

      {codes.length > 0 && (
        <div className="space-y-2">
          {codes.map((row, i) => (
            <OtpRowCard key={i} row={row} />
          ))}
        </div>
      )}
    </Card>
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
    <div className="flex items-center gap-4 rounded-lg border border-line bg-mist px-4 py-3">
      <div className="min-w-0 flex-1">
        {/* Staff codes go by email, customer codes by SMS — show where each one went. */}
        <p className="truncate text-xs text-charcoal-muted">{row.email ?? row.phone}{row.email ? ' · email' : ' · SMS'}</p>
        <p className="figure mt-0.5 text-2xl tracking-[0.3em] text-charcoal">{row.codePlain}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="figure text-xs text-charcoal-muted">Expires in {expiresIn}m</p>
        <button
          onClick={copy}
          className="mt-1 rounded text-xs font-medium text-navy underline underline-offset-2 hover:no-underline"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
