/**
 * Geometry for the small trend line in a stat tile, kept free of React so it
 * can be tested without a DOM. `Sparkline` in charts.tsx draws what
 * `sparklineLayout` returns.
 */

/** The plot's size in SVG user units, and the room kept clear on each side for the end marker. */
export type SparklineGeometry = { width: number; height: number; padX: number; padY: number };

/**
 * One month of the series. A null value is a gap: the month has no figure at
 * all (a margin in a month with no revenue), which is not the same as zero.
 */
export type SparklineMonth = { label: string; value: number | null };

export type SparklinePoint = {
  label: string;
  value: number;
  x: number;
  y: number;
  /** The month is still running, so its figure is not yet a whole month's. */
  partMonth: boolean;
};

export type SparklineLayout =
  /** Fewer than two months have a figure: a line through them would say nothing. */
  | { kind: 'not-enough-data' }
  | {
      kind: 'line';
      /** One point per month that has a figure, oldest first, each in its own month's place. */
      points: SparklinePoint[];
      /**
       * The same points in unbroken stretches of months. The line is drawn
       * through each stretch and never across a gap; a month standing alone
       * between two gaps is a stretch of one.
       */
      runs: SparklinePoint[][];
      /** Where zero sits, when a month is below it; null when no value is negative. */
      zeroY: number | null;
    };

export function sparklineLayout(
  months: SparklineMonth[],
  geometry: SparklineGeometry,
  options: { partMonthLast?: boolean } = {},
): SparklineLayout {
  // Nothing recorded (zero) and nothing to record (a gap) both leave a month without a figure.
  if (months.filter((m) => m.value !== null && m.value !== 0).length < 2) return { kind: 'not-enough-data' };

  const { width, height, padX, padY } = geometry;
  const values = months.flatMap((m) => (m.value === null ? [] : [m.value]));
  const min = Math.min(...values);
  const hasNegative = min < 0;
  // The line fills the height between its lowest and highest month. A negative
  // month brings zero into the scale, so the zero line is always inside the plot.
  const top = hasNegative ? Math.max(...values, 0) : Math.max(...values);
  const span = top - min;
  const plotH = height - padY * 2;

  // Equal values have no span to spread over, so they sit at mid-height.
  const y = (value: number) => (span === 0 ? height / 2 : padY + ((top - value) / span) * plotH);
  // A slot per month, gaps included, so a month keeps its place when a neighbour has no figure.
  const step = months.length > 1 ? (width - padX * 2) / (months.length - 1) : 0;

  const points: SparklinePoint[] = [];
  const runs: SparklinePoint[][] = [];
  let run: SparklinePoint[] | null = null;
  months.forEach((m, i) => {
    if (m.value === null) {
      run = null;
      return;
    }
    const point: SparklinePoint = {
      label: m.label,
      value: m.value,
      x: padX + step * i,
      y: y(m.value),
      partMonth: options.partMonthLast === true && i === months.length - 1,
    };
    points.push(point);
    if (run) run.push(point);
    else runs.push((run = [point]));
  });

  return { kind: 'line', points, runs, zeroY: hasNegative ? y(0) : null };
}
