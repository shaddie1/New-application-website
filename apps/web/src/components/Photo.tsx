import { cn } from '../lib/cn';
import type { PhotoSlot } from '../content/site';

/**
 * Renders a photo, or a styled placeholder while that slot is still empty, so
 * the layout is identical either way and the site never ships a broken image.
 *
 * `priority` marks the one image above the fold (the hero) so it loads eagerly;
 * everything else defers until it scrolls into view.
 */
export function Photo({
  slot,
  className,
  imgClassName,
  priority = false,
}: {
  slot: PhotoSlot;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}) {
  if (slot.src) {
    return (
      <div className={cn('overflow-hidden rounded-xl border border-line bg-cream-deep', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slot.src}
          alt={slot.alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-line bg-gradient-to-br from-white via-cream-deep to-white',
        className,
      )}
    >
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-bronze/70">OnyxHawk</span>
        <p className="max-w-[18rem] text-sm text-charcoal-muted">{slot.placeholder}</p>
      </div>
    </div>
  );
}
