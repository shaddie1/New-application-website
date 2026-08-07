'use client';

import { useState, type ReactNode } from 'react';

/**
 * Charts for the admin dashboard.
 *
 * Colours come from CSS variables (--chart-*) declared in globals.css, not from
 * hard-coded hex, so a second theme can re-skin every chart from one block.
 *
 * Palette decision (validated, not eyeballed): the brand's gold #D4A843 and
 * bronze #A87D22 are only ΔE 13.8 apart in normal vision — below the 15 floor —
 * so they cannot sit next to each other as two series. Everything here is
 * therefore SINGLE-HUE gold for magnitude, and the one two-series chart pairs
 * gold against charcoal (ΔE 58) and separates them by mark type as well.
 *
 * Gold sits at 2.1:1 against the cream page, under the 3:1 mark contrast bar, so
 * every chart carries visible numeric labels rather than relying on the fill.
 */

const GOLD = '#D4A843';
const CHARCOAL = '#14120F';

export function money(cents: number): string {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
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

/**
 * A headline number. Per the form heuristic, a single value is a stat tile, not
 * a one-bar chart. `delta` compares with the previous period.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  hint,
  context,
  progressPercent,
  progressLabel,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  hint?: string;
  /** One line saying what the number actually means. */
  context?: string;
  /** 0–100+; renders a thin capacity bar under the number when provided. */
  progressPercent?: number | null;
  progressLabel?: string;
}) {
  const showDelta = typeof delta === 'number' && Number.isFinite(delta);
  const showProgress = typeof progressPercent === 'number' && Number.isFinite(progressPercent);

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <p className="text-xs uppercase tracking-widest text-charcoal-muted">{label}</p>

      <p className="mt-2 text-3xl font-bold tracking-tight text-charcoal tabular-nums">{value}</p>

      {/* Delta stays small and secondary — it supports the headline, never competes. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {showDelta && (
          <span
            className="font-medium tabular-nums"
            style={{ color: delta >= 0 ? 'var(--chart-positive)' : 'var(--chart-negative)' }}
          >
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
        {deltaLabel && <span className="text-charcoal-muted">{deltaLabel}</span>}
      </div>

      {showProgress && (
        <div className="mt-3">
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
              className="rounded-full border border-gold-bright/60 px-2 py-1 text-[10px] font-medium text-bronze hover:bg-gold-bright/10"
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

      <div className="relative mt-3 h-3 rounded-pill bg-cream-deep">
        <div
          className="h-3 rounded-pill"
          style={{ width: `${barPct}%`, backgroundColor: GOLD }}
          role="img"
          aria-label={`${format(actual)}${hasTarget ? ` of ${format(target)} target` : ''}`}
        />
        {hasTarget && (
          // Target notch, drawn over the bar with a surface-coloured gap so the
          // two marks never blend into one another.
          <span
            className="absolute top-[-3px] h-[18px] w-[3px] rounded-sm border-x border-white"
            style={{ left: `calc(${targetPct}% - 1.5px)`, backgroundColor: CHARCOAL }}
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
 * Income as a gold gradient area, net profit as a line over it.
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

// ── Ranked magnitude bars ───────────────────────────────────────────────────

export type RankedItem = { key: string; label: string; value: number; sub?: string };

/**
 * Horizontal ranked bars — the right form for "share by category" when there
 * are more than a handful of categories. A donut of eight close values is
 * unreadable, and colouring each bar differently would burn a channel on
 * information the bar length already carries, so it is one hue throughout.
 */
export function RankedBars({
  title,
  items,
  format,
  emptyLabel = 'Nothing recorded yet.',
}: {
  title: string;
  items: RankedItem[];
  format: (n: number) => string;
  emptyLabel?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((acc, i) => acc + i.value, 0);

  return (
    <figure className="rounded-xl border border-line bg-white p-5">
      <figcaption className="text-sm font-medium text-charcoal">{title}</figcaption>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-charcoal-muted">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const share = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <li key={item.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-charcoal">{item.label}</span>
                  <span className="shrink-0 font-medium text-charcoal">
                    {format(item.value)}
                    <span className="ml-2 text-xs font-normal text-charcoal-muted">{share}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-pill bg-cream-deep">
                  <div
                    className="h-full rounded-pill"
                    style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, backgroundColor: GOLD }}
                  />
                </div>
                {item.sub && <p className="mt-1 text-xs text-charcoal-muted">{item.sub}</p>}
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
 * Categorical palette for part-to-whole charts, validated against the cream
 * surface (#FDFAF2) on the adjacent-pair gate — a donut is a stacked bar wrapped
 * into a circle, so adjacent segments are what must separate.
 *
 * Order matters: it is the colourblind-safety mechanism, not decoration. Green
 * leads by request; this ordering still passes all five checks with no warnings
 * (worst adjacent CVD ΔE 22.7, normal-vision ΔE 28.1, all slots ≥ 3:1 contrast).
 * Do not reorder or extend without re-running the validator — red beside green,
 * or the brand gold beside bronze, both fail.
 */
export const CATEGORICAL = ['#008300', '#2a78d6', '#A87D22', '#4a3aa7', '#e34948'] as const;

/** "Other" is a residual, not a category — it takes a neutral, never a hue. */
const OTHER_GREY = '#8C857A';
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
      <div className="flex h-56 items-center justify-center rounded-lg bg-cream text-sm text-charcoal-muted">
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
      <ul className="w-full min-w-0 space-y-2">
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
