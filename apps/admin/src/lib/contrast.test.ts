import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The admin's colour tokens, measured where they are defined. The test reads
 * `app/globals.css` from disk, so a token changed there is re-measured here.
 */

type Rgb = [number, number, number];

const css = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');

/** Every `--name: value;` in the token file. */
const declared = new Map<string, string>();
for (const match of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) declared.set(match[1]!, match[2]!.trim());

/**
 * A token as red, green and blue. UI tokens are stored as channels
 * (`19 58 104`), chart tokens as a hex colour or as `rgb(var(--token))`, and a
 * token may simply point at another (`var(--teal)`).
 */
function token(name: string): Rgb {
  const value = declared.get(name);
  if (value === undefined) throw new Error(`--${name} is not defined in app/globals.css`);
  const pointer = /^(?:rgb\()?var\(--([a-z0-9-]+)\)\)?$/.exec(value);
  if (pointer) return token(pointer[1]!);
  const channels = /^(\d{1,3}) (\d{1,3}) (\d{1,3})$/.exec(value);
  if (channels) return [Number(channels[1]), Number(channels[2]), Number(channels[3])];
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgb;
  throw new Error(`--${name} holds "${value}", which is not channels, a hex colour or a reference`);
}

/** WCAG 2 relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const linear = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2 contrast ratio, from 1 (identical) to 21 (black on white). */
function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `colour` painted at `alpha` over `under`, as an opacity class such as `bg-danger/10` does. */
function over(colour: Rgb, alpha: number, under: Rgb): Rgb {
  return colour.map((v, i) => v * alpha + under[i]! * (1 - alpha)) as Rgb;
}

const WHITE: Rgb = [255, 255, 255];

/** Tokens that may colour text. Gold is decoration only, so it is not here; `brass` is the readable gold. */
const TEXT_TOKENS = ['ink', 'muted', 'navy', 'teal', 'brass', 'amber', 'red'];
/** The surfaces text sits on: the warm page and the white card. */
const SURFACES = ['page', 'surface'];
/** Good, needs attention, bad: each also sits on a tint of itself (`bg-danger/10 text-danger`). */
const STATUS_TOKENS = ['teal', 'amber', 'red'];
const CHART_TOKENS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'];

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

describe('chart marks and the focus ring', () => {
  for (const name of CHART_TOKENS) {
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
