'use client';

import { TriangleAlert } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { cn } from '../../lib/cn';
import { money } from '../../lib/money';
import { Skeleton } from '../dashboard/BlockState';
import { enoughToDraw, segmentPath, stackedBars, type StackGeometry, type StackLayout, type StackSegment } from '../stacked-bars';
import { EDGE_PX } from '../chart-palette';
import { chartColour, holderFill, RETAINED_HATCH_GAP, RETAINED_LINE, retainedFill } from './colours';
import {
  amountWithoutUnit, isPhone, monthAxisLabels, monthTableColumns, tableMonthIndexes, type HistorySeries, type OwnershipHistory,
} from './history';
import { InitialsBadge, RetainedBadge } from './InitialsBadge';
import { AMOUNTS_UNIT, monthTableWording, overAllocatedLine } from './wording';

// The chart is drawn at the width it is given, never scaled and never
// scrolled: all twelve months fit a phone, with narrower slots and bars and a
// label under every other month.
const HEIGHT = 300;
const BAR_RADIUS = 4;
const NARROW_FRAME = 480;
const PAD = { top: 16, right: 8, bottom: 46, left: 66 };
const NARROW_PAD = { top: 12, right: 0, bottom: 44, left: 50 };
/** A slot narrower than this cannot hold a month's name beside its neighbours'. */
const SLOT_FOR_EVERY_LABEL = 30;
/** KSh 10,000, in cents: an axis that reaches it is labelled in thousands. */
const COMPACT_FROM = 1_000_000;
const TOOLTIP_WIDTH = 272;

/** The width of an element's content box in whole pixels, read straight from the layout. */
function contentWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const edges = [style.borderLeftWidth, style.borderRightWidth, style.paddingLeft, style.paddingRight]
    .reduce((sum, edge) => sum + (parseFloat(edge) || 0), 0);
  return Math.max(0, Math.floor(element.getBoundingClientRect().width - edges));
}

/**
 * The width of an element's content box, kept up to date. It is zero only
 * while the element has no width at all, such as inside something hidden.
 *
 * The width is read from the layout after every render, before the browser
 * paints, so what is drawn at that width is there in the first frame and
 * follows any re-render of a parent. It does not wait for a ResizeObserver,
 * whose first report comes with the next frame the browser renders and never
 * comes while the page is not being rendered (a tab opened behind another
 * one). The observer and the window's resize are only for a change of width
 * with no render of ours.
 */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  // No dependencies: after every render. Setting the same width again renders nothing.
  useLayoutEffect(() => {
    if (ref.current) setWidth(contentWidth(ref.current));
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(contentWidth(element));
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);
  return [ref, width] as const;
}

const onResize = (changed: () => void) => {
  window.addEventListener('resize', changed);
  return () => window.removeEventListener('resize', changed);
};

/** Whether the screen is a phone's, kept up to date. */
function usePhone(): boolean {
  return useSyncExternalStore(onResize, () => isPhone(window.innerWidth), () => false);
}

/** A series' colour as a small square: the legend's, and the tooltip's. */
function Swatch({ series }: { series: HistorySeries }) {
  return (
    <span
      aria-hidden="true"
      className="h-3 w-3 shrink-0 rounded-[3px]"
      style={series.kind === 'retained' ? retainedFill : holderFill(series.colourIndex)}
    />
  );
}

/**
 * Twelve months of net profit, each month's bar split between the holders at
 * today's stakes, with the same amounts in a table beneath. The table is
 * where a past month's split is read.
 *
 * With fewer than two months of figures there is no chart, only a note, and
 * the table shows the months that do have figures.
 */
export function HistoryChart({ history }: { history: OwnershipHistory }) {
  const chart = enoughToDraw(history.columns);
  // The line is about the bars, so it is there only with them.
  const over = chart ? overAllocatedLine(history.stakesBasisPoints) : null;
  const monthIndexes = tableMonthIndexes(history);
  return (
    <div>
      {/* Amber: the stakes need attention. Nothing here is a loss. */}
      {over && (
        <p className="figure mb-4 flex gap-2 text-sm font-medium text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {over}
        </p>
      )}
      {chart ? (
        <Bars history={history} />
      ) : (
        <p className="rounded-lg bg-mist px-4 py-6 text-center text-sm text-charcoal-muted">
          Not enough history to chart yet. The chart appears once two months have figures.
        </p>
      )}
      {/* With no month to show there is no table either. */}
      {monthIndexes.length > 0 && <AmountsTable history={history} monthIndexes={monthIndexes} chart={chart} />}
    </div>
  );
}

