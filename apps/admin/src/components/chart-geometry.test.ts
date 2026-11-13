import { describe, expect, it } from 'vitest';

import { donutLayout, type DonutGeometry } from './chart-geometry';

// The donut the dashboard draws: 220px square, 100px outer radius, and a 2px
// gap between segments, which is 0.02 radians at the outer edge.
const GEOMETRY: DonutGeometry = { cx: 110, cy: 110, rOuter: 100, rInner: 64, gapPx: 2 };
const GAP = 0.02;
const FULL_CIRCLE = Math.PI * 2;

type Point = { x: number; y: number };

/**
 * The start and end point of every arc in an SVG path. A browser draws nothing
 * for an arc whose two ends are the same point, which is how a full ring drawn
 * as a single arc disappears.
 */
function arcEnds(d: string): { start: Point; end: Point }[] {
  const tokens = d.trim().split(/\s+/);
  const arcs: { start: Point; end: Point }[] = [];
  let current: Point = { x: Number.NaN, y: Number.NaN };
  let i = 0;
  while (i < tokens.length) {
    const command = tokens[i];
    if (command === 'M' || command === 'L') {
      current = { x: Number(tokens[i + 1]), y: Number(tokens[i + 2]) };
      i += 3;
    } else if (command === 'A') {
      const end = { x: Number(tokens[i + 6]), y: Number(tokens[i + 7]) };
      arcs.push({ start: current, end });
      current = end;
      i += 8;
    } else if (command === 'Z') {
      i += 1;
    } else {
      throw new Error(`Unexpected path token "${command}" in "${d}"`);
    }
  }
  return arcs;
}

describe('donutLayout', () => {
  it('returns no segments when there are no slices', () => {
    expect(donutLayout([], GEOMETRY).segments).toEqual([]);
  });

  it('returns no segments when every slice is zero or negative', () => {
    const layout = donutLayout(
      [
        { key: 'refunds', label: 'Refunds', value: -500 },
        { key: 'nothing', label: 'Nothing', value: 0 },
      ],
      GEOMETRY,
    );

    expect(layout.segments).toEqual([]);
  });

  it('draws one positive slice as a full ring whose arcs each have two distinct ends', () => {
    const { segments } = donutLayout([{ key: 'unclassified', label: 'Unclassified', value: 500 }], GEOMETRY);

    expect(segments).toHaveLength(1);
    const ring = segments[0]!;
    expect(ring.key).toBe('unclassified');
    expect(ring.to - ring.from).toBeCloseTo(FULL_CIRCLE, 6);

    const arcs = arcEnds(ring.d);
    expect(arcs.length).toBeGreaterThan(0);
    for (const arc of arcs) {
      const distance = Math.hypot(arc.end.x - arc.start.x, arc.end.y - arc.start.y);
      expect(distance).toBeGreaterThan(1);
    }
  });

  it('gives slices of 75 and 25 three quarters and one quarter of the circle, less the gap', () => {
    const { segments } = donutLayout(
      [
        { key: 'homes', label: 'Homes', value: 75 },
        { key: 'offices', label: 'Offices', value: 25 },
      ],
      GEOMETRY,
    );

    expect(segments.map((s) => s.key)).toEqual(['homes', 'offices']);
    expect(segments[0]!.to - segments[0]!.from).toBeCloseTo(FULL_CIRCLE * 0.75 - GAP, 6);
    expect(segments[1]!.to - segments[1]!.from).toBeCloseTo(FULL_CIRCLE * 0.25 - GAP, 6);
  });

  it('folds seven slices with maxSlices 5 into five named segments and one Other', () => {
    const { segments } = donutLayout(
      [
        { key: 'a', label: 'A', value: 70 },
        { key: 'b', label: 'B', value: 60 },
        { key: 'c', label: 'C', value: 50 },
        { key: 'd', label: 'D', value: 40 },
        { key: 'e', label: 'E', value: 30 },
        { key: 'f', label: 'F', value: 20 },
        { key: 'g', label: 'G', value: 10 },
      ],
      GEOMETRY,
      { maxSlices: 5 },
    );

    expect(segments).toHaveLength(6);
    expect(segments.slice(0, 5).map((s) => s.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(segments[5]!.label).toBe('Other (2)');
    expect(segments[5]!.value).toBe(30);
  });

  it('omits a slice thinner than the gap', () => {
    // 1 of 1001 sweeps 0.0063 radians, less than the 0.02 radian gap.
    const { segments } = donutLayout(
      [
        { key: 'contracts', label: 'Contracts', value: 1000 },
        { key: 'tip', label: 'Tip', value: 1 },
      ],
      GEOMETRY,
    );

    expect(segments.map((s) => s.key)).toEqual(['contracts']);
  });

  it('returns no segments when the total is overridden to 0', () => {
    const layout = donutLayout([{ key: 'homes', label: 'Homes', value: 100 }], GEOMETRY, { total: 0 });

    expect(layout.segments).toEqual([]);
  });

  // `DonutChart` shows its empty message when there are no legend rows. With
  // segments gone and rows left it would draw a legend of shares of nothing.
  it('has no legend rows and a total of 0 when there is nothing to take a share of', () => {
    const nothing = { total: 0, rows: [], segments: [] };

    expect(donutLayout([], GEOMETRY)).toEqual(nothing);
    expect(donutLayout([{ key: 'homes', label: 'Homes', value: 0 }], GEOMETRY)).toEqual(nothing);
    expect(donutLayout([{ key: 'homes', label: 'Homes', value: 100 }], GEOMETRY, { total: 0 })).toEqual(nothing);
  });
});
