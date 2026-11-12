'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, Clock, FileText, RotateCw } from 'lucide-react';

import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { greeting } from '../../src/lib/greeting';
import { ActionCard } from '../../src/components/dashboard/ActionCard';
import { ExpensesChart, ProfitShareChart, RevenueCharts } from '../../src/components/dashboard/Breakdowns';
import { MonthFigures } from '../../src/components/dashboard/MonthFigures';
import { MonthSelector } from '../../src/components/dashboard/MonthSelector';
import { StatusStrip } from '../../src/components/dashboard/StatusStrip';
import { TextLink } from '../../src/components/dashboard/TextLink';
import { isSameMonth, monthLabel, nairobiYearMonth, type YearMonth } from '../../src/components/dashboard/month';
import { activeBookings, noActiveJobs } from '../../src/components/dashboard/status';
import { useBlock } from '../../src/components/dashboard/useBlock';
import { Button } from '../../src/components/ui/button';
import { Card } from '../../src/components/ui/card';

// Finance data is not served to every staff role, so only ask for it when the
// signed-in user is actually allowed it — otherwise the request 403s.
const FINANCE_ROLES = ['ADMIN', 'FINANCIAL_MANAGER', 'SHAREHOLDER'];

type OtpRow = { phone: string; email: string | null; purpose: string; codePlain: string; createdAt: string; expiresAt: string };

/**
 * The landing page, top to bottom: a greeting and the month selector; what
 * needs doing right now; the month's figures and targets; where the month's
 * money came from and went. Every block loads by itself (see `useBlock`), and
 * a block the signed-in role may not see is absent, not empty:
 *
 *   everyone signed in      status strip, action cards
 *   owner and finance roles the month's tiles, targets and revenue charts
 *   owner only              "Where the money went" and "Profit share"
 */
export default function DashboardPage() {
  const { session } = useAuth();
  // One reading of the clock for the whole visit, so the greeting, the date
  // and the month the selector stops at cannot disagree.
  const [now] = useState(() => new Date());
  const [current] = useState<YearMonth>(() => nairobiYearMonth(now));
  // The month on screen. It drives the figures, targets, sparklines and
  // breakdown charts; the strip and the action cards always show the present.
  const [month, setMonth] = useState<YearMonth>(current);

  const stats = useBlock(() => api.stats().then((res) => res.stats), [], noActiveJobs);
  const counts = stats.status === 'loaded' || stats.status === 'empty' ? stats.data : null;

  const user = session?.user;
  const isOwner = user?.isOwner === true;
  const canSeeFinance = !!user && (isOwner || FINANCE_ROLES.includes(user.role));
  const onCurrentMonth = isSameMonth(month, current);

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

      <section className="mt-7" aria-label="Jobs and requests right now">
        {/* The counts below are always today's. Say so once a past month is on
            screen, so they are not read as that month's. */}
        {!onCurrentMonth && (
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-charcoal-muted">
            <Clock className="size-3.5" aria-hidden="true" />
            Right now
          </p>
        )}

        <StatusStrip stats={stats} />

        {/* Side by side only from 1024px. From 768px the side menu takes its
            share of the width, and two cards in what is left wrap their
            titles and descriptions badly, so there they stack as on a phone. */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ActionCard
            href="/bookings"
            icon={CalendarCheck}
            title="Bookings"
            description="Review the schedule, assign crews and leads."
            count={counts ? activeBookings(counts) : undefined}
            countLoading={stats.status === 'loading'}
            countLabel="active bookings"
          />
          <ActionCard
            href="/quotes"
            icon={FileText}
            title="Quote requests"
            description="Respond to walkthrough requests with a price."
            count={counts?.pendingQuotes}
            countLoading={stats.status === 'loading'}
            countLabel="pending quotes"
          />
        </div>
      </section>

      {canSeeFinance && user && (
        <section className="mt-10" aria-labelledby="month-heading">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="month-heading" className="font-serif text-2xl text-charcoal">
              {monthLabel(month)}
              {onCurrentMonth && <span className="ml-2.5 font-sans text-sm text-charcoal-muted">so far</span>}
            </h2>
            {/* Insights is the owner's page, as in the side menu. */}
            {isOwner && <TextLink href="/insights">Full insights</TextLink>}
          </div>

          <MonthFigures month={month} current={current} user={user} />

          {/* Part-to-whole views of the month. Each child is one grid cell and
              carries `min-w-0`, so a long legend label wraps inside its card. */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <RevenueCharts month={month} isCurrentMonth={onCurrentMonth} isOwner={isOwner} />
            {isOwner && (
              <>
                <ExpensesChart month={month} />
                <ProfitShareChart month={month} isCurrentMonth={onCurrentMonth} />
              </>
            )}
          </div>
        </section>
      )}

      {/* Dev sign-in codes: the server decides whether this exists (404 when dev tools are off). */}
      {isOwner && <LiveOtpPanel />}
    </div>
  );
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
