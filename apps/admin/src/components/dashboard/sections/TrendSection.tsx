'use client';

import { TrendingUp } from 'lucide-react';
import type { OverviewSeriesMonth } from '@onyxhawk/types';

import { TrendChart } from '../../charts';
import { Card } from '../../ui/card';
import type { BlockResult } from '../block-state';
import { BlockFailed, Skeleton } from '../BlockState';
import { monthLabel, type YearMonth } from '../month';
import { SectionHeading } from './SectionHeading';
import { trendView } from './trend';

/**
 * Section 3, "Trend": income and net profit by month, ending at the month on
 * screen. The months come in the overview's answer (`useTrend` reads them out
 * of it), so this section loads, fails and retries with the month's figures.
 * What it covers is read from the months themselves and said beside its name:
 * "12 months to August 2026", or six against a server that sends six.
 */
export function TrendSection({
  trend, month,
}: {
  /** The months to chart, oldest first, from `useTrend`. */
  trend: BlockResult<OverviewSeriesMonth[]>;
  /** The month on screen, which the trend ends at. */
  month: YearMonth;
}) {
  const view = trendView(trend);

  return (
    <section id="trend" aria-labelledby="trend-heading">
      <SectionHeading
        id="trend-heading"
        section="trend"
        icon={TrendingUp}
        title="Trend"
        note={view.kind === 'chart' ? view.period : undefined}
      />

      {/* A failure shows as a failure: never as a chart of twelve empty months. */}
      {view.kind === 'failed' && (
        <Card accent="trend" className="p-3">
          <BlockFailed
            what={`the monthly trend to ${monthLabel(month)}`}
            onRetry={trend.retry}
            className="min-h-28"
          />
        </Card>
      )}

      {view.kind === 'loading' && (
        <>
          {/* Said from outside the busy card: a screen reader may hold back what is inside it. */}
          <span role="status" className="sr-only">Loading the monthly trend to {monthLabel(month)}</span>
          <Card accent="trend" className="p-5" aria-busy="true">
            <Skeleton className="h-5 w-56" />
            {/* About the height of the plot at each width, so the sections below keep their place. */}
            <Skeleton className="mt-4 h-36 w-full rounded-lg sm:h-64" />
            <Skeleton className="mt-4 h-4 w-40" />
          </Card>
        </>
      )}

      {view.kind === 'chart' && <TrendChart data={view.points} accent="trend" />}
    </section>
  );
}