/** The legend and the bars. Only for a history with enough to draw. */
function Bars({ history }: { history: OwnershipHistory }) {
  const [frame, frameWidth] = useWidth<HTMLDivElement>();

  const narrow = frameWidth < NARROW_FRAME;
  const pad = narrow ? NARROW_PAD : PAD;
  const slot = (frameWidth - pad.left - pad.right) / Math.max(history.columns.length, 1);
  const tight = slot < SLOT_FOR_EVERY_LABEL;
  const geometry: StackGeometry = {
    width: frameWidth, height: HEIGHT, pad, barShare: tight ? 0.58 : 0.45, maxBarWidth: 44, gapPx: 2,
  };
  // Nothing can be laid out in no width: the frame holds a skeleton until it has one.
  const layout = frameWidth > 0 ? stackedBars(history.series, history.columns, geometry) : null;

  return (
    <>
      <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-charcoal-muted">
        {history.series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <Swatch series={s} />
            {s.label}
          </li>
        ))}
      </ul>
      {/* The chart's place, at its full height whatever is in it: the bars, or their skeleton, never blank card. */}
      <div ref={frame} data-chart-frame="" style={{ height: HEIGHT }}>
        {layout?.status === 'ok' ? (
          <Drawing history={history} layout={layout} width={frameWidth} pad={pad} narrow={narrow} tight={tight} />
        ) : (
          <Skeleton className="h-full w-full rounded-lg" />
        )}
      </div>
    </>
  );
}

/** A segment drawn a little inside its own edges, so an outline stays within it. */
function inset(segment: StackSegment, by: number): StackSegment {
  return { ...segment, x: segment.x + by, y: segment.y + by, width: segment.width - 2 * by, height: segment.height - 2 * by };
}

