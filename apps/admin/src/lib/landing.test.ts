import { describe, expect, it } from 'vitest';

import { canSeeInsights, landingPath, maySetTargets } from './landing';

const owner = { isOwner: true, role: 'ADMIN' };
const as = (role: string) => ({ isOwner: false, role });

describe('landingPath', () => {
  it('sends the owner and every admin to Insights', () => {
    expect(landingPath(owner)).toBe('/insights');
    expect(landingPath(as('ADMIN'))).toBe('/insights');
  });

  it('sends every other staff role to Projects', () => {
    for (const role of ['FINANCIAL_MANAGER', 'SHAREHOLDER', 'COO', 'SUPPORT', 'MARKETING', 'CLEANING_SUPERVISOR']) {
      expect(landingPath(as(role))).toBe('/projects');
    }
  });
});

describe('canSeeInsights', () => {
  it('lets the owner and the roles that saw the month on the Dashboard read Insights', () => {
    expect(canSeeInsights(owner)).toBe(true);
    for (const role of ['ADMIN', 'FINANCIAL_MANAGER', 'SHAREHOLDER']) expect(canSeeInsights(as(role))).toBe(true);
  });

  it('keeps it from the roles the server gives no month figures to', () => {
    for (const role of ['COO', 'SUPPORT', 'MARKETING', 'CLEANING_SUPERVISOR']) expect(canSeeInsights(as(role))).toBe(false);
  });
});

describe('maySetTargets', () => {
  it('lets the owner, an admin and the financial manager set targets, as the Dashboard did', () => {
    expect(maySetTargets(owner)).toBe(true);
    expect(maySetTargets(as('ADMIN'))).toBe(true);
    expect(maySetTargets(as('FINANCIAL_MANAGER'))).toBe(true);
  });

  it('shows a shareholder the targets without the form', () => {
    expect(maySetTargets(as('SHAREHOLDER'))).toBe(false);
    expect(maySetTargets(as('COO'))).toBe(false);
  });
});
