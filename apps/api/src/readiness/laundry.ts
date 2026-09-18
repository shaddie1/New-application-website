/**
 * Data access shared by the catalog, the laundry settings and the readiness
 * card. Singletons are created on first read with the sheet's defaults.
 */
import { Prisma } from '@prisma/client';
import { LAUNDRY_LINE_CODE, type LaundryGoDecision, type LaundrySettingsDto } from '@onyxhawk/types';

import { prisma } from '../db.js';

/**
 * Prisma's upsert is select-then-insert, so two first reads landing together
 * (the readiness and laundry cards mount at once) can both try to insert the
 * singleton. The loser retries and finds the winner's row.
 */
async function upsertOnce<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return attempt();
    throw err;
  }
}

/** Read the go decision the Compliance checklist owns; PENDING until set. */
export async function laundryGoDecision(): Promise<LaundryGoDecision> {
  const flags = await prisma.companyReadinessFlags.findUnique({
    where: { id: 'default' },
    select: { laundryGoDecision: true },
  });
  return flags?.laundryGoDecision ?? 'PENDING';
}

/**
 * True once the decision is GO. Also makes sure the catalog row exists so the
 * line becomes selectable the moment the flag flips, without a reseed.
 */
export async function laundryLineAvailable(): Promise<boolean> {
  if ((await laundryGoDecision()) !== 'GO') return false;
  const settings = await loadLaundrySettings();
  await ensureLaundryLine(settings.pricePerKgCents);
  return true;
}

/** Upsert the catalog entry; `fromPriceCents` mirrors the per-kg price. */
export async function ensureLaundryLine(pricePerKgCents: number): Promise<void> {
  await upsertOnce(() => prisma.serviceLine.upsert({
    where: { code: LAUNDRY_LINE_CODE },
    create: {
      code: LAUNDRY_LINE_CODE,
      name: 'Laundry',
      tagline: 'Wash, dry and fold by the kilogram.',
      colorHex: '#5B7A8A',
      quoteOnly: true,
      fromPriceCents: pricePerKgCents,
      sortOrder: 20,
    },
    update: { fromPriceCents: pricePerKgCents },
  }));
}

export async function loadLaundrySettings() {
  return upsertOnce(() => prisma.laundrySettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
    include: { updatedBy: { select: { fullName: true } } },
  }));
}

export function toLaundrySettingsDto(row: Awaited<ReturnType<typeof loadLaundrySettings>>): LaundrySettingsDto {
  return {
    pricePerKgCents: row.pricePerKgCents,
    consumablesPct: row.consumablesPct,
    workingDaysPerMonth: row.workingDaysPerMonth,
    fixedCostsNowCents: row.fixedCostsNowCents,
    fixedCostsCompliantCents: row.fixedCostsCompliantCents,
    updatedByName: row.updatedBy?.fullName ?? null,
    updatedAt: row.updatedById ? row.updatedAt.toISOString() : null,
  };
}

export async function loadReadiness() {
  return upsertOnce(() => prisma.compliantPayReadiness.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
    include: { updatedBy: { select: { fullName: true } } },
  }));
}
