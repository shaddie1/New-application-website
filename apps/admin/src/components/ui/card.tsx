import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';
import type { DashboardSection } from '@onyxhawk/types';
import { cn } from '../../lib/cn';

// One card for the admin: one radius, a white surface and the one soft shadow.
// The page is close to white, so a faint outline keeps the card's edge.
const base = 'rounded-xl border border-line/70 bg-surface shadow-card';
// A card that goes somewhere. Its outline darkens on hover; the keyboard focus
// ring is the global one in app/globals.css.
const clickable = 'block transition-colors hover:border-border-strong';

/** The Dashboard section a card belongs to. */
export type CardAccent = DashboardSection;

// The accent is the card's top border, thickened and in the section's strong
// shade. The class names are written whole so that Tailwind finds them.
const accents: Record<CardAccent, string> = {
  attention: 'border-t-[3px] border-t-section-attention-strong',
  month: 'border-t-[3px] border-t-section-month-strong',
  trend: 'border-t-[3px] border-t-section-trend-strong',
  breakdown: 'border-t-[3px] border-t-section-breakdown-strong',
  ownership: 'border-t-[3px] border-t-section-ownership-strong',
};

// A section's icon tile: its light tint, with the icon in the deep shade of
// the same hue. The tint is a background only; the section's name beside it
// is ink. The class names are written whole so that Tailwind finds them.
export const SECTION_TILE: Record<CardAccent, string> = {
  attention: 'bg-section-attention-tint text-section-attention-deep',
  month: 'bg-section-month-tint text-section-month-deep',
  trend: 'bg-section-trend-tint text-section-trend-deep',
  breakdown: 'bg-section-breakdown-tint text-section-breakdown-deep',
  ownership: 'bg-section-ownership-tint text-section-ownership-deep',
};

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Draws a thin line in the section's colour along the top edge. Leave it out for a plain card. */
  accent?: CardAccent;
};

/** A plain container. Padding is the caller's, since cards hold very different things. */
export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, accent, ...props }, ref) => (
  <div ref={ref} className={cn(base, accent && accents[accent], className)} {...props} />
));
Card.displayName = 'Card';

export type ClickableCardProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Render the single child (a `Link`, for a card that navigates) with the card's styling. */
  asChild?: boolean;
};

/** A card that is one link or one button. Pass `asChild` with a `Link` to navigate. */
export const ClickableCard = forwardRef<HTMLButtonElement, ClickableCardProps>(
  ({ className, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(base, clickable, !asChild && 'w-full text-left', className)}
        {...props}
      />
    );
  },
);
ClickableCard.displayName = 'ClickableCard';
