import type {
  RequestOtpResult,
  VerifyOtpResult,
  Session,
  RegisterInput,
  ServiceLineDto,
  CleanTypeDto,
  AddOnDto,
  AddressDto,
  CreateAddressInput,
  UpdateAddressInput,
  QuoteInput,
  QuoteResult,
  AvailabilityResult,
  CreateBookingInput,
  BookingDto,
  InitiatePaymentInput,
  PaymentDto,
  LoyaltyOverview,
  ProfileOverview,
  UpdateProfileInput,
  NotificationPreferenceDto,
  UpdateNotificationInput,
  CreateQuoteRequestInput,
  QuoteRequestDto,
  NotificationsResult,
  MarkNotificationsReadInput,
  BookingPhotosResult,
} from '@onyxhawk/types';

import { clearSession, loadSession, saveSession } from './session';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public payload: unknown) {
    super(`API ${status}`);
    this.name = 'ApiError';
  }
}

/** Human-friendly message extracted from an unknown thrown value. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError) {
    const p = err.payload as { error?: string; message?: string } | string | null;
    if (typeof p === 'string' && p) return p;
    if (p && typeof p === 'object') return p.error ?? p.message ?? fallback;
    return fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

async function request<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth, headers, ...rest } = init;
  const session = loadSession();

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  if (auth && session) finalHeaders.Authorization = `Bearer ${session.accessToken}`;

  let res = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });

  // 401 + we have a refresh token → try one rotation and retry once.
  if (res.status === 401 && auth && session?.refreshToken) {
    const refreshed = await tryRefresh(session.refreshToken);
    if (refreshed) {
      finalHeaders.Authorization = `Bearer ${refreshed.accessToken}`;
      res = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });
    }
  }

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, payload);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function tryRefresh(refreshToken: string): Promise<Session | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const next = (await res.json()) as Session;
    saveSession(next);
    return next;
  } catch {
    return null;
  }
}

export const api = {
  // ── Auth ───────────────────────────────────────────────────────────────
  requestOtp: (phone: string) =>
    request<RequestOtpResult>('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),

  verifyOtp: (phone: string, code: string) =>
    request<VerifyOtpResult>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code }) }),

  register: (input: RegisterInput) =>
    request<{ kind: 'AUTHENTICATED'; session: Session }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: (refreshToken: string) =>
    request<{ ok: true }>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),

  // ── Catalog (public) ─────────────────────────────────────────────────────
  getServiceLines: () =>
    request<{ serviceLines: ServiceLineDto[] }>('/catalog/service-lines', { method: 'GET' }),

  getServiceLine: (code: string) =>
    request<{ serviceLine: ServiceLineDto & { cleanTypes: CleanTypeDto[]; addOns: AddOnDto[] } }>(
      `/catalog/service-lines/${encodeURIComponent(code)}`,
      { method: 'GET' },
    ),

  // ── Addresses ────────────────────────────────────────────────────────────
  listAddresses: () => request<{ addresses: AddressDto[] }>('/addresses', { method: 'GET', auth: true }),

  createAddress: (input: CreateAddressInput) =>
    request<{ address: AddressDto }>('/addresses', { method: 'POST', auth: true, body: JSON.stringify(input) }),

  updateAddress: (id: string, input: UpdateAddressInput) =>
    request<{ address: AddressDto }>(`/addresses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    }),

  deleteAddress: (id: string) =>
    request<{ ok: true }>(`/addresses/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  // ── Booking ──────────────────────────────────────────────────────────────
  quoteBooking: (input: QuoteInput) =>
    request<{ quote: QuoteResult }>('/bookings/quote', { method: 'POST', auth: true, body: JSON.stringify(input) }),

  getAvailability: (date: string) =>
    request<AvailabilityResult>(`/bookings/availability?date=${encodeURIComponent(date)}`, {
      method: 'GET',
      auth: true,
    }),

  createBooking: (input: CreateBookingInput) =>
    request<{ booking: BookingDto }>('/bookings', { method: 'POST', auth: true, body: JSON.stringify(input) }),

  listBookings: () =>
    request<{ upcoming: BookingDto[]; past: BookingDto[] }>('/bookings', { method: 'GET', auth: true }),

  getBooking: (id: string) =>
    request<{ booking: BookingDto }>(`/bookings/${encodeURIComponent(id)}`, { method: 'GET', auth: true }),

  cancelBooking: (id: string, reason?: string) =>
    request<{ booking: BookingDto }>(`/bookings/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason }),
    }),

  getBookingPhotos: (bookingId: string) =>
    request<BookingPhotosResult>(`/bookings/${encodeURIComponent(bookingId)}/photos`, {
      method: 'GET',
      auth: true,
    }),

  // ── Payments ─────────────────────────────────────────────────────────────
  initiatePayment: (input: InitiatePaymentInput) =>
    request<{ payment: PaymentDto }>('/payments/initiate', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  getPayment: (id: string) =>
    request<{ payment: PaymentDto }>(`/payments/${encodeURIComponent(id)}`, { method: 'GET', auth: true }),

  // ── Loyalty ──────────────────────────────────────────────────────────────
  getLoyalty: () => request<{ loyalty: LoyaltyOverview }>('/loyalty', { method: 'GET', auth: true }),

  // ── Profile ──────────────────────────────────────────────────────────────
  getProfile: () => request<{ profile: ProfileOverview }>('/profile', { method: 'GET', auth: true }),

  updateProfile: (input: UpdateProfileInput) =>
    request<{ user: ProfileOverview['user'] }>('/profile', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    }),

  getNotificationPrefs: () =>
    request<{ preferences: NotificationPreferenceDto[] }>('/profile/notifications', { method: 'GET', auth: true }),

  updateNotificationPref: (input: UpdateNotificationInput) =>
    request<{ preference: NotificationPreferenceDto }>('/profile/notifications', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    }),

  // ── Quote requests ─────────────────────────────────────────────────────────
  createQuoteRequest: (input: CreateQuoteRequestInput) =>
    request<{ quoteRequest: QuoteRequestDto }>('/quote-requests', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  listQuoteRequests: () =>
    request<{ quoteRequests: QuoteRequestDto[] }>('/quote-requests', { method: 'GET', auth: true }),

  getQuoteRequest: (id: string) =>
    request<{ quoteRequest: QuoteRequestDto }>(`/quote-requests/${encodeURIComponent(id)}`, {
      method: 'GET',
      auth: true,
    }),

  // ── Notifications ──────────────────────────────────────────────────────────
  listNotifications: () => request<NotificationsResult>('/notifications', { method: 'GET', auth: true }),

  markNotificationsRead: (input: MarkNotificationsReadInput = {}) =>
    request<{ ok: true; unreadCount: number }>('/notifications/read', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),
};
