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
  CrewJobDto,
  CrewTransitionTo,
  LoyaltyOverview,
  BookingPhotosResult,
  BookingPhotoDto,
  PhotoUploadUrlInput,
  PhotoUploadUrlResult,
  CreatePhotoInput,
  ProfileOverview,
  UpdateProfileInput,
  NotificationPreferenceDto,
  UpdateNotificationInput,
  CreateAddressInput,
  UpdateAddressInput,
  CreateQuoteRequestInput,
  QuoteRequestDto,
  NotificationsResult,
  MarkNotificationsReadInput,
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

  // ── Crew ─────────────────────────────────────────────────────────────────
  listCrewJobs: (scope: 'today' | 'upcoming' | 'past' | 'all' = 'upcoming') =>
    request<{ jobs: CrewJobDto[] }>(`/crew/jobs?scope=${scope}`, {
      method: 'GET',
      auth: true,
    }),

  getCrewJob: (id: string) =>
    request<{ job: CrewJobDto }>(`/crew/jobs/${encodeURIComponent(id)}`, {
      method: 'GET',
      auth: true,
    }),

  transitionCrewJob: (id: string, to: CrewTransitionTo) =>
    request<{ bookingId: string; status: string; pointsCredited?: number }>(
      `/crew/jobs/${encodeURIComponent(id)}/transition`,
      { method: 'POST', auth: true, body: JSON.stringify({ to }) },
    ),

  claimCrewJob: (bookingId: string, role: 'LEAD' | 'MEMBER' = 'LEAD') =>
    request<{ job: CrewJobDto }>('/crew/jobs/claim', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ bookingId, role }),
    }),

  // ── Loyalty ──────────────────────────────────────────────────────────────
  getLoyalty: () =>
    request<{ loyalty: LoyaltyOverview }>('/loyalty', { method: 'GET', auth: true }),

  // ── Profile ──────────────────────────────────────────────────────────────
  getProfile: () =>
    request<{ profile: ProfileOverview }>('/profile', { method: 'GET', auth: true }),

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

  // ── Photos ───────────────────────────────────────────────────────────────
  // Customer-side: photos for a booking the caller owns.
  getBookingPhotos: (bookingId: string) =>
    request<BookingPhotosResult>(`/bookings/${encodeURIComponent(bookingId)}/photos`, {
      method: 'GET',
      auth: true,
    }),

  // Crew-side: photos for a job the caller is assigned to.
  getCrewJobPhotos: (bookingId: string) =>
    request<BookingPhotosResult>(`/crew/jobs/${encodeURIComponent(bookingId)}/photos`, {
      method: 'GET',
      auth: true,
    }),

  requestPhotoUploadUrl: (bookingId: string, input: PhotoUploadUrlInput) =>
    request<PhotoUploadUrlResult>(`/crew/jobs/${encodeURIComponent(bookingId)}/photos/upload-url`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  saveCrewPhoto: (bookingId: string, input: CreatePhotoInput) =>
    request<{ photo: BookingPhotoDto }>(`/crew/jobs/${encodeURIComponent(bookingId)}/photos`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  // ── Notifications ──────────────────────────────────────────────────────────
  listNotifications: () =>
    request<NotificationsResult>('/notifications', { method: 'GET', auth: true }),

  markNotificationsRead: (input: MarkNotificationsReadInput = {}) =>
    request<{ ok: true; unreadCount: number }>('/notifications/read', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),
};

/**
 * End-to-end crew photo upload: presign → PUT binary to R2 → confirm row.
 * `localUri` is the file:// path from expo-image-picker.
 */
export async function uploadCrewPhoto(opts: {
  bookingId: string;
  room: string;
  kind: 'BEFORE' | 'AFTER';
  localUri: string;
  contentType?: string;
}): Promise<BookingPhotoDto> {
  const contentType = opts.contentType ?? guessContentType(opts.localUri);

  const presigned = await api.requestPhotoUploadUrl(opts.bookingId, {
    room: opts.room,
    kind: opts.kind,
    contentType,
  });

  // Read the local file and PUT it straight to R2.
  const fileRes = await fetch(opts.localUri);
  const blob = await fileRes.blob();
  const putRes = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putRes.ok) {
    throw new ApiError(putRes.status, 'upload to storage failed');
  }

  const saved = await api.saveCrewPhoto(opts.bookingId, {
    room: opts.room,
    kind: opts.kind,
    url: presigned.publicUrl,
  });
  return saved.photo;
}

function guessContentType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    default: return 'image/jpeg';
  }
}

export { ApiError };
