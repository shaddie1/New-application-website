import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

// One card for the admin: one radius, one hairline border, a white surface.
const base = 'rounded-xl border border-line bg-surface';
// A card that goes somewhere. The border darkens and the card lifts on hover;
// the keyboard focus ring is the global one in app/globals.css.
const clickable = 'block transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm';

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** A subtle shadow, for a card that should sit above its neighbours. */
  raised?: boolean;
};

/** A plain container. Padding is the caller's, since cards hold very different things. */
export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, raised = false, ...props }, ref) => (
  <div ref={ref} className={cn(base, raised && 'shadow-sm', className)} {...props} />
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
