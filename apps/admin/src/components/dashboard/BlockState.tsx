'use client';

import { CircleAlert, RotateCw } from 'lucide-react';

import { cn } from '../../lib/cn';
import { Button } from '../ui/button';

/**
 * The quiet panel inside a white card that holds a message where the card's
 * content would be: near-white, the page's own colour, with a hairline round
 * it. A failed block and a block with nothing to show both use it.
 */
export const QUIET_PANEL = 'rounded-lg border border-line/70 bg-page';

/**
 * A block whose request failed: what could not be loaded, and a way to ask
 * again. It is the same centred, quiet panel as a block with nothing to show,
 * so a failed card is filled and not left blank; what tells the two apart is
 * the alert mark, the words "Could not load" and the Retry button, which an
 * empty block never has. Give it a `min-h-*` to fill a taller card.
 */
export function BlockFailed({ what, onRetry, className }: { what: string; onRetry: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        QUIET_PANEL,
        'flex flex-wrap content-center items-center justify-center gap-x-4 gap-y-3 px-5 py-4 text-sm text-charcoal',
        className,
      )}
    >
      <span className="flex min-w-0 items-start gap-2">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        <span className="min-w-0">Could not load {what}.</span>
      </span>
      {/* Its name says what it retries, so one Retry can be told from the next in a list of buttons. */}
      <Button variant="outline" size="sm" onClick={onRetry} aria-label={`Retry loading ${what}`}>
        <RotateCw aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

/**
 * A bar standing in for something that is still loading. It is the tone of a
 * border, clearly darker than the white card it sits on.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block animate-pulse rounded bg-border', className)} />;
}
