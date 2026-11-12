'use client';

import { BellRing, CalendarClock, CircleCheck, FileText, UsersRound, type LucideIcon } from 'lucide-react';
import type { AdminStats } from '@onyxhawk/types';

import { cn } from '../../../lib/cn';
import { Card } from '../../ui/card';
import { ActionCard } from '../ActionCard';
import type { BlockResult } from '../block-state';
import { BlockFailed, Skeleton } from '../BlockState';
import { StatusStrip } from '../StatusStrip';
import { TextLink } from '../TextLink';
import { ATTENTION_CARDS, attentionView, type AttentionCardKey } from './attention';
import { SectionHeading } from './SectionHeading';

/** How each card looks. Its words and its link are in attention.ts, with the rule that shows it. */
const CARD_LOOK: Record<AttentionCardKey, { icon: LucideIcon; tile: 'bookings' | 'attention'; overdue?: boolean }> = {
  'bookings-to-assign': { icon: UsersRound, tile: 'bookings' },
  'quotes-to-price': { icon: FileText, tile: 'attention' },
  'unpaid-past-date': { icon: CalendarClock, tile: 'bookings', overdue: true },
};

/** One row for one or two cards, three across for three. Under 1024px they stack, as on a phone. */
const CARD_GRID = ['', '', 'lg:grid-cols-2', 'lg:grid-cols-3'];

/** A quiet line in a card: a teal tick, the news, and what may follow it. */
function QuietLine({ children, links }: { children: React.ReactNode; links?: React.ReactNode }) {
  return (
    <Card accent="attention" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
      <p className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-charcoal">
        {/* Teal is the colour for good news; the tick says it without the colour. */}
        <CircleCheck aria-hidden="true" className="size-[18px] shrink-0 text-positive" />
        {children}
      </p>
      {links}
    </Card>
  );
}

/**
 * Section 1, "Needs attention": the four live counters and a card for each
 * kind of work that is waiting. The counts are always the present's, whatever
 * month the rest of the page shows. `attentionView` decides what appears;
 * this draws it.
 */
export function AttentionSection({
  stats, className,
}: {
  /** The live counts, from `useAttention`. */
  stats: BlockResult<AdminStats>;
  className?: string;
}) {
  return (
    <section id="attention" aria-labelledby="attention-heading" className={className}>
      <SectionHeading id="attention-heading" section="attention" icon={BellRing} title="Needs attention" note="right now" />
      <AttentionBody stats={stats} />
    </section>
  );
}

function AttentionBody({ stats }: { stats: BlockResult<AdminStats> }) {
  // One request feeds the strip and every card, so one failure and one Retry
  // stand for the section. No card is drawn on counts that did not arrive.
  if (stats.status === 'failed') {
    return (
      <Card accent="attention" className="p-3">
        <BlockFailed what="what needs attention" onRetry={stats.retry} />
      </Card>
    );
  }

  // The placeholder is one line: a quiet day is the usual answer, and then
  // nothing under the section moves when the counts land.
  if (stats.status === 'loading') {
    return (
      <Card
        accent="attention"
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4"
        aria-busy="true"
      >
        <span className="sr-only">Loading what needs attention</span>
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-5 w-40" />
      </Card>
    );
  }

  const view = attentionView(stats.data);

  if (view.kind === 'all-clear') {
    return (
      <QuietLine
        links={
          <p className="flex gap-5">
            <TextLink href="/bookings">Bookings</TextLink>
            <TextLink href="/quotes">Quotes</TextLink>
          </p>
        }
      >
        All clear. No active jobs and nothing waiting.
      </QuietLine>
    );
  }

  return (
    <div className="space-y-4">
      {view.strip && <StatusStrip stats={stats.data} />}

      {view.cards.length === 0 ? (
        <QuietLine>Nothing to assign, price or chase.</QuietLine>
      ) : (
        <div className={cn('grid gap-4', CARD_GRID[view.cards.length])}>
          {view.cards.map(({ key, count }) => (
            <ActionCard key={key} {...ATTENTION_CARDS[key]} {...CARD_LOOK[key]} count={count} />
          ))}
        </div>
      )}
    </div>
  );
}
