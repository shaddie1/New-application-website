/**
 * How a change from the earlier period reads, kept free of React so the rule
 * can be tested without a DOM. The chip in a stat tile colours itself by it:
 *
 *   up    teal    a rise is good news
 *   down  coral   a fall; it is not an error, so never red
 *   flat  grey    0%, with no arrow
 *   none  grey    there is no earlier figure to compare with
 *
 * Red is kept for a genuinely bad state, which a tile shows on the figure
 * itself (a net loss), not on its change.
 */
export type ChangeTone = 'up' | 'down' | 'flat' | 'none';

export function changeTone(percent: number | null | undefined): ChangeTone {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return 'none';
  if (percent === 0) return 'flat';
  return percent > 0 ? 'up' : 'down';
}

// A badge is a light tint with the deep shade of the same colour as its text.
// The class names are written whole so that Tailwind finds them.
const CHIP: Record<ChangeTone, string> = {
  up: 'bg-positive-tint text-positive',
  down: 'bg-overdue-tint text-overdue',
  flat: 'bg-mist text-charcoal-muted',
  none: 'bg-mist text-charcoal-muted',
};

/** The chip's background and text colour for a tone. Its arrow and its words carry the meaning too. */
export function changeChipClass(tone: ChangeTone): string {
  return CHIP[tone];
}
