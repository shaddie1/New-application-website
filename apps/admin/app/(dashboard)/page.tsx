'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardSection } from '@onyxhawk/types';

import { useAuth } from '../../src/lib/auth';
import { greeting } from '../../src/lib/greeting';
import { hashScrollStep } from '../../src/lib/hash-scroll';
import {
  accessView,
  NO_SECTION_RE_ASKED,
  sectionRefusal,
  withReAsked,
  type ReAskedSections,
} from '../../src/components/dashboard/access-state';
import { AccessFailed, AccessLoading, BeingUpdated, NotLinked } from '../../src/components/dashboard/AccessStates';
import type { BlockResult } from '../../src/components/dashboard/block-state';
import { DevSignInCodes } from '../../src/components/dashboard/DevSignInCodes';
import {
  useAttention,
  useDashboardAccess,
  useExpenseSummary,
  useMonthOverview,
  useOwnershipSummary,
  useRevenueBreakdown,
  useSavedTargets,
  useTrend,
} from '../../src/components/dashboard/hooks';
import { MonthSelector } from '../../src/components/dashboard/MonthSelector';
import { followsMonth, nairobiYearMonth, type YearMonth } from '../../src/components/dashboard/month';
import { AttentionSection } from '../../src/components/dashboard/sections/AttentionSection';
import { BreakdownSection } from '../../src/components/dashboard/sections/BreakdownSection';
import { MonthSection } from '../../src/components/dashboard/sections/MonthSection';
import { OwnershipSummarySection } from '../../src/components/dashboard/sections/OwnershipSummarySection';
import { TrendSection } from '../../src/components/dashboard/sections/TrendSection';

/**
 * The landing page for everyone who signs in. It asks the server which
 * sections the account has before it builds anything, and then builds those
 * and no others, top to bottom:
 *
 *   1  needs attention     what is waiting right now
 *   2  the month           its figures and targets
 *   3  the trend           the months ending at it
 *   4  the breakdown       where its money came from and went
 *   5  the ownership       how its profit is split
 *
 * Who sees which is the server's list (`apps/api/src/dashboard/access.ts`)
 * and is not restated here. A section the account lacks is absent, not empty,
 * and nothing is asked for on its behalf: each section's request is made by a
 * small wrapper below, which is mounted only when the section is listed.
 * Every section loads, fails and retries by itself.
 */
