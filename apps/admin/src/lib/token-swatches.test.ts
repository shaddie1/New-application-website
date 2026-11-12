import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, declaredTokens, parseTokenValue, tokenColour } from './contrast';
import { CONTRAST_PAIRS, SWATCH_GROUPS } from './token-swatches';

/** The swatch page's list, held to `app/globals.css` where the tokens are defined. */
const css = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');
const declared = declaredTokens(css);

describe('swatch groups', () => {
  it('list every declared token in exactly one group', () => {
    const listed = SWATCH_GROUPS.flatMap((group) => group.tokens);
    const missing = [...declared.keys()].filter((name) => !listed.includes(name));
    const unknown = listed.filter((name) => !declared.has(name));
    const twice = listed.filter((name, i) => listed.indexOf(name) !== i);
    expect({ missing, unknown, twice }).toEqual({ missing: [], unknown: [], twice: [] });
  });

  it('give the card shadow a group of its own, since it is not a colour', () => {
    const group = SWATCH_GROUPS.find((g) => g.tokens.includes('shadow-card'));
    expect(group?.tokens).toEqual(['shadow-card']);
    expect(parseTokenValue(declared.get('shadow-card')!)).toBeNull();
  });

  it('hold only colours in the other groups', () => {
    for (const group of SWATCH_GROUPS.filter((g) => !g.tokens.includes('shadow-card'))) {
      for (const name of group.tokens) expect(() => tokenColour(declared, name)).not.toThrow();
    }
  });
});

describe('contrast pairs', () => {
  it('name two tokens that exist', () => {
    for (const { text, on } of CONTRAST_PAIRS) {
      expect(declared.has(text), `--${text}`).toBe(true);
      expect(declared.has(on), `--${on}`).toBe(true);
    }
  });

  for (const { text, on, target } of CONTRAST_PAIRS) {
    it(`${text} on ${on} is at least ${target}:1`, () => {
      expect(contrastRatio(tokenColour(declared, text), tokenColour(declared, on))).toBeGreaterThanOrEqual(target);
    });
  }
});

describe('a colour as a browser returns it', () => {
  it('reads rgb with spaces or with commas', () => {
    expect(parseTokenValue('rgb(20 184 166)')).toEqual({ rgb: [20, 184, 166] });
    expect(parseTokenValue('rgb(20, 184, 166)')).toEqual({ rgb: [20, 184, 166] });
  });
});
