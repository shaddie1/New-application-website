import { LoyaltyTier } from '@prisma/client';

// Lifetime-earned-points thresholds (see docs/schema.md).
// Tier derives from lifetimeEarnedPoints — NOT current balance — so that
// redeeming points never demotes the user.
export const TIER_THRESHOLDS: Array<{ tier: LoyaltyTier; minPoints: number }> = [
  { tier: LoyaltyTier.PLATINUM, minPoints: 2000 },
  { tier: LoyaltyTier.GOLD, minPoints: 1000 },
  { tier: LoyaltyTier.SILVER, minPoints: 500 },
  { tier: LoyaltyTier.BRONZE, minPoints: 0 },
];

export function tierForLifetimePoints(lifetimePoints: number): LoyaltyTier {
  for (const t of TIER_THRESHOLDS) {
    if (lifetimePoints >= t.minPoints) return t.tier;
  }
  return LoyaltyTier.BRONZE;
}

export function pointsToNextTier(lifetimePoints: number): { next: LoyaltyTier | null; pointsRemaining: number } {
  // Walk thresholds high-to-low; find the next one above us.
  const above = [...TIER_THRESHOLDS].reverse().find((t) => t.minPoints > lifetimePoints);
  if (!above) return { next: null, pointsRemaining: 0 };
  return { next: above.tier, pointsRemaining: above.minPoints - lifetimePoints };
}
