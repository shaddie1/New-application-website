import { describe, expect, it } from 'vitest';

import { projectHoldersOf } from './holders.js';

const A = { id: 'a', name: 'A', basisPoints: 5_000 };
const B = { id: 'b', name: 'B', basisPoints: 3_000 };
const C = { id: 'c', name: 'C', basisPoints: 2_000 };

describe('projectHoldersOf', () => {
  it("works out the owner's example: KSh 4,000 profit, 5,000 paid in", () => {
    const result = projectHoldersOf(400_000, [A, B, C], [
      { shareholderId: 'a', name: 'A', amountCents: 250_000 },
      { shareholderId: 'b', name: 'B', amountCents: 150_000 },
      { shareholderId: 'c', name: 'C', amountCents: 100_000 },
    ]);

    expect(result).toEqual({
      marketingCents: 20_000,
      sharedCents: 380_000,
      unallocatedCents: 0,
      paidInCents: 500_000,
      holders: [
        { shareholderId: 'a', name: 'A', basisPoints: 5_000, paidInCents: 250_000, profitShareCents: 190_000 },
        { shareholderId: 'b', name: 'B', basisPoints: 3_000, paidInCents: 150_000, profitShareCents: 114_000 },
        { shareholderId: 'c', name: 'C', basisPoints: 2_000, paidInCents: 100_000, profitShareCents: 76_000 },
      ],
    });
  });

  it('adds up several pay-ins, and keeps a former holder who paid in, with no share of the profit', () => {
    const result = projectHoldersOf(0, [A, B], [
      { shareholderId: 'a', name: 'A', amountCents: 100 },
      { shareholderId: 'a', name: 'A', amountCents: 50 },
      { shareholderId: 'x', name: 'Former', amountCents: 30 },
    ]);

    expect(result.holders).toEqual([
      { shareholderId: 'a', name: 'A', basisPoints: 5_000, paidInCents: 150, profitShareCents: 0 },
      { shareholderId: 'b', name: 'B', basisPoints: 3_000, paidInCents: 0, profitShareCents: 0 },
      { shareholderId: 'x', name: 'Former', basisPoints: 0, paidInCents: 30, profitShareCents: 0 },
    ]);
    expect(result.paidInCents).toBe(180);
  });

  it('sets nothing aside from a loss, and shares the loss by stake', () => {
    const result = projectHoldersOf(-100_000, [A, B, C], []);

    expect(result.marketingCents).toBe(0);
    expect(result.holders.map((h) => h.profitShareCents)).toEqual([-50_000, -30_000, -20_000]);
  });
});
