import type { Session } from '@onyxhawk/types';

/**
 * Mirrors the API's access rules — the server is the authority; this only
 * shapes the UI.
 */

// ── Compliance checklist (mirrors routes/compliance.ts) ─────────────────────

const COMPLIANCE_READ_ROLES = ['COO', 'BUSINESS_DEVELOPMENT_LEAD', 'MARKETING', 'FINANCIAL_MANAGER'];

export function canViewCompliance(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || COMPLIANCE_READ_ROLES.includes(session.user.role));
}

export function canEditReadinessFlags(session: Session | null | undefined): boolean {
  return !!session && (session.user.isOwner === true || session.user.role === 'COO');
}
