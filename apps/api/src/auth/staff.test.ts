import { describe, expect, it } from 'vitest';

import { staffRoleLabel } from './staff.js';

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
