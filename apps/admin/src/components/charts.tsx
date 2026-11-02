'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * Charts for the admin dashboard.
 *
 * Colours come from CSS variables (--chart-*) declared in globals.css, not from
 * hard-coded hex, so a second theme can re-skin every chart from one block.
 *
 * Palette decision (validated, not eyeballed): magnitude is SINGLE-HUE aqua
 * #0D9488, which passes every check on white (3.7:1, inside the lightness band,
 * above the chroma floor). Two-series charts pair aqua against the ink
 * (ΔE 38.9 normal, 37.7 deutan) and separate them by mark shape as well —
 * area and line in TrendChart, a full column and a narrower inset column in
 * ColumnChart.
 *
 * Charts still carry visible numeric labels, so no value relies on fill alone.
 *
 * Print: every chart root carries `chart-fill`, which globals.css sets to
 * `print-color-adjust: exact` (an inherited property), so fills survive a
 * browser print with background graphics switched off.
 */

const ACCENT = '#0D9488';
const INK = '#0F1C2E';

/** Class that keeps a chart's fills in print (see globals.css). */
const PRINT_FILLS = 'chart-fill';

/** U+2212, the typographic minus sign; a hyphen reads as a dash in "KSh -10,000". */
const MINUS = String.fromCharCode(0x2212);

