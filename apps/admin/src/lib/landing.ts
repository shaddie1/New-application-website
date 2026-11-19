/**
 * Where a staff account lands when it signs in, and who reads Insights.
 *
 * There is no Dashboard page (owner's choice, 2026-11-18). The owner and the
 * admins land on Insights, which has the full figures; everyone else lands on
 * Projects. The roles that saw the month's figures on the Dashboard read them
 * on Insights.
 */
import { hasOwnerAccess } from './roles';

type Viewer = { isOwner?: boolean; role: string };

/** Besides the owner, the roles the server gives the month's figures and revenue split to. */
const MONTH_FIGURE_ROLES = ['ADMIN', 'FINANCIAL_MANAGER', 'SHAREHOLDER'];

/** Besides the owner, the roles that set the month's targets. A shareholder sees them only. */
const TARGET_SETTER_ROLES = ['ADMIN', 'FINANCIAL_MANAGER'];

export function canSeeInsights(viewer: Viewer): boolean {
  return viewer.isOwner === true || MONTH_FIGURE_ROLES.includes(viewer.role);
}

export function maySetTargets(viewer: Viewer): boolean {
  return viewer.isOwner === true || TARGET_SETTER_ROLES.includes(viewer.role);
}

export function landingPath(viewer: Viewer): '/insights' | '/projects' {
  return hasOwnerAccess(viewer) ? '/insights' : '/projects';
}
