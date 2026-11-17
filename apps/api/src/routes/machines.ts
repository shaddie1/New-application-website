/**
 * The machine register: every machine with a daily rate, its pot and who that
 * money belongs to. Read by the owner, the admin, the financial manager, the
 * COO and current shareholders; changed by the owner only. Every figure comes
 * from machines/pot.ts: nothing about a pot is added up here.
 *
 * A machine is an asset with a daily rate, so a machine's id is its asset's id.
 *
 * Job data is opened to more roles here, so each query selects only the
 * fields it serves: no client phone, location or job notes for anyone, and a
 * hire customer's name for the owner alone.
 */
import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import type {
  MachineDetailDto,
  MachineInvestorDto,
  MachineLineDto,
  MachinePaymentDto,
  MachineRegisterDto,
  MachineRepairDto,
  MachineRowDto,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { machinesAccess } from '../machines/access.js';
import { attachMachinesActor, requireBackOfficeAccount, requireMachinesView } from '../machines/guards.js';
import { countsFromStartDay, potFigures } from '../machines/pot.js';

// What a register row reads: the machine, and the amounts its pot is worked out from.
const machineRowSelect = {
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
      job: { select: { date: true, title: true, incomeCents: true, discountCents: true, clientName: true } },
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
type OnRegister<A> = A & { dailyRateCents: number; countsFrom: Date };

function isOnRegister<A extends { dailyRateCents: number | null; countsFrom: Date | null }>(asset: A): asset is OnRegister<A> {
  return asset.dailyRateCents !== null && asset.countsFrom !== null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Newest first by calendar day, and by when it was entered within a day. */
function newestFirst<T>(rows: T[], dayOf: (row: T) => Date, enteredAt: (row: T) => Date): T[] {
  return [...rows].sort(
    (a, b) => dayOf(b).getTime() - dayOf(a).getTime() || enteredAt(b).getTime() - enteredAt(a).getTime(),
  );
}

function toMachineRow(asset: OnRegister<RowAsset>): MachineRowDto {
  const figures = potFigures({
    priceCents: asset.costCents,
    startDay: asset.countsFrom,
    lines: asset.machineLines,
    repairs: asset.maintenance,
    investors: asset.machineInvestors,
    payments: asset.machineInvestors.flatMap((i) => i.payouts),
  });
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
 * One line as its viewer may see it. A hire's job is named after its customer,
 * so for anyone but the owner the title reads "Hire" and the name is not sent.
 */
function toLineDto(line: DetailAsset['machineLines'][number], forOwner: boolean): MachineLineDto {
  const { job } = line;
  return {
    id: line.id,
    jobId: line.jobId,
    date: isoDay(job.date),
    jobTitle: line.isHire && !forOwner ? 'Hire' : job.title,
    halfDays: line.halfDays,
    rateCents: line.rateCents,
    amountCents: line.amountCents,
    isHire: line.isHire,
    chargedCents: line.isHire ? job.incomeCents - job.discountCents : null,
    ...(line.isHire && forOwner && job.clientName ? { customerName: job.clientName } : {}),
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

const sum = (amounts: number[]) => amounts.reduce((total, a) => total + a, 0);

export const machinesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', attachMachinesActor);

  // The menu asks this before it shows the Machines item, so it answers every
  // back-office account and is the one route outside the view guard.
  app.get('/access', { preHandler: requireBackOfficeAccount }, async (req, reply) => {
    return reply.send({ access: machinesAccess(req.machinesActor!) });
  });

  // Everything else sits behind the view guard. A route that changes anything
  // also takes `{ preHandler: requireMachinesEdit }` from machines/guards.ts.
  await app.register(async (guarded) => {
    guarded.addHook('preHandler', requireMachinesView);

    guarded.get('/', async (_req, reply) => {
      const assets = await prisma.asset.findMany({
        where: { dailyRateCents: { not: null } },
        select: machineRowSelect,
        orderBy: { name: 'asc' },
      });
      const machines = assets.filter(isOnRegister).map(toMachineRow);
      const body: MachineRegisterDto = {
        machines,
        totals: {
          priceCents: sum(machines.map((m) => m.priceCents)),
          earnedCents: sum(machines.map((m) => m.earnedCents)),
          repairsCents: sum(machines.map((m) => m.repairsCents)),
          paidOutCents: sum(machines.map((m) => m.paidOutCents)),
          potCents: sum(machines.map((m) => m.potCents)),
        },
      };
      return reply.send({ register: body });
    });

    guarded.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
      const machine = await loadMachineDetail(req.params.id, req.machinesActor!.isOwner);
      if (!machine) return reply.code(404).send({ error: 'machine not found' });
      return reply.send({ machine });
    });
  });
};
