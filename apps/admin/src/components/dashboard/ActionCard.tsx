'use client';

import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';

import { cn } from '../../lib/cn';
import { ClickableCard } from '../ui/card';
import { Skeleton } from './BlockState';

/**
 * A card that leads to a place where work waits: an icon, a title with a
 * count of what is waiting, one line on what happens there, and an arrow.
 */
export function ActionCard({
  href, icon: Icon, title, description, count, countLoading = false, countLabel,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** How many are waiting. Left out while the count is loading or could not be loaded. */
  count?: number;
  /** The count is on its way: hold its place beside the title, so nothing moves when it lands. */
  countLoading?: boolean;
  /** What the count is of, for screen readers: "active bookings". */
  countLabel: string;
}) {
  return (
    <ClickableCard asChild className="group min-w-0">
      <Link href={href} className="flex items-center gap-4 p-5">
        <div
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-gold/50 bg-gold/10 text-navy"
        >
          <Icon className="size-5" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h2 className="font-serif text-xl text-charcoal">{title}</h2>
            {typeof count === 'number' && (
              <span
                className={cn(
                  'figure rounded-full px-2 py-0.5 text-xs font-semibold',
                  count > 0 ? 'bg-navy text-white' : 'bg-bg-muted text-charcoal-muted',
                )}
              >
                {count}
                <span className="sr-only"> {countLabel}</span>
              </span>
            )}
            {countLoading && typeof count !== 'number' && <Skeleton className="h-5 w-7 rounded-full" />}
          </div>
          <p className="mt-1 text-sm text-charcoal-muted">{description}</p>
        </div>

        <ArrowRight
          aria-hidden="true"
          className="size-5 shrink-0 text-charcoal-muted transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-navy"
        />
      </Link>
    </ClickableCard>
  );
}
