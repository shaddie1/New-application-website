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

export type StaffRole =
  | 'ADMIN'
  | 'SUPPORT'
  | 'FINANCIAL_MANAGER'
  | 'MARKETING'
  | 'CLEANING_SUPERVISOR'
  | 'SHAREHOLDER';

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

export type JobStatus = 'OWNER_ENTRY' | 'PENDING' | 'APPROVED';

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
  status: JobStatus;
  reportedByName: string | null; // set for admin-submitted reports
  clientName: string | null;
  clientPhone: string | null;
  clientLocation: string | null;
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
  clientName?: string;
  clientPhone?: string;
  clientLocation?: string;
  notes?: string;
}

export interface UpdateJobInput {
  title?: string;
  incomeCents?: number;
  discountCents?: number;
  clientName?: string;
  clientPhone?: string;
  clientLocation?: string;
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

export interface CreateJobReportInput {
  title: string;
  date: string; // YYYY-MM-DD
  incomeCents: number;
  discountCents?: number;
  clientName?: string;
  clientPhone?: string;
  clientLocation?: string;
  notes?: string;
}

export interface MonthlyTrendItem {
  year: number;
  month: number;
  label: string; // e.g. "Jun 2026"
  incomeCents: number;
  totalExpensesCents: number;
  netCents: number;
  jobCount: number;
}

// ── Ownership / cap table (owner only) ──────────────────────────────────────

export type ShareholderKind = 'COMPANY' | 'INDIVIDUAL';

export interface ShareholderDto {
  id: string;
  name: string;
  title: string | null; // role at the company, e.g. "Director", "COO"
  kind: ShareholderKind;
  // Stake in basis points: 10000 = 100.00%, 4000 = 40%. Integer so stakes sum
  // exactly, the same reason money is in cents.
  basisPoints: number;
  notes: string | null;
  userId: string | null;
  userName: string | null; // resolved from the linked staff account, if any
  sortOrder: number;
}

export interface CreateShareholderInput {
  name: string;
  title?: string | null;
  kind: ShareholderKind;
  basisPoints: number;
  notes?: string;
  userId?: string | null;
}

export interface UpdateShareholderInput {
  name?: string;
  title?: string | null;
  kind?: ShareholderKind;
  basisPoints?: number;
  notes?: string | null;
  userId?: string | null;
  sortOrder?: number;
}

// One shareholder's cut of the profit, for a period and for all time.
export interface ShareholderAllocation {
  shareholder: ShareholderDto;
  // Share of net profit (income − expenses) for the requested period.
  periodShareCents: number;
  // Share of net profit across every job ever recorded.
  allTimeShareCents: number;
}

// All-time company totals — "what have we done so far".
export interface AllTimeTotals {
  totalProjects: number; // count of counted jobs, ever
  totalIncomeCents: number;
  totalExpensesCents: number;
  totalNetCents: number;
  firstJobDate: string | null; // YYYY-MM-DD; null when there are no jobs yet
  lastJobDate: string | null; // YYYY-MM-DD
}

export interface EquityOverview {
  allocations: ShareholderAllocation[];
  // Sum of every stake. Should be 10000 (100%); the UI warns when it is not.
  totalBasisPoints: number;
  // Net profit not covered by the stakes above — non-zero only when the cap
  // table does not add up to 100%. Retained by the business.
  unallocatedPeriodCents: number;
  unallocatedAllTimeCents: number;
  // Net profit being split, for the requested period.
  periodNetCents: number;
  fromDate: string;
  toDate: string;
  allTime: AllTimeTotals;
}
