import type { Session } from '@onyxhawk/types';

/** Mirrors quotes/access.ts on the API — the server is the authority; this only shapes the UI. */
const ESTIMATE_ROLES = ['ADMIN', 'FINANCIAL_MANAGER', 'COO'];

/** May see the internal estimate (costs, margins, commission) and the rates card. */
export function canViewEstimate(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || ESTIMATE_ROLES.includes(session.user.role));
}

// ── Pipeline (mirrors pipeline/access.ts on the API) ───────────────────────

const PIPELINE_ROLES = ['COO', 'BUSINESS_DEVELOPMENT_LEAD', 'ADMIN', 'FINANCIAL_MANAGER'];

/** Sees every lead and the tenders. */
export function canViewPipeline(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || PIPELINE_ROLES.includes(session.user.role));
}

/** Marketing: household leads only, no tenders. */
export function householdOnly(session: Session | null | undefined): boolean {
  return !!session && !canViewPipeline(session) && session.user.role === 'MARKETING';
}

export function canViewTargets(session: Session | null | undefined): boolean {
  return canViewPipeline(session) || householdOnly(session);
}

export function canEditTargets(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || session.user.role === 'COO');
}

export function canMarkCommission(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || ['COO', 'ADMIN', 'FINANCIAL_MANAGER'].includes(session.user.role));
}

/** May approve or reject an estimate: the COO or the owner. */
export function canApproveEstimate(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || session.user.role === 'COO');
}
