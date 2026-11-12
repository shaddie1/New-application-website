import type { LucideIcon } from 'lucide-react';

import { cn } from '../../../lib/cn';
import type { CardAccent } from '../../ui/card';

// A section's icon tile: its light tint, with the icon in the deep shade of
// the same hue. The tint is a background only; the section's name beside it
// is ink. The class names are written whole so that Tailwind finds them.
const tiles: Record<CardAccent, string> = {
  attention: 'bg-section-attention-tint text-section-attention-deep',
  month: 'bg-section-month-tint text-section-month-deep',
  trend: 'bg-section-trend-tint text-section-trend-deep',
  breakdown: 'bg-section-breakdown-tint text-section-breakdown-deep',
  ownership: 'bg-section-ownership-tint text-section-ownership-deep',
};

/**
 * The head of a Dashboard section: its icon tile in the section's tint, and
 * its name. The tile's colour is the colour of the thin accent on the
 * section's cards, so the two together tell one section from the next.
 * `note` is a quieter phrase after the name ("so far"); `children` sit at the
 * far end of the row, for a link or an action that belongs to the whole
 * section.
 */
export function SectionHeading({
  id, section, icon: Icon, title, note, children, className,
}: {
  /** The heading's id, for the section's `aria-labelledby`. */
  id: string;
  section: CardAccent;
  icon: LucideIcon;
  title: string;
  note?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tiles[section])}
        >
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </span>
        {/* The note keeps to one line and moves under the name whole when the two do not fit. */}
        <h2 id={id} className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 font-serif text-2xl text-charcoal">
          {title}
          {note && <span className="figure whitespace-nowrap font-sans text-sm text-charcoal-muted">{note}</span>}
        </h2>
      </div>
      {children}
    </div>
  );
}
