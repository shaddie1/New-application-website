import { UserRole } from '@prisma/client';

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
