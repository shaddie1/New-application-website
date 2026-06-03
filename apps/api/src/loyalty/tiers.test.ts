import { LoyaltyTier } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { pointsToNextTier, tierForLifetimePoints } from './tiers.js';

describe('tierForLifetimePoints', () => {
  it('maps lifetime points to the correct tier at each boundary', () => {
    expect(tierForLifetimePoints(0)).toBe(LoyaltyTier.BRONZE);
    expect(tierForLifetimePoints(499)).toBe(LoyaltyTier.BRONZE);
    expect(tierForLifetimePoints(500)).toBe(LoyaltyTier.SILVER);
    expect(tierForLifetimePoints(999)).toBe(LoyaltyTier.SILVER);
    expect(tierForLifetimePoints(1000)).toBe(LoyaltyTier.GOLD);
    expect(tierForLifetimePoints(1999)).toBe(LoyaltyTier.GOLD);
    expect(tierForLifetimePoints(2000)).toBe(LoyaltyTier.PLATINUM);
    expect(tierForLifetimePoints(50_000)).toBe(LoyaltyTier.PLATINUM);
  });

  it('matches mockup 14: 1,240 lifetime points is Gold', () => {
    expect(tierForLifetimePoints(1240)).toBe(LoyaltyTier.GOLD);
  });
});

describe('pointsToNextTier', () => {
  it('matches mockup 14: from 1,240 it is 760 points to Platinum', () => {
    expect(pointsToNextTier(1240)).toEqual({ next: LoyaltyTier.PLATINUM, pointsRemaining: 760 });
  });

  it('reports the next threshold from the bottom', () => {
    expect(pointsToNextTier(0)).toEqual({ next: LoyaltyTier.SILVER, pointsRemaining: 500 });
    expect(pointsToNextTier(500)).toEqual({ next: LoyaltyTier.GOLD, pointsRemaining: 500 });
  });

  it('returns null once Platinum is reached', () => {
    expect(pointsToNextTier(2000)).toEqual({ next: null, pointsRemaining: 0 });
    expect(pointsToNextTier(9999)).toEqual({ next: null, pointsRemaining: 0 });
  });
});
