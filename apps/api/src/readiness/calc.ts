/**
 * Pure arithmetic behind the laundry break-even stat and the compliant-pay
 * readiness gates. No I/O so the sheet's figures can be pinned in tests.
 *
 * Gate 1 (operating margin ≥ 10% for three months on a compliant-pay basis)
 * is deliberately not here: it is the COO's monthly judgement, recorded as a
 * status and a first-met month, not a simulation.
 */

/** Minimum monthly wage the compliant phase is costed at, in cents. */
export const COMPLIANT_MONTHLY_WAGE_CENTS = 1_804_740; // KES 18,047.40
/** Employer statutory on-costs as fractions of the wage. */
export const NSSF_RATE = 0.06;
export const AHL_RATE = 0.015;
export const WIBA_RATE = 0.01;
/** NITA levy per employee per month, in cents. */
export const NITA_PER_STAFF_CENTS = 5_000; // KES 50
/** The two trainees on payroll in the compliant phase. */
export const BASE_STAFF_COUNT = 2;

export const RESERVE_MONTHS_GATE_2 = 3;
export const SALARY_MONTHS_GATE_3 = 12;

export interface BreakEvenInputs {
  pricePerKgCents: number;
  consumablesPct: number;
  workingDaysPerMonth: number;
  fixedCostsCents: number;
}

/** Contribution per kg once consumables are paid for. */
export function contributionPerKgCents(pricePerKgCents: number, consumablesPct: number): number {
  return pricePerKgCents * (1 - consumablesPct);
}

/**
 * kg/day that covers fixed costs:
 *   fixedCosts / (workingDays × pricePerKg × (1 − consumablesPct))
 * At the sheet's figures: 13.4 kg/day (Now pay), 18.0 kg/day (Compliant pay).
 */
export function breakEvenKgPerDay(i: BreakEvenInputs): number {
  const perDay = i.workingDaysPerMonth * contributionPerKgCents(i.pricePerKgCents, i.consumablesPct);
  if (perDay <= 0) return Number.POSITIVE_INFINITY;
  return i.fixedCostsCents / perDay;
}

export function breakEvenKgPerMonth(i: BreakEvenInputs): number {
  const contribution = contributionPerKgCents(i.pricePerKgCents, i.consumablesPct);
  if (contribution <= 0) return Number.POSITIVE_INFINITY;
  return i.fixedCostsCents / contribution;
}

/** 2 trainees, plus the laundry attendant once the laundry is operational. */
export function compliantStaffCount(laundryOperational: boolean): number {
  return BASE_STAFF_COUNT + (laundryOperational ? 1 : 0);
}

/**
 * Monthly compliant fixed costs:
 *   staff × 18,047.40 × (1 + 0.06 NSSF + 0.015 AHL + 0.01 WIBA) + 50 × staff NITA
 */
export function compliantFixedCostsPerMonthCents(staffCount: number): number {
  const loaded = COMPLIANT_MONTHLY_WAGE_CENTS * (1 + NSSF_RATE + AHL_RATE + WIBA_RATE);
  return Math.round(staffCount * loaded + NITA_PER_STAFF_CENTS * staffCount);
}

export interface ReserveGates {
  gate2RequiredCents: number;
  gate2Met: boolean;
  gate3RequiredCents: number;
  gate3Met: boolean;
}

/**
 * Gates 2 and 3 against the reserve balance alone. The sheet's gate 3 likely
 * also counts cash on hand, which the dashboard does not track as a running
 * balance — so this is the stricter reading, on purpose.
 */
export function reserveGates(reserveBalanceCents: number, compliantFixedCostsCents: number): ReserveGates {
  const gate2RequiredCents = compliantFixedCostsCents * RESERVE_MONTHS_GATE_2;
  const gate3RequiredCents = compliantFixedCostsCents * SALARY_MONTHS_GATE_3;
  return {
    gate2RequiredCents,
    gate2Met: reserveBalanceCents >= gate2RequiredCents,
    gate3RequiredCents,
    gate3Met: reserveBalanceCents >= gate3RequiredCents,
  };
}

/** Signed sum of the ledger. */
export function reserveBalanceCents(entries: { kind: 'DEPOSIT' | 'WITHDRAWAL'; amountCents: number }[]): number {
  return entries.reduce((sum, e) => sum + (e.kind === 'DEPOSIT' ? e.amountCents : -e.amountCents), 0);
}
