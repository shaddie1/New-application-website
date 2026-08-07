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
  serviceLineCode: string | null;
  region: string | null;
  clientSegment: ClientSegment | null;
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
  /** Analysis dimensions — drive the revenue breakdown charts. */
  serviceLineCode?: string;
  region?: string;
  clientSegment?: ClientSegment;
}

export interface UpdateJobInput {
  serviceLineCode?: string | null;
  region?: string | null;
  clientSegment?: ClientSegment | null;
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

// ── Finance: marketing, assets, investments, distributions ──────────────────

/** Who entered a record and when — shown on every finance row. */
export interface Provenance {
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ClientSegment = 'RESIDENTIAL' | 'COMMERCIAL' | 'MEDICAL' | 'DEVELOPER';

export type MarketingChannel =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'GOOGLE'
  | 'WHATSAPP'
  | 'FLYERS'
  | 'RADIO'
  | 'REFERRAL'
  | 'OTHER';

export interface MarketingSpendDto extends Provenance {
  id: string;
  campaign: string;
  channel: MarketingChannel;
  amountCents: number;
  date: string; // YYYY-MM-DD
  notes: string | null;
  leadsCount: number | null;
  bookingsCount: number | null;
  receiptRef: string | null;
  receiptUrl: string | null;
  reconciled: boolean;
  /** Cost per booking, when bookings have been attributed. */
  costPerBookingCents: number | null;
}

export interface CreateMarketingSpendInput {
  campaign: string;
  channel: MarketingChannel;
  amountCents: number;
  date: string;
  notes?: string;
  leadsCount?: number;
  bookingsCount?: number;
  receiptRef?: string;
  receiptUrl?: string;
}

export type AssetCategory = 'MACHINE' | 'VEHICLE' | 'EQUIPMENT' | 'TOOL' | 'IT' | 'FURNITURE' | 'OTHER';
export type AssetCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'RETIRED';

export interface AssetMaintenanceDto {
  id: string;
  date: string;
  description: string;
  costCents: number;
  performedBy: string | null;
  receiptRef: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface AssetDto extends Provenance {
  id: string;
  name: string;
  category: AssetCategory;
  purchaseDate: string;
  costCents: number;
  supplier: string | null;
  serialNumber: string | null;
  location: string | null;
  usefulLifeMonths: number | null;
  salvageValueCents: number;
  condition: AssetCondition;
  retiredAt: string | null;
  notes: string | null;
  receiptRef: string | null;
  receiptUrl: string | null;
  /** Straight-line depreciation to date, and what the asset is worth now. */
  accumulatedDepreciationCents: number;
  bookValueCents: number;
  maintenance: AssetMaintenanceDto[];
  totalMaintenanceCents: number;
}

export interface CreateAssetInput {
  name: string;
  category: AssetCategory;
  purchaseDate: string;
  costCents: number;
  supplier?: string;
  serialNumber?: string;
  location?: string;
  usefulLifeMonths?: number;
  salvageValueCents?: number;
  condition?: AssetCondition;
  notes?: string;
  receiptRef?: string;
  receiptUrl?: string;
}

export interface CreateAssetMaintenanceInput {
  date: string;
  description: string;
  costCents?: number;
  performedBy?: string;
  receiptRef?: string;
}

export type InvestmentKind = 'CAPITAL_INJECTION' | 'LOAN' | 'GRANT' | 'OTHER';

export interface InvestmentDto extends Provenance {
  id: string;
  source: string;
  kind: InvestmentKind;
  amountCents: number;
  date: string;
  purpose: string;
  shareholderId: string | null;
  shareholderName: string | null;
  reference: string | null;
  documentUrl: string | null;
}

export interface CreateInvestmentInput {
  source: string;
  kind: InvestmentKind;
  amountCents: number;
  date: string;
  purpose: string;
  shareholderId?: string | null;
  reference?: string;
  documentUrl?: string;
}

export type DistributionStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export interface ProfitDistributionDto extends Provenance {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  shareholderId: string;
  shareholderName: string;
  /** Snapshots taken when declared — a later cap-table edit must not rewrite history. */
  netProfitCents: number;
  basisPoints: number;
  amountCents: number;
  status: DistributionStatus;
  paidAt: string | null;
  reference: string | null;
  notes: string | null;
}

/** Declare a period's distribution for every shareholder at once. */
export interface DeclareDistributionInput {
  label: string;
  periodStart: string;
  periodEnd: string;
  /** Omit to use the net profit calculated for the period. */
  netProfitCentsOverride?: number;
}

export interface MarkDistributionPaidInput {
  status: DistributionStatus;
  reference?: string;
  notes?: string;
}

/** Revenue split by an analysis dimension. */
export interface RevenueBreakdownItem {
  key: string;
  label: string;
  incomeCents: number;
  jobCount: number;
}

export interface RevenueBreakdown {
  byServiceLine: RevenueBreakdownItem[];
  byRegion: RevenueBreakdownItem[];
  bySegment: RevenueBreakdownItem[];
  totalIncomeCents: number;
  fromDate: string;
  toDate: string;
}

/** A record still missing a source document, for the reconciliation screen. */
export interface UnreconciledItem {
  id: string;
  kind: 'EXPENSE' | 'MARKETING';
  date: string;
  description: string;
  amountCents: number;
  hasReceipt: boolean;
}

// ── Targets & dashboard ─────────────────────────────────────────────────────

export interface MonthlyTargetDto {
  year: number;
  month: number;
  revenueTargetCents: number;
  netProfitTargetCents: number;
  jobsTarget: number;
  notes: string | null;
}

export interface SetMonthlyTargetInput {
  year: number;
  month: number;
  revenueTargetCents: number;
  netProfitTargetCents: number;
  jobsTarget: number;
  notes?: string;
}

/** An actual measured against its goal, for a progress meter. */
export interface TargetProgress {
  actual: number;
  target: number;
  /** Percent of target achieved, 0 when no target is set. */
  percent: number;
}

export interface DashboardOverview {
  year: number;
  month: number;
  monthLabel: string;
  revenue: TargetProgress;
  netProfit: TargetProgress;
  jobs: TargetProgress;
  /** Same month last period, for the "vs last month" line. */
  previousRevenueCents: number;
  previousNetCents: number;
  previousJobCount: number;
  hasTargets: boolean;
}

// ── Projects ────────────────────────────────────────────────────────────────

export type ProjectStage =
  | 'ENQUIRY'
  | 'SURVEY'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'SNAGGING'
  | 'COMPLETE'
  | 'CANCELLED';

export type PaymentFrequency = 'ONE_OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface ProjectCheckDto {
  id: string;
  question: string;
  section: string | null;
  sortOrder: number;
  /** Null until answered; true = yes, false = no. */
  answer: boolean | null;
  notApplicable: boolean;
  note: string | null;
  answeredByName: string | null;
  answeredAt: string | null;
}

export type ProjectEventKind =
  | 'CREATED'
  | 'DETAILS_CHANGED'
  | 'STAGE_CHANGED'
  | 'QUESTION_ANSWERED'
  | 'QUESTION_ADDED'
  | 'QUESTION_REMOVED'
  | 'NOTE_CHANGED';

/** One entry in a project's history. Written once, never edited. */
export interface ProjectEventDto {
  id: string;
  kind: ProjectEventKind;
  summary: string;
  /** Second line: the note left, or the old → new value. */
  detail: string | null;
  /** Name as it stood when the event happened, so it survives staff changes. */
  actorName: string | null;
  createdAt: string;
}

export interface ProjectDto {
  id: string;
  title: string;
  clientName: string | null;
  clientPhone: string | null;
  siteLocation: string | null;
  serviceLineCode: string | null;
  clientSegment: ClientSegment | null;
  stage: ProjectStage;
  startDate: string | null;
  targetEndDate: string | null;
  completedAt: string | null;
  /** With ONE_OFF this is the whole job; otherwise the rate per period. */
  valueCents: number | null;
  paymentFrequency: PaymentFrequency;
  /**
   * Rate × periods between start and target end. Null for one-off projects or
   * when either date is missing — an estimate needs a span to run over.
   */
  estimatedTotalCents: number | null;
  /** Whole billing periods in the span, for showing the working. */
  billingPeriods: number | null;
  notes: string | null;
  checklist: ProjectCheckDto[];
  /** Answered (or N/A) as a share of the checklist, 0–100. */
  progressPercent: number;
  answeredCount: number;
  checklistCount: number;
  /** Questions answered "no" — the outstanding problems on the job. */
  blockerCount: number;
  /** History entries, so the log tab can show a count before it loads. */
  eventCount: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  title: string;
  clientName?: string;
  clientPhone?: string;
  siteLocation?: string;
  serviceLineCode?: string;
  clientSegment?: ClientSegment;
  stage?: ProjectStage;
  startDate?: string | null;
  targetEndDate?: string | null;
  valueCents?: number;
  paymentFrequency?: PaymentFrequency;
  notes?: string;
  /** Omit to seed the standard checklist. */
  questions?: { question: string; section?: string }[];
}

export interface UpdateProjectInput {
  title?: string;
  clientName?: string | null;
  clientPhone?: string | null;
  siteLocation?: string | null;
  serviceLineCode?: string | null;
  clientSegment?: ClientSegment | null;
  stage?: ProjectStage;
  startDate?: string | null;
  targetEndDate?: string | null;
  valueCents?: number | null;
  paymentFrequency?: PaymentFrequency;
  notes?: string | null;
}

export interface AnswerProjectCheckInput {
  answer?: boolean | null;
  notApplicable?: boolean;
  note?: string | null;
}

export interface AddProjectCheckInput {
  question: string;
  section?: string;
}

// ── Company documents (shareholders only) ───────────────────────────────────

export type DocumentCategory =
  | 'INCORPORATION'
  | 'TAX'
  | 'LICENCE'
  | 'INSURANCE'
  | 'CONTRACT'
  | 'BANK'
  | 'POLICY'
  | 'MINUTES'
  | 'OTHER';

export interface CompanyDocumentDto {
  id: string;
  title: string;
  category: DocumentCategory;
  description: string | null;
  fileUrl: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  isExternal: boolean;
  expiresAt: string | null; // YYYY-MM-DD
  /** Days until expiry; negative when already lapsed, null when it never expires. */
  daysUntilExpiry: number | null;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyDocumentInput {
  title: string;
  category: DocumentCategory;
  description?: string;
  fileUrl: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  isExternal?: boolean;
  expiresAt?: string | null;
}

export interface DocumentsResult {
  documents: CompanyDocumentDto[];
  /** False when object storage is not configured — the UI then offers links only. */
  uploadEnabled: boolean;
}

export interface DocumentUploadUrlInput {
  fileName: string;
  contentType: string;
}

export interface DocumentUploadUrlResult {
  uploadUrl: string;
  publicUrl: string;
  expiresAt: string;
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
