'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { money } from '../lib/money';
import { OTHER_KEY, donutLayout, type Slice } from './chart-geometry';
import { changeTone } from './dashboard/change-tone';
import { sparklineLayout, type SparklineGeometry, type SparklineMonth } from './sparkline';

/**
 * Charts for the admin dashboard.
 *
 * Every colour is a token declared in app/globals.css, the admin's one token
 * file (the --chart-* variables, and the navy); nothing here names a colour
 * itself.
 *
 * A single series (bars, the income area) is drawn in one colour, the teal
 * `--chart-accent`, which measures 3.7:1 on the white card. The one
 * two-series chart sets that teal against the ink and separates the two by
 * mark as well: an area for income, a line for net profit.
 *
 * Teal also means "good", so two marks that only measure stay out of it and
 * are drawn in the navy: a tile's sparkline, which shows a shape and not good
 * news, and a target ring that has not reached its target yet.
 *
 * Charts carry visible numeric labels, so no value is read from fill alone.
 */

/** The navy token, for a mark that measures without saying good or bad. */
const NAVY = 'rgb(var(--navy))';

/** Compact money for axis and inline labels: KSh 1.2M, KSh 340k. */
export function moneyShort(cents: number): string {
  return money(cents, { compact: true });
}

// ── Stat tile ───────────────────────────────────────────────────────────────

/** What a change is counted in: a percent change, or percentage points for a figure that is itself a percentage. */
export type ChangeUnit = '%' | 'pts';

