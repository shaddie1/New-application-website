import type {
  RequestOtpResult,
  VerifyOtpResult,
  Session,
  RegisterInput,
  ServiceLineDto,
  CleanTypeDto,
  AddOnDto,
  AddressDto,
  QuoteInput,
  QuoteResult,
  AvailabilityResult,
  CreateBookingInput,
  BookingDto,
  InitiatePaymentInput,
  PaymentDto,
} from '@onyxhawk/types';
import { API_URL } from '../config';
import { useAuthStore } from '../auth/store';

class ApiError extends Error {
  constructor(public status: number, public payload: unknown) {
    super(`API ${status}`);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth, headers, ...rest } = init;
  const session = useAuthStore.getState().session;

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
      await useAuthStore.getState().signOut();
      return null;
    }
    const next = (await res.json()) as Session;
    await useAuthStore.getState().setSession(next);
    return next;
  } catch {
    return null;
  }
}

export const api = {
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

  me: () => request<{ user: Session['user'] }>('/auth/me', { method: 'GET', auth: true }),

  // ── Catalog ──────────────────────────────────────────────────────────────
  getServiceLines: () =>
    request<{ serviceLines: ServiceLineDto[] }>('/catalog/service-lines', { method: 'GET' }),

  getServiceLine: (code: string) =>
    request<{ serviceLine: ServiceLineDto & { cleanTypes: CleanTypeDto[]; addOns: AddOnDto[] } }>(
      `/catalog/service-lines/${encodeURIComponent(code)}`,
      { method: 'GET' },
    ),

  // ── Addresses ────────────────────────────────────────────────────────────
  listAddresses: () =>
    request<{ addresses: AddressDto[] }>('/addresses', { method: 'GET', auth: true }),

  // ── Booking ──────────────────────────────────────────────────────────────
  quoteBooking: (input: QuoteInput) =>
    request<{ quote: QuoteResult }>('/bookings/quote', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  getAvailability: (date: string) =>
    request<AvailabilityResult>(`/bookings/availability?date=${encodeURIComponent(date)}`, {
      method: 'GET',
      auth: true,
    }),

  createBooking: (input: CreateBookingInput) =>
    request<{ booking: BookingDto }>('/bookings', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  listBookings: () =>
    request<{ upcoming: BookingDto[]; past: BookingDto[] }>('/bookings', {
      method: 'GET',
      auth: true,
    }),

  getBooking: (id: string) =>
    request<{ booking: BookingDto }>(`/bookings/${encodeURIComponent(id)}`, {
      method: 'GET',
      auth: true,
    }),

  cancelBooking: (id: string, reason?: string) =>
    request<{ booking: BookingDto }>(`/bookings/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason }),
    }),

  // ── Payments ─────────────────────────────────────────────────────────────
  initiatePayment: (input: InitiatePaymentInput) =>
    request<{ payment: PaymentDto }>('/payments/initiate', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  getPayment: (id: string) =>
    request<{ payment: PaymentDto }>(`/payments/${encodeURIComponent(id)}`, {
      method: 'GET',
      auth: true,
    }),
};

export { ApiError };
