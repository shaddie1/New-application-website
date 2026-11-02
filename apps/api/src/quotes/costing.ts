/**
 * The costing a quote carries beyond its survey: crew and day rates set by
 * hand, extra materials, machines, upfront purchases, contract length and the
 * client's price. Validation, the asset register copies an owned machine is
 * costed from, and the blank survey a costing creates when a quote has none.
 *
 * Money is in cents; an override left empty follows the survey or rates card.
 */
import { z } from 'zod';
import type {
  CostingOwnedMachine,
  OwnedMachineCopy,
  QuoteCosting,
  QuoteCostingInput,
  QuoteFrequency,
  QuoteSurveyInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';

const cents = z.number().int().min(0).max(100_000_000_000);
const name = z.string().trim().min(1).max(80);
const daysUsed = z.number().int().min(1).max(31).nullish();
const amount = z.object({ name, amountCents: cents });

export const CostingSchema = z
  .object({
    crewSize: z.number().int().min(1).max(100).nullish(),
    jobDays: z.number().int().min(1).max(31).nullish(),
    supervisorDays: z.number().int().min(0).max(31).nullish(),
    cleanerPayPerDayCents: cents.nullish(),
    supervisorPayPerDayCents: cents.nullish(),
    lunchPerPersonPerDayCents: cents.nullish(),
    transportPerDayCents: cents.nullish(),
    extraMaterials: z.array(amount).max(50),
    ownedMachines: z
      .array(z.object({ assetId: z.string().trim().min(1).max(40), daysUsed, wearPerDayCents: cents.nullish() }))
      .max(30),
    boughtMachines: z
      .array(z.object({ name, priceCents: cents, lifeMonths: z.number().int().min(1).max(600), daysUsed }))
      .max(30),
    hiredMachines: z.array(z.object({ name, hirePerVisitCents: cents })).max(30),
    upfrontPurchases: z.array(amount).max(50),
    contractMonths: z.number().int().min(1).max(120).nullish(),
    clientPriceCents: cents.nullish(),
    clientPriceBasis: z.enum(['VISIT', 'MONTH']).nullish(),
    clientScope: z.string().trim().max(2000).nullish(),
  })
  .refine((c) => !(c.clientPriceBasis === 'MONTH' && c.clientPriceCents != null && !c.contractMonths), {
    message: 'a price per month needs the contract length in months',
    path: ['contractMonths'],
  }) satisfies z.ZodType<QuoteCostingInput>;

/** What a quote nobody has costed is computed with. */
export const EMPTY_COSTING: QuoteCosting = {
  extraMaterials: [],
  ownedMachines: [],
  boughtMachines: [],
  hiredMachines: [],
  upfrontPurchases: [],
};

/** The rates card's frequency label for a request's "how often". */
export const FREQ_TO_RATES_LABEL: Record<QuoteFrequency, string> = {
  NONE: 'One-off',
  WEEKLY: 'Weekly (4 visits)',
  BIWEEKLY: 'Fortnightly (2 visits)',
  MONTHLY: 'Monthly (1 visit)',
};

/**
 * A survey with nothing measured, at the request's frequency when the rates
 * card still has that label, else the card's first row.
 */
export function defaultSurvey(frequency: QuoteFrequency, labels: string[]): QuoteSurveyInput {
  const wanted = FREQ_TO_RATES_LABEL[frequency] ?? 'One-off';
  return {
    distanceZone: 'ZONE1',
    soilLevel: 'NORMAL',
    frequencyLabel: labels.includes(wanted) ? wanted : labels[0] ?? wanted,
    workingWindowHours: 7,
    supervisorOnSite: false,
    traineeSourced: false,
    notes: null,
    areas: [],
    items: [],
  };
}

/**
 * Owned machines with their asset register figures copied in. A machine
 * deleted from the register since the last save keeps its last copy. Returns
 * a sentence instead when a machine cannot be costed.
 */
export async function copyOwnedMachines(
  wanted: QuoteCostingInput['ownedMachines'],
  previous: CostingOwnedMachine[],
): Promise<{ machines: CostingOwnedMachine[] } | { error: string }> {
  if (wanted.length === 0) return { machines: [] };
  const rows = await prisma.asset.findMany({
    where: { id: { in: [...new Set(wanted.map((m) => m.assetId))] } },
    select: { id: true, name: true, category: true, costCents: true, salvageValueCents: true, usefulLifeMonths: true, retiredAt: true },
  });

  const machines: CostingOwnedMachine[] = [];
  for (const m of wanted) {
    const row = rows.find((r) => r.id === m.assetId);
    const last = previous.find((p) => p.assetId === m.assetId)?.asset;
    const asset: OwnedMachineCopy | null = row
      ? {
          name: row.name,
          category: row.category,
          costCents: row.costCents,
          salvageValueCents: row.salvageValueCents,
          usefulLifeMonths: row.usefulLifeMonths,
          retired: row.retiredAt !== null,
          deleted: false,
        }
      : last
        ? { ...last, deleted: true }
        : null;
    if (!asset) return { error: `asset ${m.assetId} is not in the asset register` };
    if (!(asset.usefulLifeMonths && asset.usefulLifeMonths > 0) && m.wearPerDayCents == null) {
      return { error: `“${asset.name}” has no useful life in the asset register — type its wear per job day` };
    }
    machines.push({ ...m, asset });
  }
  return { machines };
}
