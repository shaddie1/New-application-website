/**
 * How a change from the earlier period reads, kept free of React so the rule
 * can be tested without a DOM. The chip in a stat tile colours itself by it:
 *
 *   up    teal    a rise is good news
 *   down  amber   a decline needs attention; it is not an error, so never red
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
