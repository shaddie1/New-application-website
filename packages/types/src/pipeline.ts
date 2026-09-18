/**
 * Pipeline tracker — leads, tenders, the locked funnel targets and the
 * calculations on top of them. Field names follow the Pipeline_Tracker and
 * Tender_Tracker sheets. Money in cents; rates are fractions.
 *
 * Funnel (from OnyxHawk_Sales_Targets_and_Trackers.xlsx):
 *   Direct outreach   contacted → conversation → site visit → proposal → signed
 *   Warm intro        intro → site visit → proposal → signed
 *   Household enquiry enquiry → paid job (Marketing's funnel)
 *   Tenders           submission → award (separate model)
 */

// ── Leads ───────────────────────────────────────────────────────────────────

export type LeadStage = 'CONTACTED' | 'CONVERSATION' | 'SITE_VISIT' | 'PROPOSAL_SENT' | 'WON' | 'LOST';

/**
 * Channel and segment are free text on the sheet. These are the labels the
 * funnel understands (offered as suggestions; anything else is kept as typed
 * and classified by keyword — see classifyChannel / isHouseholdSegment).
 */
export const LEAD_CHANNEL_LABELS = ['Direct outreach', 'Warm introduction', 'Household enquiry', 'Referral', 'Other'] as const;
export const LEAD_SEGMENT_LABELS = ['Household', 'Office', 'Clinic or laboratory', 'Developer', 'NGO', 'Public sector', 'Retail', 'Other'] as const;
/** Matches the Quote Builder's frequency labels. */
export const CONTRACT_TYPE_LABELS = ['One-off', 'Monthly (1 visit)', 'Fortnightly (2 visits)', 'Weekly (4 visits)', 'Twice weekly (8 visits)', 'Daily (22 visits)'] as const;

/** The funnel's view of a free-text channel. */
export type FunnelChannel = 'DIRECT_OUTREACH' | 'WARM_INTRO' | 'HOUSEHOLD_ENQUIRY' | 'REFERRAL' | 'OTHER';

export type LeadEventKind =
  | 'CREATED'
  | 'STAGE_CHANGED'
  | 'DETAILS_CHANGED'
  | 'NOTE_ADDED'
  | 'QUOTE_LINKED'
  | 'COMMISSION_PAID';

/** Same shape as Projects' activity log, plus the from/to stage the funnel counts. */
export interface LeadEventDto {
  id: string;
  kind: LeadEventKind;
  fromStage: LeadStage | null;
  toStage: LeadStage | null;
  summary: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface LeadDto {
  id: string;
  /** Display reference, e.g. "L-001". */
  leadId: string;
  dateLogged: string; // YYYY-MM-DD
  clientOrg: string;
  segment: string;
  /** Whoever logged it first — the commission-bearing field. */
  broughtInById: string | null;
  broughtInByName: string | null;
  channel: string;
  contactName: string;
  contactPhone: string | null;
  stage: LeadStage;
  quoteValueCents: number | null;
  contractType: string | null;
  expectedClose: string | null; // YYYY-MM-DD
  /** Set by "Create quote" from Proposal sent. */
  linkedQuoteId: string | null;
  linkedQuoteStatus: string | null;
  notes: string | null;
  // Outcome (WON / LOST)
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  revenueReceivedCents: number | null;
  actualDirectCostsCents: number | null;
  /** revenue − direct costs; computed, not stored. */
  netProfitCents: number | null;
  /** Snapshotted at the win so a later rate change never rewrites a payout. */
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
  dateLogged?: string;
  clientOrg: string;
  segment: string;
  /** Defaults to the person creating the lead. */
  broughtInById?: string | null;
  channel: string;
  contactName: string;
  contactPhone?: string | null;
  quoteValueCents?: number | null;
  contractType?: string | null;
  expectedClose?: string | null;
  notes?: string | null;
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

export type TenderType = 'TENDER' | 'EOI' | 'RFQ' | 'PREQUALIFICATION';
export type BidDecision = 'BID' | 'NO_BID';

/** Status is free text on the sheet; these are the suggestions the funnel understands. */
export const TENDER_STATUS_LABELS = [
  'Identified', 'Preparing pack', 'Sent to COO', 'Submitted by COO', 'Awarded', 'Not awarded', 'No bid', 'Withdrawn',
] as const;

export type TenderEventKind = 'CREATED' | 'STATUS_CHANGED' | 'DETAILS_CHANGED' | 'NOTE_ADDED';

export interface TenderEventDto {
  id: string;
  kind: TenderEventKind;
  fromStatus: string | null;
  toStatus: string | null;
  summary: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface TenderDto {
  id: string;
  tenderRef: string;
  title: string;
  issuingOrg: string;
  sourcePortal: string | null;
  type: TenderType;
  agpoReserved: boolean;
  dateFound: string; // YYYY-MM-DD
  submissionDeadline: string; // YYYY-MM-DD
  /** Two days before the deadline (5 pm) by default; can be overridden. */
  packToCooBy: string; // YYYY-MM-DD
  bidDecision: BidDecision | null;
  status: string;
  dateSentToCoo: string | null; // YYYY-MM-DD
  /** dateSentToCoo ≤ packToCooBy; null until sent. Computed. */
  sentOnTime: boolean | null;
  /** Days until each date; negative once past. */
  daysToDeadline: number;
  daysToPack: number;
  notes: string | null;
  eventCount: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenderInput {
  tenderRef: string;
  title: string;
  issuingOrg: string;
  sourcePortal?: string | null;
  type: TenderType;
  agpoReserved?: boolean;
  dateFound?: string;
  submissionDeadline: string;
  /** Omit to default to two days before the deadline. */
  packToCooBy?: string | null;
  bidDecision?: BidDecision | null;
  status?: string;
  dateSentToCoo?: string | null;
  notes?: string | null;
}

export type UpdateTenderInput = Partial<CreateTenderInput>;

export interface ChangeTenderStatusInput {
  status: string;
  note?: string;
  /** Set when the status is the pack going to the COO. */
  dateSentToCoo?: string | null;
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
