import { cn } from '../../lib/cn';
import { EDGE_PX } from '../chart-palette';
import { chartColour, retainedFill } from './colours';
import { initials } from './initials';

const disc = 'inline-flex shrink-0 items-center justify-center rounded-full';
const sizes = { xs: 'h-6 w-6 text-[9px]', sm: 'h-7 w-7 text-[10px]' };
/** The width of the band of a holder's fill inside the disc's edge, in pixels. */
const RING_PX = 2;

type BadgeSize = keyof typeof sizes;

/**
 * A holder's initials in a disc ringed with their chart colour, so a row can
 * be matched to its segment of the share bar and its bars in the history.
 * The ring is drawn as every filled mark is: the darker edge of the colour
 * round the outside, a band of the bright fill inside it. The initials are
 * ink on white, whatever the colour. Decoration only: the name always stands
 * beside it. `className` may change the size by screen or container width.
 */
export function InitialsBadge({
  name, colourIndex, size, className,
}: {
  name: string;
  colourIndex: number | null;
  size: BadgeSize;
  className?: string;
}) {
  const { fill, edge } = chartColour(colourIndex);
  return (
    <span
      aria-hidden="true"
      style={{ borderWidth: EDGE_PX, borderColor: edge, boxShadow: `inset 0 0 0 ${RING_PX}px ${fill}` }}
      className={cn(disc, 'bg-surface font-semibold leading-none text-charcoal', sizes[size], className)}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The disc beside "Retained by the business": hatched like the retained part
 * of the share bar and of the chart, with no initials, since it is nobody's.
 */
export function RetainedBadge({ size, className }: { size: BadgeSize; className?: string }) {
  return <span aria-hidden="true" style={retainedFill} className={cn(disc, sizes[size], className)} />;
}
