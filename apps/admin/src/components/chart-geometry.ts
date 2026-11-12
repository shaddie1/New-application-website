/**
 * Geometry for the part-to-whole donut, kept free of React so it can be tested
 * without a DOM. `DonutChart` in charts.tsx renders what `donutLayout` returns.
 */

export type Slice = { key: string; label: string; value: number };

/** Where the donut sits and how big it is, in SVG user units. */
export type DonutGeometry = {
  cx: number;
  cy: number;
  rOuter: number;
  rInner: number;
  /** Width of the surface gap between touching segments, at the outer edge. */
  gapPx: number;
};

/** One drawable segment. `from` and `to` are radians, clockwise from 3 o'clock. */
export type DonutSegment = Slice & { from: number; to: number; d: string };

export type DonutLayout = {
  /** The whole the shares are measured against. 0 when there is nothing to draw. */
  total: number;
  /** Legend rows: positive slices, largest first, the tail folded into "Other". */
  rows: Slice[];
  /** The rows wide enough to draw. Empty when `rows` is. */
  segments: DonutSegment[];
};

export const OTHER_KEY = '__other';

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** SVG path for one donut segment (an annular sector). */
function arcPath(cx: number, cy: number, rOuter: number, rInner: number, from: number, to: number) {
  const large = to - from > Math.PI ? 1 : 0;
  const o1 = polar(cx, cy, rOuter, from);
  const o2 = polar(cx, cy, rOuter, to);
  const i2 = polar(cx, cy, rInner, to);
  const i1 = polar(cx, cy, rInner, from);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

/**
 * SVG path for a whole ring. An arc whose two ends are the same point draws
 * nothing, so each circle is two half arcs. The inner circle runs the other way
 * round, which leaves the hole unfilled.
 */
function ringPath(cx: number, cy: number, rOuter: number, rInner: number, from: number) {
  const o1 = polar(cx, cy, rOuter, from);
  const o2 = polar(cx, cy, rOuter, from + Math.PI);
  const i1 = polar(cx, cy, rInner, from);
  const i2 = polar(cx, cy, rInner, from + Math.PI);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 1 1 ${o2.x} ${o2.y}`,
    `A ${rOuter} ${rOuter} 0 1 1 ${o1.x} ${o1.y}`,
    'Z',
    `M ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 1 0 ${i2.x} ${i2.y}`,
    `A ${rInner} ${rInner} 0 1 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

const FULL_CIRCLE = Math.PI * 2;

export function donutLayout(
  slices: Slice[],
  geometry: DonutGeometry,
  options: { maxSlices?: number; total?: number } = {},
): DonutLayout {
  const { cx, cy, rOuter, rInner, gapPx } = geometry;
  const maxSlices = options.maxSlices ?? 5;

  const positive = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (positive.length === 0) return { total: 0, rows: [], segments: [] };

  const rows: Slice[] = positive.slice(0, maxSlices);
  const tail = positive.slice(maxSlices);
  if (tail.length > 0) {
    rows.push({
      key: OTHER_KEY,
      label: `Other (${tail.length})`,
      value: tail.reduce((acc, s) => acc + s.value, 0),
    });
  }

  const total = options.total ?? rows.reduce((acc, s) => acc + s.value, 0);
  // Every share divides by the total, so a total of 0 has nothing to draw.
  if (!(total > 0)) return { total: 0, rows: [], segments: [] };

  // The gap separates touching segments. Converted to radians at the outer edge
  // so it looks even. A lone segment has nothing to be separated from.
  const gap = rows.length > 1 ? gapPx / rOuter : 0;
  let cursor = -Math.PI / 2; // start at 12 o'clock

  const segments: DonutSegment[] = [];
  for (const row of rows) {
    const sweep = (row.value / total) * FULL_CIRCLE;
    const from = cursor + gap / 2;
    const to = cursor + sweep - gap / 2;
    cursor += sweep;
    if (to <= from) continue;
    const d =
      to - from >= FULL_CIRCLE - 1e-9
        ? ringPath(cx, cy, rOuter, rInner, from)
        : arcPath(cx, cy, rOuter, rInner, from, to);
    segments.push({ ...row, from, to, d });
  }

  return { total, rows, segments };
}
