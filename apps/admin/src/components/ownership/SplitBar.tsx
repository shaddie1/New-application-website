import { TrendingDown } from 'lucide-react';

import { cn } from '../../lib/cn';
import { ShareBar } from './ShareBar';
import { RETAINED_SEGMENT, splitSegments } from './split';

/**
 * The share bar, or the one line that takes its place when there is no profit
 * to split. The line is the caller's, since only the caller knows what period
 * the net profit covers ("this month", "all time", a named month); it is null
 * while there is a profit.
 */
export function SplitBar({
  netCents, noSplitLine, holders, unallocatedCents,
}: {
  /** The net profit being split. */
  netCents: number;
  /** What to say in place of the bar when `netCents` is zero or a loss. */
  noSplitLine: string | null;
  /** The holders in table order, each with their share of `netCents`. */
  holders: { id: string; name: string; basisPoints: number; shareCents: number }[];
  /** Net profit the stakes do not cover. */
  unallocatedCents: number;
}) {
  if (noSplitLine !== null) {
    const loss = netCents < 0;
    return (
      <p
        className={cn(
          'figure flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium',
          loss ? 'bg-danger/10 text-danger' : 'bg-mist text-charcoal-muted',
        )}
      >
        {loss && <TrendingDown aria-hidden="true" className="size-4 shrink-0" />}
        {noSplitLine}
      </p>
    );
  }

  const amounts = new Map(holders.map((h) => [h.id, h.shareCents]));
  amounts.set(RETAINED_SEGMENT, unallocatedCents);
  return <ShareBar segments={splitSegments(holders)} amounts={amounts} />;
}