export default function DashboardPage() {
  const { session, signOut } = useAuth();
  // One reading of the clock for the whole visit, so the greeting, the date
  // and the month the selector stops at cannot disagree.
  const [now] = useState(() => new Date());
  const [current] = useState<YearMonth>(() => nairobiYearMonth(now));
  // The month on screen. It drives the figures, targets, trend, breakdown and
  // ownership summary; "Needs attention" always shows the present.
  const [month, setMonth] = useState<YearMonth>(current);

  const access = useDashboardAccess();
  const view = accessView(access);

  // The sections whose refusal has already sent the page back to the access
  // list, so that each does so once in a visit.
  const [reAsked, setReAsked] = useState(NO_SECTION_RE_ASKED);
  const retryAccess = access.retry;
  const askAgain = useCallback(
    (section: DashboardSection) => {
      setReAsked((had) => withReAsked(had, section));
      retryAccess();
    },
    [retryAccess],
  );
  const refusals: Refusals = {
    reAsked,
    askingAgain: access.status === 'loaded' && access.refreshing,
    askAgain,
  };

  // The server says this is not a staff account, whatever the cached session
  // holds. Signing out clears that session, and the layout then leads to the
  // sign-in page; a plain redirect would be sent straight back here.
  const refused = view.kind === 'sign-out';
  useEffect(() => {
    if (refused) void signOut();
  }, [refused, signOut]);

  // The sections above the trend that have left loading, as their wrappers
  // report it: the jump to `#trend` waits for them.
  const [leftLoading, setLeftLoading] = useState(NONE_LEFT_LOADING);
  const onLeftLoading = useCallback((section: DashboardSection) => {
    setLeftLoading((had) => (had.has(section) ? had : new Set([...had, section])));
  }, []);
  useTrendFragment(
    view.kind === 'sections' ? view.sections : view.kind === 'not-linked' ? NO_SECTIONS : null,
    leftLoading,
  );

  const user = session?.user;
  const has = (section: DashboardSection) => view.kind === 'sections' && view.sections.includes(section);

  return (
    <div>
      {/* The greeting comes from the cached session, so it is there before the
          server has said anything. Its band carries the page's one gradient. */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 rounded-2xl border border-line/70 bg-gradient-to-r from-surface from-40% to-section-trend-tint px-5 py-5 sm:px-7 sm:py-6">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl text-charcoal">{greeting(now, user?.fullName)}</h1>
          <p className="figure mt-1 text-sm text-charcoal-muted">
            {now.toLocaleDateString('en-GB', {
              timeZone: 'Africa/Nairobi',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        {/* The selector moves every section but "Needs attention", so it is there when one of those is. */}
        {view.kind === 'sections' && followsMonth(view.sections) && (
          <MonthSelector value={month} current={current} onChange={setMonth} />
        )}
      </header>

      <div className="mt-10">
        {/* While the account is being signed out there is nothing to say: the sign-in page is a moment away. */}
        {(view.kind === 'loading' || view.kind === 'sign-out') && <AccessLoading />}
        {view.kind === 'being-updated' && <BeingUpdated onRetry={access.retry} />}
        {view.kind === 'failed' && <AccessFailed onRetry={access.retry} />}
        {view.kind === 'not-linked' && <NotLinked />}

        {view.kind === 'sections' && (
          <div className="space-y-12">
            {has('attention') && <Attention refusals={refusals} onLeftLoading={onLeftLoading} />}
            {has('month') && (
              <MonthAndTrend
                month={month}
                current={current}
                canSetTargets={view.canSetTargets}
                withTrend={has('trend')}
                refusals={refusals}
                onLeftLoading={onLeftLoading}
              />
            )}
            {has('breakdown') && (
              <Breakdown
                month={month}
                current={current}
                // Jobs & costs, where a job is classified, is the owner's page.
                canOpenJobsAndCosts={view.canManageOwnership}
                refusals={refusals}
              />
            )}
            {has('ownership') && (
              <OwnershipSummary
                month={month}
                current={current}
                canManageOwnership={view.canManageOwnership}
                refusals={refusals}
              />
            )}
          </div>
        )}
      </div>

      {/* Development sign-in codes. The session's owner flag and the server's
          own answer (404 when dev tools are off) decide this, not the access list. */}
      {user?.isOwner === true && <DevSignInCodes />}
    </div>
  );
}

// ── A section refused after the page was built ──────────────────────────────

/** What a wrapper needs to send its section back to the access list. */
type Refusals = {
  reAsked: ReAskedSections;
  /** The access list is being asked again; its last answer is still on screen. */
  askingAgain: boolean;
  askAgain: (section: DashboardSection) => void;
};

/**
 * A section the access list granted can still be refused (403) later: the
 * account's role or shareholder link changed while the page was open. The
 * first time that happens to a section the page asks the access list again
 * and rebuilds from its answer, which usually takes the section away. Until
 * that answer lands a refused block reads as loading, so the section keeps
 * its skeleton and does not flash an error for something the account may no
 * longer have. A refusal after that is the section's own error, with Retry.
 *
 * Give it every block the section asks for; pass each block through the
 * function it returns before handing it to the section.
 */
function useReAskOnRefusal(
  section: DashboardSection,
  blocks: BlockResult<unknown>[],
  { reAsked, askingAgain, askAgain }: Refusals,
): <T>(block: BlockResult<T>) => BlockResult<T> {
  const ask = blocks.some((block) => sectionRefusal(block, section, reAsked) === 'ask-access-again');
  useEffect(() => {
    if (ask) askAgain(section);
  }, [ask, askAgain, section]);

  const waiting = ask || askingAgain;
  return (block) =>
    waiting && block.status === 'failed' && block.httpStatus === 403
      ? { status: 'loading', retry: block.retry }
      : block;
}

// ── Arriving at /#trend ─────────────────────────────────────────────────────

const NONE_LEFT_LOADING: ReadonlySet<DashboardSection> = new Set<DashboardSection>();
/** What an account with no section has built. */
const NO_SECTIONS: readonly DashboardSection[] = [];

/** How a wrapper tells the page that its section has left loading. */
type OnLeftLoading = (section: DashboardSection) => void;

/**
 * Reports a section once its block has left loading: its figures, or its
 * error, are on screen and it has the height it will keep. A refused block
 * that reads as loading while the access list is asked again has not left.
 */
function useReportLeftLoading(section: DashboardSection, block: BlockResult<unknown>, onLeftLoading: OnLeftLoading) {
  const left = block.status !== 'loading';
  useEffect(() => {
    if (left) onLeftLoading(section);
  }, [left, onLeftLoading, section]);
}

/**
 * `/insights` sends its visitors to `/#trend`. `hashScrollStep` says what to
 * do about that fragment and when; this does it, once in a visit. `sections`
 * is what the page has built, or null while the access list has not said.
 */
function useTrendFragment(
  sections: readonly DashboardSection[] | null,
  leftLoading: ReadonlySet<DashboardSection>,
) {
  const done = useRef(false);
  useEffect(() => {
    const answer = hashScrollStep({
      fragment: window.location.hash,
      sections,
      settled: leftLoading,
      done: done.current,
    });
    done.current = answer.done;

    if (answer.step === 'scroll') {
      document.getElementById('trend')?.scrollIntoView();
      // Focus follows, so the next Tab starts from the trend and a screen
      // reader says where the page has gone. The heading takes focus from
      // here only, as a dialog's title does: -1 keeps it out of the Tab
      // order, and it is not a control, so it shows no focus ring.
      const heading = document.getElementById('trend-heading');
      if (heading) {
        heading.tabIndex = -1;
        heading.classList.add('outline-none');
        heading.focus({ preventScroll: true });
      }
    }

    if (answer.step === 'drop-fragment') {
      // Next.js watches this call and takes the new address as its own, so
      // the fragment does not come back with the next thing the router does.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [sections, leftLoading]);
}

// ── A section and its request ───────────────────────────────────────────────
// Each wrapper calls its section's hooks once and hands the blocks down.
// Mounting a wrapper is what sends the requests.

function Attention({ refusals, onLeftLoading }: { refusals: Refusals; onLeftLoading: OnLeftLoading }) {
  const asked = useAttention();
  const settled = useReAskOnRefusal('attention', [asked], refusals);
  const stats = settled(asked);
  useReportLeftLoading('attention', stats, onLeftLoading);
  return <AttentionSection stats={stats} />;
}

/**
 * Sections 2 and 3 read one overview answer, so one call of its hook feeds
 * both, and a refusal of it is the month's: the server grants the two
 * together.
 */
function MonthAndTrend({
  month, current, canSetTargets, withTrend, refusals, onLeftLoading,
}: {
  month: YearMonth;
  current: YearMonth;
  canSetTargets: boolean;
  withTrend: boolean;
  refusals: Refusals;
  onLeftLoading: OnLeftLoading;
}) {
  const asked = useMonthOverview(month);
  const settled = useReAskOnRefusal('month', [asked], refusals);
  const overview = settled(asked);
  useReportLeftLoading('month', overview, onLeftLoading);
  const trend = useTrend(overview);
  const savedTargets = useSavedTargets();
  return (
    <>
      <MonthSection
        overview={overview}
        savedTargets={savedTargets}
        month={month}
        current={current}
        canSetTargets={canSetTargets}
      />
      {withTrend && <TrendSection trend={trend} month={month} />}
    </>
  );
}

function Breakdown({
  month, current, canOpenJobsAndCosts, refusals,
}: {
  month: YearMonth;
  current: YearMonth;
  canOpenJobsAndCosts: boolean;
  refusals: Refusals;
}) {
  const revenue = useRevenueBreakdown(month);
  const expenses = useExpenseSummary(month);
  const settled = useReAskOnRefusal('breakdown', [revenue, expenses], refusals);
  return (
    <BreakdownSection
      revenue={settled(revenue)}
      expenses={settled(expenses)}
      month={month}
      current={current}
      canOpenJobsAndCosts={canOpenJobsAndCosts}
    />
  );
}

function OwnershipSummary({
  month, current, canManageOwnership, refusals,
}: {
  month: YearMonth;
  current: YearMonth;
  canManageOwnership: boolean;
  refusals: Refusals;
}) {
  const summary = useOwnershipSummary(month);
  const settled = useReAskOnRefusal('ownership', [summary], refusals);
  return (
    <OwnershipSummarySection
      summary={settled(summary)}
      month={month}
      current={current}
      canManageOwnership={canManageOwnership}
    />
  );
}
