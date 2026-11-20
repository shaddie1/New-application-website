/** Admin/back-office DTOs (apps/admin). */
import type { BookingDto } from './booking.js';
import type { QuoteRequestDto, QuoteStatus } from './quote.js';
import type { ClientPriceBasis, QuoteCostingDto, QuoteEstimateDto, QuoteSurveyDto } from './quoteBuilder.js';
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
  /** Site survey captured by staff; null until one is saved. */
  survey: QuoteSurveyDto | null;
  /**
   * Costs and the client's price, and the internal estimate. Only serialised
   * for roles allowed to see costs and margins (owner, admin, financial
   * manager, COO) — null for everyone else.
   */
  costing: QuoteCostingDto | null;
  estimate: QuoteEstimateDto | null;
  /** Client-facing price once an estimate is approved. Safe for every staff role. */
  approvedPricePerVisitCents: number | null;
  /** MONTH when the client agreed a monthly price, which is then approvedMonthlyValueCents exactly. */
  approvedPriceBasis: ClientPriceBasis | null;
  approvedMonthlyValueCents: number | null;
  /** Approval trail. */
  submittedForApprovalAt: string | null;
  submittedForApprovalByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  /** Approval or rejection note; null for roles without estimate access. */
  approvalNote: string | null;
}

export interface RespondQuoteInput {
  status: QuoteStatus;
  /**
   * Ignored for QUOTED — the price comes from the approved estimate. Kept for
   * older clients and for WON/LOST where no amount is needed.
   */
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
  | 'SHAREHOLDER'
  | 'COO';

export interface AdminStaffDto {
  id: string;
  fullName: string;
  phone: string;
  /** Required for staff sign-in; null on members provisioned before email codes. */
  email: string | null;
  role: StaffRole;
  isOwner: boolean;
  createdAt: string;
}

export interface CreateStaffInput {
  phone: string; // E.164
  fullName: string;
  email: string;
  role: StaffRole;
}

export interface UpdateStaffInput {
  email: string;
}

export interface AdminBookingsResult {
  bookings: AdminBookingDto[];
}

export interface AdminQuotesResult {
  quoteRequests: AdminQuoteRequestDto[];
}

// ── Financials ────────────────────────────────────────────────────────────────

export type ExpenseCategory = 'MATERIALS' | 'TRANSPORT' | 'EMPLOYEE_PAY' | 'LUNCH' | 'MISCELLANEOUS';

/**
 * Costs added up by group: the five expense categories, and the machines' days
 * as a group of their own. `MACHINES` is sent only when its amount is above
 * zero, and a server older than it never sends it, so the admin reads it as
 * optional. A cost typed into a form is always one of the five.
 */
export type CostsByGroup = Record<ExpenseCategory, number> & { MACHINES?: number };

export type JobStatus = 'OWNER_ENTRY' | 'PENDING' | 'APPROVED';

/** Where a job sits for project money. STANDALONE is what the back-office calls a one-off job. */
export type JobPlacement = 'UNSORTED' | 'PROJECT' | 'STANDALONE';

/** The place the owner chooses for a job: under one project, or one-off. "Not yet sorted" cannot be chosen. */
export type JobPlaceInput = { placement: 'PROJECT'; projectId: string } | { placement: 'STANDALONE' };

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

/** One machine's days on a job, as the owner's job list shows them. They are logged on the Machines page. */
export interface JobMachineLineDto {
  id: string;
  machineName: string;
  /** Days are counted in halves: 5 is two and a half days. */
  halfDays: number;
  /** The machine's daily rate when the days were logged. */
  rateCents: number;
  /** Days x rate: a cost of the job. */
  amountCents: number;
  /** True when the job is the machine's hire to an outside customer. */
  isHire: boolean;
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
  placement: JobPlacement;
  projectId: string | null; // set only when placement is PROJECT
  projectTitle: string | null;
  expenses: ExpenseDto[];
  /** Every cost in `expenses` and the job's machine days, so income less this is the job's profit. */
  totalExpensesCents: number;
  netCents: number; // actualIncomeCents - totalExpensesCents
  createdAt: string;
  /** The machine days inside `totalExpensesCents`. Sent only when above zero. */
  machineCents?: number;
  /** The job's machine days. Sent only to the owner, and only when the job has some: a job report carries the amount alone. */
  machineLines?: JobMachineLineDto[];
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
  /** A new job cannot be saved without its place. */
  place: JobPlaceInput;
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
  /** Moves the job to another project, or between a project and one-off. */
  place?: JobPlaceInput;
}

/** Approving a crew job report: the owner chooses its place in the same step. */
export interface ApproveReportInput {
  place: JobPlaceInput;
}

/** Sorting several jobs into one place at once. All are placed, or none. */
export interface PlaceJobsInput {
  jobIds: string[];
  place: JobPlaceInput;
}

export interface FinancialSummary {
  incomeCents: number;
  /** Costs by their own date. Machine days, under `MACHINES`, by the date of their job. */
  expensesByCategoryCents: CostsByGroup;
  /** Every group above added up, machine days included. */
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
  /** The machine days inside `totalExpensesCents`, counted in the month of their job. Sent only when above zero. */
  machineCents?: number;
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
  /** Set when this is a shareholder's part of a project's costs paid in. */
  projectId: string | null;
  projectTitle: string | null;
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
  /** The period's 5% for marketing, taken off before the split; 0 for periods declared before the rule. */
  marketingCents: number;
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

/**
 * Which ranges an overview's change figures compare. `same-period`: the month
 * is the current one in Nairobi, so days 1 to today are set against the same
 * days of the month before. `full-month`: whole month against whole month.
 */
export type ComparisonMode = 'same-period' | 'full-month';

/** Revenue, net profit and job count over one side of a comparison. */
export interface ComparisonFigures {
  revenueCents: number;
  netCents: number;
  jobCount: number;
}

export interface OverviewComparison {
  mode: ComparisonMode;
  /** Today's day of the month in Nairobi for `same-period`; null for `full-month`. */
  cutoffDay: number | null;
  /** The requested month's side: days 1 to `cutoffDay`, or the whole month. */
  current: ComparisonFigures;
  /** The month before: the same days (stopping at its last day), or the whole month. */
  previous: ComparisonFigures;
}

/** One whole calendar month of an overview's `series`. */
export interface OverviewSeriesMonth {
  year: number;
  month: number; // 1 to 12
  label: string; // e.g. "Jun"
  revenueCents: number;
  netCents: number;
  jobCount: number;
}

export interface DashboardOverview {
  year: number;
  month: number;
  monthLabel: string;
  /** Whole-month figures, whatever the comparison below covers. */
  revenue: TargetProgress;
  netProfit: TargetProgress;
  jobs: TargetProgress;
  /** The previous side of `comparison`, kept under their earlier names. */
  previousRevenueCents: number;
  previousNetCents: number;
  previousJobCount: number;
  /** A server older than this field does not send it, so the admin reads it as optional. */
  comparison: OverviewComparison;
  /**
   * The six months ending at the requested one, oldest first, each a whole
   * month: the last entry equals the headline figures above. A server older
   * than this field does not send it, so the admin reads it as optional.
   */
  series: OverviewSeriesMonth[];
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

/** Whether the client wants the service once or on a schedule. */
export type ProjectKind = 'ONCE' | 'REPEATING';
export type RepeatUnit = 'WEEK' | 'MONTH';

/**
 * A project's service schedule, as the form sends it. For a ONCE project only
 * the start date matters. serviceDays are ISO weekdays (1 = Monday … 7 = Sunday);
 * weekOfMonth is 1–4, or 5 for the last, and is used for monthly repeats only.
 */
export interface ProjectScheduleInput {
  kind?: ProjectKind;
  repeatEvery?: number | null;
  repeatUnit?: RepeatUnit | null;
  serviceDays?: number[];
  weekOfMonth?: number | null;
  deepCleanEveryMonths?: number | null;
  deepCleanPriceCents?: number | null;
}

/** One planned visit; status is PLANNED until someone marks it. */
export interface ProjectVisitDto {
  projectId: string;
  projectTitle: string;
  clientName: string | null;
  siteLocation: string | null;
  date: string;
  isDeepClean: boolean;
  status: 'PLANNED' | 'DONE' | 'SKIPPED';
  note: string | null;
  markedByName: string | null;
}

export interface MarkProjectVisitInput {
  /** Null takes the mark off, so the visit is planned again. */
  status: 'DONE' | 'SKIPPED' | null;
  note?: string | null;
}

/** What the form shows while a schedule is being filled in. */
export interface SchedulePreviewDto {
  /** What is missing, in plain words, or null when the schedule can be saved. */
  problem: string | null;
  summary: string;
  nextVisits: { date: string; isDeepClean: boolean }[];
}

// ── Invoices ────────────────────────────────────────────────────────────────

/** DRAFT can be changed or deleted; SENT is with the client; PAID added its income. */
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED';

export interface InvoiceLineDto {
  description: string;
  quantity: number;
  unitCents: number;
  amountCents: number;
}

export interface InvoiceDto {
  id: string;
  number: string;
  projectId: string;
  projectTitle: string;
  clientName: string | null;
  clientPhone: string | null;
  siteLocation: string | null;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  status: InvoiceStatus;
  lines: InvoiceLineDto[];
  totalCents: number;
  note: string | null;
  sentOn: string | null;
  dueOn: string | null;
  paidOn: string | null;
  paymentRef: string | null;
  /** Sent, not paid, and past its due date (Nairobi time). */
  isOverdue: boolean;
  /** The income job made when it was paid. */
  jobId: string | null;
  createdByName: string | null;
  createdAt: string;
}

/** One billing period of a project, with its invoice if one was made. */
export interface BillingPeriodDto {
  start: string;
  end: string;
  label: string;
  /** What a new invoice for this period would come to. */
  suggestedTotalCents: number;
  /** The period's invoice that is not cancelled, if any. */
  invoiceId: string | null;
}

export interface ProjectInvoicesDto {
  invoices: InvoiceDto[];
  /** Newest first, up to today (a one-off job: its single period). */
  periods: BillingPeriodDto[];
}

export interface CreateInvoiceInput {
  projectId: string;
  periodStart: string;
  periodEnd: string;
}

/** Only a draft can be changed. */
export interface UpdateInvoiceInput {
  lines?: InvoiceLineDto[];
  note?: string | null;
}

export interface SendInvoiceInput {
  /** The day it went to the client; today when left out. Due 14 days later. */
  sentOn?: string;
}

export interface PayInvoiceInput {
  paidOn: string;
  /** M-Pesa code, cheque or bank reference. */
  paymentRef?: string | null;
  /** Machine days to add to the income job, at each machine's project rate. */
  machineDays?: { assetId: string; halfDays: number }[];
}

/** A machine's days suggested for an invoice's payment: the period's done visits times its half days per visit. */
export interface InvoiceMachineDaysSuggestion {
  assetId: string;
  name: string;
  /** The machine's project rate now, per day. */
  rateCents: number;
  halfDaysPerVisit: number;
  halfDays: number;
}

export interface InvoiceMachineDaysDto {
  /** Visits marked done in the invoice's period. */
  doneVisits: number;
  suggestions: InvoiceMachineDaysSuggestion[];
}

/** A machine a project uses. */
export interface ProjectMachineDto {
  assetId: string;
  name: string;
  /** Half days on each visit: 2 is one day. */
  halfDaysPerVisit: number;
  projectRateCents: number;
  retired: boolean;
}

export interface ProjectMachinesDto {
  machines: ProjectMachineDto[];
  /** Machines on the register, not retired, that can be added. */
  available: { assetId: string; name: string; projectRateCents: number }[];
}

export interface SetProjectMachinesInput {
  machines: { assetId: string; halfDaysPerVisit: number }[];
}

/** One shareholder's part of a pay-in. */
export interface PayInShareDto {
  shareholderId: string;
  shareholderName: string;
  amountCents: number;
}

/** A project's costs paid in by the shareholders, split by stake. */
export interface ProjectPayInDto {
  id: string;
  date: string;
  totalCents: number;
  note: string | null;
  shares: PayInShareDto[];
  /** What the stakes did not cover when they add up to less than 100%: the company's own part. */
  companyCents: number;
  createdByName: string | null;
  createdAt: string;
}

export interface CreateProjectPayInInput {
  totalCents: number;
  date: string;
  note?: string | null;
}

/** One shareholder on a project: what they paid in and their part of its profit at today's stake. */
export interface ProjectHolderDto {
  shareholderId: string;
  name: string;
  basisPoints: number;
  paidInCents: number;
  profitShareCents: number;
}

/** How a project's profit so far splits: 5% for marketing, the rest by stake. */
export interface ProjectSplitDto {
  profitCents: number;
  marketingCents: number;
  sharedCents: number;
  holders: ProjectHolderDto[];
  /** Profit the stakes do not cover (stakes under 100%): kept by the company. */
  unallocatedCents: number;
  paidInCents: number;
  payIns: ProjectPayInDto[];
}

/** Marketing's 5% from declared Profit sharing periods, less marketing spend since the first of them. */
export interface MarketingFundDto {
  setAsideCents: number;
  spentCents: number;
  balanceCents: number;
  /** Start of the first period that set money aside; null when none has. */
  sinceDate: string | null;
  periods: { label: string; periodStart: string; periodEnd: string; marketingCents: number }[];
}

/** Invoices sent and not paid yet, for the Dashboard. */
export interface OpenInvoicesDto {
  overdue: InvoiceDto[];
  awaiting: InvoiceDto[];
  draftCount: number;
}

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
  | 'NOTE_CHANGED'
  | 'VISIT_MARKED'
  | 'INVOICE_CHANGED';

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
  kind: ProjectKind;
  repeatEvery: number | null;
  repeatUnit: RepeatUnit | null;
  serviceDays: number[];
  weekOfMonth: number | null;
  deepCleanEveryMonths: number | null;
  deepCleanPriceCents: number | null;
  /** The schedule in one line, e.g. "Every week on weekdays". */
  scheduleSummary: string;
  /** The next few planned visits from today (Nairobi), for the project card. */
  nextVisits: { date: string; isDeepClean: boolean }[];
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

export interface CreateProjectInput extends ProjectScheduleInput {
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
  /** Omit to seed the standard checklist for the project's kind. */
  questions?: { question: string; section?: string }[];
}

export interface UpdateProjectInput extends ProjectScheduleInput {
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

/** A holder's details. A stake is not among them: stakes change only through `ReplaceStakesInput`. */
export interface UpdateShareholderInput {
  name?: string;
  title?: string | null;
  kind?: ShareholderKind;
  notes?: string | null;
  userId?: string | null;
  sortOrder?: number;
}

/** One current holder's stake, by id. */
export interface HolderStake {
  id: string;
  basisPoints: number;
}

/** A holder the Edit stakes form adds. They start with no notes and no linked account. */
export interface NewHolderStake {
  name: string;
  title?: string | null;
  kind: ShareholderKind;
  basisPoints: number;
}

/**
 * Every stake at once: the only request that adds a holder, removes one or
 * changes a stake. `expected` is every current holder's stake as the form
 * opened with it; the save is refused if the stored stakes differ. `holders`
 * is the full new set and must total 10000. A current holder left out of
 * `holders` is removed.
 */
export interface ReplaceStakesInput {
  expected: HolderStake[];
  holders: Array<HolderStake | NewHolderStake>;
}

/** The current holders after the save, in table order. */
export interface ReplaceStakesResult {
  shareholders: ShareholderDto[];
  totalBasisPoints: number;
}

// One shareholder's cut of the profit, for a period and for all time.
export interface ShareholderAllocation {
  shareholder: ShareholderDto;
  // Share of net profit (income − expenses), after 5% for marketing, for the requested period.
  periodShareCents: number;
  // Share of net profit across every job ever recorded, after 5% for marketing.
  allTimeShareCents: number;
}

// All-time company totals — "what have we done so far".
export interface AllTimeTotals {
  totalProjects: number; // count of counted jobs, ever
  totalIncomeCents: number;
  totalExpensesCents: number;
  /** The machine days inside `totalExpensesCents`. Sent only when above zero. */
  totalMachineCents?: number;
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
  // Net profit for the requested period. 5% of it (when above zero) goes to
  // marketing first; the stakes split the rest.
  periodNetCents: number;
  periodMarketingCents: number;
  allTimeMarketingCents: number;
  // What periodNetCents is made of: income less expenses, and the number of
  // counted jobs dated in the period (the period's "Total projects"). A server
  // older than these fields leaves them out, so the admin reads them as optional.
  periodIncomeCents: number;
  periodExpensesCents: number;
  // What was set aside for machines in the period: the machine days inside
  // periodExpensesCents, counted by the date of their job. Sent only when above zero.
  periodMachineCents?: number;
  periodProjects: number;
  fromDate: string;
  toDate: string;
  allTime: AllTimeTotals;
}

/** One current holder's cut of one month's net profit, at today's stake. */
export interface EquityHistoryShare {
  shareholderId: string;
  shareholderName: string;
  basisPoints: number;
  shareCents: number; // negative in a loss month
}

/** One calendar month of the ownership history. */
export interface EquityHistoryMonth {
  year: number;
  month: number; // 1 to 12
  label: string; // e.g. "Jun"
  // Net profit of the whole calendar month, as the equity overview gives it for that month.
  netCents: number;
  // 5% of netCents for marketing when netCents is above zero, otherwise 0.
  marketingCents: number;
  // Every current holder, in table order, the same holders in every month. A removed holder is in none.
  shares: EquityHistoryShare[];
  // What the stakes do not cover; marketingCents, the shares and this add up to netCents.
  unallocatedCents: number;
  // True for the last month only: it is the current month in Nairobi and still running.
  partial: boolean;
}

/** Each month's net profit split at today's stakes, oldest first, ending at the current month. */
export interface EquityHistory {
  months: EquityHistoryMonth[];
}
