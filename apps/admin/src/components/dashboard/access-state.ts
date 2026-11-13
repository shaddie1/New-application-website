import type { DashboardAccess, DashboardSection } from '@onyxhawk/types';

import type { Block } from './block-state';

/**
 * What the Dashboard does with the server's answers about access, kept free
 * of React so it can be tested without a DOM. The page asks which sections
 * the account has before it builds anything (`accessView`), and asks again,
 * once for each section, when a section it built is refused (`sectionRefusal`).
 */

/** What the page shows for the access answer as it stands. */
export type AccessView =
  /** No answer yet: the greeting and a neutral skeleton. */
  | { kind: 'loading' }
  /** The server does not know the access address: it is older than this page. Say so, with Retry. */
  | { kind: 'being-updated' }
  /** The server faulted or could not be reached: "Could not load", with Retry. */
  | { kind: 'failed' }
  /**
   * The account is not a staff account. Sign it out, then send it to the
   * sign-in page: a plain redirect would bounce back, because the sign-in
   * page returns a session whose cached role is staff to the Dashboard.
   */
  | { kind: 'sign-out' }
  /** A staff account with no section: the note that it is not linked to a shareholder record. */
  | { kind: 'not-linked' }
  /** Build these sections and no others. */
  | { kind: 'sections'; sections: DashboardSection[]; canSetTargets: boolean; canManageOwnership: boolean };

export function accessView(access: Block<DashboardAccess>): AccessView {
  if (access.status === 'loading') return { kind: 'loading' };

  if (access.status === 'failed') {
    if (access.httpStatus === 403) return { kind: 'sign-out' };
    if (access.httpStatus === 404) return { kind: 'being-updated' };
    return { kind: 'failed' };
  }

  // While access is asked for again the last answer stays, so the page keeps
  // its sections until the new one says otherwise.
  const { sections, canSetTargets, canManageOwnership } = access.data;
  if (sections.length === 0) return { kind: 'not-linked' };
  return { kind: 'sections', sections, canSetTargets, canManageOwnership };
}

/**
 * The sections whose refusal has already sent the page back to the access
 * list. The page keeps one of these for the visit, starting from
 * `NO_SECTION_RE_ASKED` and adding with `withReAsked`.
 */
export type ReAskedSections = ReadonlySet<DashboardSection>;

export const NO_SECTION_RE_ASKED: ReAskedSections = new Set<DashboardSection>();

/** `reAsked` with `section` added. The same set comes back when it is already there, so setting it as state again changes nothing. */
export function withReAsked(reAsked: ReAskedSections, section: DashboardSection): ReAskedSections {
  return reAsked.has(section) ? reAsked : new Set([...reAsked, section]);
}

/**
 * What a section's block asks of the page:
 *
 *   'none'              it has not failed
 *   'ask-access-again'  the server refused it (403) and the page has not yet
 *                       asked the access list again on this section's account:
 *                       add the section with `withReAsked`, retry the access
 *                       block, and rebuild from its answer
 *   'section-error'     show the section's own error with Retry: the failure
 *                       is an outage, or a refusal that has come again after
 *                       the re-ask, which is what keeps the page from asking
 *                       in a loop
 */
export type SectionRefusal = 'none' | 'ask-access-again' | 'section-error';

export function sectionRefusal(
  block: Block<unknown>,
  section: DashboardSection,
  reAsked: ReAskedSections,
): SectionRefusal {
  if (block.status !== 'failed') return 'none';
  if (block.httpStatus === 403 && !reAsked.has(section)) return 'ask-access-again';
  return 'section-error';
}
