import type { DashboardSection } from '@onyxhawk/types';

/**
 * What the Dashboard does about a `#trend` at the end of its address, which is
 * where `/insights` sends its visitors. Kept free of React and of the browser
 * so it can be tested without a DOM; the Dashboard page asks it and acts.
 *
 * The browser's own jump to a fragment cannot serve here: when the page opens
 * the trend section is not built yet, and once it is, the sections above it
 * are still changing height as their figures land. So the page makes the jump
 * itself, once, when those sections have settled.
 */

/** The fragment that names the trend section, whose element has the id `trend`. */
const TREND_FRAGMENT = '#trend';

/** The sections the page draws above the trend. */
const ABOVE_TREND: DashboardSection[] = ['attention', 'month'];

export type HashScrollStep =
  /** Too early to say: ask again when the access list or a section above the trend has answered. */
  | 'wait'
  /** Bring the trend section to the top of the window and move focus to it. */
  | 'scroll'
  /** The account has no trend section: take the fragment off the address and stay at the top. */
  | 'drop-fragment'
  | 'nothing';

export type HashScrollQuestion = {
  /** The end of the address as the browser gives it: `''`, or `'#trend'`. */
  fragment: string;
  /** The sections the page has built, or null while the access list has not said. */
  sections: readonly DashboardSection[] | null;
  /** The built sections that have left loading: their figures, or their error, are on screen. */
  settled: ReadonlySet<DashboardSection>;
  /** What the last answer gave as `done`; false on the first ask of a visit. */
  done: boolean;
};

/**
 * The step to take now, and whether the matter is closed for this visit. Hand
 * `done` back with the next question: once it is true every answer is
 * 'nothing', so a later change of month never moves the page again.
 */
export function hashScrollStep({ fragment, sections, settled, done }: HashScrollQuestion): {
  step: HashScrollStep;
  done: boolean;
} {
  if (done || fragment !== TREND_FRAGMENT) return { step: 'nothing', done: true };
  if (sections === null) return { step: 'wait', done: false };
  if (!sections.includes('trend')) return { step: 'drop-fragment', done: true };

  const aboveSettled = ABOVE_TREND.every((section) => !sections.includes(section) || settled.has(section));
  return aboveSettled ? { step: 'scroll', done: true } : { step: 'wait', done: false };
}
