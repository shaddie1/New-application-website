import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('../db.js', () => ({ prisma: { quoteRates: { findUnique } } }));

import { DEFAULT_RATES, RatesSchema, loadRates } from './rates.js';

const savedAt = new Date('2026-10-01T09:00:00Z');

/** A card saved before lunch and working days were on it. */
function cardWithoutNewFields(overrides: Record<string, unknown> = {}) {
  const { lunchPerPersonPerDayCents: _lunch, workingDaysPerMonth: _days, ...old } = DEFAULT_RATES;
  return { ...old, cleanerPayPerDayCents: 95_000, ...overrides };
}

beforeEach(() => findUnique.mockReset());

describe('loadRates', () => {
  it('keeps the figures of a card saved before the new fields, and fills them from the defaults', async () => {
    findUnique.mockResolvedValue({ data: cardWithoutNewFields(), updatedAt: savedAt, updatedBy: { fullName: 'Amina' } });

    const { rates, updatedAt, updatedByName } = await loadRates();

    expect(rates.cleanerPayPerDayCents).toBe(95_000);
    expect(rates.lunchPerPersonPerDayCents).toBe(10_000);
    expect(rates.workingDaysPerMonth).toBe(26);
    expect(updatedAt).toBe(savedAt.toISOString());
    expect(updatedByName).toBe('Amina');
  });

  it('falls back to the defaults when a saved field is invalid', async () => {
    findUnique.mockResolvedValue({ data: cardWithoutNewFields({ cleanerPayPerDayCents: -1 }), updatedAt: savedAt, updatedBy: null });

    const { rates, updatedAt } = await loadRates();

    expect(rates).toEqual(DEFAULT_RATES);
    expect(updatedAt).toBeNull();
  });
});

describe('RatesSchema', () => {
  it('rejects zero working days per month', () => {
    expect(RatesSchema.safeParse({ ...DEFAULT_RATES, workingDaysPerMonth: 0 }).success).toBe(false);
  });
});
