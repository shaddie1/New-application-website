/**
 * Quote Builder — rates card, site survey, costing, internal estimate and the
 * client-facing quotation. Money is in cents throughout (KSh × 100), the
 * same as the rest of the API; percentages are fractions (0.15 = 15%).
 */
import type { QuoteFrequency } from './quote.js';

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
  /** Per person on site (cleaners and supervisor) per job day. */
  lunchPerPersonPerDayCents: number;
  /** Compliant-pay check only — never used in the price. */
  legalMinWagePerDayCents: number;
  productiveHoursPerPersonPerDay: number;
  largestCrewPerJobDay: number;
  setupCloseOutHours: number;
  /** Spreads an owned machine's monthly wear over the days it works. */
  workingDaysPerMonth: number;
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

// ── Costing (owner, admin, finance and the COO only) ────────────────────────

/** Whether the client's price was agreed per visit or per month. */
export type ClientPriceBasis = 'VISIT' | 'MONTH';

/** An extra material per visit, or an upfront purchase. */
export interface CostingAmount {
  name: string;
  amountCents: number;
}

export interface CostingOwnedMachineInput {
  assetId: string;
  /** Job days per visit it works; empty means every job day. */
  daysUsed?: number | null;
  /** Typed by hand; needed when the asset register has no useful life. */
  wearPerDayCents?: number | null;
}

/** Asset register figures, copied on every costing save. */
export interface OwnedMachineCopy {
  name: string;
  category: string;
  costCents: number;
  salvageValueCents: number;
  usefulLifeMonths: number | null;
  retired: boolean;
  /** Deleted from the register since; this is its last copy. */
  deleted: boolean;
}

export interface CostingOwnedMachine extends CostingOwnedMachineInput {
  asset: OwnedMachineCopy;
}

/** A machine bought for this contract, spread over its life like an owned one. */
export interface CostingBoughtMachine {
  name: string;
  priceCents: number;
  lifeMonths: number;
  daysUsed?: number | null;
}

export interface CostingHiredMachine {
  name: string;
  hirePerVisitCents: number;
}

/**
 * What the person costing enters. Every override left empty follows the
 * survey or the rates card.
 */
export interface QuoteCostingInput {
  crewSize?: number | null;
  jobDays?: number | null;
  supervisorDays?: number | null;
  cleanerPayPerDayCents?: number | null;
  supervisorPayPerDayCents?: number | null;
  lunchPerPersonPerDayCents?: number | null;
  transportPerDayCents?: number | null;
  extraMaterials: CostingAmount[];
  ownedMachines: CostingOwnedMachineInput[];
  boughtMachines: CostingBoughtMachine[];
  hiredMachines: CostingHiredMachine[];
  upfrontPurchases: CostingAmount[];
  /** Empty means a one-off; a number of months means recurring for that long. */
  contractMonths?: number | null;
  /** Exactly as typed, on its basis. */
  clientPriceCents?: number | null;
  clientPriceBasis?: ClientPriceBasis | null;
  /** Scope the client quotation prints when nothing was surveyed. */
  clientScope?: string | null;
}

/** A costing as stored: owned machines carry their register copies. */
export interface QuoteCosting extends Omit<QuoteCostingInput, 'ownedMachines'> {
  ownedMachines: CostingOwnedMachine[];
  /** Visits per month when the client's price was entered. */
  clientPriceVisitsPerMonth?: number | null;
}

/** The costing and the request's own frequency, as the engine reads them. */
export interface EstimateCostingInput extends QuoteCosting {
  requestFrequency?: QuoteFrequency;
}

export interface QuoteCostingDto extends QuoteCosting {
  updatedByName: string | null;
  updatedAt: string;
}

/** An asset the costing can pick as an owned machine: the figures it copies, nothing else from finance. */
export interface QuoteBuilderAssetDto {
  id: string;
  name: string;
  category: string;
  costCents: number;
  salvageValueCents: number;
  usefulLifeMonths: number | null;
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
  /** Job days, cleaners per job day and supervisor days as charged: the costing's where set, else the survey's. */
  jobDays: number;
  crewSize: number;
  supervisorDays: number;
  /** What the survey alone works out. */
  surveyJobDays: number;
  surveyCrewSize: number;
  surveySupervisorDays: number;
}

/** The day rates charged: the costing's where set, else the rates card's. */
export interface EstimateDayRates {
  cleanerPayPerDayCents: number;
  supervisorPayPerDayCents: number;
  lunchPerPersonPerDayCents: number;
  transportPerDayCents: number;
}

export interface EstimateMachineLine {
  kind: 'OWNED' | 'BOUGHT' | 'HIRED';
  name: string;
  /** Null for a hired machine, which is charged per visit. */
  perJobDayCents: number | null;
  daysUsed: number | null;
  /** Per visit. */
  cents: number;
}

export interface EstimateCosts {
  labourCents: number;
  supervisorCents: number;
  /** From the survey. */
  consumablesCents: number;
  extraMaterialsCents: number;
  transportCents: number;
  /** Equipment allowance: a percentage of labour and supervisor pay. */
  equipmentWearCents: number;
  lunchCents: number;
  /** Owned and bought machines. */
  machineWearCents: number;
  machineHireCents: number;
  /** Per visit: in full on a one-off, spread over a recurring contract. */
  upfrontCents: number;
  /** Every line above. */
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
  /** The engine's price per visit after the frequency discount, never below the minimum. */
  recommendedPerVisitCents: number;
  /** As typed; null when none was entered. */
  clientPriceCents: number | null;
  clientPriceBasis: ClientPriceBasis | null;
  /** The price this estimate quotes: the client's when entered, else the recommended. */
  pricePerVisitCents: number;
  monthlyValueCents: number;
  /** Gross margin at quote: 1 − cost base (direct cost + contingency) ÷ price per visit. */
  marginPct: number;
  marginCheck: MarginCheck;
}

/** Expected profit at the quoted price: price less cost base, before tax and overheads. */
export interface EstimateProfit {
  perVisitCents: number;
  /** Null for a one-off (no contract length). */
  contractMonths: number | null;
  perMonthCents: number | null;
  perContractCents: number | null;
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
  dayRates: EstimateDayRates;
  machines: EstimateMachineLine[];
  costs: EstimateCosts;
  pricing: EstimatePricing;
  profit: EstimateProfit;
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
  /** MONTH: the monthly value is the agreed price and leads; the price per visit follows from it. */
  priceBasis: ClientPriceBasis;
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
