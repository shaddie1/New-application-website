/**
 * The machine register as it is read: what each query selects, and how the
 * rows become what the Machines page is sent. Every figure comes from
 * machines/pot.ts: nothing about a pot is added up here.
 *
 * Job data is opened to more roles on the register, so each select names only
 * the fields it serves: no client phone, location or job notes for anyone, and
 * a hire customer's name for the owner alone.
 */
import type { Prisma } from '@prisma/client';
import type {
  MachineDetailDto,
  MachineInvestorDto,
  MachineLineDto,
  MachinePaymentDto,
  MachineRepairDto,
  MachineRowDto,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { countsFromStartDay, isoDay, newestFirst, potFigures, type PotFigures } from './pot.js';

// What a register row reads: the machine, and the amounts its pot is worked out from.
export const machineRowSelect = {
  id: true,
  name: true,
  category: true,
  costCents: true,
  dailyRateCents: true,
  countsFrom: true,
  condition: true,
  retiredAt: true,
  maintenance: { select: { date: true, costCents: true } },
  machineLines: { select: { amountCents: true } },
  machineInvestors: {
    select: {
      id: true,
      name: true,
      contributionCents: true,
      payouts: { select: { investorId: true, amountCents: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.AssetSelect;

// One machine opened: the same, with each line's job, each repair and each payment in full.
const machineDetailSelect = {
  ...machineRowSelect,
  maintenance: {
    select: { id: true, date: true, description: true, costCents: true, performedBy: true, receiptRef: true, createdAt: true },
  },
  machineLines: {
    select: {
      id: true,
      jobId: true,
      halfDays: true,
      rateCents: true,
      amountCents: true,
      isHire: true,
      createdAt: true,
      // A line has no date of its own, and a hire's charge is its job's income.
      // The job's lines say whether it is a hire's job, whichever machine's line this is,
      // and which other machines lose their days when a hire, and its job with it, is removed.
      job: {
        select: {
          date: true,
          title: true,
          incomeCents: true,
          discountCents: true,
          clientName: true,
          machineLines: {
            select: { id: true, isHire: true, halfDays: true, amountCents: true, asset: { select: { name: true } } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      },
    },
  },
  machineInvestors: {
    select: {
      id: true,
      name: true,
      contributionCents: true,
      payouts: { select: { id: true, investorId: true, date: true, amountCents: true, reference: true, createdAt: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.AssetSelect;

type RowAsset = Prisma.AssetGetPayload<{ select: typeof machineRowSelect }>;
type DetailAsset = Prisma.AssetGetPayload<{ select: typeof machineDetailSelect }>;

/** An asset on the register: it has a daily rate, and with it a start day. */
export type OnRegister<A> = A & { dailyRateCents: number; countsFrom: Date };

export function isOnRegister<A extends { dailyRateCents: number | null; countsFrom: Date | null }>(asset: A): asset is OnRegister<A> {
  return asset.dailyRateCents !== null && asset.countsFrom !== null;
}

/** A machine's pot, worked out from the rows loaded with it. */
export function potOf(asset: OnRegister<RowAsset>): PotFigures {
  return potFigures({
    priceCents: asset.costCents,
    startDay: asset.countsFrom,
    lines: asset.machineLines,
    repairs: asset.maintenance,
    investors: asset.machineInvestors,
    payments: asset.machineInvestors.flatMap((i) => i.payouts),
  });
}

export function toMachineRow(asset: OnRegister<RowAsset>): MachineRowDto {
  const figures = potOf(asset);
  const investors: MachineInvestorDto[] = figures.investors.map((i) => ({
    id: i.investorId,
    name: i.name,
    contributionCents: i.contributionCents,
    shareBps: i.shareBps,
    entitledCents: i.entitledCents,
    paidCents: i.paidCents,
    owedCents: i.owedCents,
    overpaidCents: i.overpaidCents,
  }));
  return {
    id: asset.id,
    name: asset.name,
    category: asset.category,
    priceCents: asset.costCents,
    dailyRateCents: asset.dailyRateCents,
    startDay: isoDay(asset.countsFrom),
    condition: asset.condition,
    retiredAt: asset.retiredAt ? asset.retiredAt.toISOString() : null,
    earnedCents: figures.earnedCents,
    repairsCents: figures.repairsCents,
    paidOutCents: figures.paidOutCents,
    potCents: figures.potCents,
    earnBackGapCents: figures.earnBackGapCents,
    paidForItself: figures.paidForItself,
    companyShareBps: figures.companyShareBps,
    companyPartCents: figures.companyPartCents,
    investors,
  };
}

/**
 * One line as its viewer may see it. Only the owner is sent a hire's customer
 * (R31). A hire's job is titled after its machine alone, but a row from before
 * that rule may still name the customer in its title, so anyone but the owner
 * is sent "Hire" for the title of a hire's job: on the hire's own line and on
 * any other machine's days on that job.
 *
 * Removing a hire deletes its job, and every other machine's days on that job
 * go with it (R11), so the owner's copy of a hire lists them: the page names
 * them before it asks.
 */
function toLineDto(line: DetailAsset['machineLines'][number], forOwner: boolean): MachineLineDto {
  const { job } = line;
  const onHireJob = line.isHire || job.machineLines.some((l) => l.isHire);
  const others = line.isHire && forOwner ? job.machineLines.filter((l) => l.id !== line.id) : [];
  return {
    id: line.id,
    jobId: line.jobId,
    date: isoDay(job.date),
    jobTitle: onHireJob && !forOwner ? 'Hire' : job.title,
    halfDays: line.halfDays,
    rateCents: line.rateCents,
    amountCents: line.amountCents,
    isHire: line.isHire,
    chargedCents: line.isHire ? job.incomeCents - job.discountCents : null,
    ...(line.isHire && forOwner && job.clientName ? { customerName: job.clientName } : {}),
    ...(others.length > 0
      ? { otherMachines: others.map((o) => ({ machineName: o.asset.name, halfDays: o.halfDays, amountCents: o.amountCents })) }
      : {}),
  };
}

function toMachineDetail(asset: OnRegister<DetailAsset>, forOwner: boolean): MachineDetailDto {
  const lines = newestFirst(asset.machineLines, (l) => l.job.date, (l) => l.createdAt);
  // The repairs the pot counts: an earlier one is in no figure, so it is not listed either.
  const repairs = newestFirst(
    asset.maintenance.filter((r) => countsFromStartDay(r.date, asset.countsFrom)),
    (r) => r.date,
    (r) => r.createdAt,
  );
  const payments = newestFirst(asset.machineInvestors.flatMap((i) => i.payouts), (p) => p.date, (p) => p.createdAt);
  return {
    ...toMachineRow(asset),
    lines: lines.map((l) => toLineDto(l, forOwner)),
    repairs: repairs.map((r): MachineRepairDto => ({
      id: r.id,
      date: isoDay(r.date),
      description: r.description,
      costCents: r.costCents,
      performedBy: r.performedBy,
      receiptRef: r.receiptRef,
    })),
    payments: payments.map((p): MachinePaymentDto => ({
      id: p.id,
      investorId: p.investorId,
      date: isoDay(p.date),
      amountCents: p.amountCents,
      reference: p.reference,
    })),
  };
}

/**
 * One machine as the page shows it, or null when the asset does not exist or
 * has no daily rate. Every route that changes a machine answers with this.
 * `forOwner` decides whether a hire names its customer.
 */
export async function loadMachineDetail(id: string, forOwner: boolean): Promise<MachineDetailDto | null> {
  const asset = await prisma.asset.findUnique({ where: { id }, select: machineDetailSelect });
  return asset && isOnRegister(asset) ? toMachineDetail(asset, forOwner) : null;
}
