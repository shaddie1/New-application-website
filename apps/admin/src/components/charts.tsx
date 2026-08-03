'use client';

/**
 * Charts for the admin dashboard.
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
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  hint?: string;
}) {
  const showDelta = typeof delta === 'number' && Number.isFinite(delta);
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <p className="text-xs uppercase tracking-widest text-charcoal-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-charcoal">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {showDelta && (
          <span className={delta >= 0 ? 'font-medium text-success' : 'font-medium text-danger'}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
        {deltaLabel && <span className="text-charcoal-muted">{deltaLabel}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-charcoal-muted">{hint}</p>}
    </div>
  );
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

// ── Monthly trend: income bars + net profit line ────────────────────────────

export type TrendPoint = { label: string; incomeCents: number; netCents: number };

/**
 * Two series on ONE axis — both are KSh, so a shared scale is honest (a second
 * y-axis would invent a relationship). Income is a gold column, net profit a
 * charcoal line: different colour AND different mark.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return <ChartEmpty>No monthly data yet.</ChartEmpty>;
  }

  const width = 760;
  const height = 260;
  const pad = { top: 16, right: 16, bottom: 34, left: 16 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = data.flatMap((d) => [d.incomeCents, d.netCents]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const y = (v: number) => pad.top + plotH - ((v - min) / span) * plotH;
  const bandW = plotW / data.length;
  const barW = Math.min(28, bandW * 0.5);

  const linePoints = data.map((d, i) => `${pad.left + bandW * i + bandW / 2},${y(d.netCents)}`).join(' ');
  const zeroY = y(0);

  return (
    <figure className="rounded-xl border border-line bg-white p-5">
      <figcaption className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-charcoal">Income and net profit by month</span>
        <span className="flex items-center gap-4 text-xs text-charcoal-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: GOLD }} /> Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-4" style={{ backgroundColor: CHARCOAL }} /> Net profit
          </span>
        </span>
      </figcaption>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img"
        aria-label="Monthly income columns with a net profit line">
        {/* Baseline only — no gridline clutter. */}
        <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke="#E8E2D2" strokeWidth="1" />

        {data.map((d, i) => {
          const cx = pad.left + bandW * i + bandW / 2;
          const value = Math.max(d.incomeCents, 0);
          // Grow upward from the baseline. A zero month draws no bar at all —
          // a minimum-height stub would hang below the axis and read as debt.
          const h = value > 0 ? Math.max(2, zeroY - y(value)) : 0;
          return (
            <g key={d.label}>
              <title>{`${d.label} — income ${money(d.incomeCents)}, net ${money(d.netCents)}`}</title>
              {h > 0 && <rect x={cx - barW / 2} y={zeroY - h} width={barW} height={h} rx="4" fill={GOLD} />}
              <text x={cx} y={height - 12} textAnchor="middle" fontSize="11" fill="#5A5348">
                {d.label}
              </text>
            </g>
          );
        })}

        <polyline points={linePoints} fill="none" stroke={CHARCOAL} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => {
          const cx = pad.left + bandW * i + bandW / 2;
          const isLast = i === data.length - 1;
          return (
            <g key={`${d.label}-pt`}>
              {/* 2px surface ring so the marker stays readable over the column. */}
              <circle cx={cx} cy={y(d.netCents)} r="4.5" fill={CHARCOAL} stroke="#FFFFFF" strokeWidth="2" />
              {/* Label only the latest point — never a number on every point. */}
              {isLast && (
                <text x={cx} y={y(d.netCents) - 12} textAnchor="end" fontSize="11" fontWeight="600" fill={CHARCOAL}>
                  {moneyShort(d.netCents)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
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
