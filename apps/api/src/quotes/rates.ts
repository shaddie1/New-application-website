/**
 * The rates card behind every estimate: pay, time policy, transport, soil and
 * frequency tables, and production rates per area/item. One editable record
 * in the database; DEFAULT_RATES is what it starts as and what the API falls
 * back to before anyone has saved one.
 *
 * Seeded from OnyxHawk_Quotation_Calculator.xlsx (Rates sheet, Sept 2026).
 * Money is in cents; percentages are fractions.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { CleanLevel, QuoteRates, QuoteRatesDto } from '@onyxhawk/types';

import { prisma } from '../db.js';

export const RATES_ID = 'default';

export const CLEAN_LEVELS = ['ROUTINE', 'DEEP', 'VACUUM_ONLY'] as const;
export const DISTANCE_ZONES = ['ZONE1', 'ZONE2', 'ZONE3'] as const;
export const SOIL_LEVELS = ['LIGHT', 'NORMAL', 'HEAVY'] as const;
export const ROOM_SIZE_PRESETS = ['SMALL', 'MEDIUM', 'LARGE', 'VERY_LARGE', 'MEASURED'] as const;

const kes = (n: number) => Math.round(n * 100);

/** (area type, per clean level) → [m²/person-hour, consumables/m², market low/m², market high/m²] in KSh. */
const AREA_TABLE: Record<string, Record<CleanLevel, [number, number, number, number]>> = {
  'Office room': { ROUTINE: [250, 1.0, 38, 50], DEEP: [50, 2.0, 50, 150], VACUUM_ONLY: [200, 0.2, 38, 50] },
  'Boardroom or meeting room': { ROUTINE: [280, 1.0, 38, 50], DEEP: [55, 2.0, 50, 150], VACUUM_ONLY: [220, 0.2, 38, 50] },
  'Open area / sitting area / reception': { ROUTINE: [300, 1.0, 38, 50], DEEP: [60, 2.0, 50, 150], VACUUM_ONLY: [250, 0.2, 38, 50] },
  'Corridor / lobby / stairs': { ROUTINE: [450, 0.8, 38, 50], DEEP: [80, 1.5, 50, 150], VACUUM_ONLY: [350, 0.2, 38, 50] },
  // Vacuum-only is not a normal choice for kitchens and washrooms; treated like Routine.
  'Kitchen or pantry': { ROUTINE: [150, 2.0, 38, 50], DEEP: [25, 4.0, 50, 150], VACUUM_ONLY: [150, 0.2, 38, 50] },
  'Washroom incl. toilets and sinks': { ROUTINE: [60, 4.0, 38, 50], DEEP: [15, 6.0, 50, 150], VACUUM_ONLY: [60, 4.0, 38, 50] },
  'Carpeted or gaming area': { ROUTINE: [220, 0.5, 80, 158], DEEP: [40, 3.0, 80, 150], VACUUM_ONLY: [250, 0.2, 38, 50] },
  'Store or warehouse': { ROUTINE: [550, 0.5, 38, 50], DEEP: [100, 1.5, 50, 150], VACUUM_ONLY: [450, 0.2, 38, 50] },
};

/** item type → [minutes/unit, consumables/unit, market low/unit, market high/unit] in KSh. */
const ITEM_TABLE: Record<string, [number, number, number, number]> = {
  'Chair (office/boardroom/dining): vacuum and wipe': [3, 1, 0, 0], // included in area price
  'Chair: shampoo and dry': [12, 15, 300, 400],
  'Sofa seat: shampoo and dry': [20, 25, 550, 1000], // per seat
  'Carpet or rug: extraction clean (per m²)': [1.5, 8, 80, 150],
  'Window or glass panel: interior clean': [3, 3, 0, 0], // reachable only; high glass = separate quote
  'Waste bin: empty and reline': [1, 3, 0, 0],
  'Fridge or microwave: clean inside and out': [15, 10, 0, 0],
  'Mattress: vacuum and sanitise': [20, 30, 3000, 4500],
  'Kitchen cabinets: clean inside (per cabinet)': [5, 3, 0, 0],
};

