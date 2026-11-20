import { describe, expect, it } from 'vitest';

import { marketingFundOf, marketingSetAsideCents, splitByStake, type DeclaredRow } from './split.js';

describe('marketingFundOf', () => {
  const row = (periodStart: string, periodEnd: string, marketingCents: number, status: DeclaredRow['status'] = 'PENDING'): DeclaredRow => ({
    label: periodStart.slice(0, 7),
    periodStart,
    periodEnd,
    marketingCents,
    status,
  });

  it('counts each period once and takes off spend from the first set-aside on', () => {
    const fund = marketingFundOf(
      [
        row('2026-11-01', '2026-11-30', 20_000), // two shareholders' rows of one period
        row('2026-11-01', '2026-11-30', 20_000, 'PAID'),
        row('2026-12-01', '2026-12-31', 5_000),
        row('2026-10-01', '2026-10-31', 0), // declared before the rule
      ],
      [
        { date: '2026-10-15', amountCents: 9_000 }, // before the fund
        { date: '2026-11-20', amountCents: 7_000 },
      ],
    );
    expect(fund).toEqual({
      setAsideCents: 25_000,
      spentCents: 7_000,
      balanceCents: 18_000,
      sinceDate: '2026-11-01',
      periods: [
        { label: '2026-12', periodStart: '2026-12-01', periodEnd: '2026-12-31', marketingCents: 5_000 },
        { label: '2026-11', periodStart: '2026-11-01', periodEnd: '2026-11-30', marketingCents: 20_000 },
      ],
    });
  });

  it('leaves out a period whose rows are all cancelled', () => {
    const fund = marketingFundOf([row('2026-11-01', '2026-11-30', 20_000, 'CANCELLED')], [{ date: '2026-11-20', amountCents: 7_000 }]);
    expect(fund).toEqual({ setAsideCents: 0, spentCents: 0, balanceCents: 0, sinceDate: null, periods: [] });
  });
});

describe('marketingSetAsideCents', () => {
  it('sets aside 5% of a profit', () => {
    // The owner's example: profit KSh 4,000 sets aside KSh 200.
    expect(marketingSetAsideCents(400_000)).toBe(20_000);
  });

  it('sets nothing aside for a loss or a zero', () => {
    expect(marketingSetAsideCents(-150_000)).toBe(0);
    expect(marketingSetAsideCents(0)).toBe(0);
  });

  it('rounds to the nearest cent', () => {
    expect(marketingSetAsideCents(1_010)).toBe(51); // 50.5
    expect(marketingSetAsideCents(1_009)).toBe(50); // 50.45
  });
});

describe('splitByStake', () => {
  it("splits the owner's example by 50%, 30% and 20%", () => {
    // KSh 3,800 shared after marketing, and KSh 5,000 of costs paid in.
    expect(splitByStake(380_000, [5_000, 3_000, 2_000])).toEqual({ shares: [190_000, 114_000, 76_000], unallocatedCents: 0 });
    expect(splitByStake(500_000, [5_000, 3_000, 2_000])).toEqual({ shares: [250_000, 150_000, 100_000], unallocatedCents: 0 });
  });

  it('gives the rounding cents to the largest fractions so the shares add up', () => {
    const { shares, unallocatedCents } = splitByStake(100, [3_333, 3_333, 3_334]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(unallocatedCents).toBe(0);
  });

  it('leaves what stakes under 100% do not cover to the company', () => {
    expect(splitByStake(100_000, [5_000, 3_000])).toEqual({ shares: [50_000, 30_000], unallocatedCents: 20_000 });
  });

  it('keeps everything with the company when there are no stakes', () => {
    expect(splitByStake(100_000, [])).toEqual({ shares: [], unallocatedCents: 100_000 });
  });
});
