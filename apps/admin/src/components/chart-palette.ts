/**
 * The charts' colours and the rule that gives a mark its colour, kept free of
 * React so they can be tested without a DOM. Every value is a token declared
 * in app/globals.css; nothing here names a colour itself.
 */

import { OTHER_KEY } from './chart-geometry';

/** A mark's two colours: its bright fill, and the darker shade of the same hue drawn round it. */
export type ChartColour = { fill: string; edge: string };

/**
 * The five colours for parts of a whole, in their fixed order: teal, violet,
 * gold, sky and coral. The fills are the strong shades of the white-led look
 * (`--chart-1` to `--chart-5` in app/globals.css) and each edge is the deep
 * shade of the same hue. A mark takes the colour of its position; colours are
 * never generated or cycled.
 *
 * The fills are bright, and four of the five are below 3:1 on the white card,
 * so a fill is never left to be seen alone: every filled mark is drawn with
 * its edge, which src/lib/contrast.test.ts holds to 3:1 on the card, and
 * every segment is named with its value in a legend or a table.
 *
 * The order was checked on the white card with the dataviz validator, for
 * colours that sit next to each other. Two checks are the gate and both pass.
 * Neighbours stay apart in a colour-blindness simulation: the closest pair is
 * violet and teal, ΔE 20.9 for a red-green colour-blind reader and 14.1 for a
 * blue-yellow one. They stay apart in full colour too: ΔE 26.4, floor 15.
 * Across every pair, not only neighbours, the closest two are sky and violet
 * (ΔE 12.9), which is why the order keeps gold between them. Run the check
 * again before changing a value or the order.
 *
 * Two results are accepted, as the owner's choice of bright fills: gold is
 * lighter than the validator's lightness band, and teal, gold, sky and coral
 * get its warning for a fill below 3:1 on white. The edge and the named
 * values are the relief for both. The validator's output is kept in
 * docs/design/merged-dashboard/chart-palette-check.txt.
 */
export const CATEGORICAL: readonly ChartColour[] = [
  { fill: 'var(--chart-1)', edge: 'var(--chart-1-edge)' },
  { fill: 'var(--chart-2)', edge: 'var(--chart-2-edge)' },
  { fill: 'var(--chart-3)', edge: 'var(--chart-3-edge)' },
  { fill: 'var(--chart-4)', edge: 'var(--chart-4-edge)' },
  { fill: 'var(--chart-5)', edge: 'var(--chart-5-edge)' },
];

/**
 * "Other" is a remainder, not a category, so it takes a neutral and never a
 * hue: a light grey with a darker grey edge. Its mark always carries a label,
 * so it is never read by fill alone.
 */
export const OTHER_GREY: ChartColour = { fill: 'var(--chart-other)', edge: 'var(--chart-other-edge)' };

/** The one colour for a single series or a progress bar: bright teal, deep-teal edge. */
export const ACCENT: ChartColour = { fill: 'var(--chart-accent)', edge: 'var(--chart-accent-deep)' };

/** The width of the edge round a filled mark, in pixels. */
export const EDGE_PX = 1.5;

/**
 * The colour for a position, counted from 0. Past the fifth colour there is
 * none left to give, and a mark with no position (null) never had one: both
 * take the neutral, never a repeat.
 */
export function positionColour(position: number | null): ChartColour {
  return (position === null ? undefined : CATEGORICAL[position]) ?? OTHER_GREY;
}

/** The colour of a donut slice: the neutral for the folded "Other" slice, the colour of its position for the rest. */
export function sliceColour(key: string, position: number): ChartColour {
  return key === OTHER_KEY ? OTHER_GREY : positionColour(position);
}

/**
 * The palette colour that has `fill` as its fill, for a mark that was given
 * its fill by name. A fill from outside the palette has no darker shade to
 * offer, so it is its own edge.
 */
export function colourOfFill(fill: string): ChartColour {
  return [...CATEGORICAL, OTHER_GREY].find((colour) => colour.fill === fill) ?? { fill, edge: fill };
}

/**
 * A filled mark drawn in CSS: the fill, with its edge just inside the mark's
 * outline, so the mark keeps its size and the gaps round it stay as they are.
 */
export function edgedFill({ fill, edge }: ChartColour): { backgroundColor: string; boxShadow: string } {
  return { backgroundColor: fill, boxShadow: `inset 0 0 0 ${EDGE_PX}px ${edge}` };
}