export const DEFAULT_RATES: QuoteRates = {
  // A. Pay, time and pricing policy
  cleanerPayPerDayCents: kes(800), // now-pay phase; compliant-phase floor is the legal minimum
  supervisorPayPerDayCents: kes(800), // 0 once the supervisor is salaried under compliant pay
  legalMinWagePerDayCents: kes(868.44), // Nairobi general labourer, Wages Order 2026
  productiveHoursPerPersonPerDay: 7,
  largestCrewPerJobDay: 6,
  setupCloseOutHours: 1,
  movementAllowancePct: 0.15,
  equipmentWearPct: 0.05,
  contingencyPct: 0.1,
  targetMarginPct: 0.4,
  minimumMarginPct: 0.3,
  commissionPct: 0.05,
  roundToKes: 500,
  quoteContactPhone: '+254 115 247 988', // unconfirmed — profile/website show a different number
  quoteContactEmail: 'info@onyxhawkcleaningservice.com',

  // B. Transport per job day by distance zone
  transportByZoneCents: {
    ZONE1: kes(1000), // up to 10 km — actual, current office contract
    ZONE2: kes(2000), // 10–25 km — planning figure, replace with transporter's quote
    ZONE3: kes(3500), // over 25 km — planning figure
  },

  // C. Soil level → hours multiplier
  soilMultiplier: { LIGHT: 0.85, NORMAL: 1.0, HEAVY: 1.3 },

  // D. Service frequency → visits per month and discount
  frequencyTable: [
    { label: 'One-off', visitsPerMonth: 1, discountPct: 0 },
    { label: 'Monthly (1 visit)', visitsPerMonth: 1, discountPct: 0 }, // no volume discount — a month of dirt
    { label: 'Fortnightly (2 visits)', visitsPerMonth: 2, discountPct: 0.1 },
    { label: 'Weekly (4 visits)', visitsPerMonth: 4, discountPct: 0.15 },
    { label: 'Twice weekly (8 visits)', visitsPerMonth: 8, discountPct: 0.18 },
    { label: 'Daily (22 visits)', visitsPerMonth: 22, discountPct: 0.2 },
  ],

  // E. Room size presets (m²)
  roomSizePresetsM2: { SMALL: 10, MEDIUM: 20, LARGE: 40, VERY_LARGE: 80 },

  // F. Area production rates
  areaRates: Object.entries(AREA_TABLE).flatMap(([areaType, levels]) =>
    CLEAN_LEVELS.map((cleanLevel) => {
      const [m2PerPersonHour, consumables, low, high] = levels[cleanLevel];
      return {
        areaType,
        cleanLevel,
        m2PerPersonHour,
        consumablesPerM2Cents: kes(consumables),
        marketLowPerM2Cents: kes(low),
        marketHighPerM2Cents: kes(high),
      };
    }),
  ),

  // G. Items counted on site
  itemRates: Object.entries(ITEM_TABLE).map(([itemType, [minutes, consumables, low, high]]) => ({
    itemType,
    minutesPerUnit: minutes,
    consumablesPerUnitCents: kes(consumables),
    marketLowPerUnitCents: kes(low),
    marketHighPerUnitCents: kes(high),
  })),

  // H. Work descriptions printed on the client quotation
  workDescriptions: {
    ROUTINE: 'Dusting and wiping of surfaces; floors swept and mopped or vacuumed; bins emptied.',
    DEEP: 'All surfaces, furniture, skirting, doors and reachable glass; under movable furniture; floors scrubbed; fittings disinfected.',
    VACUUM_ONLY: 'Vacuuming of floors and soft furnishings.',
    ITEM: 'Item cleaning as listed.',
  },
};

// ── Validation ──────────────────────────────────────────────────────────────

const cents = z.number().int().nonnegative();
const pct = z.number().min(0).max(1);
const positive = z.number().positive();

