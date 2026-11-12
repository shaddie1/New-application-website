/**
 * Geometry for a stacked bar chart, kept free of React so it can be tested
 * without a DOM. A chart component draws what `stackedBars` returns.
 *
 * Each column is one bar. Its positive values stack upward from the zero line
 * in series order and its negative values stack downward, so a loss reads
 * below the line and the axis covers both.
 */

export type StackSeries = { key: string; label: string };

/** One bar: a value for each series, in the order of the series. */
export type StackColumn = { key: string; label: string; values: number[] };

/** The drawing area, in SVG user units. */
export type StackGeometry = {
  width: number;
  height: number;
  pad: { top: number; right: number; bottom: number; left: number };
  /** How much of its slot a bar fills, from 0 to 1. */
  barShare: number;
  /** A bar is never wider than this, however few columns there are. */
  maxBarWidth: number;
  /** The surface gap between touching segments of one bar. */
  gapPx: number;
};

export type StackSegment = {
  seriesKey: string;
  seriesIndex: number;
  value: number;
  /** Where the segment starts and ends on the value axis; `from` is the side toward zero. */
  from: number;
  to: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The last segment on its side of the zero line: the end of the bar. */
  outer: boolean;
};

export type StackBar = {
  key: string;
  label: string;
  /** The column's full slot, for a hover target wider than the bar. */
  bandX: number;
  bandWidth: number;
  x: number;
  width: number;
  segments: StackSegment[];
  /** The sum of the positive values, and of the negative ones (zero or below). */
  positive: number;
  negative: number;
};

export type StackAxis = { min: number; max: number; step: number; ticks: { value: number; y: number }[] };

export type StackLayout =
  | { status: 'not-enough-data' }
  | { status: 'ok'; axis: StackAxis; zeroY: number; yOf: (value: number) => number; bars: StackBar[] };

export const OTHERS_KEY = '__others';

/**
 * Keeps the first `keep` series and adds the rest together as one "Others"
 * series, in every column. Past a handful of colours a stack cannot be read.
 */
export function foldSeries(
  series: StackSeries[],
  columns: StackColumn[],
  keep: number,
): { series: StackSeries[]; columns: StackColumn[] } {
  if (series.length <= keep) return { series, columns };
  const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);
  return {
    series: [...series.slice(0, keep), { key: OTHERS_KEY, label: `Others (${series.length - keep})` }],
    columns: columns.map((c) => ({ ...c, values: [...c.values.slice(0, keep), sum(c.values.slice(keep))] })),
  };
}

/** One column with data is a single bar, not a history. */
const MIN_COLUMNS_WITH_DATA = 2;

/** Whether there is a chart to draw: at least two columns with something in them. */
export function enoughToDraw(columns: StackColumn[]): boolean {
  return columns.filter((c) => c.values.some((v) => v !== 0)).length >= MIN_COLUMNS_WITH_DATA;
}
const AXIS_STEPS = 4;

/**
 * An axis that covers `lowest` to `highest`, which must span zero. Its ticks
 * are a step apart, 1, 2 or 5 times a power of ten. Each end stops at the
 * half step past the data, not the whole one, so the tallest bar never has
 * most of an empty step above it; an end that falls between two ticks has no
 * tick of its own.
 */
function roundAxis(lowest: number, highest: number): { min: number; max: number; step: number; values: number[] } {
  const rough = (highest - lowest) / AXIS_STEPS;
  const power = 10 ** Math.floor(Math.log10(rough));
  const leading = rough / power;
  const step = (leading <= 1 ? 1 : leading <= 2 ? 2 : leading <= 5 ? 5 : 10) * power;

  // `+ 0` turns a negative zero into zero.
  const half = step / 2;
  const min = Math.floor(lowest / half) * half + 0;
  const max = Math.ceil(highest / half) * half + 0;

  const values: number[] = [];
  for (let i = Math.ceil(min / step); i <= Math.floor(max / step); i += 1) values.push(i * step + 0);
  return { min, max, step, values };
}

