/**
 * The machine register's access list: who may see it and who may change it.
 * This is the only place that says so. The routes ask it through
 * machines/guards.ts and the admin app asks it through
 * GET /admin/machines/access; neither restates a role list.
 *
 * Pure: it is given the role, the owner flag and the shareholder link, and
 * reads nothing. guards.ts loads those three from the database.
 */
import { UserRole } from '@prisma/client';
import type { MachinesAccessDto } from '@onyxhawk/types';

import { hasOwnerAccess, STAFF_ROLES } from '../auth/staff.js';

export interface MachinesAccount {
  role: UserRole;
  isOwner: boolean;
  /** Linked to a shareholder record that is not removed. */
  isHolder: boolean;
}

/** The owner and the staff roles sign in at the back-office; a customer or crew account does not. */
export function isBackOfficeAccount(account: Pick<MachinesAccount, 'role' | 'isOwner'>): boolean {
  return account.isOwner || STAFF_ROLES.has(account.role);
}

/**
 * The roles that see the register by themselves. The Shareholder role is not
 * one of them: seeing as a shareholder follows the shareholder record, not the
 * role name.
 */
const VIEWER_ROLES = new Set<UserRole>([UserRole.ADMIN, UserRole.FINANCIAL_MANAGER, UserRole.COO]);

function canView(account: MachinesAccount): boolean {
  if (hasOwnerAccess(account)) return true;
  // Removing a staff member resets the role to customer and leaves any
  // shareholder link in place, so the link alone must not open the page.
  if (!isBackOfficeAccount(account)) return false;
  return VIEWER_ROLES.has(account.role) || account.isHolder;
}

export function machinesAccess(account: MachinesAccount): MachinesAccessDto {
  return {
    canView: canView(account),
    // Every entry here changes profit and payouts, so only the owner and admins make one.
    canEdit: hasOwnerAccess(account),
  };
}
