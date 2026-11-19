import type { Session } from '@onyxhawk/types';
import { describe, expect, it } from 'vitest';

import { canApproveEstimate, hasOwnerAccess } from './roles';

const session = (role: string, isOwner = false) => ({ user: { role, isOwner } }) as unknown as Session;

describe('hasOwnerAccess', () => {
  it('is the owner and every admin', () => {
    expect(hasOwnerAccess({ role: 'ADMIN', isOwner: true })).toBe(true);
    expect(hasOwnerAccess({ role: 'ADMIN', isOwner: false })).toBe(true);
  });

  it('is no other staff role', () => {
    for (const role of ['FINANCIAL_MANAGER', 'COO', 'SHAREHOLDER', 'SUPPORT', 'MARKETING', 'CLEANING_SUPERVISOR']) {
      expect(hasOwnerAccess({ role, isOwner: false })).toBe(false);
    }
  });
});

describe('canApproveEstimate', () => {
  it('is the owner, an admin or the COO', () => {
    expect(canApproveEstimate(session('ADMIN', true))).toBe(true);
    expect(canApproveEstimate(session('ADMIN'))).toBe(true);
    expect(canApproveEstimate(session('COO'))).toBe(true);
    expect(canApproveEstimate(session('FINANCIAL_MANAGER'))).toBe(false);
    expect(canApproveEstimate(null)).toBe(false);
  });
});
