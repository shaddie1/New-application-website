'use client';

import { CircleAlert, RotateCw } from 'lucide-react';

import { cn } from '../../lib/cn';
import { Button } from '../ui/button';

/**
 * A block whose request failed: what could not be loaded, and a way to ask
 * again. It is the same centred, tinted panel as a block with nothing to show,
 * so a failed card is filled and not left blank; what tells the two apart is
 * the alert mark, the words "Could not load" and the Retry button, which an
 * empty block never has. Give it a `min-h-*` to fill a taller card.
 */
export function BlockFailed({ what, onRetry, className }: { what: string; onRetry: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap content-center items-center justify-center gap-x-4 gap-y-3 rounded-lg bg-mist px-5 py-4 text-sm text-charcoal',
        className,
      )}
    >
      <span className="flex min-w-0 items-start gap-2">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        <span className="min-w-0">Could not load {what}.</span>
      </span>
      <Button variant="outline" size="sm" onClick={onRetry}>
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
