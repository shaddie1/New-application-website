/**
 * The Dashboard's access list: which of its five sections an account sees,
 * whether it may set monthly targets and whether it manages ownership. This is
 * the only place that says so. The routes ask it through dashboard/guards.ts
 * and the admin app asks it through GET /admin/dashboard/access; neither
 * restates a role list.
 *
 * Pure: it is given the role, the owner flag and the shareholder link, and
 * reads nothing. guards.ts loads those three from the database.
 */
import { UserRole } from '@prisma/client';
import type { DashboardAccess, DashboardSection } from '@onyxhawk/types';

import { STAFF_ROLES } from '../auth/staff.js';

export interface DashboardAccount {
  role: UserRole;
  isOwner: boolean;
  /** Linked to a current shareholder record. */
  isHolder: boolean;
}

/** The sections in the order the page draws them. */
const SECTIONS: readonly DashboardSection[] = ['attention', 'month', 'trend', 'breakdown', 'ownership'];

/**
 * What each staff role sees by itself. `month` and `trend` always go together:
 * one response serves both. The Shareholder role grants nothing, because the
 * ownership summary follows the shareholder record, not the role.
 */
const ROLE_SECTIONS: Partial<Record<UserRole, readonly DashboardSection[]>> = {
  [UserRole.ADMIN]: ['attention', 'month', 'trend', 'breakdown'],
  [UserRole.COO]: ['attention', 'month', 'trend', 'breakdown'],
  [UserRole.FINANCIAL_MANAGER]: ['month', 'trend', 'breakdown'],
  [UserRole.SUPPORT]: ['attention'],
  [UserRole.CLEANING_SUPERVISOR]: ['attention'],
  [UserRole.MARKETING]: ['attention'],
  [UserRole.SHAREHOLDER]: [],
};

/** The owner and the staff roles have a Dashboard; a customer or crew account has none. */
export function isBackOfficeAccount(account: Pick<DashboardAccount, 'role' | 'isOwner'>): boolean {
  return account.isOwner || STAFF_ROLES.has(account.role);
}

function sectionsFor(account: DashboardAccount): DashboardSection[] {
  if (account.isOwner) return [...SECTIONS];
  // Removing a staff member resets the role to customer and leaves any
  // shareholder link in place, so the link alone must not open anything.
  if (!isBackOfficeAccount(account)) return [];
  const granted = new Set<DashboardSection>(ROLE_SECTIONS[account.role]);
  if (account.isHolder) granted.add('ownership');
  return SECTIONS.filter((section) => granted.has(section));
}

export function dashboardAccess(account: DashboardAccount): DashboardAccess {
  const sections = sectionsFor(account);
  return {
    sections,
    // Everyone who sees "This month" can set its targets.
    canSetTargets: sections.includes('month'),
    canManageOwnership: account.isOwner,
    holder: account.isHolder ? 'linked' : 'not-linked',
  };
}
