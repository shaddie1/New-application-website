export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface TierProgress {
  current: LoyaltyTier;
  lifetimeEarnedPoints: number;
  balancePoints: number; // spendable
  next: LoyaltyTier | null;
  pointsRemaining: number; // 0 if next === null
}

export type PointsReason =
  | 'BOOKING_BASE'
  | 'WEEKEND_MULTIPLIER'
  | 'RECURRING_BONUS'
  | 'REFERRAL'
  | 'PHOTO_DOCUMENTATION'
  | 'TIER_BONUS'
  | 'REDEMPTION'
  | 'REFUND_CLAWBACK'
  | 'ADJUSTMENT';

export interface PointsLedgerEntry {
  id: string;
  direction: 'CREDIT' | 'DEBIT';
  points: number;
  balanceAfter: number;
  reason: PointsReason;
  description?: string;
  bookingId?: string;
  createdAt: string;
}
