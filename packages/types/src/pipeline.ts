/**
 * Pipeline tracker — leads, tenders, the locked funnel targets and the
 * calculations on top of them. Money in cents; rates are fractions.
 *
 * Funnel (from OnyxHawk_Sales_Targets_and_Trackers.xlsx):
 *   Direct outreach   contacted → conversation → site visit → proposal → signed
 *   Warm intro        intro → site visit → proposal → signed
 *   Household enquiry enquiry → paid job (Marketing's funnel)
 *   Tenders           submission → award (separate model)
 */

// ── Leads ───────────────────────────────────────────────────────────────────

export type LeadSegment = 'HOUSEHOLD' | 'COMMERCIAL' | 'MEDICAL' | 'DEVELOPER' | 'NGO' | 'PUBLIC_SECTOR';

export type LeadChannel = 'DIRECT_OUTREACH' | 'WARM_INTRO' | 'HOUSEHOLD_ENQUIRY' | 'REFERRAL' | 'OTHER';

/** NEW is "contacted" for outreach, "intro received" for warm intros, "enquiry logged" for households. */
export type LeadStage = 'NEW' | 'CONVERSATION' | 'SITE_VISIT' | 'PROPOSAL_SENT' | 'WON' | 'LOST';

export type LeadEventKind =
  | 'CREATED'
  | 'STAGE_CHANGED'
  | 'DETAILS_CHANGED'
  | 'NOTE_ADDED'
  | 'QUOTE_LINKED'
  | 'COMMISSION_PAID';

