import type { AdminStats } from '@onyxhawk/types';

import { noActiveJobs } from '../status';

/**
 * What the "Needs attention" section shows for a set of live counts, kept
 * free of React so the rule can be tested without a DOM.
 *
 * Six numbers decide it: the strip's four counters, and the two that only the
 * cards show (confirmed bookings with no crew, and unpaid bookings whose date
 * has passed).
 *
 *   the strip      when any of its four counters is above zero
 *   a card         when its own count is above zero
 *   one line       in place of the cards, when all three card counts are zero
 *   "all clear"    in place of the strip and the cards, when all six are zero
 */

export type AttentionCardKey = 'bookings-to-assign' | 'quotes-to-price' | 'unpaid-past-date';

export type AttentionCard = {
  key: AttentionCardKey;
  /** How many are waiting. Left out when the server did not send the count. */
  count?: number;
};

export type AttentionView =
  | { kind: 'all-clear' }
  /** `cards` empty: one line stands where the cards would be. */
  | { kind: 'work'; strip: boolean; cards: AttentionCard[] };

export function attentionView(stats: AdminStats): AttentionView {
  const strip = !noActiveJobs(stats);
  const { unassignedBookings, unpaidPastDate } = stats;
  const cards = [
    card('bookings-to-assign', unassignedBookings),
    card('quotes-to-price', stats.pendingQuotes),
    card('unpaid-past-date', unpaidPastDate),
  ];

  // A server from before the two card counts sends neither. A count that was
  // not sent is not zero, so every card stays, the two bookings cards with no
  // count on them, and the section is never called clear.
  if (unassignedBookings === undefined || unpaidPastDate === undefined) return { kind: 'work', strip, cards };

  const waiting = cards.filter((c) => (c.count ?? 0) > 0);
  if (!strip && waiting.length === 0) return { kind: 'all-clear' };
  return { kind: 'work', strip, cards: waiting };
}

function card(key: AttentionCardKey, count: number | undefined): AttentionCard {
  return count === undefined ? { key } : { key, count };
}

/**
 * Each card's words and where it leads. A bookings card opens the Bookings
 * page filtered to the status it counts.
 */
export const ATTENTION_CARDS: Record<
  AttentionCardKey,
  { title: string; description: string; href: string; /** What the count is of, for screen readers. */ countLabel: string }
> = {
  'bookings-to-assign': {
    title: 'Bookings to assign',
    description: 'Confirmed, with no crew on them yet.',
    href: '/bookings?status=CONFIRMED',
    countLabel: 'confirmed bookings with no crew',
  },
  'quotes-to-price': {
    title: 'Quotes to price',
    description: 'Walkthrough requests waiting for a price.',
    href: '/quotes',
    countLabel: 'quote requests waiting for a price',
  },
  'unpaid-past-date': {
    title: 'Unpaid bookings past their date',
    description: 'Still awaiting payment, dated in the last 30 days.',
    href: '/bookings?status=PENDING_PAYMENT',
    countLabel: 'unpaid bookings past their date',
  },
};
