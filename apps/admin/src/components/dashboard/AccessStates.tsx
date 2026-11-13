'use client';

import { Link2Off, RefreshCw, RotateCw, type LucideIcon } from 'lucide-react';

import { cn } from '../../lib/cn';
import { Button } from '../ui/button';
import { Card, SECTION_TILE } from '../ui/card';
import { BlockFailed, Skeleton } from './BlockState';

/**
 * What the Dashboard shows in place of its sections while it does not know
 * them: the access answer is on its way, could not be had, or lists none.
 * Which of these applies is `accessView`'s to say; these draw it.
 */

/**
 * The access answer is on its way. One heading and one card of plain bars: it
 * says the page is loading and nothing about which sections will come.
 */
export function AccessLoading() {
  return (
    <>
      {/* Said from outside the busy part: a screen reader may hold back what is inside it. */}
      <span role="status" className="sr-only">Loading your Dashboard</span>
      <div aria-busy="true">
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Card className="p-5 sm:p-6">
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="mt-5 h-4 w-full" />
          <Skeleton className="mt-3 h-4 w-4/5" />
          <Skeleton className="mt-3 h-4 w-3/5" />
        </Card>
      </div>
    </>
  );
}

const tiles = {
  update: SECTION_TILE.trend,
  ownership: SECTION_TILE.ownership,
};

/** One card that stands for the whole page: an icon tile, what has happened, and what can be done about it. */
function Notice({
  icon: Icon, tile, title, children, action,
}: {
  icon: LucideIcon;
  tile: keyof typeof tiles;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-x-8 gap-y-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-start gap-4">
        <span
          aria-hidden="true"
          className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', tiles[tile])}
        >
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-xl text-charcoal">{title}</h2>
          <p className="mt-1 max-w-prose text-sm text-charcoal-muted">{children}</p>
        </div>
      </div>
      {action}
    </Card>
  );
}

/**
 * The server does not know the access address: this page is newer than the
 * server behind it, which happens for a few minutes while a release goes out.
 */
export function BeingUpdated({ onRetry }: { onRetry: () => void }) {
  return (
    <Notice
      icon={RefreshCw}
      tile="update"
      title="The back-office is being updated"
      action={
        <Button variant="outline" onClick={onRetry} className="w-full shrink-0 sm:w-auto">
          <RotateCw aria-hidden="true" />
          Retry
        </Button>
      }
    >
      Your Dashboard will be back in a few minutes. Try again shortly.
    </Notice>
  );
}

/** The access answer could not be had: the server faulted or could not be reached. */
export function AccessFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="p-3">
      <BlockFailed what="your Dashboard" onRetry={onRetry} className="min-h-28" />
    </Card>
  );
}

/**
 * A staff account with no section. Its role gives it none, so the only thing
 * it could see here is the ownership summary, and that follows a shareholder
 * record. The words fit both someone not linked yet and someone whose record
 * was removed.
 */
export function NotLinked() {
  return (
    <Notice icon={Link2Off} tile="ownership" title="This sign-in is not linked to a shareholder record">
      The owner links sign-ins to shareholder records on the Ownership page. When this one is linked, the ownership
      summary shows here.
    </Notice>
  );
}