export interface LeadEventDto {
  id: string;
  kind: LeadEventKind;
  /** Stage reached, for STAGE_CHANGED and CREATED — what the funnel actuals count. */
  stage: LeadStage | null;
  summary: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface LeadDto {
  id: string;
  organisation: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  segment: LeadSegment;
  channel: LeadChannel;
  stage: LeadStage;
  bdOwnerId: string | null;
  bdOwnerName: string | null;
  siteLocation: string | null;
  estimatedValueCents: number | null;
  /** Recurring contract rather than a one-off job — feeds the "share of wins recurring" rate. */
  isRecurring: boolean;
  /** Lead came through a trainee — commission applies on the win. */
  traineeSourced: boolean;
  notes: string | null;
  nextActionAt: string | null; // YYYY-MM-DD
  /** Set by "Create quote" from Proposal sent. */
  quoteRequestId: string | null;
  quoteStatus: string | null;
  // Outcome (WON / LOST)
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  revenueReceivedCents: number | null;
  actualDirectCostsCents: number | null;
  netProfitCents: number | null;
  commissionPct: number | null;
  commissionCents: number | null;
  commissionPaidAt: string | null;
  commissionReference: string | null;
  eventCount: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeadInput {
  organisation?: string | null;
  contactName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  segment: LeadSegment;
  channel: LeadChannel;
  bdOwnerId?: string | null;
  siteLocation?: string | null;
  estimatedValueCents?: number | null;
  isRecurring?: boolean;
  traineeSourced?: boolean;
  notes?: string | null;
  nextActionAt?: string | null;
}

export type UpdateLeadInput = Partial<CreateLeadInput>;

/** Moving a lead. WON needs the money; LOST needs a reason. */
export interface ChangeLeadStageInput {
  stage: LeadStage;
  note?: string;
  revenueReceivedCents?: number;
  actualDirectCostsCents?: number;
  lostReason?: string;
}

export interface MarkCommissionPaidInput {
  reference?: string;
}

export interface CreateQuoteFromLeadResult {
  lead: LeadDto;
  quoteRequestId: string;
}

// ── Tenders ─────────────────────────────────────────────────────────────────

export type TenderKind = 'PUBLIC_TENDER' | 'PRIVATE_RFQ';

export type TenderStatus =
  | 'IDENTIFIED'
  | 'PREPARING'
  | 'PACK_WITH_COO'
  | 'SUBMITTED'
  | 'AWARDED'
  | 'NOT_AWARDED'
  | 'WITHDRAWN';

export type TenderEventKind = 'CREATED' | 'STATUS_CHANGED' | 'DETAILS_CHANGED' | 'NOTE_ADDED';

export interface TenderEventDto {
  id: string;
  kind: TenderEventKind;
  status: TenderStatus | null;
  summary: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface TenderDto {
  id: string;
  title: string;
  issuer: string;
  reference: string | null;
  kind: TenderKind;
  status: TenderStatus;
  estimatedValueCents: number | null;
  submissionDeadline: string; // YYYY-MM-DD
  packToCooBy: string; // YYYY-MM-DD
  /** Days until each date; negative once past. */
  daysToDeadline: number;
  daysToPack: number;
  ownerId: string | null;
  ownerName: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  notes: string | null;
  eventCount: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenderInput {
  title: string;
  issuer: string;
  reference?: string | null;
  kind: TenderKind;
  estimatedValueCents?: number | null;
  submissionDeadline: string;
  packToCooBy: string;
  ownerId?: string | null;
  notes?: string | null;
}

export type UpdateTenderInput = Partial<CreateTenderInput>;

export interface ChangeTenderStatusInput {
  status: TenderStatus;
  note?: string;
}

// ── Funnel targets (single locked record) ───────────────────────────────────

/** A locked conversion rate. Year-split rates carry both; single rates carry year1 only. */
export interface LockedRate {
  key: string;
  label: string;
  year1: number;
  year2?: number;
}

export type TargetSeriesOwner = 'BD_LEAD' | 'MARKETING';

/** One row of the monthly table: a target the person commits to, or an expected outcome shown for reference. */
export interface TargetSeries {
  key: string;
  label: string;
  owner: TargetSeriesOwner;
  kind: 'TARGET' | 'EXPECTED';
  /** Whether the tracker can measure this from logged activity. */
  tracked: boolean;
  /** Month → value, keyed YYYY-MM. */
  byMonth: Record<string, number>;
}

export interface FunnelTargets {
  sourcePolicy: string;
  /** First month of year 1, YYYY-MM. */
  year1Start: string;
  lockedRates: LockedRate[];
  series: TargetSeries[];
  /** Household repeat-booking cadence, months. */
  monthsBetweenRepeatBookings: number;
}

export interface FunnelTargetsDto {
  targets: FunnelTargets;
  updatedAt: string | null;
  updatedByName: string | null;
}

// ── Actuals vs locked ───────────────────────────────────────────────────────

export interface StageActual {
  key: string;
  label: string;
  numerator: number;
  denominator: number;
  /** null when nothing reached the prior stage this month. */
  actualRate: number | null;
  lockedRate: number;
  /** actual < locked × 0.8 — the sheet's "fix the cause" rule. */
  belowLocked: boolean;
  /** False for rates the tracker cannot measure from activity. */
  tracked: boolean;
}

export interface ActivityActual {
  key: string;
  label: string;
  owner: TargetSeriesOwner;
  kind: 'TARGET' | 'EXPECTED';
  target: number | null;
  actual: number | null;
  tracked: boolean;
}

export interface FunnelActualsDto {
  month: string; // YYYY-MM
  monthLabel: string;
  /** 1 or 2 — which locked-rate column applies. */
  year: 1 | 2;
  stages: StageActual[];
  activity: ActivityActual[];
}

// ── Required-activity calculator (on demand, nothing stored) ────────────────

export type CalculatorChannel = 'DIRECT_OUTREACH' | 'WARM_INTRO' | 'PUBLIC_TENDER' | 'PRIVATE_RFQ' | 'HOUSEHOLD';

export interface RequiredActivityInput {
  winsWantedPerYear: number;
  /** Fractions summing to 1. */
  channelMix: Record<CalculatorChannel, number>;
  year: 1 | 2;
}

export interface RequiredActivityChannel {
  channel: CalculatorChannel;
  label: string;
  share: number;
  winsPerYear: number;
  /** Product of the channel's locked conversion rates. */
  conversion: number;
  activityLabel: string;
  activityPerYear: number;
  activityPerMonth: number;
  /** Intermediate stage volumes per year, in funnel order. */
  stages: { label: string; perYear: number }[];
}

export interface RequiredActivityResult {
  winsWantedPerYear: number;
  year: 1 | 2;
  channels: RequiredActivityChannel[];
}

// ── Commission ──────────────────────────────────────────────────────────────

export interface CommissionSummary {
  /** Sum of commission on Won leads not yet marked paid. */
  dueCents: number;
  dueCount: number;
  paidCents: number;
}
