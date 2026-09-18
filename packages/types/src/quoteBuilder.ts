/**
 * Quote Builder — rates card, site survey, internal estimate and the
 * client-facing quotation. Money is in cents throughout (KSh × 100), the
 * same as the rest of the API; percentages are fractions (0.15 = 15%).
 */

// ── Enumerations ─────────────────────────────────────────────────────────────

/** Distance from the office, which sets the transport charge per job day. */
export type DistanceZone = 'ZONE1' | 'ZONE2' | 'ZONE3';

/** How dirty the site is expected to be; scales the task hours. */
export type SoilLevel = 'LIGHT' | 'NORMAL' | 'HEAVY';

export type CleanLevel = 'ROUTINE' | 'DEEP' | 'VACUUM_ONLY';

/** Preset room sizes, or MEASURED when the surveyor entered the real m². */
export type RoomSizePreset = 'SMALL' | 'MEDIUM' | 'LARGE' | 'VERY_LARGE' | 'MEASURED';

export type MarginCheck = 'OK' | 'BELOW TARGET' | 'BELOW MINIMUM';

export type EstimateStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

// ── Rates (single editable record) ──────────────────────────────────────────

export interface AreaRate {
  areaType: string;
  cleanLevel: CleanLevel;
  /** Square metres one person cleans in one hour. */
  m2PerPersonHour: number;
  consumablesPerM2Cents: number;
  marketLowPerM2Cents: number;
  marketHighPerM2Cents: number;
}

export interface ItemRate {
  itemType: string;
  minutesPerUnit: number;
  consumablesPerUnitCents: number;
  marketLowPerUnitCents: number;
  marketHighPerUnitCents: number;
}

export interface FrequencyOption {
  label: string;
  visitsPerMonth: number;
  discountPct: number;
}

export interface QuoteRates {
  cleanerPayPerDayCents: number;
  supervisorPayPerDayCents: number;
  /** Compliant-pay check only — never used in the price. */
  legalMinWagePerDayCents: number;
  productiveHoursPerPersonPerDay: number;
  largestCrewPerJobDay: number;
  setupCloseOutHours: number;
  movementAllowancePct: number;
  equipmentWearPct: number;
  contingencyPct: number;
  targetMarginPct: number;
  minimumMarginPct: number;
  /** On net profit per visit, trainee-sourced leads only. */
  commissionPct: number;
  roundToKes: number;
  quoteContactPhone: string;
  quoteContactEmail: string;
  transportByZoneCents: Record<DistanceZone, number>;
  soilMultiplier: Record<SoilLevel, number>;
  frequencyTable: FrequencyOption[];
  roomSizePresetsM2: Record<Exclude<RoomSizePreset, 'MEASURED'>, number>;
  areaRates: AreaRate[];
  itemRates: ItemRate[];
  /** Printed on the client quotation against each scope line. */
  workDescriptions: Record<CleanLevel | 'ITEM', string>;
}

export interface QuoteRatesDto {
  rates: QuoteRates;
  updatedAt: string | null;
  updatedByName: string | null;
}

// ── Site survey ─────────────────────────────────────────────────────────────

export interface QuoteSurveyAreaInput {
  areaType: string;
  cleanLevel: CleanLevel;
  roomCount: number;
  sizePreset: RoomSizePreset;
  /** Required when sizePreset is MEASURED; m² per room. */
  measuredM2?: number | null;
}

export interface QuoteSurveyItemInput {
  itemType: string;
  quantity: number;
}

export interface QuoteSurveyInput {
  distanceZone: DistanceZone;
  soilLevel: SoilLevel;
  /** Must match a label in the rates' frequency table. */
  frequencyLabel: string;
  /** Hours the crew can be on site per day. */
  workingWindowHours: number;
  supervisorOnSite: boolean;
  /** Lead came from a trainee — commission applies. */
  traineeSourced: boolean;
  notes?: string | null;
  areas: QuoteSurveyAreaInput[];
  items: QuoteSurveyItemInput[];
}