function Drawing({
  history, layout, width, pad, narrow, tight,
}: {
  history: OwnershipHistory;
  layout: Extract<StackLayout, { status: 'ok' }>;
  /** The frame's width, above zero. */
  width: number;
  pad: StackGeometry['pad'];
  narrow: boolean;
  /** Slots too narrow for a label under every month. */
  tight: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const hatch = `retained-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const reach = Math.max(-layout.axis.min, layout.axis.max);
  const tickText = (cents: number) => money(cents, reach >= COMPACT_FROM ? { compact: true } : { whole: true });
  const labels = monthAxisLabels(history.months, tight ? 2 : 1);
  const active = hover === null ? null : { bar: layout.bars[hover]!, month: history.months[hover]!, column: history.columns[hover]! };

  return (
    <div className="relative" style={{ height: HEIGHT }}>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={history.summary}
        className="block overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {/* The same hatching as the retained part of the share bar. */}
          <pattern id={hatch} patternUnits="userSpaceOnUse" width={RETAINED_HATCH_GAP} height={RETAINED_HATCH_GAP} patternTransform="rotate(45)">
            <line x1="0.5" x2="0.5" y1="0" y2={RETAINED_HATCH_GAP} stroke={RETAINED_LINE} strokeWidth="1" />
          </pattern>
        </defs>

        {layout.axis.ticks.map((tick) => (
          <g key={tick.value}>
            <line x1={pad.left} x2={width - pad.right} y1={tick.y} y2={tick.y} stroke="var(--chart-grid)" strokeWidth="1" />
            <text
              x={pad.left - (narrow ? 6 : 10)}
              y={tick.y + 4}
              textAnchor="end"
              fontSize={narrow ? 10 : 11}
              fill="var(--chart-muted)"
              className="figure"
            >
              {tickText(tick.value)}
            </text>
          </g>
        ))}

        {layout.bars.map((bar, i) => {
          const month = history.months[i]!;
          const { label, second } = labels[i]!;
          const centre = bar.bandX + bar.bandWidth / 2;
          return (
            <g key={bar.key}>
              {hover === i && (
                <rect x={bar.bandX} y={pad.top} width={bar.bandWidth} height={HEIGHT - pad.top - pad.bottom} className="fill-mist" />
              )}
              {bar.segments.map((segment) => {
                const series = history.series[segment.seriesIndex]!;
                const { fill, edge } = chartColour(series.colourIndex);
                // Nobody's share: hatched and outlined, never a solid colour.
                if (series.kind === 'retained') {
                  return (
                    <path
                      key={segment.seriesKey}
                      d={segmentPath(inset(segment, 0.5), BAR_RADIUS)}
                      fill={`url(#${hatch})`}
                      stroke={RETAINED_LINE}
                      strokeWidth="1"
                    />
                  );
                }
                // A sliver too thin to outline is all edge, so it is solid in the edge's colour.
                if (segment.height < 4) {
                  return <path key={segment.seriesKey} d={segmentPath(segment, BAR_RADIUS)} fill={edge} />;
                }
                // Each share is its bright fill inside the darker edge of the
                // same colour. The edge is drawn within the segment, so the
                // gaps between segments stay. The month still running has a
                // light fill inside the same edge.
                return (
                  <path
                    key={segment.seriesKey}
                    d={segmentPath(inset(segment, EDGE_PX / 2), BAR_RADIUS)}
                    fill={fill}
                    fillOpacity={month.partial ? 0.3 : undefined}
                    stroke={edge}
                    strokeWidth={EDGE_PX}
                  />
                );
              })}
              {label && (
                <text x={centre} y={HEIGHT - pad.bottom + 18} textAnchor="middle" fontSize={narrow ? 11 : 12} fill="var(--chart-ink)">
                  {label}
                </text>
              )}
              {second && (
                <text
                  x={centre}
                  y={HEIGHT - pad.bottom + 32}
                  textAnchor="middle"
                  fontSize={narrow ? 10 : 11}
                  fill="var(--chart-muted)"
                  className="figure"
                >
                  {second}
                </text>
              )}
            </g>
          );
        })}

        {/* The zero line, over the bars' square ends. */}
        <line x1={pad.left} x2={width - pad.right} y1={layout.zeroY} y2={layout.zeroY} stroke="var(--chart-muted)" strokeWidth="1" />

        {/* The whole column answers the pointer, not only the bar. */}
        {layout.bars.map((bar, i) => (
          <rect
            key={bar.key}
            x={bar.bandX}
            y={0}
            width={bar.bandWidth}
            height={HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {/* Above the plot, over the legend it repeats, so it never sits on a bar. */}
      {active && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs shadow-md"
          style={{
            width: Math.min(TOOLTIP_WIDTH, width),
            bottom: HEIGHT - pad.top + 6,
            left: Math.max(0, Math.min(active.bar.bandX + active.bar.bandWidth / 2 - TOOLTIP_WIDTH / 2, width - TOOLTIP_WIDTH)),
          }}
        >
          <p className="figure font-semibold text-charcoal">{active.month.heading}</p>
          <dl className="mt-1.5 space-y-1">
            {history.series.map((s, seriesIndex) => (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <dt className="flex min-w-0 items-center gap-2 text-charcoal-muted">
                  <Swatch series={s} />
                  <span className="truncate">{s.label}</span>
                </dt>
                <dd className="figure shrink-0 font-medium text-charcoal">{money(active.column.values[seriesIndex] ?? 0)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-1.5">
              <dt className="text-charcoal-muted">Net profit</dt>
              <dd className={cn('figure shrink-0 font-semibold', active.month.netCents < 0 ? 'text-danger' : 'text-charcoal')}>
                {money(active.month.netCents)}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

function Amount({ cents, over = false }: { cents: number; over?: boolean }) {
  // An empty month is a quiet dash to the eye and a nought to a screen reader.
  if (cents === 0) {
    return (
      <span className="text-charcoal-muted">
        <span aria-hidden="true">–</span>
        <span className="sr-only">0</span>
      </span>
    );
  }
  // What stakes over 100% hand out beyond the profit is amber: it needs attention, and it is nobody's loss.
  return <span className={over ? 'text-warning' : cents < 0 ? 'text-danger' : undefined}>{amountWithoutUnit(cents)}</span>;
}

// The first column stays in view while the months scroll under it. Its soft
// shadow shows once months are hidden beneath it: the cue that the table scrolls.
const stuck =
  "sticky left-0 z-[1] border-r border-line text-left after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-3 after:bg-gradient-to-r after:from-charcoal/10 after:to-transparent after:opacity-0 after:transition-opacity after:content-[''] group-data-[scrolled=true]:after:opacity-100";

/**
 * The amounts behind the chart, one column a month. The unit is said once,
 * above the table, so each cell is the figure alone and more months are in
 * view. On a phone the first column is a badge alone, with the name it stands
 * for as the cell's title and as its name to a screen reader; `monthTableColumns`
 * says when.
 */
function AmountsTable({
  history, monthIndexes, chart,
}: {
  history: OwnershipHistory;
  /** The months to show, as positions in the history. */
  monthIndexes: number[];
  /** Whether the chart is drawn above. */
  chart: boolean;
}) {
  const [frame, frameWidth] = useWidth<HTMLDivElement>();
  const [scrolled, setScrolled] = useState(false);
  const phone = usePhone();

  const months = monthIndexes.map((i) => history.months[i]!);
  const longest = (texts: string[]) => texts.reduce((most, text) => Math.max(most, text.length), 0);
  const columns = monthTableColumns(frameWidth, {
    phone,
    months: months.length,
    amountCharacters: longest(
      [...history.rows.flatMap((row) => monthIndexes.map((i) => row.cents[i] ?? 0)), ...months.map((m) => m.netCents)].map(amountWithoutUnit),
    ),
    nameCharacters: longest(history.rows.map((row) => row.label)),
  });
  // A badge alone in the first column: on a phone, unless every month fits beside the names.
  const badgeOnly = columns ? !columns.named : phone;
  const words = monthTableWording(months.map((m) => m.heading), { chart, scrolls: columns !== null && columns.visible < months.length });

  // The table opens at its right-hand end, where the latest months are, and
  // returns there when its columns are sized again. Before the browser paints,
  // so it is never seen resting anywhere else.
  const tableWidth = columns?.table;
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    element.scrollLeft = element.scrollWidth;
    setScrolled(element.scrollLeft > 0);
  }, [frame, tableWidth]);

  // The padding `monthTableColumns` counts on: 10px a side on a phone, 16px from 640px.
  const padX = phone ? 'px-2.5' : 'px-4';
  const cell = cn('figure whitespace-nowrap py-3 text-right', padX);
  const pinnedCell = cn(stuck, badgeOnly ? 'px-2' : padX);
  const badgeSize = phone ? 'xs' : 'sm';

  return (
    <div className="mt-8">
      {/* The heading stays put while the table scrolls; the table's own caption repeats it for a screen reader. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h3 className="text-sm font-medium text-charcoal">{words.heading}</h3>
        <p className="text-sm text-charcoal-muted">{AMOUNTS_UNIT}</p>
      </div>
      <p className="mt-0.5 text-sm text-charcoal-muted">{words.note}</p>
      {/* `relative`, so the frame also clips what is positioned inside the table. It stops only where a month column begins. */}
      <div
        ref={frame}
        data-scrolled={scrolled}
        onScroll={(event) => setScrolled(event.currentTarget.scrollLeft > 0)}
        style={{ scrollPaddingLeft: columns?.pinned }}
        className="group relative mt-3 snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-lg border border-line"
      >
        <table className={cn('border-separate border-spacing-0 text-sm', columns ? 'table-fixed' : 'w-full')} style={{ width: columns?.table }}>
          <caption className="sr-only">{words.caption}</caption>
          {columns && (
            <colgroup>
              <col style={{ width: columns.pinned }} />
              {months.map((m) => <col key={m.key} style={{ width: columns.month }} />)}
            </colgroup>
          )}
          <thead>
            <tr className="whitespace-nowrap text-charcoal-muted">
              <th scope="col" className={cn(pinnedCell, 'border-b bg-mist py-2.5 align-top text-xs font-medium uppercase tracking-widest')}>
                <span className={badgeOnly ? 'sr-only' : undefined}>Shareholder</span>
              </th>
              {/* Two short lines, as under the chart: the month, then its year or "so far". */}
              {months.map((m) => (
                <th key={m.key} scope="col" className={cn('snap-start border-b border-line bg-mist py-2.5 text-right align-top font-medium', padX)}>
                  <span className="block text-xs uppercase tracking-widest">{m.columnHead[0]}</span>{' '}
                  <span className="figure block text-[11px] font-normal leading-4">{m.columnHead[1]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" title={badgeOnly ? row.label : undefined} className={cn(pinnedCell, 'border-b bg-surface py-2.5 font-normal')}>
                  <span className={cn('flex items-center', badgeOnly ? 'justify-center' : phone ? 'gap-2' : 'gap-2.5')}>
                    {row.kind === 'holder' ? (
                      <InitialsBadge name={row.label} colourIndex={row.colourIndex} size={badgeSize} />
                    ) : row.kind === 'retained' ? (
                      <RetainedBadge size={badgeSize} />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning', phone ? 'h-6 w-6' : 'h-7 w-7')}
                      >
                        <TriangleAlert className="size-3.5" />
                      </span>
                    )}
                    {/* A badge alone stands for the name, which a screen reader still reads. Beside its badge the name is never cut short: a long one takes a second line. */}
                    <span
                      className={cn(
                        badgeOnly ? 'sr-only' : 'min-w-0 break-words leading-snug',
                        row.kind === 'holder' ? 'text-charcoal' : row.kind === 'retained' ? 'italic text-charcoal-muted' : 'font-medium text-warning',
                      )}
                    >
                      {row.label}
                    </span>
                  </span>
                </th>
                {monthIndexes.map((i) => (
                  <td key={history.months[i]!.key} className={cn(cell, 'border-b border-line')}>
                    <Amount cents={row.cents[i] ?? 0} over={row.kind === 'over'} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                title={badgeOnly ? 'Net profit' : undefined}
                className={cn(pinnedCell, 'bg-mist py-3 font-medium text-charcoal', badgeOnly && 'text-center text-xs')}
              >
                Net<span className={badgeOnly ? 'sr-only' : undefined}> profit</span>
              </th>
              {months.map((m) => (
                <td key={m.key} className={cn(cell, 'bg-mist font-medium')}>
                  <Amount cents={m.netCents} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
