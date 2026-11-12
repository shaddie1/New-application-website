import { cn } from '../../lib/cn';
import { money } from '../../lib/money';
import { Skeleton } from '../dashboard/BlockState';
import { Card } from '../ui/card';
import type { ScopeFigures } from './scope';

/**
 * The page's headline: net profit for the chosen scope, with what it is made
 * of beside it. A loss is red; income and expenses are plain figures.
 *
 * While the figures load, each one's place is held by a bar on the figure's
 * own line, so no label moves when the figures arrive.
 *
 * The layout follows the card's own width, not the screen's, so it holds
 * beside a side menu. Under 34rem of room the supporting figures are rows, a
 * label and its figure; from 34rem they are three equal columns under the
 * headline. The two wider layouts are written as separate ranges, so no class
 * has to win over another.
 *
 * From 55rem the headline and the three figures are one row of four columns
 * on one grid: the headline's column has two fifths of the width and the
 * others share the rest, so the gaps between them are even however wide the
 * card, and nothing moves sideways when the figures arrive or the scope
 * changes them. The wrappers step out of the way (`display: contents`) and
 * every label and figure is placed on that grid itself. That is what lines
 * the four labels up on one row and stands the four figures on one baseline,
 * the large one and the small ones alike.
 */
export function Hero({
  figures, scopeText,
}: {
  /** Null while the figures load. */
  figures: ScopeFigures | null;
  /** What the figures cover, such as "All time, since 20 Jan 2026". */
  scopeText: string;
}) {
  return (
    <Card className="p-6 sm:p-8" aria-busy={figures === null}>
      <div className="[container-type:inline-size]">
        <div className="grid gap-6 [@container_(min-width:55rem)]:grid-cols-[minmax(auto,2fr)_repeat(3,minmax(0,1fr))] [@container_(min-width:55rem)]:items-baseline [@container_(min-width:55rem)]:gap-0">
          <div className="min-w-0 [@container_(min-width:55rem)]:contents">
            <span
              aria-hidden="true"
              className="mb-5 block h-0.5 w-10 rounded-full bg-gold [@container_(min-width:55rem)]:col-start-1 [@container_(min-width:55rem)]:row-start-1"
            />
            <h2 className="text-xs font-medium uppercase tracking-widest text-charcoal-muted [@container_(min-width:55rem)]:col-start-1 [@container_(min-width:55rem)]:row-start-2">
              Net profit
            </h2>
            <p
              className={cn(
                'figure mt-2 text-4xl font-semibold tracking-tight sm:text-5xl [@container_(min-width:55rem)]:col-start-1 [@container_(min-width:55rem)]:row-start-3 [@container_(min-width:55rem)]:whitespace-nowrap [@container_(min-width:55rem)]:pr-10',
                figures && figures.netCents < 0 ? 'text-danger' : 'text-charcoal',
              )}
            >
              {figures ? money(figures.netCents) : <Skeleton className="inline-block h-8 w-56 align-baseline sm:h-10" />}
            </p>
            <p className="figure mt-3 text-sm text-charcoal-muted [@container_(min-width:55rem)]:col-start-1 [@container_(min-width:55rem)]:row-start-4">
              {scopeText}
            </p>
          </div>

          <dl className="grid divide-y divide-line border-t border-line [@container_(min-width:34rem)_and_(max-width:54.99rem)]:grid-cols-3 [@container_(min-width:34rem)_and_(max-width:54.99rem)]:divide-x [@container_(min-width:34rem)_and_(max-width:54.99rem)]:divide-y-0 [@container_(min-width:34rem)_and_(max-width:54.99rem)]:pt-6 [@container_(min-width:55rem)]:contents">
            <Supporting column={0} label="Income" value={figures && amount(figures.incomeCents)} />
            <Supporting column={1} label="Expenses" value={figures && amount(figures.expensesCents)} />
            <Supporting column={2} label="Projects" value={figures && (figures.projects === null ? MISSING : String(figures.projects))} />
          </dl>
        </div>
      </div>
    </Card>
  );
}

/** Shown for a figure an older server does not send. */
const MISSING = '—';
const amount = (cents: number | null) => (cents === null ? MISSING : money(cents));

// From 55rem, where a supporting figure stands on the headline's grid: its
// label and its figure in the second, third or fourth column, and before them
// the rule that divides it from its neighbour. The rule is the wrapper's
// `::before`, which stays a box of the grid when the wrapper itself steps out.
const WIDE_COLUMN = [
  {
    cell: '[@container_(min-width:55rem)]:col-start-2',
    rule: '[@container_(min-width:55rem)]:before:col-start-2',
  },
  {
    cell: '[@container_(min-width:55rem)]:col-start-3',
    rule: '[@container_(min-width:55rem)]:before:col-start-3',
  },
  {
    cell: '[@container_(min-width:55rem)]:col-start-4',
    rule: '[@container_(min-width:55rem)]:before:col-start-4',
  },
];

function Supporting({ column, label, value }: { column: 0 | 1 | 2; label: string; value: string | null }) {
  const wide = WIDE_COLUMN[column]!;
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-3',
        '[@container_(min-width:34rem)_and_(max-width:54.99rem)]:block [@container_(min-width:34rem)_and_(max-width:54.99rem)]:px-6 [@container_(min-width:34rem)_and_(max-width:54.99rem)]:py-0 [@container_(min-width:34rem)_and_(max-width:54.99rem)]:first:pl-0 [@container_(min-width:34rem)_and_(max-width:54.99rem)]:last:pr-0',
        // The rule runs from the labels' row to the foot of the figures' row.
        "[@container_(min-width:55rem)]:contents [@container_(min-width:55rem)]:before:row-start-2 [@container_(min-width:55rem)]:before:row-end-4 [@container_(min-width:55rem)]:before:self-stretch [@container_(min-width:55rem)]:before:border-l [@container_(min-width:55rem)]:before:border-line [@container_(min-width:55rem)]:before:content-['']",
        wide.rule,
      )}
    >
      <dt
        className={cn(
          'text-xs font-medium uppercase tracking-widest text-charcoal-muted [@container_(min-width:55rem)]:row-start-2 [@container_(min-width:55rem)]:pl-6',
          wide.cell,
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          'figure whitespace-nowrap text-lg font-medium text-charcoal [@container_(min-width:34rem)_and_(max-width:54.99rem)]:mt-2 [@container_(min-width:34rem)]:text-xl [@container_(min-width:55rem)]:row-start-3 [@container_(min-width:55rem)]:pl-6',
          wide.cell,
        )}
      >
        {/* On the figure's baseline, in the figure's line: the label beside or above it stays where it will be. */}
        {value ?? <Skeleton className="inline-block h-5 w-24 align-baseline" />}
      </dd>
    </div>
  );
}
