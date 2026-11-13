'use client';

import { Check, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRequireAdmin } from '../../../src/lib/auth';
import { CATEGORICAL, OTHER_GREY, edgedFill } from '../../../src/components/chart-palette';
import { Card, SECTION_TILE } from '../../../src/components/ui/card';
import { contrastRatio, parseTokenValue, type Rgb } from '../../../src/lib/contrast';
import {
  CONTRAST_PAIRS, SECTIONS, SWATCH_GROUPS, type ContrastPair,
} from '../../../src/lib/token-swatches';

const heading = 'font-serif text-xl text-charcoal';
const note = 'text-sm text-charcoal-muted';

/** Every token's value, as the page's own styles give it. */
type Values = Record<string, string>;

/** A token's colour, following the tokens it points at; null for something that is not a colour. */
function colourOf(values: Values, name: string, depth = 0): Rgb | null {
  const value = values[name];
  const parsed = value === undefined ? null : parseTokenValue(value);
  if (parsed === null) return null;
  if ('rgb' in parsed) return parsed.rgb;
  return depth < 8 ? colourOf(values, parsed.ref, depth + 1) : null;
}

/** A colour as CSS, drawn from the same numbers that are measured. */
const paint = ([r, g, b]: Rgb) => `color(srgb ${r / 255} ${g / 255} ${b / 255})`;

const ratioOf = (values: Values, { text, on }: ContrastPair): number | null => {
  const a = colourOf(values, text);
  const b = colourOf(values, on);
  return a && b ? contrastRatio(a, b) : null;
};

/** Pass or fail in words and an icon, so it is not told by colour alone. */
function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 font-medium text-positive">
      <Check size={14} aria-hidden="true" /> Pass
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-medium text-overdue">
      <X size={14} aria-hidden="true" /> Fail
    </span>
  );
}

export default function DesignTokensPage() {
  const session = useRequireAdmin();
  const [values, setValues] = useState<Values | null>(null);

  // The values come from the page's computed styles, so the page shows what is applied, not a copy.
  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const read: Values = {};
    for (const group of SWATCH_GROUPS) {
      for (const name of group.tokens) read[name] = styles.getPropertyValue(`--${name}`).trim();
    }
    setValues(read);
  }, []);

  if (session === undefined) return <div className="text-text-muted">Loading…</div>;
  if (!session) return null;
  if (!session.user.isOwner) {
    return <div className="rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">Owner access required.</div>;
  }
  if (values === null) return <div className="text-text-muted">Loading…</div>;

  const pairGroups = [...new Set(CONTRAST_PAIRS.map((pair) => pair.group))];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl text-charcoal">Design tokens</h1>
        <p className={`${note} mt-1 max-w-2xl`}>
          Every colour the admin uses, with the value the page is using now. Text colours are measured against the
          background they sit on: text needs 4.5 to 1, chart edges and the keyboard focus ring need 3 to 1.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className={heading}>As they are used</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <Card key={section} accent={section} className="p-5">
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${SECTION_TILE[section]}`}>
                  <Sparkles size={20} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium capitalize text-charcoal">{section}</p>
                  <p className={note}>Tile, badge and top accent</p>
                </div>
              </div>
              <span className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-medium ${SECTION_TILE[section]}`}>
                {section} badge
              </span>
            </Card>
          ))}
        </div>

        <h3 className="pt-2 font-medium text-charcoal">The five chart fills, in order, each with its edge</h3>
        <div className="flex flex-wrap items-center gap-3">
          {CATEGORICAL.map((colour, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-md" style={edgedFill(colour)} />
              <span className={note}>{i + 1}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-md" style={edgedFill(OTHER_GREY)} />
            <span className={note}>Other</span>
          </div>
        </div>

        <h3 className="pt-2 font-medium text-charcoal">The card shadow, on a white card</h3>
        <Card className="max-w-xs p-5">
          <p className="text-charcoal">A white card</p>
          <p className={note}>With its one soft shadow.</p>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className={heading}>All tokens</h2>
        {/* Two columns from a wide screen, each card as tall as its own list. */}
        <div className="columns-1 gap-4 xl:columns-2">
        {SWATCH_GROUPS.map((group) => (
          <Card key={group.title} className="mb-4 break-inside-avoid p-5">
            <h3 className="font-medium text-charcoal">{group.title}</h3>
            {group.note && <p className={note}>{group.note}</p>}
            <ul className="mt-3 divide-y divide-line/70">
              {group.tokens.map((name) => {
                const colour = colourOf(values, name);
                return (
                  <li key={name} className="flex items-center gap-3 py-2">
                    {colour ? (
                      <span
                        className="h-8 w-12 shrink-0 rounded-md border border-line"
                        style={{ backgroundColor: paint(colour) }}
                      />
                    ) : (
                      <span className="h-8 w-12 shrink-0 rounded-md bg-surface shadow-card" />
                    )}
                    <code className="min-w-0 flex-1 break-words text-sm text-charcoal">--{name}</code>
                    <code className="min-w-0 shrink-0 break-words text-right text-sm text-charcoal-muted">{values[name]}</code>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={heading}>Contrast</h2>
        {pairGroups.map((group) => (
          <Card key={group} className="overflow-x-auto p-5">
            <h3 className="font-medium text-charcoal">{group}</h3>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-charcoal-muted">
                <tr>
                  <th className="py-1 pr-4 font-medium">Sample</th>
                  <th className="py-1 pr-4 font-medium">Colour</th>
                  <th className="py-1 pr-4 font-medium">On</th>
                  <th className="figure py-1 pr-4 text-right font-medium">Ratio</th>
                  <th className="figure py-1 pr-4 text-right font-medium">Needs</th>
                  <th className="py-1 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {CONTRAST_PAIRS.filter((pair) => pair.group === group).map((pair) => {
                  const ratio = ratioOf(values, pair);
                  const fore = colourOf(values, pair.text);
                  const back = colourOf(values, pair.on);
                  return (
                    <tr key={`${pair.text}/${pair.on}`}>
                      <td className="py-2 pr-4">
                        {fore && back && (
                          <span
                            className="inline-block rounded px-3 py-1 font-medium"
                            style={{ color: paint(fore), backgroundColor: paint(back), outline: '1px solid var(--chart-grid)' }}
                          >
                            Aa 123
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4"><code>--{pair.text}</code></td>
                      <td className="py-2 pr-4"><code>--{pair.on}</code></td>
                      <td className="figure py-2 pr-4 text-right">{ratio === null ? 'n/a' : `${ratio.toFixed(2)} : 1`}</td>
                      <td className="figure py-2 pr-4 text-right">{pair.target} : 1</td>
                      <td className="py-2">{ratio === null ? 'Not measured' : <Mark ok={ratio >= pair.target} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ))}
      </section>
    </div>
  );
}
