'use client';

import Link from 'next/link';
import { ArrowRight, Clock, type LucideIcon } from 'lucide-react';

import { cn } from '../../lib/cn';
import { ClickableCard } from '../ui/card';

// The icon tile says what the card is about. Sky is the colour for bookings
// wherever they appear, and the trend section's sky is the one sky there is;
// anything else in "Needs attention" takes that section's own butter and gold.
// The class names are written whole so that Tailwind finds them.
const tiles = {
  bookings: 'bg-section-trend-tint text-section-trend-deep',
  attention: 'bg-section-attention-tint text-section-attention-deep',
};

/**
 * A card that leads to a place where work waits: an icon, a title, one line
 * on what is waiting, how many, and an arrow.
 *
 * The count is a badge: gold for something that needs attention, coral for
 * something overdue, which also carries a clock so it is not told by colour
 * alone. With no count given the card shows without one; it never shows a
 * zero it was not handed.
 *
 * The layout follows the card's own width, not the screen's, so it holds
 * whether the card has a row to itself or shares it with two others. Under
 * 24rem the icon and the count sit above the words; from 24rem everything is
 * on one row.
 */
export function ActionCard({
  href, icon: Icon, tile, title, description, count, countLabel, overdue = false,
}: {
  href: string;
  icon: LucideIcon;
  /** What the card is about: a booking, or anything else that needs attention. */
  tile: keyof typeof tiles;
  title: string;
  description: string;
  /** How many are waiting. Left out when the server did not say. */
  count?: number;
  /** What the count is of, for screen readers: "quote requests waiting for a price". */
  countLabel: string;
  /** What is waiting is past its date. */
  overdue?: boolean;
}) {
  return (
    <div className="min-w-0 [container-type:inline-size]">
      {/* The thin top line of the "Needs attention" section, kept through the hover that darkens the outline. */}
      <ClickableCard
        asChild
        className="group h-full border-t-[3px] border-t-section-attention-strong hover:border-t-section-attention-strong"
      >
        <Link
          href={href}
          // The rows keep to the top, so cards of unequal text line up along their icons and titles.
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] content-start items-center gap-x-3 gap-y-3 p-5 [@container_(min-width:24rem)]:flex [@container_(min-width:24rem)]:gap-4"
        >
          <span
            aria-hidden="true"
            className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', tiles[tile])}
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </span>

          <span className="col-span-3 row-start-2 block min-w-0 [@container_(min-width:24rem)]:flex-1">
            <span className="block font-medium text-charcoal">{title}</span>
            <span className="mt-0.5 block text-sm text-charcoal-muted">{description}</span>
          </span>

          <span className="col-start-3 row-start-1 flex shrink-0 items-center gap-2.5">
            {typeof count === 'number' && (
              <span
                className={cn(
                  'figure inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold',
                  overdue ? 'bg-overdue-tint text-overdue' : 'bg-attention-tint text-attention',
                )}
              >
                {overdue && <Clock aria-hidden="true" className="size-3.5" />}
                {count}
                <span className="sr-only"> {countLabel}</span>
              </span>
            )}
            <ArrowRight
              aria-hidden="true"
              className="size-5 shrink-0 text-charcoal-muted transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-navy"
            />
          </span>
        </Link>
      </ClickableCard>
    </div>
  );
}
