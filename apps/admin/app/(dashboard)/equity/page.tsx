'use client';

import { Info, TrendingDown, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ShareholderDto } from '@onyxhawk/types';
import { api } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { cn } from '../../../src/lib/cn';
import { money } from '../../../src/lib/money';
import { BlockFailed, Skeleton } from '../../../src/components/dashboard/BlockState';
import { useBlock } from '../../../src/components/dashboard/useBlock';
import { EditDetails } from '../../../src/components/ownership/EditDetails';
import { EditStakes } from '../../../src/components/ownership/EditStakes';
import { Hero } from '../../../src/components/ownership/Hero';
import { shapeHistory } from '../../../src/components/ownership/history';
import { HistoryChart } from '../../../src/components/ownership/HistoryChart';
import { HoldersTable } from '../../../src/components/ownership/HoldersTable';
import {
  DEFAULT_SCOPE, nairobiMonth, scopeFigures, type OwnershipScope, type ReceivedEquityOverview,
} from '../../../src/components/ownership/scope';
import { ShareBar } from '../../../src/components/ownership/ShareBar';
import { RETAINED_SEGMENT, splitSegments } from '../../../src/components/ownership/split';
import { BASIS_POINTS_TOTAL, formatPercentShort as pct } from '../../../src/components/ownership/stakes';
import { noSplitLine, scopeLine, shareHeadingParts } from '../../../src/components/ownership/wording';
import { Button } from '../../../src/components/ui/button';
import { Card } from '../../../src/components/ui/card';
import { Segmented, type SegmentedOption } from '../../../src/components/ui/segmented';
import { enoughToDraw } from '../../../src/components/stacked-bars';

const SCOPES: SegmentedOption<OwnershipScope>[] = [
  { value: 'all-time', label: 'All time' },
  { value: 'this-month', label: 'This month' },
];

const HISTORY_MONTHS = 12;
const cardTitle = 'font-serif text-xl text-charcoal';

