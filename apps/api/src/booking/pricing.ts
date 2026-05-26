/**
 * Booking pricing rules.
 *
 * v1 keeps the formula in code rather than a DB table — pricing changes rarely
 * and we'd rather review them in a PR than as runtime config. When/if marketing
 * needs to tweak prices without a deploy, port these constants into a
 * PricingRule table mirroring PointsRule.
 *
 * The shape is intentionally simple:
 *   base + (bedrooms × per-bed) + (bathrooms × per-bath) + (livingRooms × per-living)
 *   + sum(add-ons)
 *   + travel fee (per area)
 *   − customer credit applied (first-clean, refund credit, ...)
 *   − discount (promo code; not implemented yet)
 *
 * All values in KES cents.
 */
import type { CleanTypeCode, QuoteLineItem, QuoteResult, BookingScope, ServiceLineCode } from '@onyxhawk/types';

interface CleanTypePricing {
  basePriceCents: number;
  perBedroomCents: number;
  perBathroomCents: number;
  perLivingRoomCents: number;
  baseDurationMinutes: number;
  durationPerBedroomMinutes: number;
}

// Calibrated against mockup 15 ("Deep clean · 3 bed / 2 bath" → 3,200):
//   1,400 + 3×400 + 2×300 = 1,400 + 1,200 + 600 = 3,200 ✓
const CLEAN_TYPE_PRICING: Record<CleanTypeCode, CleanTypePricing> = {
  standard: {
    basePriceCents: 100_000,
    perBedroomCents: 30_000,
    perBathroomCents: 20_000,
    perLivingRoomCents: 15_000,
    baseDurationMinutes: 90,
    durationPerBedroomMinutes: 30,
  },
  deep: {
    basePriceCents: 140_000,
    perBedroomCents: 40_000,
    perBathroomCents: 30_000,
    perLivingRoomCents: 20_000,
    baseDurationMinutes: 150,
    durationPerBedroomMinutes: 45,
  },
  move_out: {
    basePriceCents: 200_000,
    perBedroomCents: 50_000,
    perBathroomCents: 40_000,
    perLivingRoomCents: 30_000,
    baseDurationMinutes: 240,
    durationPerBedroomMinutes: 60,
  },
  recurring: {
    basePriceCents: 250_000,
    perBedroomCents: 0,
    perBathroomCents: 0,
    perLivingRoomCents: 0,
    baseDurationMinutes: 180,
    durationPerBedroomMinutes: 0,
  },
};

// Travel fee by area. Default applies when the area isn't in the map.
const TRAVEL_FEE_BY_AREA = new Map<string, number>([
  ['Westlands', 25_000],
  ['Kilimani', 25_000],
  ['Lavington', 28_000],
  ['Karen', 35_000],
  ['Runda', 35_000],
  ['Parklands', 30_000],
  ['CBD', 20_000],
  ['Upper Hill', 22_000],
]);
const DEFAULT_TRAVEL_FEE_CENTS = 30_000;

// Hawk Points: 10 pts per KSh 100, doubled on Sat/Sun.
const POINTS_NUMERATOR = 10;
const POINTS_DENOMINATOR_CENTS = 10_000;

export interface PricingInputs {
  serviceLineCode: ServiceLineCode;
  scope: BookingScope;
  cleanTypeName: string;       // for line-item labels
  addOns: Array<{ id: string; code: string; name: string; priceCents: number }>;
  area?: string | null;
  scheduledAt?: Date;
  creditAppliedCents?: number;
  discountCents?: number;
}

export function quoteBooking(input: PricingInputs): QuoteResult {
  const pricing = CLEAN_TYPE_PRICING[input.scope.cleanTypeCode];
  if (!pricing) {
    throw new Error(`unknown clean type: ${input.scope.cleanTypeCode}`);
  }

  const lineItems: QuoteLineItem[] = [];

  // Base
  const baseCents =
    pricing.basePriceCents +
    pricing.perBedroomCents * input.scope.bedrooms +
    pricing.perBathroomCents * input.scope.bathrooms +
    pricing.perLivingRoomCents * input.scope.livingRooms;
  lineItems.push({
    label: `${input.cleanTypeName} · ${input.scope.bedrooms} bed / ${input.scope.bathrooms} bath`,
    amountCents: baseCents,
    kind: 'BASE',
  });

  // Add-ons
  let addOnsTotalCents = 0;
  for (const addOn of input.addOns) {
    lineItems.push({ label: addOn.name, amountCents: addOn.priceCents, kind: 'ADDON' });
    addOnsTotalCents += addOn.priceCents;
  }

  // Travel
  const travelFeeCents = travelFeeFor(input.area);
  if (input.area) {
    lineItems.push({ label: `Travel · ${input.area}`, amountCents: travelFeeCents, kind: 'TRAVEL' });
  } else {
    lineItems.push({ label: 'Travel', amountCents: travelFeeCents, kind: 'TRAVEL' });
  }

  // Credit & discount
  const creditAppliedCents = input.creditAppliedCents ?? 0;
  const discountCents = input.discountCents ?? 0;
  if (creditAppliedCents > 0) {
    lineItems.push({ label: 'First-clean credit', amountCents: -creditAppliedCents, kind: 'CREDIT' });
  }
  if (discountCents > 0) {
    lineItems.push({ label: 'Promo discount', amountCents: -discountCents, kind: 'DISCOUNT' });
  }

  const subtotalCents = baseCents + addOnsTotalCents;
  const totalCents = Math.max(0, subtotalCents + travelFeeCents - creditAppliedCents - discountCents);

  const estimatedDurationMinutes =
    pricing.baseDurationMinutes + pricing.durationPerBedroomMinutes * input.scope.bedrooms;

  const pointsToEarn = computePointsForCharge(totalCents, input.scheduledAt);

  return {
    serviceLineCode: input.serviceLineCode,
    cleanTypeCode: input.scope.cleanTypeCode,
    lineItems,
    subtotalCents,
    travelFeeCents,
    creditAppliedCents,
    discountCents,
    totalCents,
    estimatedDurationMinutes,
    pointsToEarn,
  };
}

export function travelFeeFor(area: string | null | undefined): number {
  if (!area) return DEFAULT_TRAVEL_FEE_CENTS;
  return TRAVEL_FEE_BY_AREA.get(area) ?? DEFAULT_TRAVEL_FEE_CENTS;
}

/** 10 pts per KSh 100, ×2 on Sat/Sun (Africa/Nairobi). */
export function computePointsForCharge(amountCents: number, scheduledAt?: Date): number {
  const base = Math.floor((amountCents * POINTS_NUMERATOR) / POINTS_DENOMINATOR_CENTS);
  if (!scheduledAt) return base;
  // toLocaleString is the simplest way to get the weekday in a fixed tz without pulling in date-fns-tz.
  const weekday = scheduledAt.toLocaleString('en-US', { timeZone: 'Africa/Nairobi', weekday: 'short' });
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  return isWeekend ? base * 2 : base;
}
