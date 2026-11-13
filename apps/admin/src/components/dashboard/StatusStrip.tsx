'use client';

import Link from 'next/link';
import type { AdminStats } from '@onyxhawk/types';

import { cn } from '../../lib/cn';
import { Card } from '../ui/card';

const COUNTERS: { key: 'pendingPayment' | 'confirmed' | 'inProgress' | 'pendingQuotes'; label: string; href: string }[] = [
  { key: 'pendingPayment', label: 'Awaiting payment', href: '/bookings?status=PENDING_PAYMENT' },
  { key: 'confirmed', label: 'Confirmed', href: '/bookings?status=CONFIRMED' },
  { key: 'inProgress', label: 'In progress', href: '/bookings' },
  { key: 'pendingQuotes', label: 'Pending quotes', href: '/quotes' },
];

/** Hairlines between the cells: two by two on a phone, four in a row from 640px. */
const DIVIDERS = ['', 'border-l', 'border-t sm:border-l sm:border-t-0', 'border-l border-t sm:border-t-0'];

/**
 * The four live counters in one strip, each a link to the list it counts.
 * It draws the counts it is given and nothing else: whether there is a strip
 * at all, and what stands in its place while the counts load or after they
 * fail, is the section's to decide (see `attentionView`).
 */
export function StatusStrip({ stats }: { stats: AdminStats }) {
  return (
    <Card accent="attention" className="grid grid-cols-2 overflow-hidden sm:grid-cols-4">
      {COUNTERS.map((counter, i) => (
        <Link
          key={counter.key}
          href={counter.href}
          // The card clips what leaves it, and the focus ring of app/globals.css
          // sits outside its link, so here the ring is drawn just inside the
          // cell. It is rounded as the card is, which keeps it whole in the
          // card's corners. `!` is what lets the offset win over that rule.
          className={cn(
            'min-w-0 border-line px-4 py-4 transition-colors hover:bg-mist focus-visible:rounded-xl focus-visible:!outline-offset-[-2px] sm:px-5',
            DIVIDERS[i],
          )}
        >
          {/* A little tighter on a phone, so "Awaiting payment" fits half the screen whole. */}
          <span className="block text-[11px] uppercase tracking-wider text-charcoal-muted sm:text-xs sm:tracking-widest">
            {counter.label}
          </span>
          <span className="figure mt-1 block text-2xl font-semibold text-charcoal">{stats[counter.key]}</span>
        </Link>
      ))}
    </Card>
  );
}
