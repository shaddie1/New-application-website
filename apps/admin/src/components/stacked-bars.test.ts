import { describe, expect, it } from 'vitest';

import {
  OTHERS_KEY, enoughToDraw, foldSeries, segmentPath, stackedBars,
  type StackColumn, type StackGeometry, type StackLayout, type StackSeries,
} from './stacked-bars';

const GEOMETRY: StackGeometry = {
  width: 720,
  height: 300,
  pad: { top: 20, right: 20, bottom: 40, left: 60 },
  barShare: 0.6,
  maxBarWidth: 24,
  gapPx: 2,
};
const PLOT_BOTTOM = GEOMETRY.height - GEOMETRY.pad.bottom;

const THREE: StackSeries[] = [
  { key: 'a', label: 'Holdings' },
  { key: 'b', label: 'Amina' },
  { key: 'c', label: 'Zecharia' },
];

const column = (key: string, values: number[]): StackColumn => ({ key, label: key, values });

/** The layout, or a failed test when the chart reports it has too little to draw. */
function drawn(layout: StackLayout) {
  if (layout.status !== 'ok') throw new Error('expected a chart, got "not enough data"');
  return layout;
}

describe('a profit month', () => {
  const layout = drawn(stackedBars(THREE, [column('jan', [400, 300, 300]), column('feb', [40, 30, 30])], GEOMETRY));
  const segments = layout.bars[0]!.segments;

  it('stacks the three shares upward from zero, in table order', () => {
    expect(segments.map((s) => s.seriesKey)).toEqual(['a', 'b', 'c']);
    expect(segments.map((s) => [s.from, s.to])).toEqual([[0, 400], [400, 700], [700, 1000]]);
    // On the page: the first rests on the zero line and each next one sits above the one before.
    expect(segments[0]!.y + segments[0]!.height).toBeCloseTo(layout.zeroY);
    expect(segments[1]!.y + segments[1]!.height).toBeLessThanOrEqual(segments[0]!.y);
    expect(segments[2]!.y + segments[2]!.height).toBeLessThanOrEqual(segments[1]!.y);
  });

  it('reaches the sum of the shares', () => {
    expect(layout.bars[0]!.positive).toBe(1000);
    expect(layout.bars[0]!.negative).toBe(0);
    expect(segments[2]!.y).toBeCloseTo(layout.yOf(1000));
    expect(layout.yOf(1000)).toBeLessThan(layout.zeroY);
  });

  it('marks only the top segment as the end of the bar', () => {
    expect(segments.map((s) => s.outer)).toEqual([false, false, true]);
  });

  it('leaves the gap between touching segments', () => {
    expect(segments[0]!.y - (segments[1]!.y + segments[1]!.height)).toBeCloseTo(GEOMETRY.gapPx);
    expect(segments[1]!.y - (segments[2]!.y + segments[2]!.height)).toBeCloseTo(GEOMETRY.gapPx);
  });
});

describe('a loss month', () => {
  const layout = drawn(stackedBars(THREE, [column('jan', [-400, -300, -300]), column('feb', [40, 30, 30])], GEOMETRY));
  const segments = layout.bars[0]!.segments;

  it('stacks the three shares downward from zero, in table order', () => {
    expect(segments.map((s) => s.seriesKey)).toEqual(['a', 'b', 'c']);
    expect(segments.map((s) => [s.from, s.to])).toEqual([[0, -400], [-400, -700], [-700, -1000]]);
    expect(segments[0]!.y).toBeCloseTo(layout.zeroY);
    expect(segments[1]!.y).toBeGreaterThanOrEqual(segments[0]!.y + segments[0]!.height);
    expect(segments[2]!.y).toBeGreaterThanOrEqual(segments[1]!.y + segments[1]!.height);
  });

  it('reaches the sum of the losses, below the zero line', () => {
    expect(layout.bars[0]!.negative).toBe(-1000);
    expect(layout.bars[0]!.positive).toBe(0);
    expect(segments[2]!.y + segments[2]!.height).toBeCloseTo(layout.yOf(-1000));
    expect(layout.yOf(-1000)).toBeGreaterThan(layout.zeroY);
  });

  it('marks only the bottom segment as the end of the bar', () => {
    expect(segments.map((s) => s.outer)).toEqual([false, false, true]);
  });
});

