/** Admin/back-office DTOs (apps/admin). */
import type { BookingDto } from './booking.js';
import type { QuoteRequestDto, QuoteStatus } from './quote.js';
import type { UserRole } from './auth.js';

export interface CrewMemberSummary {
  userId: string;
  name: string;
  role: 'LEAD' | 'MEMBER';
}

export interface AdminBookingDto extends BookingDto {
  customerName: string;
  customerPhone: string;
  crew: CrewMemberSummary[];
}

export interface AssignCrewInput {
  userId: string;
  role: 'LEAD' | 'MEMBER';
}

/** Crew users available for assignment. */
export interface CrewUserDto {
  id: string;
  fullName: string;
  phone: string;
  role: UserRole; // CREW | CREW_LEAD
}

export interface AdminQuoteRequestDto extends QuoteRequestDto {
  customerName: string;
  customerPhone: string;
}

export interface RespondQuoteInput {
  status: QuoteStatus;
  quotedAmountCents?: number;
}

export interface AdminStats {
  pendingPayment: number;
  confirmed: number;
  inProgress: number;
  pendingQuotes: number;
}

// ── Team / staff management (owner only) ────────────────────────────────────

export type StaffRole = 'ADMIN' | 'SUPPORT';

export interface AdminStaffDto {
  id: string;
  fullName: string;
  phone: string;
  role: StaffRole;
  isOwner: boolean;
  createdAt: string;
}

export interface CreateStaffInput {
  phone: string; // E.164
  fullName: string;
  role: StaffRole;
}

export interface AdminBookingsResult {
  bookings: AdminBookingDto[];
}

export interface AdminQuotesResult {
  quoteRequests: AdminQuoteRequestDto[];
}

// ── Financials ────────────────────────────────────────────────────────────────

export type ExpenseCategory = 'MATERIALS' | 'TRANSPORT' | 'EMPLOYEE_PAY' | 'LUNCH' | 'MISCELLANEOUS';

export interface ExpenseDto {
  id: string;
  category: ExpenseCategory;
  amountCents: number;
  description: string | null;
  date: string; // YYYY-MM-DD
  jobId: string | null;
  bookingId: string | null;
  createdAt: string;
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  amountCents: number;
  description?: string;
  date: string; // YYYY-MM-DD
}

// A Job represents one cleaning engagement with its own income + expenses.
export interface JobDto {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  incomeCents: number;
  discountCents: number;
  actualIncomeCents: number; // incomeCents - discountCents
  notes: string | null;
  expenses: ExpenseDto[];
  totalExpensesCents: number;
  netCents: number; // actualIncomeCents - totalExpensesCents
  createdAt: string;
}

export interface CreateJobInput {
  title: string;
  date: string; // YYYY-MM-DD
  incomeCents: number;
  discountCents?: number;
  notes?: string;
}

export interface UpdateJobInput {
  title?: string;
  incomeCents?: number;
  discountCents?: number;
  notes?: string;
}

export interface FinancialSummary {
  incomeCents: number;
  expensesByCategoryCents: Record<ExpenseCategory, number>;
  totalExpensesCents: number;
  netCents: number;
  fromDate: string;
  toDate: string;
}
