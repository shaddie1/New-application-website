import { cn } from '../../lib/cn';
import { chartColour, retainedFill } from './colours';
import { initials } from './initials';

const disc = 'inline-flex shrink-0 items-center justify-center rounded-full';
const sizes = { xs: 'h-6 w-6 text-[9px]', sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs' };

type BadgeSize = keyof typeof sizes;

/**
 * A holder's initials in a disc ringed with their chart colour, so a row can
 * be matched to its segment of the share bar and its bars in the history.
 * The initials are ink on white, whatever the colour. Decoration only: the
 * name always stands beside it. `className` may change the size by screen or
 * container width.
 */
export function InitialsBadge({
  name, colourIndex, size = 'md', className,
}: {
  name: string;
  colourIndex: number | null;
  size?: BadgeSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ borderColor: chartColour(colourIndex) }}
      className={cn(disc, 'border-2 bg-surface font-semibold leading-none text-charcoal', sizes[size], className)}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The disc beside "Retained by the business": hatched like the retained part
 * of the share bar and of the chart, with no initials, since it is nobody's.
 */
export function RetainedBadge({ size = 'md', className }: { size?: BadgeSize; className?: string }) {
  return <span aria-hidden="true" style={retainedFill} className={cn(disc, sizes[size], className)} />;
}
