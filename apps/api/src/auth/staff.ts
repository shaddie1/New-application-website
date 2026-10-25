import { UserRole } from '@prisma/client';
import type { StaffRole } from '@onyxhawk/types';

/**
 * Roles that sign in at the back-office. Typed as the full UserRole so
 * `.has()` accepts any role, not just staff ones. The owner is an ADMIN with
 * isOwner set, so is covered here too.
 */
export const STAFF_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.SUPPORT,
  UserRole.FINANCIAL_MANAGER,
  UserRole.MARKETING,
  UserRole.CLEANING_SUPERVISOR,
  UserRole.SHAREHOLDER,
]);

/** How each staff role reads to people: the same labels as the admin Team page. */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: 'Admin',
  SUPPORT: 'Support',
  FINANCIAL_MANAGER: 'Financial Manager',
  MARKETING: 'Marketing Personnel',
  CLEANING_SUPERVISOR: 'Cleaning Supervisor',
  SHAREHOLDER: 'Shareholder',
};

/** The role to show for a staff account. The owner is an ADMIN with isOwner set, shown as "Owner" as on the Team page. */
export function staffRoleLabel(user: { role: string; isOwner: boolean }): string {
  if (user.isOwner) return 'Owner';
  return STAFF_ROLE_LABELS[user.role as StaffRole] ?? user.role;
}
