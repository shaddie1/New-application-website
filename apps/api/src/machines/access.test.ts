import { UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { isBackOfficeAccount, machinesAccess } from './access.js';

// Who may see the machine register and who may change it. The owner and the
// admins see and change. The financial manager and the COO see. Any other
// back-office account sees only while it is linked to a current shareholder
// record. Nobody else changes anything.

const account = (role: UserRole, over: { isOwner?: boolean; isHolder?: boolean } = {}) => ({
  role, isOwner: false, isHolder: false, ...over,
});

const SEES_AND_CHANGES = { canView: true, canEdit: true };
const SEES = { canView: true, canEdit: false };
const NOTHING = { canView: false, canEdit: false };

describe('machinesAccess', () => {
  it.each([
    ['the owner', account(UserRole.ADMIN, { isOwner: true }), SEES_AND_CHANGES],
    ['the owner, also a shareholder', account(UserRole.ADMIN, { isOwner: true, isHolder: true }), SEES_AND_CHANGES],
    ['an admin', account(UserRole.ADMIN), SEES_AND_CHANGES],
    ['an admin, also a shareholder', account(UserRole.ADMIN, { isHolder: true }), SEES_AND_CHANGES],
    ['the financial manager', account(UserRole.FINANCIAL_MANAGER), SEES],
    ['the COO', account(UserRole.COO), SEES],
    ['the COO, also a shareholder', account(UserRole.COO, { isHolder: true }), SEES],
    ['support', account(UserRole.SUPPORT), NOTHING],
    ['marketing', account(UserRole.MARKETING), NOTHING],
    ['a supervisor', account(UserRole.CLEANING_SUPERVISOR), NOTHING],
    ['the Shareholder role with no shareholder record', account(UserRole.SHAREHOLDER), NOTHING],
    ['support linked to a current shareholder', account(UserRole.SUPPORT, { isHolder: true }), SEES],
    ['marketing linked to a current shareholder', account(UserRole.MARKETING, { isHolder: true }), SEES],
    ['a supervisor linked to a current shareholder', account(UserRole.CLEANING_SUPERVISOR, { isHolder: true }), SEES],
    ['the Shareholder role linked to a current shareholder', account(UserRole.SHAREHOLDER, { isHolder: true }), SEES],
    ['a customer', account(UserRole.CUSTOMER), NOTHING],
    ['crew', account(UserRole.CREW), NOTHING],
    ['a crew lead', account(UserRole.CREW_LEAD), NOTHING],
    // Removing a staff member resets the role to customer and leaves the shareholder link in place.
    ['a linked shareholder whose role was reset to customer', account(UserRole.CUSTOMER, { isHolder: true }), NOTHING],
    ['crew linked to a current shareholder', account(UserRole.CREW, { isHolder: true }), NOTHING],
  ])('%s', (_who, who, expected) => {
    expect(machinesAccess(who)).toEqual(expected);
  });
});

describe('isBackOfficeAccount', () => {
  it.each([
    UserRole.ADMIN, UserRole.SUPPORT, UserRole.FINANCIAL_MANAGER, UserRole.MARKETING, UserRole.CLEANING_SUPERVISOR,
    UserRole.SHAREHOLDER, UserRole.COO,
  ])('%s signs in at the back-office', (role) => {
    expect(isBackOfficeAccount(account(role))).toBe(true);
  });

  it.each([UserRole.CUSTOMER, UserRole.CREW, UserRole.CREW_LEAD])('%s does not', (role) => {
    expect(isBackOfficeAccount(account(role))).toBe(false);
  });

  it('the owner does, whatever the role says', () => {
    expect(isBackOfficeAccount(account(UserRole.CUSTOMER, { isOwner: true }))).toBe(true);
  });
});
