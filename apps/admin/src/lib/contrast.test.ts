import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio as ratio, declaredTokens, parseTokenValue, tokenColour, type Rgb } from './contrast';

/**
 * The admin's colour tokens, measured where they are defined. The test reads
 * `app/globals.css` from disk, so a token changed there is re-measured here.
 */

const css = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');

/** Every `--name: value;` in the token file. */
const declared = declaredTokens(css);

/** A token as red, green and blue. */
const token = (name: string): Rgb => tokenColour(declared, name);

/** `colour` painted at `alpha` over `under`, as an opacity class such as `bg-danger/10` does. */
function over(colour: Rgb, alpha: number, under: Rgb): Rgb {
  return colour.map((v, i) => v * alpha + under[i]! * (1 - alpha)) as Rgb;
}

const WHITE: Rgb = [255, 255, 255];

/** Tokens that may colour text. Gold is decoration only, so it is not here; `brass` is the readable gold. */
const TEXT_TOKENS = ['ink', 'muted', 'navy', 'teal', 'brass', 'amber', 'red'];
/** The surfaces text sits on: the near-white page and the white card. */
const SURFACES = ['page', 'surface'];
/** Good, needs attention, bad: each also sits on a tint of itself (`bg-danger/10 text-danger`). */
const STATUS_TOKENS = ['teal', 'amber', 'red'];
/**
 * The edges of the charts' filled marks. The fills are bright and most are too
 * pale to be held to 3:1, so the edge drawn round each one is.
 */
const CHART_EDGE_TOKENS = [
  'chart-1-edge',
  'chart-2-edge',
  'chart-3-edge',
  'chart-4-edge',
  'chart-5-edge',
  'chart-other-edge',
  'chart-accent-deep',
  'chart-target-edge',
];

/** The raw colours of the white-led look, one hue to a row: the light tint, the strong shade and the deep shade. */
const HUES = [
  { tint: 'tint-mint', strong: 'strong-teal', deep: 'deep-teal' },
  { tint: 'tint-sky', strong: 'strong-sky', deep: 'deep-sky' },
  { tint: 'tint-butter', strong: 'strong-gold', deep: 'deep-gold' },
  { tint: 'tint-blush', strong: 'strong-coral', deep: 'deep-coral' },
  { tint: 'tint-lavender', strong: 'strong-violet', deep: 'deep-violet' },
];
const SHADES = ['tint', 'strong', 'deep'] as const;
/** The names components use. Each must point at a raw colour of the shade its name says. */
const SECTIONS = ['attention', 'month', 'trend', 'breakdown', 'ownership'];
/** Good, needs attention, overdue or a fall. The bare name is the deep shade, the one for text. */
const MEANINGS = ['positive', 'attention', 'overdue'];

/** The token that holds the colour `name` ends up at, following the tokens it points at. */
function rawTokenBehind(name: string): string {
  const value = declared.get(name);
  if (value === undefined) throw new Error(`--${name} is not defined in app/globals.css`);
  const parsed = parseTokenValue(value);
  return parsed !== null && 'ref' in parsed ? rawTokenBehind(parsed.ref) : name;
}

const AA_TEXT = 4.5;
const AA_MARK = 3;

describe('text tokens', () => {
  for (const surface of SURFACES) {
    for (const name of TEXT_TOKENS) {
      it(`${name} on ${surface} is at least ${AA_TEXT}:1`, () => {
        expect(ratio(token(name), token(surface))).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it(`white on navy (the primary button) is at least ${AA_TEXT}:1`, () => {
    expect(ratio(WHITE, token('navy'))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('gold is a token, and is not a text token', () => {
    expect(() => token('gold')).not.toThrow();
    expect(TEXT_TOKENS).not.toContain('gold');
  });
});

describe('status colours on their own tint', () => {
  // The admin's banners and status pills use a 10% or 15% tint of the text colour.
  for (const surface of SURFACES) {
    for (const name of STATUS_TOKENS) {
      for (const alpha of [0.1, 0.15]) {
        it(`${name} on a ${alpha * 100}% ${name} tint over ${surface} is at least ${AA_TEXT}:1`, () => {
          const tint = over(token(name), alpha, token(surface));
          expect(ratio(token(name), tint)).toBeGreaterThanOrEqual(AA_TEXT);
        });
      }
    }
  }
});

describe('text on the light tints', () => {
  // A tint is a background only. What is written on it is ink, muted or the deep shade of its own hue.
  for (const { tint } of HUES) {
    for (const name of ['ink', 'muted']) {
      it(`${name} on ${tint} is at least ${AA_TEXT}:1`, () => {
        expect(ratio(token(name), token(tint))).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }
});

describe('deep shades', () => {
  for (const { tint, deep } of HUES) {
    for (const background of [...SURFACES, tint]) {
      it(`${deep} on ${background} is at least ${AA_TEXT}:1`, () => {
        expect(ratio(token(deep), token(background))).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }
});

describe('section and meaning tokens', () => {
  const semantic = [
    ...SECTIONS.flatMap((section) => SHADES.map((shade) => ({ name: `section-${section}-${shade}`, shade }))),
    ...MEANINGS.flatMap((meaning) => [
      { name: meaning, shade: 'deep' as const },
      { name: `${meaning}-tint`, shade: 'tint' as const },
      { name: `${meaning}-strong`, shade: 'strong' as const },
    ]),
  ];

  for (const { name, shade } of semantic) {
    it(`${name} points at a raw ${shade} that holds a colour`, () => {
      expect(HUES.map((hue) => hue[shade])).toContain(rawTokenBehind(name));
      expect(() => token(name)).not.toThrow();
    });
  }
});

describe('chart edges and the focus ring', () => {
  for (const name of CHART_EDGE_TOKENS) {
    it(`${name} on the card surface is at least ${AA_MARK}:1`, () => {
      expect(ratio(token(name), token('surface'))).toBeGreaterThanOrEqual(AA_MARK);
    });
  }

  for (const surface of SURFACES) {
    it(`the focus ring on ${surface} is at least ${AA_MARK}:1`, () => {
      expect(ratio(token('focus'), token(surface))).toBeGreaterThanOrEqual(AA_MARK);
    });
  }
});