export const RatesSchema = z.object({
  cleanerPayPerDayCents: cents,
  supervisorPayPerDayCents: cents,
  legalMinWagePerDayCents: cents,
  productiveHoursPerPersonPerDay: positive.max(24),
  largestCrewPerJobDay: z.number().int().min(1).max(100),
  setupCloseOutHours: z.number().min(0).max(24),
  movementAllowancePct: pct,
  equipmentWearPct: pct,
  contingencyPct: pct,
  targetMarginPct: z.number().min(0).max(0.99),
  minimumMarginPct: z.number().min(0).max(0.99),
  commissionPct: pct,
  roundToKes: z.number().int().min(1),
  quoteContactPhone: z.string().trim().max(40),
  quoteContactEmail: z.string().trim().max(120),
  transportByZoneCents: z.object({ ZONE1: cents, ZONE2: cents, ZONE3: cents }),
  soilMultiplier: z.object({ LIGHT: positive, NORMAL: positive, HEAVY: positive }),
  frequencyTable: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        visitsPerMonth: z.number().int().min(1),
        discountPct: pct,
      }),
    )
    .min(1)
    .refine((rows) => new Set(rows.map((r) => r.label)).size === rows.length, 'frequency labels must be unique'),
  roomSizePresetsM2: z.object({ SMALL: positive, MEDIUM: positive, LARGE: positive, VERY_LARGE: positive }),
  areaRates: z
    .array(
      z.object({
        areaType: z.string().trim().min(1).max(80),
        cleanLevel: z.enum(CLEAN_LEVELS),
        m2PerPersonHour: positive,
        consumablesPerM2Cents: cents,
        marketLowPerM2Cents: cents,
        marketHighPerM2Cents: cents,
      }),
    )
    .min(1)
    .refine(
      (rows) => new Set(rows.map((r) => `${r.areaType}|${r.cleanLevel}`)).size === rows.length,
      'each (area type, clean level) may appear once',
    ),
  itemRates: z
    .array(
      z.object({
        itemType: z.string().trim().min(1).max(80),
        minutesPerUnit: positive,
        consumablesPerUnitCents: cents,
        marketLowPerUnitCents: cents,
        marketHighPerUnitCents: cents,
      }),
    )
    .min(1)
    .refine((rows) => new Set(rows.map((r) => r.itemType)).size === rows.length, 'item types must be unique'),
  workDescriptions: z.object({
    ROUTINE: z.string().trim().max(400),
    DEEP: z.string().trim().max(400),
    VACUUM_ONLY: z.string().trim().max(400),
    ITEM: z.string().trim().max(400),
  }),
}).refine((r) => r.minimumMarginPct <= r.targetMarginPct, {
  message: 'minimum margin cannot exceed target margin',
  path: ['minimumMarginPct'],
}) satisfies z.ZodType<QuoteRates>;

// ── Persistence ─────────────────────────────────────────────────────────────

/** The saved rates, or the defaults when nobody has edited them yet. */
export async function loadRates(): Promise<QuoteRatesDto> {
  const row = await prisma.quoteRates.findUnique({
    where: { id: RATES_ID },
    include: { updatedBy: { select: { fullName: true } } },
  });
  if (!row) return { rates: DEFAULT_RATES, updatedAt: null, updatedByName: null };

  // A stored card that fails validation (e.g. after a schema change) must not
  // take quoting down with it — fall back to the defaults and say so in the log.
  const parsed = RatesSchema.safeParse(row.data);
  if (!parsed.success) return { rates: DEFAULT_RATES, updatedAt: null, updatedByName: null };

  return {
    rates: parsed.data,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy?.fullName ?? null,
  };
}

export async function saveRates(rates: QuoteRates, userId: string): Promise<QuoteRatesDto> {
  const data = rates as unknown as Prisma.InputJsonValue;
  const row = await prisma.quoteRates.upsert({
    where: { id: RATES_ID },
    create: { id: RATES_ID, data, updatedById: userId },
    update: { data, updatedById: userId },
    include: { updatedBy: { select: { fullName: true } } },
  });
  return { rates, updatedAt: row.updatedAt.toISOString(), updatedByName: row.updatedBy?.fullName ?? null };
}
