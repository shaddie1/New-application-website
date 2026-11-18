import type { CSSProperties } from 'react';

import { CATEGORICAL, OTHER_GREY } from '../charts';

/**
 * The chart colour for a colour index from `colourIndexOf` in split.ts: a
 * holder's own colour, or the solid neutral for holders past the fifth and
 * for "Others". What the business retains is not a colour at all: see
 * `retainedFill`.
 */
export function chartColour(colourIndex: number | null): string {
  return (colourIndex === null ? undefined : CATEGORICAL[colourIndex]) ?? OTHER_GREY;
}

/** The line colour of the outline and hatching that mark what the business retains. */
export const RETAINED_LINE = 'var(--chart-muted)';
/** The spacing of the hatching, in pixels, shared by the CSS fill and the chart's SVG pattern. */
export const RETAINED_HATCH_GAP = 5;

/**
 * The retained part as a CSS fill: an outlined, diagonally hatched neutral on
 * the card's surface. Nobody holds it, so it is drawn as an empty space, and
 * it cannot be taken for the solid neutral of "Others".
 */
export const retainedFill: CSSProperties = {
  backgroundColor: 'var(--chart-surface)',
  backgroundImage: `repeating-linear-gradient(135deg, ${RETAINED_LINE} 0 1px, transparent 1px ${RETAINED_HATCH_GAP}px)`,
  boxShadow: `inset 0 0 0 1px ${RETAINED_LINE}`,
};
