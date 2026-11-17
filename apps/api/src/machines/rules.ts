/**
 * The rules a change to a machine is checked against: the lock once an
 * investor has been paid, the lowest price a machine can have, and when it can
 * be deleted. The Machines page (routes/machines.ts) and the asset list
 * (routes/finance.ts) hold the same records, so both ask these. The messages
 * are shown to the owner as they are.
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '../db.js';
import { newestFirst, sum } from './pot.js';

/** A change the owner asked for and did not get: the status and the message to show. */
export type Refusal = { status: 400 | 404 | 409; error: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A calendar day as a message names it: "5 Nov 2026". */
export const dayText = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Cents as a message names them: "KSh 15,000". */
export const kshText = (cents: number) => `KSh ${(cents / 100).toLocaleString('en-KE')}`;

// What the rules on a machine's price, investors and start day read.
const machineRulesSelect = {
  costCents: true,
  dailyRateCents: true,
  countsFrom: true,
  retiredAt: true,
  machineLines: { select: { job: { select: { date: true } } } },
  machineInvestors: {
    select: {
      name: true,
      contributionCents: true,
      payouts: { select: { date: true, amountCents: true, createdAt: true } },
    },
  },
} satisfies Prisma.AssetSelect;

export type MachineRules = Prisma.AssetGetPayload<{ select: typeof machineRulesSelect }>;

/**
 * An asset as the rules below read it, or null when there is none. Called
 * inside the transaction that also writes the change, so the check and the
 * write see the same rows.
 */
export function loadMachineRules(tx: Prisma.TransactionClient, id: string): Promise<MachineRules | null> {
  return tx.asset.findUnique({ where: { id }, select: machineRulesSelect });
}

/**
 * R7: once an investor has been paid, the machine's price, investors and start
 * day stay as they are. Null when no payment is recorded; otherwise the
 * message, which names the payment whose deletion lifts the lock.
 */
export function paymentLockRefusal(asset: Pick<MachineRules, 'machineInvestors'>): string | null {
  const payments = asset.machineInvestors.flatMap((i) => i.payouts.map((p) => ({ ...p, name: i.name })));
  const [latest] = newestFirst(payments, (p) => p.date, (p) => p.createdAt);
  if (!latest) return null;
  const paid = `${latest.name}, ${kshText(latest.amountCents)} on ${dayText(latest.date)}`;
  return payments.length === 1
    ? `This machine's price, investors and start day are locked because an investor has been paid: ${paid}. Delete that payment to unlock them.`
    : `This machine's price, investors and start day are locked because ${payments.length} payments to its investors are recorded, the latest to ${paid}. Delete those payments to unlock them.`;
}

/**
 * Why a machine's price cannot become `priceCents`, or null when it can: the
 * lock of R7, then the investors' total, which the price never drops below.
 * Sending the price the machine already has changes nothing and is never refused.
 */
export function priceChangeRefusal(asset: MachineRules, priceCents: number): string | null {
  if (priceCents === asset.costCents) return null;
  const locked = paymentLockRefusal(asset);
  if (locked) return locked;
  const putIn = sum(asset.machineInvestors.map((i) => i.contributionCents));
  return priceCents < putIn
    ? `The investors put in ${kshText(putIn)} between them, so the price cannot be lower than that. Lower the investors' amounts first.`
    : null;
}

/**
 * R4: why an asset cannot be deleted, or null when it can. The database
 * refuses the delete as well; counting first is what gives the owner a reason
 * and the way out.
 */
export async function machineDeleteRefusal(assetId: string): Promise<string | null> {
  const [lineCount, paymentCount] = await Promise.all([
    prisma.machineLine.count({ where: { assetId } }),
    prisma.machinePayout.count({ where: { investor: { assetId } } }),
  ]);
  const has = [
    lineCount === 1 ? 'days logged on 1 job' : lineCount > 1 ? `days logged on ${lineCount} jobs` : null,
    paymentCount === 1 ? '1 payment to an investor' : paymentCount > 1 ? `${paymentCount} payments to its investors` : null,
  ].filter((part) => part !== null);
  if (has.length === 0) return null;
  return `This machine cannot be deleted because it has ${has.join(' and ')}. Retire it instead: it keeps its history and takes no new days or hires.`;
}
