import { cn } from '../../lib/cn';
import { money } from '../../lib/money';
import { chartColour, retainedFill } from './colours';
import type { SplitSegment } from './split';
import { formatPercentShort } from './stakes';

// The label inside a part: ink on a white chip, so it reads on any chart colour.
const chip = 'hidden items-center justify-center rounded-full bg-surface leading-none';
const initialsChip = `${chip} font-semibold text-charcoal`;
// Two sizes of chip, each shown over its own range of part widths, so a part
// of about a tenth of a phone-width bar still carries its initials.
const smallChip = `${initialsChip} h-[1.125rem] min-w-[1.125rem] px-0.5 text-[9px] [@container_(min-width:1.25rem)_and_(max-width:2.7499rem)]:flex`;
const largeChip = `${initialsChip} h-7 min-w-7 px-1.5 text-[11px] [@container_(min-width:2.75rem)]:flex`;

/**
 * The cap table as one bar: a part per holder, as wide as their stake, with
 * their initials inside when the part is wide enough to hold them. Each part
 * is a size container, so "wide enough" is decided by the part's own width
 * at any screen size. A sliver too thin for a chip has none; the table under
 * the bar names every holder. What the business retains is hatched, not
 * filled, so it is never read as one more holder.
 */
export function ShareBar({
  segments, amounts,
}: {
  segments: SplitSegment[];
  /** Each part's amount for the chosen scope, by segment key, for its tooltip. */
  amounts: Map<string, number>;
}) {
  const describe = (s: SplitSegment) => {
    const cents = amounts.get(s.key);
    return `${s.name}: ${formatPercentShort(s.basisPoints)}${cents === undefined ? '' : `, ${money(cents)}`}`;
  };

  return (
    <div
      role="img"
      aria-label={`Share split. ${segments.map(describe).join('. ')}.`}
      className="flex h-11 w-full gap-0.5 overflow-hidden rounded-lg"
    >
      {segments.map((s) => (
        <div
          key={s.key}
          title={describe(s)}
          style={{
            width: `${s.widthPercent}%`,
            ...(s.kind === 'retained' ? retainedFill : { backgroundColor: chartColour(s.colourIndex) }),
          }}
          className={cn(
            'flex min-w-0 items-center justify-center rounded-[3px] [container-type:inline-size]',
            // The hatched part is always last: its outline follows the bar's rounded end.
            s.kind === 'retained' && 'rounded-r-lg',
          )}
        >
          {s.kind === 'holder' ? (
            <>
              <span className={smallChip}>{s.initials}</span>
              <span className={largeChip}>{s.initials}</span>
            </>
          ) : (
            <span className={`${chip} h-7 border border-border-strong px-2.5 text-[11px] font-medium text-charcoal-muted [@container_(min-width:6rem)]:flex`}>
              {s.name}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
