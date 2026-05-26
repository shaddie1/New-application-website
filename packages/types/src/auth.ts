/** Auth DTOs shared between API, mobile, and (future) web. */

export type UserRole = 'CUSTOMER' | 'CREW' | 'CREW_LEAD' | 'ADMIN' | 'SUPPORT';

export interface PublicUser {
  id: string;
  phone: string;
  email?: string | null;
  fullName: string;
  role: UserRole;
  avatarUrl?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  accessExpiresAt: string; // ISO
  refreshToken: string;
  refreshExpiresAt: string;
}

export interface Session extends AuthTokens {
  user: PublicUser;
}

/** POST /auth/request-otp */
export interface RequestOtpInput {
  phone: string; // E.164
}
export interface RequestOtpResult {
  ok: true;
  // In dev, we surface the OTP here so the mobile app can auto-fill. Never set in prod.
  devOtp?: string;
}

/** POST /auth/verify-otp */
export interface VerifyOtpInput {
  phone: string;
  code: string;
}
export type VerifyOtpResult =
  | { kind: 'AUTHENTICATED'; session: Session }
  | { kind: 'NEEDS_REGISTRATION'; registrationToken: string; phone: string };

/** POST /auth/register (after a NEEDS_REGISTRATION verify-otp result) */
export interface RegisterInput {
  registrationToken: string;
  fullName: string;
  email?: string;
  defaultAddress?: {
    label: string; // "Home"
    line1: string;
    area?: string;
    city?: string;
  };
  referralCode?: string;
}

/** POST /auth/refresh */
export interface RefreshInput {
  refreshToken: string;
}

/** POST /auth/logout */
export interface LogoutInput {
  refreshToken: string;
}
