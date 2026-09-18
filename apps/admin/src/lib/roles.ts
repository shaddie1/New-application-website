import type { Session } from '@onyxhawk/types';

/** Mirrors quotes/access.ts on the API — the server is the authority; this only shapes the UI. */
const ESTIMATE_ROLES = ['ADMIN', 'FINANCIAL_MANAGER', 'COO'];

/** May see the internal estimate (costs, margins, commission) and the rates card. */
export function canViewEstimate(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || ESTIMATE_ROLES.includes(session.user.role));
}

/** May approve or reject an estimate: the COO or the owner. */
export function canApproveEstimate(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || session.user.role === 'COO');
}
