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

// ── Staff changing their own sign-in email (admin Profile page) ──────────────

/** POST /profile/email/request */
export interface RequestEmailChangeInput {
  email: string;
}

export interface RequestEmailChangeResult {
  ok: true;
  /** The new address, masked: a code went there. */
  sentTo: string;
  /** Owners only: their current address, masked, where an approval code went. Null otherwise. */
  approvalSentTo: string | null;
  /** Never in production. */
  devCodes?: { newCode: string; currentCode?: string };
}

/** POST /profile/email/confirm — owners must send both codes. */
export interface ConfirmEmailChangeInput {
  newCode: string;
  currentCode?: string;
}

/** The session is signed out everywhere on success; sign in again with `email`. */
export interface ConfirmEmailChangeResult {
  ok: true;
  email: string;
}
