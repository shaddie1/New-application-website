import { describe, expect, it } from 'vitest';
import type { EquityOverview, ShareholderDto } from '@onyxhawk/types';

import { DEFAULT_SCOPE, nairobiMonth, scopeFigures, type ReceivedEquityOverview } from './scope';

const holder = (id: string, name: string, basisPoints: number): ShareholderDto => ({
  id, name, title: null, kind: 'INDIVIDUAL', basisPoints, notes: null, userId: null, userName: null, sortOrder: 0,
});

const holdings = holder('h1', 'OnyxHawk Holdings', 4000);
const amina = holder('h2', 'Amina Yusuf', 3000);

// Stakes of 40% and 30%, so 30% of each net profit is unallocated. Every
// amount differs from every other, so a figure taken from the wrong scope
// cannot pass for the right one.
const overview: EquityOverview = {
  allocations: [
    { shareholder: holdings, periodShareCents: 460_000, allTimeShareCents: 3_600_000 },
    { shareholder: amina, periodShareCents: 345_000, allTimeShareCents: 2_700_000 },
  ],
  totalBasisPoints: 7000,
  unallocatedPeriodCents: 345_000,
  unallocatedAllTimeCents: 2_700_000,
  periodNetCents: 1_150_000,
  periodIncomeCents: 1_400_000,
  periodExpensesCents: 250_000,
  periodProjects: 2,
  fromDate: '2026-11-01',
  toDate: '2026-11-30',
  allTime: {
    totalProjects: 41,
    totalIncomeCents: 12_500_000,
    totalExpensesCents: 3_500_000,
    totalNetCents: 9_000_000,
    firstJobDate: '2025-03-02',
    lastJobDate: '2026-11-20',
  },
};

const ALL_TIME = {
  netCents: 9_000_000,
  incomeCents: 12_500_000,
  expensesCents: 3_500_000,
  projects: 41,
  holders: [
    { shareholder: holdings, shareCents: 3_600_000 },
    { shareholder: amina, shareCents: 2_700_000 },
  ],
  unallocatedCents: 2_700_000,
  footerNetCents: 9_000_000,
};

describe('scopeFigures', () => {
  it('gives the all-time figures when no scope is chosen', () => {
    expect(DEFAULT_SCOPE).toBe('all-time');
    expect(scopeFigures(overview)).toEqual(ALL_TIME);
  });

  it('gives every all-time figure, and none from the month, for "All time"', () => {
    expect(scopeFigures(overview, 'all-time')).toEqual(ALL_TIME);
  });

  it('gives every figure of the month, and none from all time, for "This month"', () => {
    expect(scopeFigures(overview, 'this-month')).toEqual({
      netCents: 1_150_000,
      incomeCents: 1_400_000,
      expensesCents: 250_000,
      projects: 2,
      holders: [
        { shareholder: holdings, shareCents: 460_000 },
        { shareholder: amina, shareCents: 345_000 },
      ],
      unallocatedCents: 345_000,
      footerNetCents: 1_150_000,
    });
  });

  it("has no income, expenses or count for the month when an older server does not send them", () => {
    const { periodIncomeCents: _i, periodExpensesCents: _e, periodProjects: _p, ...older } = overview;
    const received: ReceivedEquityOverview = older;

    const month = scopeFigures(received, 'this-month');
    expect(month.incomeCents).toBeNull();
    expect(month.expensesCents).toBeNull();
    expect(month.projects).toBeNull();
    // What that server does send still shows.
    expect(month.netCents).toBe(1_150_000);
    expect(month.holders.map((h) => h.shareCents)).toEqual([460_000, 345_000]);

    expect(scopeFigures(received, 'all-time')).toEqual(ALL_TIME);
  });
});

describe('nairobiMonth', () => {
  it('gives the first and last day of the month, and its name', () => {
    expect(nairobiMonth(new Date('2026-11-12T09:00:00Z'))).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
      label: 'November 2026',
    });
  });

  it('goes by the date in Nairobi, three hours ahead of UTC', () => {
    // 22:00 UTC on 31 October is 01:00 on 1 November in Nairobi.
    expect(nairobiMonth(new Date('2026-10-31T22:00:00Z'))).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
    // 20:59 UTC is 23:59 in Nairobi: still October.
    expect(nairobiMonth(new Date('2026-10-31T20:59:00Z'))).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('ends February on the 29th in a leap year and the 28th otherwise', () => {
    expect(nairobiMonth(new Date('2028-02-10T09:00:00Z')).to).toBe('2028-02-29');
    expect(nairobiMonth(new Date('2027-02-10T09:00:00Z')).to).toBe('2027-02-28');
  });

  it('crosses the year end with Nairobi', () => {
    expect(nairobiMonth(new Date('2026-12-31T21:30:00Z'))).toEqual({
      from: '2027-01-01',
      to: '2027-01-31',
      label: 'January 2027',
    });
  });
});
