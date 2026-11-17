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
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import type {
  AddMachineInput,
  AddMachineRepairInput,
  EditMachineInput,
  GiveMachineRateInput,
  MachineDetailDto,
  MachineInvestorDto,
  MachineLineDto,
  MachinePaymentDto,
  MachineRegisterDto,
  MachineRepairDto,
  MachineRowDto,
  ReplaceMachineInvestorsInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { nairobiToday } from '../finance/comparison.js';
import { machinesAccess } from '../machines/access.js';
import {
  attachMachinesActor,
  requireBackOfficeAccount,
  requireMachinesEdit,
  requireMachinesView,
} from '../machines/guards.js';
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

// ── The rules a change is checked against ───────────────────────────────────
//
// The asset list (routes/finance.ts) holds the same records, so its edit and
// delete routes ask these too. The messages are shown to the owner as they are.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A calendar day as a message names it: "5 Nov 2026". */
const dayText = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Cents as a message names them: "KSh 15,000". */
const kshText = (cents: number) => `KSh ${(cents / 100).toLocaleString('en-KE')}`;

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

// ── What the owner sends ────────────────────────────────────────────────────

const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'RETIRED'] as const;

const DayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date must be YYYY-MM-DD.');

const RATE_RULE = 'The daily rate must be whole shillings, above zero.';
// Whole shillings keep half a day a whole number of cents.
const RateCents = z
  .number({ required_error: RATE_RULE, invalid_type_error: RATE_RULE })
  .int(RATE_RULE)
  .positive(RATE_RULE)
  .multipleOf(100, RATE_RULE);

const PRICE_RULE = 'The price must be a whole number of cents, zero or more.';
const PriceCents = z.number({ required_error: PRICE_RULE, invalid_type_error: PRICE_RULE }).int(PRICE_RULE).nonnegative(PRICE_RULE);

const MachineName = z.string({ required_error: 'Give the machine a name.' }).trim().min(1, 'Give the machine a name.').max(200);

// The purchase date is today when left out, so what comes in is wider than
// AddMachineInput: only what comes out is held to it.
const AddMachineSchema = z.object({
  name: MachineName,
  purchaseDate: DayStr.default(nairobiToday),
  priceCents: PriceCents,
  dailyRateCents: RateCents,
  startDay: DayStr.optional(),
}) satisfies z.ZodType<AddMachineInput, z.ZodTypeDef, unknown>;

const GiveMachineRateSchema = z.object({
  dailyRateCents: RateCents,
  startDay: DayStr.optional(),
}) satisfies z.ZodType<GiveMachineRateInput>;

// The rate is optional, never nullable: it can be changed and not cleared (R3).
const EditMachineSchema = z.object({
  name: MachineName.optional(),
  priceCents: PriceCents.optional(),
  dailyRateCents: RateCents.optional(),
  condition: z.enum(CONDITIONS).optional(),
  startDay: DayStr.optional(),
}) satisfies z.ZodType<EditMachineInput>;

const INVESTOR_NAME_RULE = 'Each investor needs a name.';
const INVESTOR_AMOUNT_RULE = 'Each investor\'s amount must be a whole number of cents, above zero.';
const ReplaceInvestorsSchema = z.object({
  investors: z.array(
    z.object({
      name: z.string({ required_error: INVESTOR_NAME_RULE }).trim().min(1, INVESTOR_NAME_RULE).max(200),
      contributionCents: z
        .number({ required_error: INVESTOR_AMOUNT_RULE, invalid_type_error: INVESTOR_AMOUNT_RULE })
        .int(INVESTOR_AMOUNT_RULE)
        .positive(INVESTOR_AMOUNT_RULE),
    }),
  ),
}) satisfies z.ZodType<ReplaceMachineInvestorsInput>;

const AddRepairSchema = z.object({
  date: DayStr,
  description: z.string().trim().min(1, 'Say what was repaired.').max(500),
  costCents: z.number().int().nonnegative(),
  performedBy: z.string().trim().max(200).optional(),
  receiptRef: z.string().trim().max(200).optional(),
}) satisfies z.ZodType<AddMachineRepairInput>;

/** The first thing wrong with what was sent, as a sentence the page can show. */
const firstProblem = (error: z.ZodError) => error.issues[0]!.message;

/** A change the owner asked for and did not get: the status and the message to show. */
type Refusal = { status: 400 | 404 | 409; error: string };

const NO_MACHINE: Refusal = { status: 404, error: 'machine not found' };
const FUTURE_START_DAY: Refusal = { status: 400, error: 'The start day cannot be in the future.' };

/**
 * R32: the start day to store when a machine joins the register. The day sent,
 * or today in Nairobi when none is; null when the day sent is in the future.
 */