export function money(cents: number): string {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

/**
 * Money with a true minus sign ahead of the currency: "−KSh 10,000" for a loss,
 * "KSh 10,000" otherwise. `money` would print "KSh -10,000".
 */
export function signedMoney(cents: number): string {
  const whole = Math.round(Math.abs(cents) / 100);
  const text = `KSh ${whole.toLocaleString('en-KE')}`;
  return cents < 0 && whole !== 0 ? `${MINUS}${text}` : text;
}

/** Compact money for axis/inline labels: KSh 1.2M, KSh 340k. */
export function moneyShort(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `KSh ${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `KSh ${Math.round(v / 1_000)}k`;
  return `KSh ${Math.round(v)}`;
}

// ── Stat tile ───────────────────────────────────────────────────────────────

/** One comparison line on a stat tile. */
export type StatComparison = {
  /** Signed change. Null or undefined when there is nothing to compare with: the line reads "Not available". */
  delta: number | null | undefined;
  /** What the change is measured against, e.g. "vs last month". */
  label: string;
  /** Formats the size of the change (always passed as a positive number); percent by default, e.g. `money` for KSh. */
  format?: (magnitude: number) => string;
};

const percentMagnitude = (n: number) => `${n}%`;

/**
 * A headline number. Per the form heuristic, a single value is a stat tile, not
 * a one-bar chart. `delta` compares with the previous period; `comparisons`
 * replaces it when a tile needs several lines (vs last month, vs a year ago).
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  comparisons,
  hint,
  context,
  progressPercent,
  progressLabel,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  /** Several comparison lines; when given, `delta` and `deltaLabel` are ignored. */
  comparisons?: StatComparison[];
  hint?: string;
  /** One line saying what the number actually means. */
  context?: string;
  /** 0–100+; renders a thin capacity bar under the number when provided. */
  progressPercent?: number | null;
  progressLabel?: string;
}) {
  const showProgress = typeof progressPercent === 'number' && Number.isFinite(progressPercent);
  const lines: { delta: number | null | undefined; label?: string; format?: (magnitude: number) => string }[] =
    comparisons ??
    (deltaLabel || (typeof delta === 'number' && Number.isFinite(delta)) ? [{ delta, label: deltaLabel }] : []);

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <p className="text-xs uppercase tracking-widest text-charcoal-muted">{label}</p>

      <p className="mt-2 text-3xl font-bold tracking-tight text-charcoal tabular-nums">{value}</p>

      {/* Delta stays small and secondary — it supports the headline, never competes.
          A comparison with no figure says so, rather than leaving a bare "vs last month". */}
      {lines.map((line, i) => {
        const known = typeof line.delta === 'number' && Number.isFinite(line.delta);
        const d = known ? (line.delta as number) : 0;
        return (
          <div key={i} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {known ? (
              <span
                className="font-medium tabular-nums"
                style={{ color: d >= 0 ? 'var(--chart-positive)' : 'var(--chart-negative)' }}
              >
                {d >= 0 ? '▲' : '▼'} {(line.format ?? percentMagnitude)(Math.abs(d))}
              </span>
            ) : (
              line.label && <span className="font-medium text-charcoal-muted">Not available</span>
            )}
            {line.label && <span className="text-charcoal-muted">{line.label}</span>}
          </div>
        );
      })}

      {showProgress && (
        <div className={`mt-3 ${PRINT_FILLS}`}>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--chart-track)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                backgroundColor: 'var(--chart-accent)',
              }}
            />
          </div>
          {progressLabel && <p className="mt-1 text-xs text-charcoal-muted">{progressLabel}</p>}
        </div>
      )}

      {context && <p className="mt-2 text-xs text-charcoal-muted">{context}</p>}
      {hint && <p className="mt-1 text-xs text-charcoal-muted">{hint}</p>}
    </div>
  );
}

// ── Achievement ring ────────────────────────────────────────────────────────

/**
 * Circular progress against a target. When no target is set the ring renders as
 * an empty track with an inline "Set target" action inside it, so the widget
 * still reads as a deliberate control rather than a broken or empty state.
 */
export function AchievementRing({
  label,
  percent,
  caption,
  onSetTarget,
  setTargetLabel = 'Set target',
}: {
  label: string;
  /** Null when no target exists — draws the empty-track state. */
  percent: number | null;
  caption?: string;
  onSetTarget?: () => void;
  setTargetLabel?: string;
}) {
  const size = 92;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const hasTarget = typeof percent === 'number' && Number.isFinite(percent);
  const shown = hasTarget ? Math.max(0, percent) : 0;
  // Cap the arc at a full turn so 180% does not wrap and read as 80%.
  const dash = (Math.min(shown, 100) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white p-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label}: ${hasTarget ? `${Math.round(shown)}% of target` : 'no target set'}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={stroke} />
          {hasTarget && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--chart-accent)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              className="transition-[stroke-dasharray] duration-700"
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {hasTarget ? (
            <span className="text-lg font-bold tabular-nums text-charcoal">{Math.round(shown)}%</span>
          ) : onSetTarget ? (
            <button
              onClick={onSetTarget}
              className="rounded-full border border-aqua/60 px-2 py-1 text-[10px] font-medium text-aqua-deep hover:bg-aqua-soft"
            >
              + {setTargetLabel}
            </button>
          ) : (
            <span className="text-xs text-charcoal-muted">—</span>
          )}
        </div>
      </div>

      <div className="text-center">
        <p className="text-xs font-medium text-charcoal">{label}</p>
        {caption && <p className="mt-0.5 text-[11px] text-charcoal-muted">{caption}</p>}
      </div>
    </div>
  );
}

/** Row wrapper so the rings sit consistently wherever they are used. */
export function AchievementRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>;
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
            className={`text-xs font-medium ${
              percent >= 100 ? 'text-success' : percent >= 70 ? 'text-charcoal' : 'text-warning'
            }`}
          >
            {percent}% of target
          </span>
        )}
      </div>

      <p className="mt-2 text-2xl font-bold tracking-tight text-charcoal">{format(actual)}</p>

      <div className={`relative mt-3 h-3 rounded-pill bg-mist ${PRINT_FILLS}`}>
        <div
          className="h-3 rounded-pill"
          style={{ width: `${barPct}%`, backgroundColor: ACCENT }}
          role="img"
          aria-label={`${format(actual)}${hasTarget ? ` of ${format(target)} target` : ''}`}
        />
        {hasTarget && (
          // Target notch, drawn over the bar with a surface-coloured gap so the
          // two marks never blend into one another.
          <span
            className="absolute top-[-3px] h-[18px] w-[3px] rounded-sm border-x border-white"
            style={{ left: `calc(${targetPct}% - 1.5px)`, backgroundColor: INK }}
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
  /** Optional tooltip context; points without it simply hide that row. */
  jobCount?: number;
};

/**
 * Income as an aqua gradient area, net profit as a line over it.
 *
 * Both series share ONE axis deliberately. They are the same unit (KSh) and net
 * profit is a component of income, so a second y-scale could render the profit
 * line above the income area — stating something false. The density the brief
 * asks for comes from the tooltip, gridlines and fill instead of a second scale.
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
    <figure className={`relative rounded-xl border border-line bg-white p-5 ${PRINT_FILLS}`}>
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
            <text x={pad.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--chart-muted)">
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
              <dd className="tabular-nums font-medium text-charcoal">{money(active.incomeCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-5">
              <dt className="flex items-center gap-1.5 text-charcoal-muted">
                <span className="h-[2px] w-3" style={{ backgroundColor: 'var(--chart-ink)' }} />
                Net profit
              </dt>
              <dd className="tabular-nums font-medium text-charcoal">{money(active.netCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-5">
              <dt className="text-charcoal-muted">Margin</dt>
              <dd className="tabular-nums font-medium text-charcoal">
                {active.incomeCents > 0 ? `${Math.round((active.netCents / active.incomeCents) * 100)}%` : '—'}
              </dd>
            </div>
            {typeof active.jobCount === 'number' && (
              <div className="flex items-center justify-between gap-5">
                <dt className="text-charcoal-muted">Jobs</dt>
                <dd className="tabular-nums font-medium text-charcoal">{active.jobCount}</dd>
              </div>
            )}
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

// ── Monthly columns: one month selection driven by mouse, touch and keyboard ─

export type ColumnSeries = { key: string; label: string };

export type ColumnPoint = {
  /** Stable id, e.g. "2026-03"; what `selectedKey` and `onSelect` carry. */
  key: string;
  /** Full name for the tooltip, readout and screen readers, e.g. "March 2026". */
  label: string;
  /** Axis label from `sm` up, e.g. "Mar". */
  shortLabel: string;
  /** Axis label below `sm`, where a band can be 24 px wide; keep it to about three letters. Defaults to `shortLabel`. */
  tinyLabel?: string;
  /** One value per series, in series order: cents for `unit="money"`, a count for `unit="count"`. */
  values: readonly number[];
  /** False before records began: draws an empty slot and reads "No records yet". */
  hasRecords?: boolean;
  /** The month still running: drawn lighter and labelled "In progress". */
  inProgress?: boolean;
};

/** A labelled figure shown in the tooltip and readout after the series values. */
export type ColumnFigure = { label: string; value: string };

export type ColumnChartProps = {
  title: string;
  /** One series, or two: the second draws as a narrower inset column in the ink. Both share one axis and one unit. */
  series: readonly [ColumnSeries] | readonly [ColumnSeries, ColumnSeries];
  points: readonly ColumnPoint[];
  unit: 'money' | 'count';
  /** The selected point's key, or null for no selection. The page owns this state. */
  selectedKey: string | null;
  /** Called on click, tap, Enter or Space. Hover and arrow keys never select. */
  onSelect: (key: string) => void;
  /** Extra figures for a point, shown in its tooltip, readout and aria-label (e.g. expenses on Trends). */
  extraFigures?: (point: ColumnPoint) => ColumnFigure[];
};

const SERIES_FILL = ['var(--chart-accent)', 'var(--chart-ink)'] as const;
/** Every band is at least this wide; past that the plot scrolls sideways inside its card. */
const MIN_BAND_PX = 24;
/**
 * Vertical geometry, shared by the gridlines, the y labels and every band so
 * they line up: 16 px headroom (top-4) for the top tick label, the value scale,
 * then a 24 px (h-6) row of month labels.
 */
const SCALE_BOX = 'absolute inset-x-0 top-4 h-[184px] sm:h-[224px]';
const BAND_HEIGHT = 'h-[224px] sm:h-[264px]';
/** Surface halo so in-plot axis labels stay legible where a column passes behind them. */
const LABEL_HALO = '0 0 2px var(--chart-surface), 0 0 2px var(--chart-surface), 0 0 3px var(--chart-surface)';

const formatCount = (n: number) => n.toLocaleString('en-KE');

/** Round ticks over the data and zero. All-zero data keeps a fixed axis rather than collapsing. */
function niceScale(values: number[], unit: 'money' | 'count') {
  const lo = Math.min(0, ...values);
  let hi = Math.max(0, ...values);
  if (lo === 0 && hi === 0) hi = unit === 'money' ? 1_000_000 : 10; // KSh 10,000 or 10 jobs
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const steps = unit === 'money' ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
  let step = (steps.find((s) => raw / mag <= s) ?? 10) * mag;
  step = unit === 'money' ? Math.max(100, step) : Math.max(1, Math.round(step));
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max; t += step) ticks.push(t);
  return { min, max, ticks };
}

/** Axis money: one style per axis (full, k or M), a true minus sign, and "0" at zero. */
function axisMoney(cents: number, style: 'full' | 'k' | 'M'): string {
  if (cents === 0) return '0';
  const ksh = Math.abs(cents) / 100;
  const n = style === 'M' ? ksh / 1_000_000 : style === 'k' ? ksh / 1_000 : ksh;
  const text = `KSh ${n.toLocaleString('en-KE', { maximumFractionDigits: 2 })}${style === 'full' ? '' : style}`;
  return cents < 0 ? `${MINUS}${text}` : text;
}

function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

function SeriesKey({ index, shape }: { index: number; shape: 'rect' | 'line' }) {
  const fill = SERIES_FILL[index === 1 ? 1 : 0];
  if (shape === 'line') return <span aria-hidden className="h-[2px] w-3 shrink-0" style={{ backgroundColor: fill }} />;
  // Legend swatches mirror the marks: the inset series is the narrower column.
  return (
    <span
      aria-hidden
      className={`h-2.5 shrink-0 rounded-[2px] ${index === 1 ? 'w-1.5' : 'w-2.5'}`}
      style={{ backgroundColor: fill }}
    />
  );
}

type FigureRow = ColumnFigure & { series?: number };

function FigureRows({ rows, shape, className }: { rows: FigureRow[]; shape: 'rect' | 'line'; className: string }) {
  return (
    <dl className={className}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-1.5 text-charcoal-muted">
            {row.series !== undefined && <SeriesKey index={row.series} shape={shape} />}
            {row.label}
          </dt>
          <dd className="font-medium tabular-nums text-charcoal">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Columns per month for one or two series on ONE axis (never two scales).
 * Losses hang below the zero line. With two series the second is a narrower
 * inset column in the ink, ringed in the surface colour, so revenue and net
 * profit differ by shape as well as colour.
 *
 * Interaction (KTD6): each month is a full-height button band at least 24 px
 * wide. A mouse hover or keyboard focus shows a tooltip without selecting;
 * click, tap, Enter or Space selects through `onSelect`; arrow keys, Home and
 * End move focus between months. The readout under the plot always shows the
 * selected month's exact figures, so no value depends on hover or colour.
 *
 * Phone geometry: below `sm` the card drops to p-3 and the y labels sit inside
 * the plot above each gridline, which leaves 294 px for bands on a 360 px
 * screen inside the layout's px-5 (360 − 40 − 2 − 24); 12 months get 24.5 px.
 * A series that still does not fit scrolls sideways inside the card.
 */
export function ColumnChart({ title, series, points, unit, selectedKey, onSelect, extraFigures }: ColumnChartProps) {
  const uid = useId();
  const captionId = `${uid}-caption`;
  const readoutId = `${uid}-readout`;
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bandRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tip, setTip] = useState<{ index: number; side: 'left' | 'right'; offset: number; room: number } | null>(
    null,
  );
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const format = unit === 'money' ? signedMoney : formatCount;
  const recorded = points.filter((p) => p.hasRecords !== false);
  const scale = niceScale(
    recorded.flatMap((p) => series.map((_, s) => p.values[s] ?? 0)),
    unit,
  );
  const span = scale.max - scale.min;
  const pos = (v: number) => ((v - scale.min) / span) * 100; // % up from the bottom of the scale
  const zero = pos(0);
  const extent = Math.max(Math.abs(scale.min), Math.abs(scale.max));
  const moneyStyle = extent >= 100_000_000 ? 'M' : extent >= 1_000_000 ? 'k' : 'full';
  const axisLabel = (t: number) => (unit === 'money' ? axisMoney(t, moneyStyle) : formatCount(t));

  const selectedIndex = points.findIndex((p) => p.key === selectedKey);
  const selected = selectedIndex >= 0 ? points[selectedIndex] : undefined;
  // Roving tab stop: the focused band while focus is inside, else the selected (or latest) month.
  const tabStop =
    focusIndex !== null && focusIndex < points.length
      ? focusIndex
      : selectedIndex >= 0
        ? selectedIndex
        : points.length - 1;

  const figures = (p: ColumnPoint): FigureRow[] => [
    ...series.map((s, i) => ({ label: s.label, value: format(p.values[i] ?? 0), series: i })),
    ...(extraFigures?.(p) ?? []),
  ];
  const describe = (p: ColumnPoint) =>
    `${p.label}${p.inProgress ? ', in progress' : ''}: ${
      p.hasRecords === false ? 'no records yet' : figures(p).map((f) => `${f.label} ${f.value}`).join(', ')
    }`;

  // Keep the selected month (or the latest, with no selection) in view when the plot scrolls.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const band = bandRefs.current[selectedIndex >= 0 ? selectedIndex : points.length - 1];
    if (!scroller || !band || scroller.scrollWidth <= scroller.clientWidth) return;
    const b = band.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    if (b.left < s.left) scroller.scrollLeft -= s.left - b.left;
    else if (b.right > s.right) scroller.scrollLeft += b.right - s.right;
  }, [selectedIndex, points.length]);

  /** Place the tooltip beside the band, on whichever side of the frame has more room. */
  function showTip(index: number) {
    const band = bandRefs.current[index];
    const frame = frameRef.current;
    if (!band || !frame) return;
    const b = band.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const gap = 6;
    if (b.left + b.width / 2 - f.left < f.width / 2) {
      const offset = b.right - f.left + gap;
      setTip({ index, side: 'right', offset, room: Math.max(140, f.width - offset) });
    } else {
      const offset = f.right - b.left + gap;
      setTip({ index, side: 'left', offset, room: Math.max(140, f.width - offset) });
    }
  }

  function onBandKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = points.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? Math.min(last, index + 1)
        : e.key === 'ArrowLeft'
          ? Math.max(0, index - 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    bandRefs.current[next]?.focus();
  }

  const legend: ReactNode[] = [];
  if (series.length > 1) {
    series.forEach((s, i) =>
      legend.push(
        <li key={s.key} className="flex items-center gap-1.5">
          <SeriesKey index={i} shape="rect" /> {s.label}
        </li>,
      ),
    );
  }
  if (points.some((p) => p.inProgress)) {
    legend.push(
      <li key="__in-progress" className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ backgroundColor: SERIES_FILL[0], opacity: 0.55 }}
        />
        Lighter: month in progress
      </li>,
    );
  }

  const tipPoint = tip ? points[tip.index] : undefined;

  return (
    <figure className={`relative rounded-xl border border-line bg-white p-3 sm:p-5 ${PRINT_FILLS}`}>
      <figcaption id={captionId} className="text-sm font-medium text-charcoal">
        {title}
      </figcaption>
      {legend.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-charcoal-muted">{legend}</ul>
      )}

      {points.length === 0 ? (
        <p className="mt-4 text-sm text-charcoal-muted">Nothing recorded yet.</p>
      ) : (
        <div
          ref={frameRef}
          className="relative mt-3 flex"
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setTip(null);
          }}
        >
          {/* y axis from sm up: a gutter outside the scroller, so it stays put while the plot scrolls. */}
          <div aria-hidden className={`relative hidden w-16 shrink-0 sm:block ${BAND_HEIGHT}`}>
            <div className={SCALE_BOX}>
              {scale.ticks.map((t) => (
                <span
                  key={t}
                  className="absolute right-2 translate-y-1/2 whitespace-nowrap text-[10px] leading-none tabular-nums text-charcoal-muted"
                  style={{ bottom: `${pos(t)}%` }}
                >
                  {axisLabel(t)}
                </span>
              ))}
            </div>
          </div>

          <div
            ref={scrollerRef}
            className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden print:overflow-visible"
            onScroll={() => {
              if (tip) showTip(tip.index);
            }}
          >
            <div className="relative" style={{ minWidth: points.length * MIN_BAND_PX }}>
              {/* Selected and hovered highlights sit under the gridlines, so the zero
                  line stays visible through them. Bands are equal flex columns, so
                  band i spans i/n to (i+1)/n of this box. */}
              {[
                { role: 'selected', index: selectedIndex, opacity: 1 },
                { role: 'hover', index: tip && tip.index !== selectedIndex ? tip.index : -1, opacity: 0.55 },
              ].map(
                (h) =>
                  h.index >= 0 && (
                    <span
                      key={h.role}
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 rounded"
                      style={{
                        left: `${(h.index / points.length) * 100}%`,
                        width: `${100 / points.length}%`,
                        backgroundColor: 'var(--chart-track)',
                        opacity: h.opacity,
                      }}
                    />
                  ),
              )}

              {/* Hairline gridlines; the zero line is one step stronger. */}
              <div aria-hidden className={`pointer-events-none ${SCALE_BOX}`}>
                {scale.ticks.map((t) => (
                  <span
                    key={t}
                    className="absolute inset-x-0 h-px"
                    style={{
                      bottom: `${pos(t)}%`,
                      backgroundColor: t === 0 ? 'var(--chart-muted)' : 'var(--chart-grid)',
                      opacity: t === 0 ? 0.6 : 1,
                    }}
                  />
                ))}
              </div>

              <div
                role="group"
                aria-labelledby={captionId}
                className="relative flex"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIndex(null);
                }}
              >
                {points.map((p, i) => {
                  const isSelected = i === selectedIndex;
                  const noRecords = p.hasRecords === false;
                  return (
                    <button
                      key={p.key}
                      ref={(el) => {
                        bandRefs.current[i] = el;
                      }}
                      type="button"
                      tabIndex={i === tabStop ? 0 : -1}
                      aria-pressed={isSelected}
                      aria-label={describe(p)}
                      aria-controls={readoutId}
                      onClick={() => onSelect(p.key)}
                      onKeyDown={(e) => onBandKey(e, i)}
                      onFocus={(e) => {
                        setFocusIndex(i);
                        if (isFocusVisible(e.currentTarget)) showTip(i);
                      }}
                      onBlur={() => setTip((t) => (t?.index === i ? null : t))}
                      onPointerEnter={(e) => {
                        if (e.pointerType === 'mouse') showTip(i);
                      }}
                      className={`relative min-w-0 flex-1 basis-0 rounded outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-aqua-deep ${BAND_HEIGHT}`}
                      style={{ minWidth: MIN_BAND_PX }}
                    >
                      <span aria-hidden className={SCALE_BOX}>
                        {noRecords ? (
                          // Empty slot: before records began, distinct from a recorded zero.
                          <span
                            className="absolute left-1/2 h-4 -translate-x-1/2 rounded-t-[4px] border border-dashed"
                            style={{
                              bottom: `${zero}%`,
                              width: '62%',
                              maxWidth: 24,
                              borderColor: 'var(--chart-muted)',
                              opacity: 0.6,
                            }}
                          />
                        ) : (
                          series.map((s, si) => {
                            const v = p.values[si] ?? 0;
                            if (v === 0) return null;
                            const inset = si === 1;
                            const r = inset ? 3 : 4;
                            return (
                              <span
                                key={s.key}
                                className="absolute left-1/2 -translate-x-1/2"
                                style={{
                                  // Grow away from the zero line: up for gains, down for losses.
                                  ...(v > 0 ? { bottom: `${zero}%` } : { top: `${100 - zero}%` }),
                                  height: `${(Math.abs(v) / span) * 100}%`,
                                  minHeight: 2,
                                  width: inset ? '31%' : '62%',
                                  maxWidth: inset ? 12 : 24,
                                  backgroundColor: SERIES_FILL[si === 1 ? 1 : 0],
                                  borderRadius: v > 0 ? `${r}px ${r}px 0 0` : `0 0 ${r}px ${r}px`,
                                  outline: inset ? '2px solid var(--chart-surface)' : undefined,
                                  opacity: p.inProgress ? 0.55 : 1,
                                }}
                              />
                            );
                          })
                        )}
                      </span>
                      <span
                        aria-hidden
                        className={`absolute inset-x-0 bottom-0 flex h-6 items-center justify-center whitespace-nowrap text-[10px] leading-none sm:text-[11px] ${
                          isSelected ? 'font-semibold text-charcoal' : noRecords ? 'text-charcoal-muted/70' : 'text-charcoal-muted'
                        }`}
                      >
                        <span className="sm:hidden">{p.tinyLabel ?? p.shortLabel}</span>
                        <span className="hidden sm:inline">{p.shortLabel}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* y axis below sm: labels sit inside the plot above each gridline, fixed while the plot scrolls. */}
          <div aria-hidden className="pointer-events-none absolute left-0 right-0 top-4 h-[184px] sm:hidden">
            {scale.ticks.map((t) => (
              <span
                key={t}
                className="absolute left-0.5 whitespace-nowrap text-[10px] leading-none tabular-nums text-charcoal-muted"
                style={{ bottom: `calc(${pos(t)}% + 3px)`, textShadow: LABEL_HALO }}
              >
                {axisLabel(t)}
              </span>
            ))}
          </div>

          {tip && tipPoint && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-4 z-20 w-max rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg print:hidden"
              style={
                tip.side === 'right'
                  ? { left: tip.offset, maxWidth: tip.room }
                  : { right: tip.offset, maxWidth: tip.room }
              }
            >
              <p className="font-semibold text-charcoal">
                {tipPoint.label}
                {tipPoint.inProgress && <span className="ml-1.5 font-normal text-charcoal-muted">In progress</span>}
              </p>
              {tipPoint.hasRecords === false ? (
                <p className="mt-1 text-charcoal-muted">No records yet</p>
              ) : (
                <FigureRows rows={figures(tipPoint)} shape="line" className="mt-1 space-y-0.5" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Persistent readout: the selected month's exact figures, read aloud on change. */}
      <div id={readoutId} aria-live="polite" className="mt-3 border-t border-line pt-3 text-sm">
        {selected ? (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-charcoal">{selected.label}</span>
              {selected.inProgress && (
                <span className="rounded-pill bg-aqua-soft px-2 py-0.5 text-[11px] font-medium text-aqua-deep">
                  In progress
                </span>
              )}
            </p>
            {selected.hasRecords === false ? (
              <p className="mt-1 text-charcoal-muted">No records yet</p>
            ) : (
              <FigureRows
                rows={figures(selected)}
                shape="rect"
                className="mt-2 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-8"
              />
            )}
          </>
        ) : (
          <p className="text-charcoal-muted">Select a month to see its exact figures.</p>
        )}
      </div>
    </figure>
  );
}

// ── Ranked magnitude bars ───────────────────────────────────────────────────

export type RankedItem = { key: string; label: string; value: number; sub?: string };

/**
 * Horizontal ranked bars — the right form for "share by category" when there
 * are more than a handful of categories. A donut of eight close values is
 * unreadable, and colouring each bar differently would burn a channel on
 * information the bar length already carries, so it is one hue throughout.
 *
 * Given `detail`, each row becomes a button: mouse hover, keyboard focus or a
 * tap shows that row's detail line in a floating chip (so rows never shift
 * under the pointer), and screen readers get it as the row's description.
 * The value and share stay printed on every row either way.
 */
export function RankedBars({
  title,
  items,
  format,
  emptyLabel = 'Nothing recorded yet.',
  detail,
}: {
  title: string;
  items: RankedItem[];
  format: (n: number) => string;
  emptyLabel?: string;
  /** The row's detail line (exact value, jobs, share of total). `share` is the row's fraction of the total, 0–1. */
  detail?: (item: RankedItem, share: number) => ReactNode;
}) {
  const uid = useId();
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((acc, i) => acc + i.value, 0);

  return (
    <figure className={`rounded-xl border border-line bg-white p-5 ${PRINT_FILLS}`}>
      <figcaption className="text-sm font-medium text-charcoal">{title}</figcaption>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-charcoal-muted">{emptyLabel}</p>
      ) : (
        <ul className={detail ? 'mt-3 space-y-1' : 'mt-4 space-y-3'}>
          {items.map((item, index) => {
            const shareFraction = total > 0 ? item.value / total : 0;
            const body = (
              <>
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-charcoal">{item.label}</span>
                  <span className="shrink-0 font-medium text-charcoal">
                    {format(item.value)}
                    <span className="ml-2 text-xs font-normal text-charcoal-muted">
                      {Math.round(shareFraction * 100)}%
                    </span>
                  </span>
                </span>
                <span className="mt-1.5 block h-2.5 overflow-hidden rounded-pill bg-mist">
                  <span
                    className="block h-full rounded-pill"
                    style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, backgroundColor: ACCENT }}
                  />
                </span>
                {item.sub && <span className="mt-1 block text-xs text-charcoal-muted">{item.sub}</span>}
              </>
            );

            if (!detail) return <li key={item.key}>{body}</li>;

            const detailId = `${uid}-detail-${index}`;
            const isActive = active === item.key;
            return (
              <li key={item.key} className="relative">
                <button
                  type="button"
                  aria-describedby={detailId}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') setActive(item.key);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === 'mouse') setActive((a) => (a === item.key ? null : a));
                  }}
                  onFocus={(e) => {
                    if (isFocusVisible(e.currentTarget)) setActive(item.key);
                  }}
                  onBlur={() => setActive((a) => (a === item.key ? null : a))}
                  onClick={() => setActive(item.key)}
                  className={`-mx-2 block w-[calc(100%+1rem)] rounded-[6px] px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-aqua-deep ${
                    isActive ? 'bg-mist' : ''
                  }`}
                >
                  {body}
                </button>
                {/* Always in the DOM as the row's description; shown as a chip only while active. */}
                <span
                  id={detailId}
                  className={
                    isActive
                      ? 'pointer-events-none absolute left-0 top-full z-10 -mt-1 w-max max-w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-charcoal shadow-lg print:hidden'
                      : 'sr-only'
                  }
                >
                  {detail(item, shareFraction)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">
      {children}
    </div>
  );
}

// ── Donut (part-to-whole) ───────────────────────────────────────────────────

/**
 * Categorical palette for part-to-whole charts, validated against the white
 * surface (#FFFFFF) on the adjacent-pair gate — a donut is a stacked bar wrapped
 * into a circle, so adjacent segments are what must separate.
 *
 * Order matters: it is the colourblind-safety mechanism, not decoration. Green
 * leads by request; orange took the old bronze slot, and this ordering still
 * passes all five checks with no warnings (worst adjacent CVD ΔE 22.7,
 * normal-vision ΔE 29.0, all slots ≥ 3:1 contrast). Do not reorder or extend
 * without re-running the validator — orange or red beside green both fail.
 */
export const CATEGORICAL = ['#008300', '#2a78d6', '#eb6834', '#4a3aa7', '#e34948'] as const;

/** "Other" is a residual, not a category — it takes a neutral, never a hue. */
export const OTHER_GREY = '#8A94A3';
const SURFACE = '#FFFFFF';

export type Slice = { key: string; label: string; value: number };

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
 * Part-to-whole donut. Segments are sorted largest first and the tail folded
 * into "Other" past `maxSlices`, because past ~6 wedges adjacent colours blur
 * and the chart stops being readable at a glance.
 *
 * The centre carries the total as a hero figure, and every segment is named with
 * its value and share in the legend — the fill is never the only way to read it.
 */
export function DonutChart({
  slices,
  total: totalOverride,
  format = money,
  centreLabel,
  maxSlices = 5,
  emptyLabel = 'Nothing recorded yet.',
}: {
  slices: Slice[];
  total?: number;
  format?: (n: number) => string;
  centreLabel?: string;
  maxSlices?: number;
  emptyLabel?: string;
}) {
  const positive = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);

  if (positive.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg bg-mist text-sm text-charcoal-muted">
        {emptyLabel}
      </div>
    );
  }

  const head = positive.slice(0, maxSlices);
  const tail = positive.slice(maxSlices);
  const shown: (Slice & { color: string })[] = head.map((s, i) => ({ ...s, color: CATEGORICAL[i]! }));
  if (tail.length > 0) {
    shown.push({
      key: '__other',
      label: `Other (${tail.length})`,
      value: tail.reduce((acc, s) => acc + s.value, 0),
      color: OTHER_GREY,
    });
  }

  const total = totalOverride ?? shown.reduce((acc, s) => acc + s.value, 0);
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 100;
  const rInner = 64;

  // A 2px surface gap separates touching segments — the gap does the work, not a
  // stroke. Converted to radians at the outer edge so it looks even.
  const gap = shown.length > 1 ? 2 / rOuter : 0;
  let cursor = -Math.PI / 2; // start at 12 o'clock

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Donut chart: ${shown.map((s) => `${s.label} ${format(s.value)}`).join(', ')}`}
        className="shrink-0"
      >
        {shown.map((s) => {
          const sweep = (s.value / total) * Math.PI * 2;
          const from = cursor + gap / 2;
          const to = cursor + sweep - gap / 2;
          cursor += sweep;
          if (to <= from) return null;
          return (
            <path key={s.key} d={arcPath(cx, cy, rOuter, rInner, from, to)} fill={s.color}>
              <title>{`${s.label}: ${format(s.value)} (${Math.round((s.value / total) * 100)}%)`}</title>
            </path>
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-charcoal text-[15px] font-bold">
          {format(total)}
        </text>
        {centreLabel && (
          <text x={cx} y={cy + 14} textAnchor="middle" className="fill-charcoal-muted text-[11px]">
            {centreLabel}
          </text>
        )}
      </svg>

      {/* Legend carries the identity, the value and the share, so the chart is
          never read by colour alone. */}
      <ul className={`w-full min-w-0 space-y-2 ${PRINT_FILLS}`}>
        {shown.map((s) => (
          <li key={s.key} className="flex items-baseline gap-2.5 text-sm">
            <span
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color, boxShadow: `0 0 0 2px ${SURFACE}` }}
            />
            <span className="min-w-0 flex-1 truncate text-charcoal">{s.label}</span>
            <span className="shrink-0 tabular-nums text-charcoal-muted">
              {Math.round((s.value / total) * 100)}%
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums font-medium text-charcoal">
              {format(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