export default function EquityPage() {
  const session = useRequireAdmin();
  // "This month" is the current month in Nairobi. The one overview requested
  // for it carries the all-time figures too, so the control needs no request.
  const month = useMemo(() => nairobiMonth(new Date()), []);
  const [scope, setScope] = useState<OwnershipScope>(DEFAULT_SCOPE);

  const [stakesOpen, setStakesOpen] = useState(false);
  const [detailsFor, setDetailsFor] = useState<ShareholderDto | null>(null);

  // The page's two requests. Each feeds its own blocks, so a failed history
  // leaves the figures and the split standing, and the other way round.
  const overviewBlock = useBlock(
    async (): Promise<ReceivedEquityOverview> => (await api.equity(month.from, month.to)).overview,
    [month.from, month.to],
  );
  const historyBlock = useBlock(
    async () => shapeHistory((await api.equityHistory(HISTORY_MONTHS)).history.months),
    [],
  );

  if (session === undefined) return <div className="text-text-muted">Loading…</div>;
  if (!session) return null;
  if (!session.user.isOwner) {
    return <div className="rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">Owner access required.</div>;
  }

  // A holder's name and every stake appear in both requests.
  const reload = () => {
    overviewBlock.retry();
    historyBlock.retry();
  };

  const overview = overviewBlock.status === 'loaded' ? overviewBlock.data : null;
  const history = historyBlock.status === 'loaded' ? historyBlock.data : null;

  // Every figure below comes from here, so the control moves them together.
  const figures = overview ? scopeFigures(overview, scope) : null;
  const holders = figures?.holders ?? [];
  const totalBasisPoints = overview?.totalBasisPoints ?? 0;
  const scopeWords = scope === 'all-time' ? 'all-time' : 'this month';
  // With no holders yet, the prompt in the split card carries the one primary "Edit stakes".
  const noHolders = overview !== null && holders.length === 0;
  // The line that explains the bars is there while they load and once they are
  // drawn. A single month of figures is a note, not a chart, and a failed
  // request has no bars to explain.
  const chartable = history ? enoughToDraw(history.columns) : historyBlock.status !== 'failed';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">Ownership</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented legend="Figures shown" name="ownership-scope" options={SCOPES} value={scope} onChange={setScope} />
          <Button variant={noHolders ? 'outline' : 'primary'} onClick={() => setStakesOpen(true)} disabled={!overview}>
            Edit stakes
          </Button>
        </div>
      </div>

      {/* ── The figures and the split: the overview request ───────────────────── */}
      {overviewBlock.status === 'failed' ? (
        <Card className="p-6">
          <BlockFailed what="the ownership figures" onRetry={overviewBlock.retry} />
        </Card>
      ) : (
        <>
          <Hero figures={figures} scopeText={scopeLine(scope, overview?.allTime.firstJobDate ?? null, month.label)} />

          {!overview || !figures ? (
            <Card className="p-5 sm:p-6" aria-busy="true">
              <h2 className={cardTitle}>Share split</h2>
              <Skeleton className="mt-5 h-11 w-full rounded-lg" />
              <Skeleton className="mt-6 h-4 w-2/3" />
              <Skeleton className="mt-4 h-4 w-1/2" />
              <span className="sr-only" role="status">Loading the share split</span>
            </Card>
          ) : holders.length === 0 ? (
            <Card className="p-5 sm:p-6">
              <h2 className={cardTitle}>Share split</h2>
              <div className="mt-5 rounded-lg bg-mist px-5 py-8 text-center text-sm text-charcoal-muted">
                <p>No shareholders yet. Add the holders and their stakes, which must total 100%.</p>
                <Button className="mt-4" onClick={() => setStakesOpen(true)}>Edit stakes</Button>
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className={cardTitle}>Share split</h2>
                  <p className="figure text-sm text-charcoal-muted">
                    {holders.length} shareholder{holders.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <div className="mt-5">
                  <SplitBar
                    netCents={figures.netCents}
                    scope={scope}
                    holders={holders}
                    unallocatedCents={figures.unallocatedCents}
                  />
                </div>

                {/* The stakes do not add up: say so plainly. */}
                {totalBasisPoints !== BASIS_POINTS_TOTAL && (
                  <div className="mt-5 flex gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                    <div>
                      <p className="figure font-medium text-warning">The stakes add up to {pct(totalBasisPoints)}, not 100%.</p>
                      <p className="figure mt-1 text-charcoal-muted">
                        {totalBasisPoints < BASIS_POINTS_TOTAL
                          ? `The remaining ${pct(BASIS_POINTS_TOTAL - totalBasisPoints)} (${money(figures.unallocatedCents)} ${scopeWords}) is shown as retained by the business.`
                          : 'Shares are over-allocated: the amounts below total more than the profit. Edit the stakes so they total 100%.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <HoldersTable
                figures={figures}
                totalBasisPoints={totalBasisPoints}
                shareHeadingLines={shareHeadingParts(scope, month.label)}
                onEditDetails={setDetailsFor}
                onEditStakes={() => setStakesOpen(true)}
              />
            </Card>
          )}
        </>
      )}

      {/* ── Twelve months: the history request ────────────────────────────────── */}
      {/* With no holders there is no split to draw, and the prompt above says what to do. */}
      {!(history && history.series.length === 0) && (
        <Card className="p-5 sm:p-6" aria-busy={historyBlock.status === 'loading'}>
          <h2 className={cardTitle}>Last twelve months</h2>
          {chartable && (
            <p className="mt-1 max-w-prose text-sm text-charcoal-muted">
              Each bar is a month’s net profit, split between the shareholders at today’s stakes.
            </p>
          )}
          <div className="mt-5">
            {history ? (
              <HistoryChart history={history} />
            ) : historyBlock.status === 'failed' ? (
              <BlockFailed what="the twelve-month history" onRetry={historyBlock.retry} />
            ) : (
              <>
                <Skeleton className="h-64 w-full rounded-lg" />
                <span className="sr-only" role="status">Loading the twelve-month history</span>
              </>
            )}
          </div>
        </Card>
      )}

      <aside className="flex gap-3 rounded-xl border border-navy/15 bg-navy-soft/60 px-5 py-4">
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-navy" />
        <div className="text-sm">
          <h2 className="font-medium text-charcoal">How net profit is calculated</h2>
          {/* The card is as wide as the page, so its two sentences use that width. */}
          <p className="mt-1 leading-relaxed text-charcoal-muted">
            Net profit is income after expenses, counted for approved jobs only. Each share is that holder’s stake of the net profit.
          </p>
        </div>
      </aside>

      <EditStakes
        open={stakesOpen}
        onOpenChange={setStakesOpen}
        holders={holders.map((h) => h.shareholder)}
        onStakesChanged={reload}
      />
      <EditDetails
        holder={detailsFor}
        onOpenChange={(open) => { if (!open) setDetailsFor(null); }}
        onSaved={reload}
      />
    </div>
  );
}

/** The share bar, or the one line that takes its place when there is no profit to split. */
function SplitBar({
  netCents, scope, holders, unallocatedCents,
}: {
  netCents: number;
  scope: OwnershipScope;
  holders: { shareholder: ShareholderDto; shareCents: number }[];
  unallocatedCents: number;
}) {
  const line = noSplitLine(netCents, scope);
  if (line !== null) {
    const loss = netCents < 0;
    return (
      <p
        className={cn(
          'figure flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium',
          loss ? 'bg-danger/10 text-danger' : 'bg-mist text-charcoal-muted',
        )}
      >
        {loss && <TrendingDown aria-hidden="true" className="size-4 shrink-0" />}
        {line}
      </p>
    );
  }

  const amounts = new Map(holders.map((h) => [h.shareholder.id, h.shareCents]));
  amounts.set(RETAINED_SEGMENT, unallocatedCents);
  return <ShareBar segments={splitSegments(holders.map((h) => h.shareholder))} amounts={amounts} />;
}