function startDayOrToday(sent: string | undefined): string | null {
  const today = nairobiToday();
  const startDay = sent ?? today;
  return startDay > today ? null : startDay;
}

/** The asset when it is on the register, with the start day its repairs are checked against. */
async function findMachine(id: string) {
  const asset = await prisma.asset.findUnique({ where: { id }, select: { dailyRateCents: true, countsFrom: true } });
  return asset && isOnRegister(asset) ? asset : null;
}

/** What every route that changes a machine answers with: the machine as it now is. Only the owner gets here. */
async function sendMachine(reply: FastifyReply, id: string, status: 200 | 201 = 200) {
  const machine = await loadMachineDetail(id, true);
  if (!machine) return reply.code(NO_MACHINE.status).send({ error: NO_MACHINE.error });
  return reply.code(status).send({ machine });
}

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

    // ── Putting a machine on the register ───────────────────────────────────
    //
    // These two routes and the edit below are the only places a daily rate or
    // a start day is written. The asset list never accepts either.

    // The assets the owner can still give a rate.
    guarded.get('/assets', { preHandler: requireMachinesEdit }, async (_req, reply) => {
      const assets = await prisma.asset.findMany({
        where: { dailyRateCents: null },
        select: { id: true, name: true, category: true, costCents: true, purchaseDate: true },
        orderBy: { name: 'asc' },
      });
      return reply.send({
        assets: assets.map((a) => ({
          id: a.id,
          name: a.name,
          category: a.category,
          costCents: a.costCents,
          purchaseDate: isoDay(a.purchaseDate),
        })),
      });
    });

    guarded.post('/', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const parsed = AddMachineSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });
      const startDay = startDayOrToday(parsed.data.startDay);
      if (!startDay) return reply.code(FUTURE_START_DAY.status).send({ error: FUTURE_START_DAY.error });

      const asset = await prisma.asset.create({
        data: {
          name: parsed.data.name,
          category: 'MACHINE',
          purchaseDate: new Date(parsed.data.purchaseDate),
          costCents: parsed.data.priceCents,
          condition: 'GOOD',
          dailyRateCents: parsed.data.dailyRateCents,
          countsFrom: new Date(startDay),
          createdById: req.machinesActor!.id,
        },
        select: { id: true },
      });
      return sendMachine(reply, asset.id, 201);
    });

    guarded.post<{ Params: { assetId: string } }>(
      '/from-asset/:assetId',
      { preHandler: requireMachinesEdit },
      async (req, reply) => {
        const parsed = GiveMachineRateSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });
        const startDay = startDayOrToday(parsed.data.startDay);
        if (!startDay) return reply.code(FUTURE_START_DAY.status).send({ error: FUTURE_START_DAY.error });

        const id = req.params.assetId;
        const refused = await prisma.$transaction(async (tx): Promise<Refusal | null> => {
          const asset = await tx.asset.findUnique({ where: { id }, select: { dailyRateCents: true } });
          if (!asset) return { status: 404, error: 'asset not found' };
          // Its rate and start day are changed by the edit below, which checks them against its lines and payments.
          if (asset.dailyRateCents !== null) {
            return { status: 409, error: 'This asset is already on the register. Open it there to change its rate or start day.' };
          }
          await tx.asset.update({
            where: { id },
            data: { dailyRateCents: parsed.data.dailyRateCents, countsFrom: new Date(startDay) },
          });
          return null;
        });
        if (refused) return reply.code(refused.status).send({ error: refused.error });
        return sendMachine(reply, id, 201);
      },
    );

    // ── Changing a machine ──────────────────────────────────────────────────

    guarded.patch<{ Params: { id: string } }>('/:id', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const parsed = EditMachineSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });
      const { name, priceCents, dailyRateCents, condition, startDay } = parsed.data;

      const { id } = req.params;
      // KTD10: the price and start day are checked and written in one transaction.
      const refused = await prisma.$transaction(async (tx): Promise<Refusal | null> => {
        const asset = await loadMachineRules(tx, id);
        if (!asset || !isOnRegister(asset)) return NO_MACHINE;

        if (priceCents !== undefined) {
          const problem = priceChangeRefusal(asset, priceCents);
          if (problem) return { status: 409, error: problem };
        }

        // The start day the machine already has changes nothing and is never refused.
        if (startDay !== undefined && startDay !== isoDay(asset.countsFrom)) {
          if (startDay > nairobiToday()) return FUTURE_START_DAY;
          const locked = paymentLockRefusal(asset);
          if (locked) return { status: 409, error: locked };
          // R32: a job that already has this machine's days stays on or after the start day.
          const [earliest] = asset.machineLines.map((l) => l.job.date).sort((a, b) => a.getTime() - b.getTime());
          if (earliest && startDay > isoDay(earliest)) {
            return {
              status: 409,
              error: `This machine has days logged on a job dated ${dayText(earliest)}, so its start day cannot be later than that.`,
            };
          }
        }

        await tx.asset.update({
          where: { id },
          data: {
            ...(name !== undefined && { name }),
            ...(priceCents !== undefined && { costCents: priceCents }),
            ...(dailyRateCents !== undefined && { dailyRateCents }),
            ...(startDay !== undefined && { countsFrom: new Date(startDay) }),
            ...(condition !== undefined && { condition }),
            // Retiring stamps the time and any other condition brings the machine back, as the asset list does.
            ...(condition === 'RETIRED' && !asset.retiredAt ? { retiredAt: new Date() } : {}),
            ...(condition !== undefined && condition !== 'RETIRED' ? { retiredAt: null } : {}),
          },
        });
        return null;
      });
      if (refused) return reply.code(refused.status).send({ error: refused.error });
      return sendMachine(reply, id);
    });

    // The whole list replaces the one stored. New shares apply to everything
    // the machine has earned (R28): nothing about a share is stored.
    guarded.put<{ Params: { id: string } }>('/:id/investors', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const parsed = ReplaceInvestorsSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });
      const { investors } = parsed.data;

      const { id } = req.params;
      const createdById = req.machinesActor!.id;
      // KTD10: the lock and the price are checked and the list written in one transaction.
      const refused = await prisma.$transaction(async (tx): Promise<Refusal | null> => {
        const asset = await loadMachineRules(tx, id);
        if (!asset || !isOnRegister(asset)) return NO_MACHINE;

        const locked = paymentLockRefusal(asset);
        if (locked) return { status: 409, error: locked };

        // R5: a share is what was put in over the price, so no price means no investors.
        if (investors.length > 0 && asset.costCents === 0) {
          return { status: 409, error: 'This machine has no price, so it cannot have investors. Give it a price first.' };
        }
        const putIn = sum(investors.map((i) => i.contributionCents));
        if (putIn > asset.costCents) {
          return {
            status: 409,
            error: `The investors' amounts add up to ${kshText(putIn)}, which is more than the machine's price of ${kshText(asset.costCents)}.`,
          };
        }

        await tx.machineInvestor.deleteMany({ where: { assetId: id } });
        if (investors.length > 0) {
          await tx.machineInvestor.createMany({
            data: investors.map((i) => ({ assetId: id, name: i.name, contributionCents: i.contributionCents, createdById })),
          });
        }
        return null;
      });
      if (refused) return reply.code(refused.status).send({ error: refused.error });
      return sendMachine(reply, id);
    });

    // ── Repairs ─────────────────────────────────────────────────────────────

    guarded.post<{ Params: { id: string } }>('/:id/repairs', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const parsed = AddRepairSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });

      const { id } = req.params;
      const machine = await findMachine(id);
      if (!machine) return reply.code(NO_MACHINE.status).send({ error: NO_MACHINE.error });

      const date = new Date(parsed.data.date);
      // R13: an earlier repair is in no figure here, so adding one would change nothing the owner can see.
      if (!countsFromStartDay(date, machine.countsFrom)) {
        return reply.code(409).send({
          error: `This machine's start day is ${dayText(machine.countsFrom)}, and a repair dated before it would not come out of its pot. Use a date from the start day on, or move the start day back first.`,
        });
      }

      await prisma.assetMaintenance.create({
        data: { ...parsed.data, date, assetId: id, createdById: req.machinesActor!.id },
      });
      return sendMachine(reply, id, 201);
    });

    guarded.delete<{ Params: { id: string; repairId: string } }>(
      '/:id/repairs/:repairId',
      { preHandler: requireMachinesEdit },
      async (req, reply) => {
        const { id, repairId } = req.params;
        const machine = await findMachine(id);
        if (!machine) return reply.code(NO_MACHINE.status).send({ error: NO_MACHINE.error });

        const repair = await prisma.assetMaintenance.findUnique({ where: { id: repairId }, select: { assetId: true } });
        if (!repair || repair.assetId !== id) return reply.code(404).send({ error: 'repair not found' });

        await prisma.assetMaintenance.delete({ where: { id: repairId } });
        return sendMachine(reply, id);
      },
    );

    // ── Deleting a machine ──────────────────────────────────────────────────

    // KTD9: a machine with lines or payments is retired, not deleted. With
    // neither, it goes, and the database deletes its investors and repairs with it.
    guarded.delete<{ Params: { id: string } }>('/:id', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const { id } = req.params;
      const machine = await findMachine(id);
      if (!machine) return reply.code(NO_MACHINE.status).send({ error: NO_MACHINE.error });

      const refusal = await machineDeleteRefusal(id);
      if (refusal) return reply.code(409).send({ error: refusal });

      await prisma.asset.delete({ where: { id } });
      return reply.send({ ok: true });
    });
  });
};