describe('the axis', () => {
  const columns = [
    column('jan', [400, 300, 300]), // +1000, the largest profit
    column('feb', [-100, -75, -75]), // −250, the largest loss
    column('mar', [40, 30, 30]),
    column('apr', [-4, -3, -3]),
  ];
  const layout = drawn(stackedBars(THREE, columns, GEOMETRY));

  it('covers the largest positive stack and the largest negative stack', () => {
    expect(layout.axis.max).toBeGreaterThanOrEqual(1000);
    expect(layout.axis.min).toBeLessThanOrEqual(-250);
  });

  it('runs from the top of the plot to the bottom, with zero in between', () => {
    expect(layout.yOf(layout.axis.max)).toBeCloseTo(GEOMETRY.pad.top);
    expect(layout.yOf(layout.axis.min)).toBeCloseTo(PLOT_BOTTOM);
    expect(layout.zeroY).toBeGreaterThan(GEOMETRY.pad.top);
    expect(layout.zeroY).toBeLessThan(PLOT_BOTTOM);
    expect(layout.zeroY).toBeCloseTo(layout.yOf(0));
  });

  it('has evenly spaced ticks that include zero and stay inside the axis', () => {
    const values = layout.axis.ticks.map((t) => t.value);
    expect(values).toContain(0);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(layout.axis.min);
      expect(value).toBeLessThanOrEqual(layout.axis.max);
      expect(Math.abs(value % layout.axis.step)).toBe(0);
    }
    for (let i = 1; i < values.length; i += 1) expect(values[i]! - values[i - 1]!).toBe(layout.axis.step);
    for (const tick of layout.axis.ticks) expect(tick.y).toBeCloseTo(layout.yOf(tick.value));
  });

  it('ends within half a step of the tallest bar, not at the next whole step', () => {
    // +1085 and -400 are labelled every 500. The axis stops at 1250 and -500,
    // so there is no empty band up to 1500 above the tallest bar.
    const tall = drawn(stackedBars(THREE, [column('jan', [435, 325, 325]), column('feb', [-160, -120, -120])], GEOMETRY));
    expect(tall.axis.step).toBe(500);
    expect(tall.axis.max).toBe(1250);
    expect(tall.axis.min).toBe(-500);
    expect(tall.axis.ticks.map((t) => t.value)).toEqual([-500, 0, 500, 1000]);
    expect(tall.axis.max - 1085).toBeLessThanOrEqual(tall.axis.step / 2);
  });

  it('ends exactly at a bar that reaches a half step', () => {
    const exact = drawn(stackedBars(THREE, [column('jan', [500, 400, 350]), column('feb', [40, 30, 30])], GEOMETRY));
    expect(exact.axis.max).toBe(1250);
    expect(exact.axis.min).toBe(0);
  });

  it('keeps every bar inside the plot', () => {
    for (const bar of layout.bars) {
      for (const s of bar.segments) {
        expect(s.y).toBeGreaterThanOrEqual(GEOMETRY.pad.top - 1e-6);
        expect(s.y + s.height).toBeLessThanOrEqual(PLOT_BOTTOM + 1e-6);
      }
    }
  });

  it('starts at zero when no month is a loss', () => {
    const profits = drawn(stackedBars(THREE, [column('jan', [400, 300, 300]), column('feb', [40, 30, 30])], GEOMETRY));
    expect(profits.axis.min).toBe(0);
    expect(profits.zeroY).toBeCloseTo(PLOT_BOTTOM);
  });

  it('steps in round numbers', () => {
    // 1, 2 or 5 times a power of ten, so a label such as "KSh 50k" is exact.
    const leading = Number(String(layout.axis.step).replace(/0+$/, ''));
    expect([1, 2, 5]).toContain(leading);
  });
});

describe('seven holders', () => {
  const seven: StackSeries[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => ({ key, label: `Holder ${key}` }));
  const columns = [
    column('jan', [300, 200, 150, 120, 100, 80, 50]),
    column('feb', [30, 20, 15, 12, 10, 8, 5]),
  ];
  const folded = foldSeries(seven, columns, 5);

  it('keeps the first five and groups the rest as one "Others" series', () => {
    expect(folded.series.map((s) => s.key)).toEqual(['a', 'b', 'c', 'd', 'e', OTHERS_KEY]);
    expect(folded.series[5]!.label).toBe('Others (2)');
    expect(folded.columns[0]!.values).toEqual([300, 200, 150, 120, 100, 130]);
    expect(folded.columns[1]!.values).toEqual([30, 20, 15, 12, 10, 13]);
  });

  it('draws five segments and one "Others" segment in each month', () => {
    const layout = drawn(stackedBars(folded.series, folded.columns, GEOMETRY));
    for (const bar of layout.bars) {
      expect(bar.segments).toHaveLength(6);
      expect(bar.segments.map((s) => s.seriesKey)).toEqual(['a', 'b', 'c', 'd', 'e', OTHERS_KEY]);
    }
    expect(layout.bars[0]!.segments[5]!.value).toBe(130);
    expect(layout.bars[0]!.positive).toBe(1000);
  });

  it('leaves five or fewer series as they are', () => {
    const columnsOfThree = [column('jan', [400, 300, 300])];
    expect(foldSeries(THREE, columnsOfThree, 5)).toEqual({ series: THREE, columns: columnsOfThree });
  });
});