/**
 * A headline number. `delta` compares with the previous period and is drawn as
 * a chip; `sparkline` is the slot for the figure's recent trend.
 *
 * The line under the figure is the chip and what it compares with. A tile with
 * no comparison puts its `context` there instead, so the figure is never left
 * with a gap beneath it; a tile with a comparison keeps `context` at the foot.
 * The sparkline sits at the foot too, so the sparklines of a row of tiles line
 * up whatever wraps above them.
 *
 * Below 640px a tile with a sparkline is compact, so a column of them stays
 * short: the label, figure and chip on the left, the sparkline on the right,
 * and the foot caption left to screen readers.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  deltaUnit = '%',
  sparkline,
  context,
  loss = false,
}: {
  label: string;
  value: string;
  /** The change, in `deltaUnit`. Null when there is no earlier figure; leave it out for a tile with no comparison. */
  delta?: number | null;
  /** What the change is measured against: "vs previous month". */
  deltaLabel?: string;
  /** "%" for a percent change; "pts" when `delta` is a difference of two percentages. */
  deltaUnit?: ChangeUnit;
  /** A `Sparkline` of the figure's last few months. */
  sparkline?: ReactNode;
  /** One line saying what the number actually means. */
  context?: string;
  /** The figure is a loss, so it is drawn in red. */
  loss?: boolean;
}) {
  const compared = delta !== undefined || deltaLabel !== undefined;
  const hasFigure = changeTone(delta) !== 'none';
  const contextUnderFigure = !compared && !!context;
  const compact = !!sparkline;

  return (
    <div
      className={`min-w-0 rounded-xl border border-line bg-surface sm:flex sm:flex-col sm:p-5 ${
        compact ? 'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-center gap-x-3 p-4 sm:items-stretch' : 'flex flex-col p-5'
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-widest text-charcoal-muted">{label}</p>

        {/* A little smaller in the compact tile, so a seven-digit amount keeps to one line beside the sparkline. */}
        <p
          className={`figure mt-2 break-words font-bold leading-tight tracking-tight ${
            compact ? 'text-2xl sm:text-[1.75rem]' : 'text-[1.75rem]'
          } ${loss ? 'text-danger' : 'text-charcoal'}`}
        >
          {value}
        </p>

        {/* The change stays small and secondary: it supports the headline, never
            competes. The label never breaks mid-phrase: it sits beside the chip
            when the tile has room and moves whole to the next line when not. */}
        {compared && (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs leading-6 text-charcoal-muted">
            <ChangeChip change={delta} unit={deltaUnit} />
            {hasFigure && deltaLabel && <span className="whitespace-nowrap">{deltaLabel}</span>}
          </p>
        )}
        {contextUnderFigure && <p className="mt-2 text-xs leading-6 text-charcoal-muted">{context}</p>}
      </div>

      {sparkline && <div className="min-w-0 sm:mt-auto sm:pt-4">{sparkline}</div>}

      {/* The foot caption is the size of the sparkline's axis labels above it:
          the tile's small print. At that size a caption of some 35 characters
          keeps to one line in the narrowest tile, four across at 1280px. The
          compact tile has no room for it, so there it is read out, not shown. */}
      {context && !contextUnderFigure && (
        <p
          className={`text-[11px] leading-4 text-charcoal-muted ${
            compact ? 'max-sm:sr-only sm:pt-3' : 'mt-auto pt-3'
          }`}
        >
          {context}
        </p>
      )}
      {/* Beside tiles that carry a caption at the foot, the room of one line
          keeps this tile's sparkline level with theirs. A tile on a row of
          its own (a phone) does without it. */}
      {sparkline && contextUnderFigure && (
        <p className="hidden pt-3 text-[11px] leading-4 sm:block" aria-hidden="true">
          &nbsp;
        </p>
      )}
    </div>
  );
}

/**
 * The change from the earlier period as a rounded pill, coloured by
 * `changeTone`: a rise is teal, a decline is amber (it needs attention; red is
 * kept for a loss or an error), and no change is neutral with no arrow. With
 * no earlier figure there is nothing to give, so the pill says so instead of
 * leaving a bare label. The arrow is decoration; "Up" and "Down" are there for
 * screen readers.
 */
function ChangeChip({ change, unit }: { change: number | null | undefined; unit: ChangeUnit }) {
  const pill = 'figure inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 align-middle font-medium leading-4';
  const tone = changeTone(change);
  if (tone === 'none') {
    return <span className={`${pill} bg-mist text-charcoal-muted`}>No earlier figure to compare</span>;
  }
  if (tone === 'flat') {
    return (
      <span className={`${pill} bg-mist text-charcoal-muted`}>
        <ChangeSize size={0} unit={unit} />
      </span>
    );
  }
  const up = tone === 'up';
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`${pill} ${up ? 'bg-aqua-soft text-success' : 'bg-warning/10 text-warning'}`}>
      <Arrow className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{up ? 'Up' : 'Down'}</span>
      <ChangeSize size={Math.abs(change as number)} unit={unit} />
    </span>
  );
}

/** The size of a change with its unit: "6%", or "6 pts" (read out as "6 percentage points"). */
function ChangeSize({ size, unit }: { size: number; unit: ChangeUnit }) {
  if (unit === '%') return <>{size}%</>;
  const one = size === 1;
  return (
    <>
      <span aria-hidden="true">
        {size} {one ? 'pt' : 'pts'}
      </span>
      <span className="sr-only">
        {size} percentage {one ? 'point' : 'points'}
      </span>
    </>
  );
}

// ── Sparkline ───────────────────────────────────────────────────────────────

// The plot stretches to the tile's width, so its strokes are told not to
// scale and the end marker is a round-capped dot, which stays a circle.
const SPARK_GEOMETRY: SparklineGeometry = { width: 200, height: 40, padX: 6, padY: 6 };
// One series is not a part of a whole, so it stays out of the categorical
// palette: the line is the navy.
const SPARK_COLOR = NAVY;

/**
 * A figure's last few months as one small line, ending at the month on screen.
 * There are no axes: the tile's headline gives the size and this gives the
 * shape. When the last month is still running its stretch of line is dashed
 * and its marker hollow. A month with no figure (a null value) is a gap: the
 * line stops before it and starts again after it. The dotted zero line, with
 * a "0" at its left end, is there only when a month is below zero. Draws
 * nothing when fewer than two months have a figure. Each month answers a hover
 * with its own figure.
 */
export function Sparkline({
  label,
  months,
  partMonthLast = false,
  format,
  gapLabel = 'no figure',
}: {
  /** What is plotted, for the text alternative: "Revenue". */
  label: string;
  /** Oldest first. A null value is a month with no figure. */
  months: SparklineMonth[];
  partMonthLast?: boolean;
  format: (value: number) => string;
  /** What a hover says for a month with no figure: "no revenue". */
  gapLabel?: string;
}) {
  const layout = sparklineLayout(months, SPARK_GEOMETRY, { partMonthLast });
  if (layout.kind === 'not-enough-data') return null;

  const { points, runs, zeroY } = layout;
  const { width, height } = SPARK_GEOMETRY;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const path = (pts: typeof points) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const dotAt = (p: { x: number; y: number }) => `M ${p.x} ${p.y} h 0.01`;
  const band = width / months.length;
  const dot = dotAt(last);
  // The axis under the plot names the first and last month of the stretch, figure or not.
  const firstMonth = months[0]!;
  const lastMonth = months[months.length - 1]!;

  return (
    // The zero line is named, so it is not taken for a target. Its "0" stands
    // in a gutter left of the plot, level with the line and clear of the first
    // month's point; the axis below moves in with the plot.
    <div className={zeroY !== null ? 'relative pl-3' : undefined}>
      {zeroY !== null && (
        <span
          aria-hidden="true"
          className="figure absolute left-0 -translate-y-1/2 text-[11px] leading-none text-charcoal-muted"
          // The plot is `h-10`, 2.5rem tall, whatever its width.
          style={{ top: `${(zeroY / height) * 2.5}rem` }}
        >
          0
        </span>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block h-10 w-full"
        role="img"
        aria-label={`${label} over ${months.length} months: ${format(first.value)} in ${first.label}, ${format(last.value)} in ${last.label}${last.partMonth ? ' so far' : ''}`}
      >
        {zeroY !== null && (
          <line
            x1={0} y1={zeroY} x2={width} y2={zeroY}
            stroke="var(--chart-muted)" strokeWidth="1" strokeDasharray="2 3" opacity="0.6"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {runs.map((run) => {
          // The running month's stretch is the dashed one, drawn below.
          const whole = run[run.length - 1]!.partMonth ? run.slice(0, -1) : run;
          const start = run[0]!;
          if (whole.length > 1) {
            return (
              <path
                key={start.label} d={path(whole)} fill="none" stroke={SPARK_COLOR} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
              />
            );
          }
          // A month alone between two gaps has no line to be on, so it is a small dot.
          if (run.length === 1 && start !== last) {
            return (
              <path
                key={start.label} d={dotAt(start)} stroke={SPARK_COLOR} strokeWidth="4"
                strokeLinecap="round" vectorEffect="non-scaling-stroke"
              />
            );
          }
          return null;
        })}
        {last.partMonth && runs[runs.length - 1]!.length > 1 && (
          <path
            d={path(runs[runs.length - 1]!.slice(-2))} fill="none" stroke={SPARK_COLOR} strokeWidth="2"
            strokeDasharray="3 4" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          />
        )}
        {/* The end marker, ringed in the card's colour so the line never runs into it. */}
        <path d={dot} stroke={SURFACE} strokeWidth="12" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={dot} stroke={SPARK_COLOR} strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {last.partMonth && (
          <path d={dot} stroke={SURFACE} strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        {/* A full-height band per month: a far bigger hover target than the line. */}
        {months.map((m, i) => (
          <rect key={`${m.label}-${i}`} x={band * i} y={0} width={band} height={height} fill="transparent">
            <title>
              {m.value === null
                ? `${m.label}: ${gapLabel}`
                : `${m.label}: ${format(m.value)}${partMonthLast && i === months.length - 1 ? ' so far' : ''}`}
            </title>
          </rect>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-charcoal-muted" aria-hidden="true">
        <span>{firstMonth.label}</span>
        <span>{partMonthLast ? `${lastMonth.label}, so far` : lastMonth.label}</span>
      </div>
    </div>
  );
}

// ── Achievement ring ────────────────────────────────────────────────────────

/**
 * Circular progress against a target, with the figures beside it. Progress is
 * a neutral measure, so the arc is the navy; it turns teal, the colour for
 * good, only once the target is met (100% or more). A target that is not set
 * draws an empty track with a dash in it.
 */
export function AchievementRing({
  label,
  percent,
  caption,
}: {
  label: string;
  /** Null when no target is set. */
  percent: number | null;
  /** The figures behind the ring: "KSh 54,000 of KSh 400,000". */
  caption?: string;
}) {
  const size = 68;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const hasTarget = typeof percent === 'number' && Number.isFinite(percent);
  const shown = hasTarget ? Math.max(0, percent) : 0;
  // Cap the arc at a full turn so 180% does not wrap and read as 80%.
  const dash = (Math.min(shown, 100) / 100) * circumference;
  const met = hasTarget && shown >= 100;

  return (
    <div className="flex min-w-0 items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label}: ${hasTarget ? `${Math.round(shown)}% of target${met ? ', target met' : ''}` : 'no target set'}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={stroke} />
          {hasTarget && shown > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={met ? 'var(--chart-accent)' : NAVY}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              className="transition-[stroke-dasharray] duration-700"
            />
          )}
        </svg>

        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          {hasTarget ? (
            <span className="figure text-sm font-bold text-charcoal">{Math.round(shown)}%</span>
          ) : (
            <span className="text-sm text-charcoal-muted">—</span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium text-charcoal">{label}</p>
        {caption && <p className="figure mt-0.5 text-xs text-charcoal-muted">{caption}</p>}
      </div>
    </div>
  );
}

/** Row wrapper so the rings sit consistently wherever they are used. */
export function AchievementRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">{children}</div>;
}

// ── Target meter ────────────────────────────────────────────────────────────

/**
 * Progress toward a goal. The bar is the actual; the notch is the target, so
 * over-performance is visible rather than clipped at 100%.
 */
export function TargetMeter({
  label,
  actual,
  target,
  format,
}: {
  label: string;
  actual: number;
  target: number;
  format: (n: number) => string;
}) {
  const hasTarget = target > 0;
  const percent = hasTarget ? Math.round((actual / target) * 100) : 0;
  // Scale so the target notch sits at 80% of the track; the bar can overshoot.
  const scaleMax = hasTarget ? Math.max(target * 1.25, actual * 1.05) : Math.max(actual, 1);
  const barPct = Math.min(100, (actual / scaleMax) * 100);
  const targetPct = hasTarget ? (target / scaleMax) * 100 : 0;

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-widest text-charcoal-muted">{label}</p>
        {hasTarget && (
          <span
            className={`figure text-xs font-medium ${
              percent >= 100 ? 'text-success' : percent >= 70 ? 'text-charcoal' : 'text-warning'
            }`}
          >
            {percent}% of target
          </span>
        )}
      </div>

      <p className="figure mt-2 text-2xl font-bold tracking-tight text-charcoal">{format(actual)}</p>

      <div className="relative mt-3 h-3 rounded-pill bg-mist">
        <div
          className="h-3 rounded-pill"
          style={{ width: `${barPct}%`, backgroundColor: 'var(--chart-accent)' }}
          role="img"
          aria-label={`${format(actual)}${hasTarget ? ` of ${format(target)} target` : ''}`}
        />
        {hasTarget && (
          // Target notch, drawn over the bar with a surface-coloured gap so the
          // two marks never blend into one another.
          <span
            className="absolute top-[-3px] h-[18px] w-[3px] rounded-sm border-x border-surface"
            style={{ left: `calc(${targetPct}% - 1.5px)`, backgroundColor: 'var(--chart-ink)' }}
            aria-hidden="true"
          />
        )}
      </div>

      <p className="mt-2 text-xs text-charcoal-muted">
        {hasTarget ? `Target ${format(target)}` : 'No target set for this month'}
      </p>
    </div>
  );
}

// ── Monthly trend: income area + net profit line ────────────────────────────

export type TrendPoint = {
  label: string;
  incomeCents: number;
  netCents: number;
};

/**
 * Income as an aqua gradient area, net profit as a line over it.
 *
 * Both series share ONE axis deliberately. They are the same unit (KSh) and net
 * profit is a component of income, so a second y-scale could render the profit
 * line above the income area — stating something false.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const width = 760;
  const height = 280;
  const pad = { top: 18, right: 18, bottom: 38, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const hasData = data.some((d) => d.incomeCents !== 0 || d.netCents !== 0);
  const values = data.flatMap((d) => [d.incomeCents, d.netCents]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const y = (v: number) => pad.top + plotH - ((v - min) / span) * plotH;
  const bandW = data.length > 0 ? plotW / data.length : plotW;
  const cx = (i: number) => pad.left + bandW * i + bandW / 2;
  const zeroY = y(0);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + span * t);

  const areaPath =
    data.length > 0
      ? [
          `M ${cx(0)} ${zeroY}`,
          ...data.map((d, i) => `L ${cx(i)} ${y(Math.max(d.incomeCents, 0))}`),
          `L ${cx(data.length - 1)} ${zeroY}`,
          'Z',
        ].join(' ')
      : '';

  const active = hover !== null ? data[hover] : null;

  return (
    <figure className="relative rounded-xl border border-line bg-white p-5">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-charcoal">Income and net profit by month</span>
        {!hasData && (
          <span className="text-xs text-charcoal-muted">
            Awaiting data — the dashed line marks the zero baseline
          </span>
        )}
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Monthly income area with a net profit line"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-accent)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--chart-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              y1={y(t)}
              x2={width - pad.right}
              y2={y(t)}
              stroke="var(--chart-grid)"
              strokeWidth="1"
            />
            <text x={pad.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--chart-muted)" className="figure">
              {moneyShort(t)}
            </text>
          </g>
        ))}

        {/* Zero baseline. Dashed when there is nothing to plot, so an empty
            chart shows the shape of the plot rather than blank white. */}
        <line
          x1={pad.left}
          y1={zeroY}
          x2={width - pad.right}
          y2={zeroY}
          stroke={hasData ? 'var(--chart-grid)' : 'var(--chart-accent-deep)'}
          strokeWidth={hasData ? 1 : 1.5}
          strokeDasharray={hasData ? undefined : '6 5'}
          opacity={hasData ? 1 : 0.55}
        />

        {hasData && (
          <>
            <path d={areaPath} fill="url(#incomeFill)" />
            <polyline
              points={data.map((d, i) => `${cx(i)},${y(Math.max(d.incomeCents, 0))}`).join(' ')}
              fill="none"
              stroke="var(--chart-accent)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points={data.map((d, i) => `${cx(i)},${y(d.netCents)}`).join(' ')}
              fill="none"
              stroke="var(--chart-ink)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        {data.map((d, i) => (
          <g key={d.label}>
            <text x={cx(i)} y={height - 14} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">
              {d.label}
            </text>
            {hover === i && hasData && (
              <line
                x1={cx(i)}
                y1={pad.top}
                x2={cx(i)}
                y2={pad.top + plotH}
                stroke="var(--chart-ink)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.35"
              />
            )}
            {/* Full-height band — a far bigger hit target than the mark itself. */}
            <rect
              x={pad.left + bandW * i}
              y={pad.top}
              width={bandW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}

        {hasData &&
          data.map((d, i) => (
            <circle
              key={`${d.label}-pt`}
              cx={cx(i)}
              cy={y(d.netCents)}
              r={hover === i ? 5.5 : 4}
              fill="var(--chart-ink)"
              stroke="var(--chart-surface)"
              strokeWidth="2"
            />
          ))}
      </svg>

      {active && hasData && (
        <div
          className="pointer-events-none absolute top-16 z-10 rounded-lg border border-line bg-white px-3 py-2 shadow-lg"
          style={{ left: `${(cx(hover!) / width) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <p className="text-xs font-semibold text-charcoal">{active.label}</p>
          <dl className="mt-1 space-y-0.5 text-xs">
            <div className="flex items-center justify-between gap-5">
              <dt className="flex items-center gap-1.5 text-charcoal-muted">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: 'var(--chart-accent)' }} />
                Income
              </dt>
              <dd className="figure font-medium text-charcoal">{money(active.incomeCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-5">
              <dt className="flex items-center gap-1.5 text-charcoal-muted">
                <span className="h-[2px] w-3" style={{ backgroundColor: 'var(--chart-ink)' }} />
                Net profit
              </dt>
              <dd className="figure font-medium text-charcoal">{money(active.netCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-5">
              <dt className="text-charcoal-muted">Margin</dt>
              <dd className="figure font-medium text-charcoal">
                {active.incomeCents > 0 ? `${Math.round((active.netCents / active.incomeCents) * 100)}%` : '—'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 text-xs text-charcoal-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'var(--chart-accent)' }} /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4" style={{ backgroundColor: 'var(--chart-ink)' }} /> Net profit
        </span>
      </div>
    </figure>
  );
}

// ── Donut (part-to-whole) ───────────────────────────────────────────────────

/**
 * The six colours for parts of a whole, in their fixed order: blue (from the
 * navy), teal, old gold, plum, terracotta and slate violet. The values are
 * `--chart-1` to `--chart-6` in app/globals.css. A slice takes the colour of
 * its position; colours are never generated or cycled.
 *
 * The values were measured against the white card, and EVERY pair is far
 * enough apart, not only neighbours: every colour sits in the lightness band
 * and above the chroma floor, the closest pair for a red-green colour-blind
 * reader is slate violet and teal (ΔE 8.6, target 8), the closest pair in
 * full colour is terracotta and plum (ΔE 15.7, floor 15), and each is at
 * least 3:1 on the card (3.4 to 8.2). Because every pair passes, the order
 * can change and a donut of any size can wrap its last slice round to its
 * first. The values are not the brand's own: the brand navy itself is too
 * dark for its lightness band, the logo gold too pale to be a mark at all,
 * and a greyer slate cannot be told from teal.
 *
 * src/lib/contrast.test.ts holds each colour to 3:1 on the card.
 */
export const CATEGORICAL = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

/**
 * "Other" is a remainder, not a category, so it takes a neutral and never a
 * hue. It is deliberately a light grey (2.3:1 on the card): a mid grey, at 3:1
 * or more, is the same colour as the teal to a red-green colour-blind reader.
 * Its slice always carries a label and a gap, so it is never read by fill alone.
 */
export const OTHER_GREY = 'var(--chart-other)';
const SURFACE = 'var(--chart-surface)';

/**
 * A donut slice. `color` fixes the slice's colour, for an entity that keeps
 * one colour wherever it appears (a shareholder, on Dashboard and Ownership).
 * A slice with none takes the colour of its position, largest first.
 */
export type DonutSlice = Slice & { color?: string };

// A 2px surface gap separates touching segments — the gap does the work, not a
// stroke.
// The donut is small enough to leave its legend room for a holder's full name
// on one line beside it in a half-width card, its ring thin enough to read as
// a frame for the total and not as the subject, and its hole wide enough for
// a six-figure total. A longer total is written short (see `centreTotal`).
const DONUT_SIZE = 128;
const DONUT_GEOMETRY = { cx: DONUT_SIZE / 2, cy: DONUT_SIZE / 2, rOuter: 64, rInner: 50, gapPx: 2 };

/** Seven digits of shillings: the first total too wide for the hole when written in full. */
const CENTRE_COMPACT_FROM_CENTS = 1_000_000 * 100;

/**
 * Part-to-whole donut. Segments are sorted largest first and the tail folded
 * into "Other" past `maxSlices`, because past ~6 wedges adjacent colours blur
 * and the chart stops being readable at a glance.
 *
 * The centre carries the total as a hero figure, and every segment is named with
 * its value and share in the legend — the fill is never the only way to read it.
 *
 * The legend sits beside the donut whenever there is room for its full
 * labels, and under it at full width when there is not (a phone, a narrow
 * card). Share and amount each keep to one column, right-aligned. The legend
 * stops growing at 22rem, so in a wide card a share and an amount stay near
 * the label they belong to and the donut and legend sit together in the
 * middle.
 *
 * A money total of seven digits or more is written short in the centre
 * ("KSh 1.2M"); the legend always gives exact amounts.
 */
export function DonutChart({
  slices,
  centreLabel,
  maxSlices = 5,
  emptyLabel = 'Nothing recorded yet.',
}: {
  slices: DonutSlice[];
  centreLabel?: string;
  maxSlices?: number;
  emptyLabel?: string;
}) {
  const layout = donutLayout(slices, DONUT_GEOMETRY, { maxSlices });

  // No positive slices, or a total of 0: there is no whole to take a share of.
  if (layout.rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-mist px-6 py-8 text-center text-sm text-charcoal-muted"
        style={{ minHeight: DONUT_SIZE }}
      >
        {emptyLabel}
      </div>
    );
  }

  const { total } = layout;
  const given = new Map(slices.map((s) => [s.key, s.color]));
  const shown: (Slice & { color: string })[] = layout.rows.map((s, i) => ({
    ...s,
    // Past the sixth colour there is none left to give: the neutral, never a repeat.
    color: given.get(s.key) ?? (s.key === OTHER_KEY ? OTHER_GREY : (CATEGORICAL[i] ?? OTHER_GREY)),
  }));
  const colorOf = new Map(shown.map((s) => [s.key, s.color]));
  const size = DONUT_SIZE;
  const { cx, cy } = DONUT_GEOMETRY;
  const centreTotal = Math.round(Math.abs(total)) >= CENTRE_COMPACT_FROM_CENTS ? moneyShort(total) : money(total);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Donut chart: ${shown.map((s) => `${s.label} ${money(s.value)}`).join(', ')}`}
        className="shrink-0"
      >
        {layout.segments.map((s) => (
          <path key={s.key} d={s.d} fill={colorOf.get(s.key)}>
            <title>{`${s.label}: ${money(s.value)} (${Math.round((s.value / total) * 100)}%)`}</title>
          </path>
        ))}
        {/* 13px: a six-figure total ("KSh 164,000") with clear room on both sides of it. */}
        <text x={cx} y={cy - 2} textAnchor="middle" className="figure fill-charcoal text-[13px] font-bold">
          {centreTotal}
        </text>
        {centreLabel && (
          <text x={cx} y={cy + 14} textAnchor="middle" className="fill-charcoal-muted text-[11px]">
            {centreLabel}
          </text>
        )}
      </svg>

      {/* Legend carries the identity, the value and the share, so the chart is
          never read by colour alone. One grid for the whole list, so every
          row's share and amount line up; the label takes the room that is left. */}
      <ul className="grid min-w-0 max-w-[22rem] flex-1 basis-56 grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-x-1.5 gap-y-2.5 text-sm">
        {shown.map((s) => (
          <li key={s.key} className="col-span-4 grid grid-cols-subgrid items-start">
            <span
              aria-hidden="true"
              className="mt-[5px] h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color, boxShadow: `0 0 0 2px ${SURFACE}` }}
            />
            <span className="line-clamp-2 min-w-0 break-words text-charcoal" title={s.label}>{s.label}</span>
            <span className="figure text-right text-charcoal-muted">
              {Math.round((s.value / total) * 100)}%
            </span>
            <span className="figure text-right font-medium text-charcoal">
              {money(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
