import { describe, expect, it } from 'vitest';

import { sparklineLayout, type SparklineGeometry } from './sparkline';

// A 200 by 40 plot with 4 units of room on every side, so the line runs from
// x = 4 to x = 196 and from y = 4 (top) to y = 36 (bottom).
const GEOMETRY: SparklineGeometry = { width: 200, height: 40, padX: 4, padY: 4 };

const months = (...values: (number | null)[]) =>
  values.map((value, i) => ({ label: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'][i] ?? `M${i}`, value }));

function line(values: (number | null)[], options?: { partMonthLast?: boolean }) {
  const layout = sparklineLayout(months(...values), GEOMETRY, options);
  if (layout.kind !== 'line') throw new Error(`expected a line, got ${layout.kind}`);
  return layout;
}

describe('sparklineLayout', () => {
  it('maps six values to six points spanning the width, the highest at the top', () => {
    const { points } = line([10, 40, 20, 60, 30, 50]);

    expect(points).toHaveLength(6);
    expect(points[0]!.x).toBeCloseTo(4);
    expect(points[5]!.x).toBeCloseTo(196);
    // Evenly spaced, in the order given.
    const step = points[1]!.x - points[0]!.x;
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.x - points[i - 1]!.x).toBeCloseTo(step);
    }
    // 60 is the highest value and sits at the top; 10 is the lowest, at the bottom.
    expect(points[3]!.y).toBeCloseTo(4);
    expect(points[0]!.y).toBeCloseTo(36);
    // Every other point lies between the two.
    for (const i of [1, 2, 4, 5]) {
      expect(points[i]!.y).toBeGreaterThan(4);
      expect(points[i]!.y).toBeLessThan(36);
    }
  });

  it('keeps each point with its month and its value', () => {
    const { points } = line([10, 40, 20, 60, 30, 50]);
    expect(points.map((p) => p.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
    expect(points.map((p) => p.value)).toEqual([10, 40, 20, 60, 30, 50]);
  });

  it('draws six equal values as a flat line at mid-height', () => {
    const { points } = line([25, 25, 25, 25, 25, 25]);
    for (const point of points) expect(point.y).toBeCloseTo(20);
  });

  it('reports "not enough data" when only one month has a figure', () => {
    expect(sparklineLayout(months(0, 0, 0, 0, 0, 54_000), GEOMETRY)).toEqual({ kind: 'not-enough-data' });
  });

  it('reports "not enough data" when no month has a figure', () => {
    expect(sparklineLayout(months(0, 0, 0, 0, 0, 0), GEOMETRY)).toEqual({ kind: 'not-enough-data' });
    expect(sparklineLayout([], GEOMETRY)).toEqual({ kind: 'not-enough-data' });
  });

  it('draws a line as soon as two months have a figure', () => {
    expect(sparklineLayout(months(0, 0, 0, 0, 165_000, 54_000), GEOMETRY).kind).toBe('line');
  });

  it('plots a loss below the zero line and a profit above it', () => {
    const { points, zeroY } = line([30, 20, -10, 40, 10, 20]);

    expect(zeroY).not.toBeNull();
    expect(points[2]!.y).toBeGreaterThan(zeroY!); // SVG y grows downwards
    for (const i of [0, 1, 3, 4, 5]) expect(points[i]!.y).toBeLessThan(zeroY!);
    // The zero line is inside the plot, where it can be drawn.
    expect(zeroY!).toBeGreaterThan(4);
    expect(zeroY!).toBeLessThan(36);
  });

  it('has no zero line when no month made a loss', () => {
    expect(line([10, 40, 20, 60, 30, 50]).zeroY).toBeNull();
  });

  it('has no zero line for a month of exactly zero, or for a month with no figure', () => {
    expect(line([0, 40, 20, 60, 30, 50]).zeroY).toBeNull();
    expect(line([null, 40, 20, 60, 30, 50]).zeroY).toBeNull();
  });

  it('has a zero line as soon as one month is negative', () => {
    expect(line([10, 40, 20, 60, -1, 50]).zeroY).not.toBeNull();
  });

  // A month with no figure at all (a margin in a month with no revenue) is a
  // gap: it is not zero, and it has no point.
  describe('gaps', () => {
    it('gives a month with no figure no point, and leaves the others in their own slots', () => {
      const { points } = line([10, null, 20, 60, 30, 50]);

      expect(points.map((p) => p.label)).toEqual(['Jun', 'Aug', 'Sep', 'Oct', 'Nov']);
      // Six slots across the width: Jun in the first, Aug in the third.
      const step = (196 - 4) / 5;
      expect(points[0]!.x).toBeCloseTo(4);
      expect(points[1]!.x).toBeCloseTo(4 + step * 2);
      expect(points[4]!.x).toBeCloseTo(196);
    });

    it('scales to the months that have a figure, not to the gap', () => {
      const { points, zeroY } = line([20, null, 60, 40, 30, 50]);
      expect(points[0]!.y).toBeCloseTo(36); // 20 is the lowest, at the bottom
      expect(points[1]!.y).toBeCloseTo(4); // 60 is the highest, at the top
      expect(zeroY).toBeNull();
    });

    it('breaks the line at a gap instead of drawing across it', () => {
      const { runs } = line([10, 40, null, 60, 30, 50]);
      expect(runs.map((run) => run.map((p) => p.label))).toEqual([
        ['Jun', 'Jul'],
        ['Sep', 'Oct', 'Nov'],
      ]);
    });

    it('keeps one unbroken run when every month has a figure', () => {
      const { runs, points } = line([10, 40, 20, 60, 30, 50]);
      expect(runs).toEqual([points]);
    });

    it('keeps a month that stands alone between two gaps as a run of one', () => {
      const { runs } = line([10, null, 20, null, 30, 50]);
      expect(runs.map((run) => run.map((p) => p.label))).toEqual([['Jun'], ['Aug'], ['Oct', 'Nov']]);
    });

    it('reports "not enough data" when fewer than two months have a figure', () => {
      expect(sparklineLayout(months(null, null, null, null, null, 72), GEOMETRY)).toEqual({ kind: 'not-enough-data' });
      expect(sparklineLayout(months(null, null, null, null, null, null), GEOMETRY)).toEqual({
        kind: 'not-enough-data',
      });
    });

    it('draws a line as soon as two months have a figure, wherever the gaps are', () => {
      expect(sparklineLayout(months(null, 64, null, null, null, 72), GEOMETRY).kind).toBe('line');
    });

    it('flags no point as part-month when the running month has no figure', () => {
      const { points } = line([10, 40, 20, 60, 30, null], { partMonthLast: true });
      expect(points).toHaveLength(5);
      expect(points.some((p) => p.partMonth)).toBe(false);
    });
  });

  it('flags only the last point as part-month in same-period mode', () => {
    const { points } = line([10, 40, 20, 60, 30, 50], { partMonthLast: true });
    expect(points.map((p) => p.partMonth)).toEqual([false, false, false, false, false, true]);
  });

  it('flags no point when whole months are compared', () => {
    const { points } = line([10, 40, 20, 60, 30, 50], { partMonthLast: false });
    expect(points.some((p) => p.partMonth)).toBe(false);
    expect(line([10, 40, 20, 60, 30, 50]).points.some((p) => p.partMonth)).toBe(false);
  });
});
