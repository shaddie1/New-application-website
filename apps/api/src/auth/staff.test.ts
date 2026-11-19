import { describe, expect, it } from 'vitest';

import { canApprove } from '../quotes/access.js';
import { hasOwnerAccess, staffRoleLabel } from './staff.js';

describe('staffRoleLabel', () => {
  it('reads each role the way the Team page shows it', () => {
    expect(staffRoleLabel({ role: 'MARKETING', isOwner: false })).toBe('Marketing Personnel');
    expect(staffRoleLabel({ role: 'FINANCIAL_MANAGER', isOwner: false })).toBe('Financial Manager');
    expect(staffRoleLabel({ role: 'CLEANING_SUPERVISOR', isOwner: false })).toBe('Cleaning Supervisor');
  });

  it('shows the owner as Owner, whatever their underlying role', () => {
    expect(staffRoleLabel({ role: 'ADMIN', isOwner: true })).toBe('Owner');
  });

  it('falls back to the raw role for one it does not know', () => {
    expect(staffRoleLabel({ role: 'CREW', isOwner: false })).toBe('CREW');
  });
});

describe('hasOwnerAccess', () => {
  it('is the owner and every admin', () => {
    expect(hasOwnerAccess({ role: 'ADMIN', isOwner: true })).toBe(true);
    expect(hasOwnerAccess({ role: 'ADMIN', isOwner: false })).toBe(true);
  });

  it.each(['FINANCIAL_MANAGER', 'COO', 'SHAREHOLDER', 'SUPPORT', 'MARKETING', 'CLEANING_SUPERVISOR', 'CUSTOMER', 'CREW'])(
    'is not %s',
    (role) => {
      expect(hasOwnerAccess({ role, isOwner: false })).toBe(false);
    },
  );

  it('lets an admin approve a quote, as the owner and the COO can', () => {
    expect(canApprove({ role: 'ADMIN', isOwner: false } as never)).toBe(true);
    expect(canApprove({ role: 'COO', isOwner: false } as never)).toBe(true);
    expect(canApprove({ role: 'FINANCIAL_MANAGER', isOwner: false } as never)).toBe(false);
  });
});
