import type { ShareholderDto } from '@onyxhawk/types';

import { initials } from './initials';
import { BASIS_POINTS_TOTAL } from './stakes';

/**
 * How many holders get a colour of their own. A holder's colour is their
 * position in the cap table, the rule the Dashboard's profit-share chart
 * follows too; those past the fifth share the neutral colour and are still
 * named wherever they appear.
 */
export const COLOURED_HOLDERS = 5;

/** The chart colour for a position in the cap table, counted from 0. Null is the neutral colour. */
export function colourIndexOf(position: number): number | null {
  return position < COLOURED_HOLDERS ? position : null;
}

export const RETAINED_SEGMENT = '__retained';

/** One part of the share bar. */
export type SplitSegment = {
  key: string;
  kind: 'holder' | 'retained';
  name: string;
  /** Empty for the retained part, which is nobody's. */
  initials: string;
  basisPoints: number;
  /** Of the whole bar. */
  widthPercent: number;
  colourIndex: number | null;
};

/**
 * The parts of the share bar, in table order. Widths follow the stakes, not
 * the amounts, so the bar reads the same in any scope. What the stakes leave
 * uncovered is one "Retained" part at the end; stakes that total more than
 * 100% are scaled to fill the bar exactly.
 */
export function splitSegments(holders: Pick<ShareholderDto, 'id' | 'name' | 'basisPoints'>[]): SplitSegment[] {
  if (holders.length === 0) return [];
  const total = holders.reduce((acc, h) => acc + h.basisPoints, 0);
  const whole = Math.max(total, BASIS_POINTS_TOTAL);
  const widthOf = (basisPoints: number) => (basisPoints / whole) * 100;

  const segments: SplitSegment[] = [];
  holders.forEach((h, position) => {
    if (h.basisPoints <= 0) return;
    segments.push({
      key: h.id,
      kind: 'holder',
      name: h.name,
      initials: initials(h.name),
      basisPoints: h.basisPoints,
      widthPercent: widthOf(h.basisPoints),
      colourIndex: colourIndexOf(position),
    });
  });

  if (total < BASIS_POINTS_TOTAL) {
    const basisPoints = BASIS_POINTS_TOTAL - total;
    segments.push({
      key: RETAINED_SEGMENT,
      kind: 'retained',
      name: 'Retained',
      initials: '',
      basisPoints,
      widthPercent: widthOf(basisPoints),
      colourIndex: null,
    });
  }
  return segments;
}
