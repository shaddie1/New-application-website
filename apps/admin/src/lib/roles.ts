import type { Session } from '@onyxhawk/types';

/** Mirrors quotes/access.ts on the API — the server is the authority; this only shapes the UI. */
const ESTIMATE_ROLES = ['ADMIN', 'FINANCIAL_MANAGER', 'COO'];

/**
 * The owner's view and powers: the owner, and every Admin (owner's choice,
 * 2026-11-19). Mirrors hasOwnerAccess in the API's auth/staff.ts.
 */
export function hasOwnerAccess(user: { isOwner?: boolean; role: string }): boolean {
  return user.isOwner === true || user.role === 'ADMIN';
}

/** May see the internal estimate (costs, margins, commission) and the rates card. */
export function canViewEstimate(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || ESTIMATE_ROLES.includes(session.user.role));
}

/** May see what each project was charged, what it cost and its profit: the same people who see the estimate. */
export function canViewProjectMoney(session: Session | null | undefined): boolean {
  return canViewEstimate(session);
}

/** May approve or reject an estimate: the COO, the owner or an admin. */
export function canApproveEstimate(session: Session | null | undefined): boolean {
  return !!session && (hasOwnerAccess(session.user) || session.user.role === 'COO');
}
