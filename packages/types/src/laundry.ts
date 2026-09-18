// ── Laundry service line ─────────────────────────────────────────────────────

/** Set on the Compliance checklist; the laundry line is only sold once it is GO. */
export type LaundryGoDecision = 'PENDING' | 'GO' | 'NO_GO';

/** The catalog code the Laundry service line is filed under. */
export const LAUNDRY_LINE_CODE = 'laundry';

export interface LaundrySettingsDto {
  pricePerKgCents: number;
  /** Consumables as a fraction of price, e.g. 0.10. */
  consumablesPct: number;
  workingDaysPerMonth: number;
  /** Rent, attendant, electricity, water/sewer and loan repayment per month. */
  fixedCostsNowCents: number;
  /** Same, with the attendant at the legal minimum plus statutory costs. */
  fixedCostsCompliantCents: number;
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface UpdateLaundrySettingsInput {
  pricePerKgCents?: number;
  consumablesPct?: number;
  workingDaysPerMonth?: number;
  fixedCostsNowCents?: number;
  fixedCostsCompliantCents?: number;
}

/** The break-even stat, computed for whichever pay phase the company is in. */
export interface LaundryBreakEvenDto {
  goDecision: LaundryGoDecision;
  payPhase: PayPhase;
  settings: LaundrySettingsDto;
  /** Fixed costs used for the current phase. */
  fixedCostsCents: number;
  /** Contribution per kg after consumables, in cents. */
  contributionPerKgCents: number;
  breakEvenKgPerDay: number;
  breakEvenKgPerMonth: number;
  /** Both phases, so the UI can show the other figure without a second call. */
  breakEvenKgPerDayNow: number;
  breakEvenKgPerDayCompliant: number;
  canEditSettings: boolean;
}

// ── Compliant-pay readiness ──────────────────────────────────────────────────

export type PayPhase = 'NOW' | 'COMPLIANT';

export const PAY_PHASE_LABEL: Record<PayPhase, string> = {
  NOW: 'Now pay',
  COMPLIANT: 'Compliant pay',
};

export type ReserveEntryKind = 'DEPOSIT' | 'WITHDRAWAL';

export interface ReserveEntryDto {
  id: string;
  kind: ReserveEntryKind;
  amountCents: number;
  date: string; // YYYY-MM-DD
  note: string;
  reference: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface CreateReserveEntryInput {
  kind: ReserveEntryKind;
  amountCents: number;
  date: string; // YYYY-MM-DD
  note: string;
  reference?: string;
}

export interface ReserveLedgerDto {
  entries: ReserveEntryDto[];
  balanceCents: number;
  canEdit: boolean;
}

/** One row of the readiness card. Gate 1 is a judgement; 2 and 3 are arithmetic. */
export interface ReadinessGateDto {
  key: 'MARGIN' | 'RESERVE_3_MONTHS' | 'SALARIES_12_MONTHS';
  label: string;
  met: boolean;
  /** What the gate is measured against, already formatted for the row. */
  detail: string;
  requiredCents: number | null;
  actualCents: number | null;
}

export interface ReadinessDto {
  payPhase: PayPhase;
  gate1MarginMet: boolean;
  gate1FirstMetMonth: string | null; // YYYY-MM-DD (first of the month)
  laundryOperational: boolean;
  /** 2 (BD Lead, Comms) + 1 when the laundry attendant is on payroll. */
  staffCount: number;
  compliantFixedCostsPerMonthCents: number;
  reserveBalanceCents: number;
  gates: ReadinessGateDto[];
  allMet: boolean;
  canEdit: boolean;
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface UpdateReadinessInput {
  payPhase?: PayPhase;
  gate1MarginMet?: boolean;
  gate1FirstMetMonth?: string | null; // YYYY-MM-DD
  laundryOperational?: boolean;
}
