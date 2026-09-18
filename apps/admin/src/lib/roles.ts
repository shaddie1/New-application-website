import type { Session } from '@onyxhawk/types';

/**
 * Mirrors the API's access rules — the server is the authority; this only
 * shapes the UI.
 */

// ── Probation tracker (mirrors routes/probation.ts) ─────────────────────────

/** The COO, the CEO (owner) and the two trainees. */
export function canViewProbation(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || ['COO', 'MARKETING', 'BUSINESS_DEVELOPMENT_LEAD'].includes(session.user.role));
}
