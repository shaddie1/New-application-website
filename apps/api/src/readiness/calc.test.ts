import { describe, expect, it } from 'vitest';

import {
  breakEvenKgPerDay,
  breakEvenKgPerMonth,
  compliantFixedCostsPerMonthCents,
  compliantStaffCount,
  contributionPerKgCents,
  reserveBalanceCents,
  reserveGates,
} from './calc.js';

// The Laundry sheet's inputs.
const SHEET = { pricePerKgCents: 10_000, consumablesPct: 0.1, workingDaysPerMonth: 26 };
const FIXED_NOW = 3_138_542; // KES 31,385.42
const FIXED_COMPLIANT = 4_201_685; // KES 42,016.85

describe('laundry break-even', () => {
  it('contribution per kg is price less consumables', () => {
    expect(contributionPerKgCents(10_000, 0.1)).toBeCloseTo(9_000, 6);
  });

  it('matches the sheet: 13.4 kg/day on Now pay', () => {
    expect(breakEvenKgPerDay({ ...SHEET, fixedCostsCents: FIXED_NOW })).toBeCloseTo(13.4, 1);
  });

  it('matches the sheet: 18.0 kg/day on Compliant pay', () => {
    expect(breakEvenKgPerDay({ ...SHEET, fixedCostsCents: FIXED_COMPLIANT })).toBeCloseTo(18.0, 1);
  });

  it('per month is per day × working days', () => {
    const perDay = breakEvenKgPerDay({ ...SHEET, fixedCostsCents: FIXED_NOW });
    expect(breakEvenKgPerMonth({ ...SHEET, fixedCostsCents: FIXED_NOW })).toBeCloseTo(perDay * 26, 6);
  });

  it('never divides by zero when the price or the days are zero', () => {
    expect(breakEvenKgPerDay({ ...SHEET, pricePerKgCents: 0, fixedCostsCents: FIXED_NOW })).toBe(Infinity);
    expect(breakEvenKgPerDay({ ...SHEET, workingDaysPerMonth: 0, fixedCostsCents: FIXED_NOW })).toBe(Infinity);
  });
});

describe('compliant fixed costs', () => {
  it('counts the two trainees, plus the attendant once the laundry runs', () => {
    expect(compliantStaffCount(false)).toBe(2);
    expect(compliantStaffCount(true)).toBe(3);
  });

  it('loads the minimum wage with NSSF, AHL, WIBA and NITA per head', () => {
    // 18,047.40 × 1.085 + 50 = 19,631.43 per head
    expect(compliantFixedCostsPerMonthCents(1)).toBe(1_963_143);
    expect(compliantFixedCostsPerMonthCents(2)).toBe(3_926_286);
    expect(compliantFixedCostsPerMonthCents(3)).toBe(5_889_429);
  });
});

describe('reserve gates', () => {
  const monthly = compliantFixedCostsPerMonthCents(2);

  it('gate 2 needs three months of compliant fixed costs', () => {
    const g = reserveGates(monthly * 3, monthly);
    expect(g.gate2RequiredCents).toBe(monthly * 3);
    expect(g.gate2Met).toBe(true);
    expect(reserveGates(monthly * 3 - 1, monthly).gate2Met).toBe(false);
  });

  it('gate 3 needs twelve months', () => {
    const g = reserveGates(monthly * 12, monthly);
    expect(g.gate3RequiredCents).toBe(monthly * 12);
    expect(g.gate3Met).toBe(true);
    expect(reserveGates(monthly * 11, monthly).gate3Met).toBe(false);
  });

  it('gate 3 gets harder when the attendant joins', () => {
    const two = reserveGates(0, compliantFixedCostsPerMonthCents(2)).gate3RequiredCents;
    const three = reserveGates(0, compliantFixedCostsPerMonthCents(3)).gate3RequiredCents;
    expect(three).toBeGreaterThan(two);
  });

  it('balance is deposits less withdrawals', () => {
    expect(reserveBalanceCents([
      { kind: 'DEPOSIT', amountCents: 500_000 },
      { kind: 'WITHDRAWAL', amountCents: 120_000 },
      { kind: 'DEPOSIT', amountCents: 20_000 },
    ])).toBe(400_000);
    expect(reserveBalanceCents([])).toBe(0);
  });
});