export interface QuoteSurveyDto extends QuoteSurveyInput {
  notes: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

// ── Estimate ────────────────────────────────────────────────────────────────

/** One area or item, with its share of the hours and money. */
export interface EstimateLine {
  kind: 'AREA' | 'ITEM';
  label: string;
  /** e.g. "3 rooms × 20 m² · Deep" or "12 units". */
  detail: string;
  quantity: number;
  /** Total m² for areas; units for items. */
  units: number;
  personHours: number;
  consumablesCents: number;
  marketLowCents: number;
  marketHighCents: number;
}

export interface EstimateHours {
  /** Area hours already carry the soil multiplier; item hours do not. */
  areaTaskHours: number;
  itemTaskHours: number;
  taskHours: number;
  soilMultiplier: number;
  /** Movement allowance is time, not money: a share of the task hours. */
  movementAllowanceHours: number;
  /** Once per visit. */
  setupCloseOutHours: number;
  totalPersonHours: number;
  /** Working window capped by productive hours. */
  hoursPerPersonPerDay: number;
  jobDays: number;
  /** Cleaners per job day. */
  crewSize: number;
  supervisorDays: number;
}

export interface EstimateCosts {
  labourCents: number;
  supervisorCents: number;
  consumablesCents: number;
  transportCents: number;
  equipmentWearCents: number;
  /** Labour + supervisor + consumables + transport + equipment wear. */
  directCostCents: number;
  contingencyCents: number;
  /** Direct cost + contingency — what the margins are applied to. */
  costBaseCents: number;
}

export interface EstimatePricing {
  minimumPriceCents: number;
  targetPriceCents: number;
  marketLowCents: number;
  marketHighCents: number;
  recommendedPriceCents: number;
  frequencyLabel: string;
  visitsPerMonth: number;
  discountPct: number;
  pricePerVisitCents: number;
  monthlyValueCents: number;
  /** Gross margin at quote: 1 − cost base (direct cost + contingency) ÷ price per visit. */
  marginPct: number;
  marginCheck: MarginCheck;
}

export interface EstimateCommission {
  traineeSourced: boolean;
  commissionPct: number;
  netProfitPerVisitCents: number;
  commissionCents: number;
}

/** The sheet's compliant-pay comparison row — informational, never blocks a quote. */
export interface EstimateCompliance {
  cleanerPayPerDayCents: number;
  legalMinWagePerDayCents: number;
  meetsLegalMinimum: boolean;
  /** Cleaners at the legal minimum with contingency, plus consumables and transport. */
  legalDirectCostCents: number;
  legalMarginPct: number;
}

export interface QuoteEstimateOutput {
  lines: EstimateLine[];
  hours: EstimateHours;
  costs: EstimateCosts;
  pricing: EstimatePricing;
  commission: EstimateCommission;
  compliance: EstimateCompliance;
  /** Human-readable caveats (e.g. crew capped, unknown rate for an area). */
  warnings: string[];
}

export interface QuoteEstimateDto {
  id: string;
  status: EstimateStatus;
  output: QuoteEstimateOutput;
  /** When the rates used were last edited — flags a stale estimate. */
  ratesUpdatedAt: string | null;
  computedAt: string;
  computedByName: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
}

export interface ApproveEstimateInput {
  note?: string;
}

export interface RejectEstimateInput {
  note: string;
}

// ── Client quotation (scope + price only) ───────────────────────────────────

export interface ClientQuotationScopeLine {
  label: string;
  detail: string;
  description: string;
}

export interface ClientQuotationDto {
  quoteRequestId: string;
  customerName: string;
  siteType: string;
  serviceLineName: string;
  frequencyLabel: string;
  visitsPerMonth: number;
  pricePerVisitCents: number;
  monthlyValueCents: number;
  scope: ClientQuotationScopeLine[];
  contactPhone: string;
  contactEmail: string;
  approvedAt: string;
  issuedAt: string;
}

// ── Survey option lists (no money — safe for every staff role) ──────────────

export interface QuoteBuilderOptions {
  areaTypes: string[];
  itemTypes: string[];
  frequencies: { label: string; visitsPerMonth: number }[];
  roomSizePresetsM2: Record<Exclude<RoomSizePreset, 'MEASURED'>, number>;
}
