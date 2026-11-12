import { UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { STAFF_ROLES } from '../auth/staff.js';
import { dashboardAccess } from './access.js';

// The access list: which of the Dashboard's five sections an account sees,
// whether it may set targets and whether it manages ownership.

const ROLES = Object.values(UserRole);
const FLAGS = [false, true];

/** The sections of a staff member who is not the owner. */
const sectionsOf = (role: UserRole, isHolder = false) => dashboardAccess({ role, isOwner: false, isHolder }).sections;

describe('dashboardAccess', () => {
  it.each(ROLES)('gives an owner all five sections, whatever the role: %s', (role) => {
    for (const isHolder of FLAGS) {
      expect(dashboardAccess({ role, isOwner: true, isHolder }).sections).toEqual([
        'attention', 'month', 'trend', 'breakdown', 'ownership',
      ]);
    }
  });

  it.each([UserRole.ADMIN, UserRole.COO])('gives %s needs attention, this month, the trend and the breakdown', (role) => {
    expect(sectionsOf(role)).toEqual(['attention', 'month', 'trend', 'breakdown']);
  });

  it('gives FINANCIAL_MANAGER this month, the trend and the breakdown', () => {
    expect(sectionsOf(UserRole.FINANCIAL_MANAGER)).toEqual(['month', 'trend', 'breakdown']);
  });

  it.each([UserRole.SUPPORT, UserRole.CLEANING_SUPERVISOR, UserRole.MARKETING])('gives %s needs attention only', (role) => {
    expect(sectionsOf(role)).toEqual(['attention']);
  });

  it('gives the SHAREHOLDER role no section by itself', () => {
    expect(sectionsOf(UserRole.SHAREHOLDER)).toEqual([]);
  });

  it.each([...STAFF_ROLES])('adds ownership for %s linked to a shareholder record, and removes nothing', (role) => {
    expect(sectionsOf(role, true)).toEqual([...sectionsOf(role), 'ownership']);
  });

  it.each([UserRole.CUSTOMER, UserRole.CREW, UserRole.CREW_LEAD])(
    'gives %s no section and both answers false, linked or not',
    (role) => {
      for (const isHolder of FLAGS) {
        expect(dashboardAccess({ role, isOwner: false, isHolder })).toEqual({
          sections: [],
          canSetTargets: false,
          canManageOwnership: false,
          holder: isHolder ? 'linked' : 'not-linked',
        });
      }
    },
  );

  it('says whether the account is linked to a shareholder record', () => {
    expect(dashboardAccess({ role: UserRole.COO, isOwner: false, isHolder: true }).holder).toBe('linked');
    expect(dashboardAccess({ role: UserRole.COO, isOwner: false, isHolder: false }).holder).toBe('not-linked');
  });

  describe.each(ROLES)('for every combination of owner flag and holder link, as %s', (role) => {
    const every = FLAGS.flatMap((isOwner) => FLAGS.map((isHolder) => ({ isOwner, isHolder })));

    it('lets an account set targets exactly when it sees this month', () => {
      for (const flags of every) {
        const access = dashboardAccess({ role, ...flags });
        expect(access.canSetTargets).toBe(access.sections.includes('month'));
      }
    });

    it('lets only the owner manage ownership', () => {
      for (const flags of every) {
        expect(dashboardAccess({ role, ...flags }).canManageOwnership).toBe(flags.isOwner);
      }
    });

    // One response serves both sections, so neither may admit an account the other refuses.
    it('admits the same accounts to this month and to the trend', () => {
      for (const flags of every) {
        const { sections } = dashboardAccess({ role, ...flags });
        expect(sections.includes('trend')).toBe(sections.includes('month'));
      }
    });
  });

  it('lets ADMIN, COO and FINANCIAL_MANAGER set targets, and no other role', () => {
    const setters = ROLES.filter((role) => dashboardAccess({ role, isOwner: false, isHolder: true }).canSetTargets);
    expect(setters.sort()).toEqual([UserRole.ADMIN, UserRole.COO, UserRole.FINANCIAL_MANAGER]);
  });
});
