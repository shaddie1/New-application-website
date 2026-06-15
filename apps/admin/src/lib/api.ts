import type {
  Session,
  RequestOtpResult,
  VerifyOtpResult,
  AdminStats,
  AdminBookingDto,
  AdminQuoteRequestDto,
  CrewUserDto,
  AssignCrewInput,
  RespondQuoteInput,
  AdminStaffDto,
  CreateStaffInput,
  ExpenseDto,
  CreateExpenseInput,
  FinancialSummary,
  JobDto,
  CreateJobInput,
  UpdateJobInput,
} from '@onyxhawk/types';

import { loadSession, saveSession, clearSession } from './session';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public payload: unknown) {
    super(`API ${status}`);
    this.name = 'ApiError';
  }
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
  requestOtp: (phone: string) =>
    request<RequestOtpResult>('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),

  verifyOtp: (phone: string, code: string) =>
    request<VerifyOtpResult>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code }) }),

  logout: (refreshToken: string) =>
    request<{ ok: true }>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),

  // ── Admin ──────────────────────────────────────────────────────────────
  stats: () => request<{ stats: AdminStats }>('/admin/stats', { method: 'GET', auth: true }),

  bookings: (status?: string) =>
    request<{ bookings: AdminBookingDto[] }>(
      `/admin/bookings${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      { method: 'GET', auth: true },
    ),

  assignCrew: (bookingId: string, input: AssignCrewInput) =>
    request<{ booking: AdminBookingDto }>(`/admin/bookings/${encodeURIComponent(bookingId)}/assign`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  removeCrew: (bookingId: string, userId: string) =>
    request<{ booking: AdminBookingDto }>(
      `/admin/bookings/${encodeURIComponent(bookingId)}/crew/${encodeURIComponent(userId)}`,
      { method: 'DELETE', auth: true },
    ),

  crewUsers: () => request<{ crew: CrewUserDto[] }>('/admin/crew', { method: 'GET', auth: true }),

  quotes: (status?: string) =>
    request<{ quoteRequests: AdminQuoteRequestDto[] }>(
      `/admin/quote-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      { method: 'GET', auth: true },
    ),

  respondQuote: (id: string, input: RespondQuoteInput) =>
    request<{ quoteRequest: AdminQuoteRequestDto }>(`/admin/quote-requests/${encodeURIComponent(id)}/respond`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  // ── Team / staff (owner only) ────────────────────────────────────────────
  staff: () => request<{ staff: AdminStaffDto[] }>('/admin/staff', { method: 'GET', auth: true }),

  addStaff: (input: CreateStaffInput) =>
    request<{ staff: AdminStaffDto }>('/admin/staff', { method: 'POST', auth: true, body: JSON.stringify(input) }),

  removeStaff: (id: string) =>
    request<{ ok: true }>(`/admin/staff/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  // ── Financials (owner only) ──────────────────────────────────────────────
  financialSummary: (from: string, to: string) =>
    request<{ summary: FinancialSummary }>(
      `/admin/financials/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: 'GET', auth: true },
    ),

  jobs: (from: string, to: string) =>
    request<{ jobs: JobDto[] }>(
      `/admin/financials/jobs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: 'GET', auth: true },
    ),

  createJob: (input: CreateJobInput) =>
    request<{ job: JobDto }>('/admin/financials/jobs', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }),

  updateJob: (id: string, input: UpdateJobInput) =>
    request<{ job: JobDto }>(`/admin/financials/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    }),

  deleteJob: (id: string) =>
    request<{ ok: true }>(`/admin/financials/jobs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: true,
    }),

  addJobExpense: (jobId: string, input: CreateExpenseInput) =>
    request<{ expense: ExpenseDto }>(
      `/admin/financials/jobs/${encodeURIComponent(jobId)}/expenses`,
      { method: 'POST', auth: true, body: JSON.stringify(input) },
    ),

  deleteJobExpense: (jobId: string, expenseId: string) =>
    request<{ ok: true }>(
      `/admin/financials/jobs/${encodeURIComponent(jobId)}/expenses/${encodeURIComponent(expenseId)}`,
      { method: 'DELETE', auth: true },
    ),
};