export function stackedBars(series: StackSeries[], columns: StackColumn[], geometry: StackGeometry): StackLayout {
  if (!enoughToDraw(columns)) return { status: 'not-enough-data' };

  const { width, height, pad, barShare, maxBarWidth, gapPx } = geometry;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const sums = columns.map((c) => ({
    positive: c.values.reduce((acc, v) => (v > 0 ? acc + v : acc), 0),
    negative: c.values.reduce((acc, v) => (v < 0 ? acc + v : acc), 0),
  }));
  // Two columns have data, so the two ends cannot both be zero.
  const axis = roundAxis(Math.min(0, ...sums.map((s) => s.negative)), Math.max(0, ...sums.map((s) => s.positive)));
  const yOf = (value: number) => pad.top + ((axis.max - value) / (axis.max - axis.min)) * plotHeight;

  const bandWidth = plotWidth / columns.length;
  const barWidth = Math.min(maxBarWidth, bandWidth * barShare);

  const bars = columns.map((column, index): StackBar => {
    const bandX = pad.left + bandWidth * index;
    const x = bandX + (bandWidth - barWidth) / 2;

    const segments: StackSegment[] = [];
    // The running top of the stack above the line, and the bottom of the one below.
    let up = 0;
    let down = 0;
    let lastUp: StackSegment | null = null;
    let lastDown: StackSegment | null = null;

    for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex += 1) {
      const value = column.values[seriesIndex] ?? 0;
      if (value === 0) continue;
      const rising = value > 0;
      const from = rising ? up : down;
      const to = from + value;
      if (rising) up = to;
      else down = to;

      const near = yOf(from);
      const far = yOf(to);
      // A segment that touches another gives up the gap, unless it is too thin to spare it.
      const inset = from !== 0 && Math.abs(far - near) > gapPx + 1 ? gapPx : 0;
      const top = rising ? far : near + inset;
      const bottom = rising ? near - inset : far;

      const segment: StackSegment = {
        seriesKey: series[seriesIndex]!.key,
        seriesIndex,
        value,
        from,
        to,
        x,
        y: top,
        width: barWidth,
        height: bottom - top,
        outer: false,
      };
      segments.push(segment);
      if (rising) lastUp = segment;
      else lastDown = segment;
    }

    if (lastUp) lastUp.outer = true;
    if (lastDown) lastDown.outer = true;

    return {
      key: column.key,
      label: column.label,
      bandX,
      bandWidth,
      x,
      width: barWidth,
      segments,
      positive: sums[index]!.positive,
      negative: sums[index]!.negative,
    };
  });

  return {
    status: 'ok',
    axis: { min: axis.min, max: axis.max, step: axis.step, ticks: axis.values.map((value) => ({ value, y: yOf(value) })) },
    zeroY: yOf(0),
    yOf,
    bars,
  };
}

/**
 * The outline of one segment. The end of a bar has its two far corners
 * rounded; every edge toward the zero line, and every segment inside the
 * stack, is square.
 */
export function segmentPath(segment: StackSegment, radius: number): string {
  const { x, y, width, height } = segment;
  const right = x + width;
  const bottom = y + height;
  const r = segment.outer ? Math.max(0, Math.min(radius, width / 2, height)) : 0;

  if (r === 0) return `M ${x} ${y} L ${right} ${y} L ${right} ${bottom} L ${x} ${bottom} Z`;
  if (segment.value > 0) {
    return [
      `M ${x} ${bottom}`,
      `L ${x} ${y + r}`,
      `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
      `L ${right - r} ${y}`,
      `A ${r} ${r} 0 0 1 ${right} ${y + r}`,
      `L ${right} ${bottom}`,
      'Z',
    ].join(' ');
  }
  return [
    `M ${x} ${y}`,
    `L ${right} ${y}`,
    `L ${right} ${bottom - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
    `L ${x + r} ${bottom}`,
    `A ${r} ${r} 0 0 1 ${x} ${bottom - r}`,
    'Z',
  ].join(' ');
}
