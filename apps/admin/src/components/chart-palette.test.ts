import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { declaredTokens, parseTokenValue } from '../lib/contrast';
import { OTHER_KEY } from './chart-geometry';
import { CATEGORICAL, OTHER_GREY, positionColour, sliceColour } from './chart-palette';

/**
 * The chart palette, checked against the tokens it names. The test reads
 * `app/globals.css` from disk, so a chart token re-pointed there is checked
 * again here.
 */

const declared = declaredTokens(readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8'));

/** The token a `var(--name)` names. */
function tokenName(cssVar: string): string {
  const match = /^var\(--([a-z0-9-]+)\)$/.exec(cssVar);
  if (!match) throw new Error(`"${cssVar}" is not a token`);
  return match[1]!;
}

/** The raw token a chart token ends up at, as its shade and its hue: `strong-teal` is the strong shade of teal. */
function shadeAndHue(name: string): { shade: string; hue: string } {
  const value = declared.get(name);
  if (value === undefined) throw new Error(`--${name} is not defined in app/globals.css`);
  const parsed = parseTokenValue(value);
  if (parsed !== null && 'ref' in parsed) return shadeAndHue(parsed.ref);
  const [shade, ...hue] = name.split('-');
  return { shade: shade!, hue: hue.join('-') };
}

describe('the colours for parts of a whole', () => {
  it('are five, in the recorded order: teal, violet, gold, sky, coral', () => {
    expect(CATEGORICAL.map((colour) => colour.fill)).toEqual([
      'var(--chart-1)',
      'var(--chart-2)',
      'var(--chart-3)',
      'var(--chart-4)',
      'var(--chart-5)',
    ]);
    expect(CATEGORICAL.map((colour) => shadeAndHue(tokenName(colour.fill)).hue)).toEqual([
      'teal',
      'violet',
      'gold',
      'sky',
      'coral',
    ]);
  });

  it('give every fill token in the token file an edge token, and no sixth colour', () => {
    const fills = [...declared.keys()].filter((name) => /^chart-(\d+|other)$/.test(name));
    expect(fills).toEqual(['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-other']);
    for (const fill of fills) expect(declared.has(`${fill}-edge`)).toBe(true);
  });

  it('pair every fill with the edge token of its own name', () => {
    for (const colour of [...CATEGORICAL, OTHER_GREY]) {
      expect(tokenName(colour.edge)).toBe(`${tokenName(colour.fill)}-edge`);
    }
  });

  it('take the fill and the edge of one position from the same hue: its strong shade and its deep shade', () => {
    for (const colour of CATEGORICAL) {
      const fill = shadeAndHue(tokenName(colour.fill));
      const edge = shadeAndHue(tokenName(colour.edge));
      expect(fill.shade).toBe('strong');
      expect(edge.shade).toBe('deep');
      expect(edge.hue).toBe(fill.hue);
    }
  });
});

describe('the colour of a mark', () => {
  it('is the colour of its position for the first five', () => {
    expect(CATEGORICAL.map((_, position) => sliceColour(`slice-${position}`, position))).toEqual([...CATEGORICAL]);
    expect(positionColour(4)).toBe(CATEGORICAL[4]);
  });

  it('is the neutral for a sixth slice, never a repeat', () => {
    expect(sliceColour('slice-5', 5)).toBe(OTHER_GREY);
    expect(OTHER_GREY.fill).toBe('var(--chart-other)');
  });

  it('is the neutral for the folded "Other" slice, wherever it stands', () => {
    expect(sliceColour(OTHER_KEY, 2)).toBe(OTHER_GREY);
  });

  it('is the neutral for a holder past the fifth, who has no colour index', () => {
    expect(positionColour(null)).toBe(OTHER_GREY);
  });
});
