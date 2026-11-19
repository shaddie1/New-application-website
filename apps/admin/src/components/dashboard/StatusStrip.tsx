'use client';

import Link from 'next/link';
import type { AdminStats } from '@onyxhawk/types';

import { cn } from '../../lib/cn';
import { Card } from '../ui/card';
import { BlockFailed, Skeleton } from './BlockState';
import { TextLink } from './TextLink';
import type { Block } from './useBlock';

const COUNTERS: { key: keyof AdminStats; label: string; href: string }[] = [
  { key: 'pendingPayment', label: 'Awaiting payment', href: '/bookings?status=PENDING_PAYMENT' },
  { key: 'confirmed', label: 'Confirmed', href: '/bookings?status=CONFIRMED' },
  { key: 'inProgress', label: 'In progress', href: '/bookings' },
  { key: 'pendingQuotes', label: 'Pending quotes', href: '/quotes' },
];

/** Hairlines between the cells: two by two on a phone, four in a row from 640px. */
const DIVIDERS = ['', 'border-l', 'border-t sm:border-l sm:border-t-0', 'border-l border-t sm:border-t-0'];

/** The one-line strip: "No active jobs right now", and the placeholder that holds its place. */
const QUIET_LINE = 'flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4';

/**
 * The four live counters in one strip, each a link to the list it counts.
 * When all four are zero (the block is "empty", by `noActiveJobs`) the strip
 * gives way to one line saying so; that line never shows while the counts are
 * loading or after they failed to load. While they load, the strip is one
 * line of placeholder, the height of the "no active jobs" line; it grows into
 * the counters only when there is something to count.
 */
export function StatusStrip({ stats }: { stats: Block<AdminStats> & { retry: () => void } }) {
  if (stats.status === 'failed') {
    return (
      <Card className="p-3">
        <BlockFailed what="the job counts" onRetry={stats.retry} />
      </Card>
    );
  }

  if (stats.status === 'empty') {
    return (
      <Card className={QUIET_LINE}>
        <p className="text-sm font-medium text-charcoal">No active jobs right now</p>
        <p className="flex gap-5">
          <TextLink href="/bookings">Bookings</TextLink>
          <TextLink href="/quotes">Quotes</TextLink>
        </p>
      </Card>
    );
  }

  // The placeholder is the "no active jobs" line in outline: the same card,
  // one bar for the sentence and one for the links, each as tall as a line of
  // that text and about as wide, so they wrap where the words do. A quiet day
  // is the usual answer, and then nothing below the strip moves when it lands.
  if (stats.status === 'loading') {
    return (
      <Card className={QUIET_LINE} aria-busy="true">
        <span className="sr-only">Loading the job counts</span>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-5 w-40" />
      </Card>
    );
  }

  return (
    <Card className="grid grid-cols-2 overflow-hidden sm:grid-cols-4">
      {COUNTERS.map((counter, i) => (
        <Link
          key={counter.key}
          href={counter.href}
          className={cn('min-w-0 border-line px-4 py-4 transition-colors hover:bg-mist sm:px-5', DIVIDERS[i])}
        >
          {/* A little tighter on a phone, so "Awaiting payment" fits half the screen whole. */}
          <span className="block text-[11px] uppercase tracking-wider text-charcoal-muted sm:text-xs sm:tracking-widest">
            {counter.label}
          </span>
          <span className="figure mt-1 block text-2xl font-semibold text-charcoal">{stats.data[counter.key]}</span>
        </Link>
      ))}
    </Card>
  );
}
