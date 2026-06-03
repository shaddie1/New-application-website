import { describe, expect, it } from 'vitest';

import { computePointsForCharge, quoteBooking, travelFeeFor, type PricingInputs } from './pricing.js';

function inputs(overrides: Partial<PricingInputs> = {}): PricingInputs {
  return {
    serviceLineCode: 'residential',
    cleanTypeName: 'Deep clean',
    scope: { bedrooms: 3, bathrooms: 2, livingRooms: 0, cleanTypeCode: 'deep', addOnCodes: [] },
    addOns: [],
    ...overrides,
  };
}

describe('quoteBooking', () => {
  it('matches the mockup-15 calibration: deep clean 3 bed / 2 bath = KSh 3,200 base', () => {
    // 140,000 + 3×40,000 + 2×30,000 = 320,000 cents = KSh 3,200
    const q = quoteBooking(inputs({ area: null }));
    const base = q.lineItems.find((li) => li.kind === 'BASE');
    expect(base?.amountCents).toBe(320_000);
    expect(q.subtotalCents).toBe(320_000);
  });

  it('adds the default travel fee when the area is unknown', () => {
    const q = quoteBooking(inputs({ area: 'Nowhere' }));
    expect(q.travelFeeCents).toBe(30_000);
    // total = base 320,000 + travel 30,000
    expect(q.totalCents).toBe(350_000);
  });

  it('uses the per-area travel fee when known', () => {
    const q = quoteBooking(inputs({ area: 'Karen' }));
    expect(q.travelFeeCents).toBe(35_000);
    expect(q.totalCents).toBe(355_000);
  });

  it('sums add-ons into the subtotal and line items', () => {
    const q = quoteBooking(
      inputs({
        area: null,
        addOns: [
          { id: 'a1', code: 'fridge', name: 'Inside fridge', priceCents: 50_000 },
          { id: 'a2', code: 'oven', name: 'Inside oven', priceCents: 40_000 },
        ],
      }),
    );
    expect(q.subtotalCents).toBe(320_000 + 90_000);
    expect(q.lineItems.filter((li) => li.kind === 'ADDON')).toHaveLength(2);
    // total = subtotal 410,000 + travel 30,000
    expect(q.totalCents).toBe(440_000);
  });

  it('applies credit and discount and never goes below zero', () => {
    const q = quoteBooking(inputs({ area: null, creditAppliedCents: 100_000, discountCents: 50_000 }));
    // 320,000 + 30,000 − 100,000 − 50,000 = 200,000
    expect(q.totalCents).toBe(200_000);
    expect(q.lineItems.some((li) => li.kind === 'CREDIT')).toBe(true);
    expect(q.lineItems.some((li) => li.kind === 'DISCOUNT')).toBe(true);

    const huge = quoteBooking(inputs({ area: null, creditAppliedCents: 999_999_999 }));
    expect(huge.totalCents).toBe(0);
  });

  it('throws on an unknown clean type', () => {
    expect(() =>
      quoteBooking(inputs({ scope: { bedrooms: 1, bathrooms: 1, livingRooms: 0, cleanTypeCode: 'bogus' as never, addOnCodes: [] } })),
    ).toThrow(/unknown clean type/);
  });

  it('estimates duration from base + per-bedroom minutes', () => {
    // deep: base 150 + 45×3 = 285
    const q = quoteBooking(inputs({ area: null }));
    expect(q.estimatedDurationMinutes).toBe(285);
  });
});

describe('travelFeeFor', () => {
  it('returns the default for null/undefined/unknown areas', () => {
    expect(travelFeeFor(null)).toBe(30_000);
    expect(travelFeeFor(undefined)).toBe(30_000);
    expect(travelFeeFor('Atlantis')).toBe(30_000);
  });

  it('returns the configured fee for a known area', () => {
    expect(travelFeeFor('CBD')).toBe(20_000);
    expect(travelFeeFor('Runda')).toBe(35_000);
  });
});

describe('computePointsForCharge', () => {
  it('awards 10 pts per KSh 100 (floored) with no schedule', () => {
    // 350,000 cents = KSh 3,500 → 350 pts
    expect(computePointsForCharge(350_000)).toBe(350);
    // floors partial hundreds: KSh 3,599 → still 359 pts
    expect(computePointsForCharge(359_900)).toBe(359);
  });

  it('doubles points for a Saturday booking (Africa/Nairobi)', () => {
    const saturday = new Date('2024-01-06T09:00:00+03:00'); // Sat in EAT
    expect(computePointsForCharge(350_000, saturday)).toBe(700);
  });

  it('does not double for a weekday booking', () => {
    const wednesday = new Date('2024-01-03T09:00:00+03:00'); // Wed in EAT
    expect(computePointsForCharge(350_000, wednesday)).toBe(350);
  });
});
