/**
 * Reading and measuring the colour tokens of `app/globals.css`. It has no
 * colour of its own and touches neither the disk nor the page: the caller
 * hands it the stylesheet's text or a token's value, so the contrast test and
 * a page that shows the tokens measure them the same way.
 */

export type Rgb = [number, number, number];

/** What a token's value holds: a colour, or the name of the token it points at. */
export type TokenValue = { rgb: Rgb } | { ref: string };

/** Every `--name: value;` in a stylesheet's text. */
export function declaredTokens(css: string): Map<string, string> {
  const declared = new Map<string, string>();
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) declared.set(match[1]!, match[2]!.trim());
  return declared;
}

/**
 * A token's value, read. UI tokens are stored as channels (`19 58 104`), chart
 * tokens as a hex colour or as another token wrapped in `rgb`, and a token may
 * simply point at another (`var(--teal)`). Anything else, such as a shadow, is
 * not a colour and reads as null.
 */
export function parseTokenValue(value: string): TokenValue | null {
  const pointer = /^(?:rgb\()?var\(--([a-z0-9-]+)\)\)?$/.exec(value);
  if (pointer) return { ref: pointer[1]! };
  const channels = /^(\d{1,3}) (\d{1,3}) (\d{1,3})$/.exec(value);
  if (channels) return { rgb: [Number(channels[1]), Number(channels[2]), Number(channels[3])] };
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return { rgb: [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgb };
  // The form a browser returns for a computed colour: `rgb(20 184 166)` or `rgb(20, 184, 166)`.
  const computed = /^rgb\((\d{1,3})[ ,]+(\d{1,3})[ ,]+(\d{1,3})\)$/.exec(value);
  if (computed) return { rgb: [Number(computed[1]), Number(computed[2]), Number(computed[3])] };
  return null;
}

/** A declared token as red, green and blue, following it through the tokens it points at. */
export function tokenColour(declared: Map<string, string>, name: string): Rgb {
  const value = declared.get(name);
  if (value === undefined) throw new Error(`--${name} is not defined in app/globals.css`);
  const parsed = parseTokenValue(value);
  if (parsed === null) throw new Error(`--${name} holds "${value}", which is not channels, a hex colour or a reference`);
  return 'ref' in parsed ? tokenColour(declared, parsed.ref) : parsed.rgb;
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
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
