/** Profile + account-settings DTOs (mockup 13). */
import type { PublicUser } from './auth.js';
import type { LoyaltyTier } from './loyalty.js';

export interface ProfileOverview {
  user: PublicUser;
  tier: LoyaltyTier;
  pointsBalance: number;
  lifetimeEarnedPoints: number;
  bookingsCount: number;
  memberSince: string; // ISO of account creation
}

export interface UpdateProfileInput {
  fullName?: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export type NotificationChannel = 'PUSH' | 'SMS' | 'EMAIL';

export interface NotificationPreferenceDto {
  channel: NotificationChannel;
  enabled: boolean;
}

export interface UpdateNotificationInput {
  channel: NotificationChannel;
  enabled: boolean;
}