describe('too little to draw', () => {
  const empty = (key: string) => column(key, [0, 0, 0]);
  const elevenEmpty = Array.from({ length: 11 }, (_, i) => empty(`m${i}`));

  it('reports "not enough data" for eleven empty months and one with data', () => {
    expect(stackedBars(THREE, [...elevenEmpty, column('nov', [400, 300, 300])], GEOMETRY)).toEqual({ status: 'not-enough-data' });
  });

  it('reports "not enough data" when every month is empty, or there are none', () => {
    expect(stackedBars(THREE, [...elevenEmpty, empty('nov')], GEOMETRY)).toEqual({ status: 'not-enough-data' });
    expect(stackedBars(THREE, [], GEOMETRY)).toEqual({ status: 'not-enough-data' });
  });

  it('draws once two months have data, wherever they fall', () => {
    const columns = [column('jan', [-40, -30, -30]), ...elevenEmpty.slice(0, 10), column('nov', [400, 300, 300])];
    expect(stackedBars(THREE, columns, GEOMETRY).status).toBe('ok');
  });

  it('says so before anything is laid out, for a page that words itself around the chart', () => {
    expect(enoughToDraw([...elevenEmpty, column('nov', [400, 300, 300])])).toBe(false);
    expect(enoughToDraw([])).toBe(false);
    expect(enoughToDraw([column('jan', [-40, -30, -30]), ...elevenEmpty.slice(0, 10), column('nov', [400, 300, 300])])).toBe(true);
  });
});

describe('each bar', () => {
  const layout = drawn(stackedBars(THREE, [column('jan', [400, 0, 300]), column('feb', [600, 600, -200])], GEOMETRY));

  it('draws nothing for a share of zero', () => {
    expect(layout.bars[0]!.segments.map((s) => s.seriesKey)).toEqual(['a', 'c']);
  });

  it('stacks gains up and losses down when a month has both', () => {
    const [a, b, c] = layout.bars[1]!.segments;
    expect([a!.from, a!.to, b!.from, b!.to]).toEqual([0, 600, 600, 1200]);
    expect([c!.from, c!.to]).toEqual([0, -200]);
    expect(c!.y).toBeCloseTo(layout.zeroY);
    // One end above the line and one below.
    expect(layout.bars[1]!.segments.map((s) => s.outer)).toEqual([false, true, true]);
  });

  it('is no wider than the cap and sits in the middle of its band', () => {
    const band = (GEOMETRY.width - GEOMETRY.pad.left - GEOMETRY.pad.right) / 2;
    const [first, second] = layout.bars;
    expect(first!.width).toBe(GEOMETRY.maxBarWidth);
    expect(first!.bandX).toBeCloseTo(GEOMETRY.pad.left);
    expect(second!.bandX).toBeCloseTo(GEOMETRY.pad.left + band);
    expect(first!.x + first!.width / 2).toBeCloseTo(first!.bandX + band / 2);
    for (const s of first!.segments) expect([s.x, s.width]).toEqual([first!.x, first!.width]);
  });

  it('fills the share of its slot the chart asks for, while that is under the cap', () => {
    const wide = { ...GEOMETRY, barShare: 0.45, maxBarWidth: 200 };
    const band = (wide.width - wide.pad.left - wide.pad.right) / 2;
    const [first] = drawn(stackedBars(THREE, [column('jan', [400, 0, 300]), column('feb', [600, 600, -200])], wide)).bars;
    expect(first!.width).toBeCloseTo(band * 0.45);
    expect(first!.x + first!.width / 2).toBeCloseTo(first!.bandX + band / 2);
  });

  it('narrows the bars when the bands are tight', () => {
    const many = Array.from({ length: 60 }, (_, i) => column(`m${i}`, [4, 3, 3]));
    const tight = drawn(stackedBars(THREE, many, GEOMETRY));
    expect(tight.bars[0]!.width).toBeLessThan(tight.bars[0]!.bandWidth);
    expect(tight.bars[0]!.width).toBeLessThan(GEOMETRY.maxBarWidth);
  });
});

describe('segmentPath', () => {
  const layout = drawn(stackedBars(THREE, [column('jan', [400, 300, 300]), column('feb', [-400, -300, -300])], GEOMETRY));

  /** Whether the path passes through the point exactly, which a rounded corner does not. */
  const passesThrough = (d: string, x: number, y: number) => ` ${d} `.includes(` ${x} ${y} `);
  const corners = (s: { x: number; y: number; width: number; height: number }) => ({
    top: [[s.x, s.y], [s.x + s.width, s.y]] as const,
    bottom: [[s.x, s.y + s.height], [s.x + s.width, s.y + s.height]] as const,
  });

  it('draws a plain rectangle for a segment inside the stack', () => {
    const inner = layout.bars[0]!.segments[0]!;
    const d = segmentPath(inner, 4);
    for (const [x, y] of [...corners(inner).top, ...corners(inner).bottom]) expect(passesThrough(d, x, y)).toBe(true);
  });

  it('rounds the top of a profit bar and keeps it square toward the zero line', () => {
    const top = layout.bars[0]!.segments[2]!;
    const d = segmentPath(top, 4);
    for (const [x, y] of corners(top).top) expect(passesThrough(d, x, y)).toBe(false);
    for (const [x, y] of corners(top).bottom) expect(passesThrough(d, x, y)).toBe(true);
  });

  it('rounds the bottom of a loss bar and keeps it square toward the zero line', () => {
    const bottom = layout.bars[1]!.segments[2]!;
    const d = segmentPath(bottom, 4);
    for (const [x, y] of corners(bottom).bottom) expect(passesThrough(d, x, y)).toBe(false);
    for (const [x, y] of corners(bottom).top) expect(passesThrough(d, x, y)).toBe(true);
  });
});
