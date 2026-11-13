/**
 * What the `/design-tokens` page shows: every token of `app/globals.css` in a
 * named group, and the pairs of tokens whose contrast it measures. The list is
 * plain data with no colour of its own. src/lib/token-swatches.test.ts holds it
 * to the stylesheet: a token declared there without a group fails the test, and
 * so does a pair that misses its target, which keeps the page's pass and fail
 * marks honest.
 */

import type { DashboardSection } from '@onyxhawk/types';

export type SwatchGroup = { title: string; note?: string; tokens: string[] };

/** A piece of text (or a line) on a background, with the ratio it has to reach. */
export type ContrastPair = { group: string; text: string; on: string; target: number };

/** Text must reach 4.5:1 (WCAG AA). */
export const TEXT_TARGET = 4.5;
/** Chart edges and the focus ring only have to be seen: 3:1. */
export const MARK_TARGET = 3;

/** The Dashboard's sections, in the order the page shows them. */
export const SECTIONS = ['attention', 'month', 'trend', 'breakdown', 'ownership'] as const satisfies readonly DashboardSection[];
const MEANINGS = ['positive', 'attention', 'overdue'] as const;

/** The five hues, one row each: the light tint, the strong shade and the deep shade. */
const HUES = [
  { tint: 'tint-mint', strong: 'strong-teal', deep: 'deep-teal' },
  { tint: 'tint-sky', strong: 'strong-sky', deep: 'deep-sky' },
  { tint: 'tint-butter', strong: 'strong-gold', deep: 'deep-gold' },
  { tint: 'tint-blush', strong: 'strong-coral', deep: 'deep-coral' },
  { tint: 'tint-lavender', strong: 'strong-violet', deep: 'deep-violet' },
];

const CHART_FILLS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'];

export const SWATCH_GROUPS: SwatchGroup[] = [
  { title: 'Surfaces', tokens: ['page', 'surface', 'sunken', 'mist'] },
  { title: 'Lines', tokens: ['line', 'border', 'border-strong'] },
  { title: 'Text', tokens: ['ink', 'muted'] },
  { title: 'Navy', tokens: ['navy', 'navy-deep', 'navy-soft', 'on-dark', 'on-dark-muted'] },
  { title: 'Teal', tokens: ['teal', 'teal-fill', 'teal-soft', 'teal-light'] },
  { title: 'Error and gold', tokens: ['amber', 'red', 'gold', 'brass', 'steel'] },
  { title: 'Keyboard focus', tokens: ['focus'] },
  { title: 'Light tints', note: 'Backgrounds only, never text.', tokens: HUES.map((h) => h.tint) },
  { title: 'Strong shades', note: 'Fills and accents, never text.', tokens: HUES.map((h) => h.strong) },
  { title: 'Deep shades', note: 'Text, edges and lines.', tokens: HUES.map((h) => h.deep) },
  ...SECTIONS.map((section) => ({
    title: `Section: ${section}`,
    tokens: (['tint', 'strong', 'deep'] as const).map((shade) => `section-${section}-${shade}`),
  })),
  ...MEANINGS.map((meaning) => ({
    title: `Meaning: ${meaning}`,
    note: 'The bare name is the deep shade, for text.',
    tokens: [meaning, `${meaning}-tint`, `${meaning}-strong`],
  })),
  {
    title: 'Chart colours for parts of a whole',
    note: 'In this order: teal, violet, gold, sky, coral. Each fill is drawn with its edge.',
    tokens: CHART_FILLS.flatMap((fill) => [fill, `${fill}-edge`]),
  },
  { title: 'Chart: Other', note: 'A remainder, not a category.', tokens: ['chart-other', 'chart-other-edge'] },
  {
    title: 'Chart: single series and target',
    tokens: [
      'chart-accent', 'chart-accent-deep', 'chart-target', 'chart-target-edge', 'chart-positive', 'chart-negative',
    ],
  },
  {
    title: 'Chart: surface and text',
    tokens: ['chart-surface', 'chart-ink', 'chart-muted', 'chart-grid', 'chart-track'],
  },
  { title: 'Card shadow', note: 'Not a colour, so it is not measured.', tokens: ['shadow-card'] },
];

const SURFACES = ['page', 'surface'];

export const CONTRAST_PAIRS: ContrastPair[] = [
  ...SURFACES.flatMap((on) =>
    ['ink', 'muted', 'navy', 'teal', 'brass', 'amber', 'red'].map((text) => ({
      group: 'Text on the page and the card', text, on, target: TEXT_TARGET,
    })),
  ),
  { group: 'Text on the page and the card', text: 'surface', on: 'navy', target: TEXT_TARGET },
  ...HUES.flatMap(({ tint }) =>
    ['ink', 'muted'].map((text) => ({ group: 'Text on the light tints', text, on: tint, target: TEXT_TARGET })),
  ),
  ...HUES.flatMap(({ tint, deep }) =>
    [...SURFACES, tint].map((on) => ({ group: 'Deep shades as text', text: deep, on, target: TEXT_TARGET })),
  ),
  ...[...CHART_FILLS.map((fill) => `${fill}-edge`), 'chart-other-edge', 'chart-accent-deep', 'chart-target-edge'].map(
    (text) => ({ group: 'Chart edges on the card', text, on: 'surface', target: MARK_TARGET }),
  ),
  ...SURFACES.map((on) => ({ group: 'Keyboard focus ring', text: 'focus', on, target: MARK_TARGET })),
];
