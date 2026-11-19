/**
 * The machine register: every machine with a project rate, its pot and who that
 * money belongs to. Read by the owner, the admin, the financial manager, the
 * COO and current shareholders; changed by the owner only. Every figure comes
 * from machines/pot.ts: nothing about a pot is added up here.
 *
 * A machine is an asset with a project rate, so a machine's id is its asset's id.
 *
 * Job data is opened to more roles here, so each query selects only the
 * fields it serves: no client location for anyone, no phone or notes of a job
 * for anyone, and a hire customer's name, phone and notes for the owner alone.
 * The name is kept in the hire job's client name and never in its title, which
 * other pages show to other people.
 *
 * The selects and the mapping to what the page is sent are in machines/read.ts,
 * the rules a change is checked against in machines/rules.ts, and what the
 * owner sends in machines/schemas.ts.
 */
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { DeclaredPeriodDto, MachineJobPickerDto, MachineRegisterDto } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { hasOwnerAccess } from '../auth/staff.js';
import { nairobiToday } from '../finance/comparison.js';
import { machinesAccess } from '../machines/access.js';
import {
  attachMachinesActor,
  requireBackOfficeAccount,
  requireMachinesEdit,
  requireMachinesView,
} from '../machines/guards.js';
import { countsFromStartDay, isoDay, sum, type InvestorFigures } from '../machines/pot.js';
import { hireRateOf, isOnRegister, loadMachineDetail, machineRowSelect, potOf, toMachineRow } from '../machines/read.js';
import {
  dayText,
  kshText,
  loadMachineRules,
  machineDeleteRefusal,
  paymentLockRefusal,
  priceChangeRefusal,
  type Refusal,
} from '../machines/rules.js';
import {
  AddMachineSchema,
  AddRepairSchema,
  EditDaysSchema,
  EditHireSchema,
  EditMachineSchema,
  GiveMachineRateSchema,
  LogDaysSchema,
  LogHireSchema,
  MarkHirePaidSchema,
  PayInvestorSchema,
  ReplaceInvestorsSchema,
  firstProblem,
} from '../machines/schemas.js';
import { COUNTED_STATUSES } from '../projectMoney/figures.js';

const NO_MACHINE: Refusal = { status: 404, error: 'machine not found' };
const NO_DAYS: Refusal = { status: 404, error: 'machine days not found' };
const NO_HIRE: Refusal = { status: 404, error: 'hire not found' };
const FUTURE_START_DAY: Refusal = { status: 400, error: 'The start day cannot be in the future.' };
// R4: a retired machine keeps its history, and what is already logged on it can still be corrected.
const RETIRED: Refusal = { status: 409, error: 'This machine is retired, so it takes no new days or hires. Bring it back first.' };

const sendRefusal = (reply: FastifyReply, refusal: Refusal) => reply.code(refusal.status).send({ error: refusal.error });

/** KTD5: half days x rate / 2. A rate is whole shillings, so half a day is a whole number of cents. */
const lineAmountCents = (halfDays: number, rateCents: number) => (halfDays * rateCents) / 2;

/**
 * A hire's one-off job is named after the machine alone. R31: the customer is
 * the owner's to see, and a job's title is shown to other people, here and in
 * project money, so the customer is kept in the job's client name only.
 */
const hireTitle = (machineName: string) => `Hire: ${machineName}`;

/** KTD10: a hire recorded before hires were charged at days x rate changes its figures only through both. */
const OLD_HIRE_NEEDS_BOTH: Refusal = {
  status: 409,
  error:
    'This hire was recorded before hires were charged at days times the daily rate, so its days and its rate change together. Give both.',
};
// A hire is one machine hired out on its own (owner's choice, 2026-11-18).
const HIRE_JOB: Refusal = {
  status: 409,
  error: 'This job is a machine hire. To hire this machine out as well, log a hire for it on its own page.',
};
const SHARED_HIRE: Refusal = {
  status: 409,
  error:
    'Other machines also have days on this hire\'s job, so its days and rate stay as recorded. Change what the client was charged on Jobs & costs instead.',
};

/** A phone or notes sent blank are cleared; left out, they stay as they are. */
const blankAsNull = (text: string | undefined) => (text === undefined ? undefined : text || null);

/** R32: why a hire of a machine whose start day is `startDay` cannot start earlier. */
const hireBeforeStartDay = (startDay: Date): Refusal => ({
  status: 409,
  error: `This machine's start day is ${dayText(startDay)}, so a hire cannot start before it. Use a date from the start day on, or move the start day back first.`,
});

/** R16 and R25: why an investor cannot be paid more than they are still owed. The message names what they are owed. */
function paymentRefusal(investor: InvestorFigures): string {
  if (investor.overpaidCents > 0) {
    return `${investor.name} has already been paid ${kshText(investor.overpaidCents)} more than they are entitled to, so no payment can be recorded for them until they are owed something again.`;
  }
  if (investor.owedCents === 0) {
    return `${investor.name} is not owed anything at the moment, so no payment can be recorded for them.`;
  }
  return `${investor.name} is still owed ${kshText(investor.owedCents)}, so a payment cannot be more than that.`;
}

// The job picker sends this many jobs at most; the search narrows a longer list.
const PICKER_ROWS = 50;

/**
 * R32: the start day to store when a machine joins the register. The day sent,
 * or today in Nairobi when none is; null when the day sent is in the future.
 */
function startDayOrToday(sent: string | undefined): string | null {
  const today = nairobiToday();
  const startDay = sent ?? today;
  return startDay > today ? null : startDay;
}

/**
 * The asset when it is on the register, with what a new repair, new days or a
 * new hire are checked against: its start day, its rate and whether it is retired.
 */
async function findMachine(id: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { projectRateCents: true, countsFrom: true, retiredAt: true },
  });
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
        where: { projectRateCents: { not: null } },
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
      const machine = await loadMachineDetail(req.params.id, hasOwnerAccess(req.machinesActor!));
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
        where: { projectRateCents: null },
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
          projectRateCents: parsed.data.projectRateCents,
          hireRateCents: parsed.data.hireRateCents,
          // KTD2: the owner typed both rates, so the hire rate is reviewed.
          hireRateReviewedAt: new Date(),
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
          const asset = await tx.asset.findUnique({ where: { id }, select: { projectRateCents: true } });
          if (!asset) return { status: 404, error: 'asset not found' };
          // Its rate and start day are changed by the edit below, which checks them against its lines and payments.
          if (asset.projectRateCents !== null) {
            return { status: 409, error: 'This asset is already on the register. Open it there to change its rate or start day.' };
          }
          // As when adding a machine, the hire rate is reviewed (KTD2).
          await tx.asset.update({
            where: { id },
            data: {
              projectRateCents: parsed.data.projectRateCents,
              hireRateCents: parsed.data.hireRateCents,
              hireRateReviewedAt: new Date(),
              countsFrom: new Date(startDay),
            },
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
      const { name, priceCents, projectRateCents, hireRateCents, ratesReviewed, condition, startDay } = parsed.data;

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
            // R5: lines already made keep the rate they were made at.
            ...(projectRateCents !== undefined && { projectRateCents }),
            ...(hireRateCents !== undefined && { hireRateCents }),
            // R3 and KTD2: the owner saved both rates from the edit form, which shows them.
            ...(ratesReviewed && { hireRateReviewedAt: new Date() }),
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

    // ── Days on a job ───────────────────────────────────────────────────────

    // The jobs this machine can still take days on, and the periods whose
    // payout is declared, which the forms warn about before saving (R30). A
    // read, and the owner's alone: it lists job titles across the business.
    // A retired machine is answered too: correcting its days needs the periods.
    guarded.get<{ Params: { id: string }; Querystring: { search?: unknown } }>(
      '/:id/jobs',
      { preHandler: requireMachinesEdit },
      async (req, reply) => {
        const { id } = req.params;
        const machine = await findMachine(id);
        if (!machine) return sendRefusal(reply, NO_MACHINE);

        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const [jobs, declared] = await Promise.all([
          prisma.job.findMany({
            where: {
              // R8: a job that counts in the figures, dated on or after the start day.
              status: { in: COUNTED_STATUSES },
              date: { gte: machine.countsFrom },
              // A machine has one line per job, so a job that has it is corrected, not picked again.
              // A hire is one machine hired out on its own: another machine is hired with a hire of its own.
              machineLines: { none: { OR: [{ assetId: id }, { isHire: true }] } },
              ...(search && { title: { contains: search, mode: 'insensitive' as const } }),
            },
            select: { id: true, date: true, title: true, project: { select: { title: true } } },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            take: PICKER_ROWS,
          }),
          prisma.profitDistribution.findMany({
            where: { status: { not: 'CANCELLED' } },
            select: { label: true, periodStart: true, periodEnd: true },
            orderBy: [{ periodStart: 'desc' }, { periodEnd: 'desc' }],
          }),
        ]);

        // A declared payout is one row per shareholder: the period is listed once.
        const declaredPeriods = new Map<string, DeclaredPeriodDto>();
        for (const d of declared) {
          const period = { label: d.label, periodStart: isoDay(d.periodStart), periodEnd: isoDay(d.periodEnd) };
          const key = `${period.periodStart} ${period.periodEnd}`;
          if (!declaredPeriods.has(key)) declaredPeriods.set(key, period);
        }

        const picker: MachineJobPickerDto = {
          jobs: jobs.map((j) => ({ jobId: j.id, date: isoDay(j.date), title: j.title, projectTitle: j.project?.title ?? null })),
          declaredPeriods: [...declaredPeriods.values()],
        };
        return reply.send({ picker });
      },
    );

    // The rate and the amount are taken now and stored on the line (R3), and
    // the line takes its job's date (R8). R6 and KTD3: days use the project
    // rate unless the owner sent another, and the line keeps the project rate
    // of the moment as its usual rate beside the rate it used.
    guarded.post<{ Params: { id: string } }>('/:id/lines', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const parsed = LogDaysSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });
      const { jobId, halfDays } = parsed.data;

      const { id } = req.params;
      const machine = await findMachine(id);
      if (!machine) return sendRefusal(reply, NO_MACHINE);
      if (machine.retiredAt) return sendRefusal(reply, RETIRED);

      const job = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true, date: true } });
      if (!job) return reply.code(404).send({ error: 'job not found' });
      // R8: a report waiting for approval counts in no figure, so it takes no machine days either.
      if (!COUNTED_STATUSES.includes(job.status)) {
        return reply.code(409).send({
          error: 'This job report is still waiting for approval. Approve it first, then log the machine\'s days on it.',
        });
      }
      // R32: earnings start on the start day, as repairs do.
      if (!countsFromStartDay(job.date, machine.countsFrom)) {
        return reply.code(409).send({
          error: `This machine's start day is ${dayText(machine.countsFrom)} and this job is dated ${dayText(job.date)}. Pick a job from the start day on, or move the start day back first.`,
        });
      }
      const logged = await prisma.machineLine.findFirst({ where: { assetId: id, jobId }, select: { id: true } });
      if (logged) {
        return reply.code(409).send({ error: 'This machine\'s days on this job are already logged. Edit that line instead.' });
      }
      // A hire's income is its own machine's amount and cannot be typed over, so
      // another machine's days there would come straight off profit (R9, R20).
      const hire = await prisma.machineLine.findFirst({ where: { jobId, isHire: true }, select: { id: true } });
      if (hire) return sendRefusal(reply, HIRE_JOB);

      const rateCents = parsed.data.rateCents ?? machine.projectRateCents;
      await prisma.machineLine.create({
        data: {
          assetId: id,
          jobId,
          halfDays,
          rateCents,
          standardRateCents: machine.projectRateCents,
          amountCents: lineAmountCents(halfDays, rateCents),
          isHire: false,
          createdById: req.machinesActor!.id,
        },
      });
      return sendMachine(reply, id, 201);
    });

    // KTD9: the days, the rate or both change. A rate left out keeps the
    // line's own, whatever the machine's rate is now, and the usual rate stored
    // with the line is never rewritten. What is already logged on a retired
    // machine can still be corrected.
    guarded.patch<{ Params: { lineId: string } }>('/lines/:lineId', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const parsed = EditDaysSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });

      const { lineId } = req.params;
      const line = await prisma.machineLine.findUnique({
        where: { id: lineId },
        select: { assetId: true, isHire: true, halfDays: true, rateCents: true },
      });
      if (!line) return sendRefusal(reply, NO_DAYS);
      if (line.isHire) {
        return reply.code(409).send({
          error: 'These days belong to a hire. Edit the hire instead: its days and rate are changed with its client and date.',
        });
      }

      const halfDays = parsed.data.halfDays ?? line.halfDays;
      const rateCents = parsed.data.rateCents ?? line.rateCents;
      await prisma.machineLine.update({
        where: { id: lineId },
        data: { halfDays, rateCents, amountCents: lineAmountCents(halfDays, rateCents) },
      });
      return sendMachine(reply, line.assetId);
    });

    guarded.delete<{ Params: { lineId: string } }>('/lines/:lineId', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const { lineId } = req.params;
      const line = await prisma.machineLine.findUnique({ where: { id: lineId }, select: { assetId: true, isHire: true } });
      if (!line) return sendRefusal(reply, NO_DAYS);
      // KTD6: a hire's line goes with its job, never alone, or the job would keep the income with no machine cost.
      if (line.isHire) {
        return reply.code(409).send({
          error: 'These days belong to a hire. Remove the hire instead: that removes its job, the costs on it and these days.',
        });
      }

      await prisma.machineLine.delete({ where: { id: lineId } });
      return sendMachine(reply, line.assetId);
    });

    // ── Hires ───────────────────────────────────────────────────────────────
    //
    // A hire is a one-off job the owner entered, with one line marked as a
    // hire. KTD4: the client is charged days x the rate, and all of it goes to
    // the machine's pot, so the job's income is the line's amount with no
    // discount, written with the line. A hire therefore adds as much income as
    // machine cost and leaves profit where it was (R9). A hire recorded before
    // this has no usual rate stored and keeps its own income (R10).

    guarded.post<{ Params: { id: string } }>('/:id/hires', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const parsed = LogHireSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });
      const { customerName, halfDays } = parsed.data;
      const date = new Date(parsed.data.startDate);

      const { id } = req.params;
      const createdById = req.machinesActor!.id;
      // The job and its line are written together, or neither is.
      const refused = await prisma.$transaction(async (tx): Promise<Refusal | null> => {
        const machine = await tx.asset.findUnique({
          where: { id },
          select: { name: true, projectRateCents: true, hireRateCents: true, countsFrom: true, retiredAt: true },
        });
        if (!machine || !isOnRegister(machine)) return NO_MACHINE;
        if (machine.retiredAt) return RETIRED;
        if (!countsFromStartDay(date, machine.countsFrom)) return hireBeforeStartDay(machine.countsFrom);

        // R10: the same hire logged twice would count its income and its machine amount twice.
        const same = await tx.machineLine.findFirst({
          where: { assetId: id, isHire: true, job: { date, clientName: customerName } },
          select: { id: true },
        });
        if (same) {
          return {
            status: 409,
            error: `A hire of this machine to ${customerName} starting ${dayText(date)} is already logged. Edit that hire instead.`,
          };
        }

        // R8 and KTD3: the machine's hire rate unless the owner sent another, kept as the usual rate beside it.
        const usualRateCents = hireRateOf(machine);
        const rateCents = parsed.data.rateCents ?? usualRateCents;
        const amountCents = lineAmountCents(halfDays, rateCents);

        // One-off with no project, which the Job_placement_project_check constraint requires.
        const job = await tx.job.create({
          data: {
            title: hireTitle(machine.name),
            date,
            incomeCents: amountCents,
            discountCents: 0,
            status: 'OWNER_ENTRY',
            placement: 'STANDALONE',
            projectId: null,
            clientName: customerName,
            clientPhone: parsed.data.customerPhone || null,
            notes: parsed.data.notes || null,
            createdById,
          },
          select: { id: true },
        });
        await tx.machineLine.create({
          data: {
            assetId: id,
            jobId: job.id,
            halfDays,
            rateCents,
            standardRateCents: usualRateCents,
            amountCents,
            isHire: true,
            createdById,
          },
        });
        return null;
      });
      if (refused) return sendRefusal(reply, refused);
      return sendMachine(reply, id, 201);
    });

    // The job and the line are written together, and a hire on a retired
    // machine can still be corrected. KTD10: with neither days nor a rate sent
    // only the client and the start date change. With either, the line is
    // repriced (a rate left out keeps the hire's own, KTD9) and the job's
    // income becomes the new amount with no discount (KTD4).
    guarded.patch<{ Params: { lineId: string } }>('/hires/:lineId', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const parsed = EditHireSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });
      const { customerName } = parsed.data;
      const date = new Date(parsed.data.startDate);
      const changesFigures = parsed.data.halfDays !== undefined || parsed.data.rateCents !== undefined;

      const { lineId } = req.params;
      const result = await prisma.$transaction(async (tx): Promise<Refusal | { machineId: string }> => {
        const line = await tx.machineLine.findUnique({
          where: { id: lineId },
          select: {
            assetId: true,
            jobId: true,
            isHire: true,
            halfDays: true,
            rateCents: true,
            standardRateCents: true,
            asset: { select: { name: true, projectRateCents: true, hireRateCents: true } },
          },
        });
        if (!line || !line.isHire) return NO_HIRE;
        // R10: a hire with no usual rate stored keeps its recorded charge until
        // the owner gives it both days and a rate; one alone would mix its old
        // charge with the new rule.
        const isOldHire = line.standardRateCents === null;
        if (changesFigures && isOldHire && (parsed.data.halfDays === undefined || parsed.data.rateCents === undefined)) {
          return OLD_HIRE_NEEDS_BOTH;
        }

        // R32: the new date moves the job, so it is checked against the start
        // day of every machine with days on that job, the hired one among them.
        const onJob = await tx.machineLine.findMany({
          where: { jobId: line.jobId },
          select: { assetId: true, asset: { select: { name: true, countsFrom: true } } },
        });
        for (const { assetId, asset } of onJob) {
          if (!asset.countsFrom || countsFromStartDay(date, asset.countsFrom)) continue;
          if (assetId === line.assetId) return hireBeforeStartDay(asset.countsFrom);
          return {
            status: 409,
            error: `${asset.name} also has days logged on this hire's job, and its start day is ${dayText(asset.countsFrom)}, so the hire cannot start before that.`,
          };
        }
        // An older hire's charge may cover the other machines' days too; under R8
        // the income would drop to this machine's amount and their share leave profit.
        if (changesFigures && onJob.some((l) => l.assetId !== line.assetId)) return SHARED_HIRE;

        const halfDays = parsed.data.halfDays ?? line.halfDays;
        const rateCents = parsed.data.rateCents ?? line.rateCents;
        const amountCents = lineAmountCents(halfDays, rateCents);
        const clientPhone = blankAsNull(parsed.data.customerPhone);
        const notes = blankAsNull(parsed.data.notes);

        await tx.job.update({
          where: { id: line.jobId },
          data: {
            title: hireTitle(line.asset.name),
            clientName: customerName,
            date,
            ...(clientPhone !== undefined && { clientPhone }),
            ...(notes !== undefined && { notes }),
            // What the client was charged is income less discount, so the amount is stored with nothing off.
            ...(changesFigures && { incomeCents: amountCents, discountCents: 0 }),
          },
        });
        if (changesFigures) {
          await tx.machineLine.update({
            where: { id: lineId },
            data: {
              halfDays,
              rateCents,
              amountCents,
              // KTD10: an older hire becomes an ordinary one, with the machine's hire rate as its usual
              // rate: hireRateOf, spelled out because a line's asset may in principle have no project rate.
              ...(isOldHire && {
                standardRateCents: line.asset.hireRateCents ?? line.asset.projectRateCents ?? rateCents,
              }),
            },
          });
        }
        return { machineId: line.assetId };
      });
      if ('status' in result) return sendRefusal(reply, result);
      return sendMachine(reply, result.machineId);
    });

    // The hire is its job: the database deletes the job's costs and every
    // machine's days on it with the job (R11). The owner's copy of the hire
    // lists the other machines, so the page names them before it asks.
    guarded.delete<{ Params: { lineId: string } }>('/hires/:lineId', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const { lineId } = req.params;
      const line = await prisma.machineLine.findUnique({
        where: { id: lineId },
        select: { assetId: true, jobId: true, isHire: true },
      });
      if (!line || !line.isHire) return sendRefusal(reply, NO_HIRE);

      await prisma.job.delete({ where: { id: line.jobId } });
      return sendMachine(reply, line.assetId);
    });

    // R14 and R15: a hire's paid mark, a date and an optional reference.
    // Only those two columns are written: no income, amount or pot moves, and
    // a hire counts from the day it was recorded whether paid or not. Marking
    // it again replaces the date and the reference.
    guarded.put<{ Params: { lineId: string } }>('/hires/:lineId/paid', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const parsed = MarkHirePaidSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });

      const { lineId } = req.params;
      const line = await prisma.machineLine.findUnique({ where: { id: lineId }, select: { assetId: true, isHire: true } });
      // Days on a job are paid for by the job, not marked here.
      if (!line || !line.isHire) return sendRefusal(reply, NO_HIRE);

      await prisma.machineLine.update({
        where: { id: lineId },
        data: { hirePaidOn: new Date(parsed.data.paidOn), hirePaymentRef: parsed.data.reference || null },
      });
      return sendMachine(reply, line.assetId);
    });

    // Undoing the mark: the hire is awaiting payment again.
    guarded.delete<{ Params: { lineId: string } }>('/hires/:lineId/paid', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const { lineId } = req.params;
      const line = await prisma.machineLine.findUnique({ where: { id: lineId }, select: { assetId: true, isHire: true } });
      if (!line || !line.isHire) return sendRefusal(reply, NO_HIRE);

      await prisma.machineLine.update({ where: { id: lineId }, data: { hirePaidOn: null, hirePaymentRef: null } });
      return sendMachine(reply, line.assetId);
    });

    // ── Payments to investors ───────────────────────────────────────────────

    guarded.post<{ Params: { id: string } }>('/:id/payouts', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const parsed = PayInvestorSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: firstProblem(parsed.error) });
      const { investorId, amountCents, reference } = parsed.data;

      const { id } = req.params;
      const createdById = req.machinesActor!.id;
      // KTD10: what the investor is owed is worked out and the payment written in one transaction.
      const refused = await prisma.$transaction(async (tx): Promise<Refusal | null> => {
        const asset = await tx.asset.findUnique({ where: { id }, select: machineRowSelect });
        if (!asset || !isOnRegister(asset)) return NO_MACHINE;

        const investor = potOf(asset).investors.find((i) => i.investorId === investorId);
        if (!investor) return { status: 404, error: 'investor not found' };
        // R16, and R25 with it: an overpaid investor is owed nothing.
        if (amountCents > investor.owedCents) return { status: 409, error: paymentRefusal(investor) };

        await tx.machinePayout.create({
          data: { investorId, date: new Date(parsed.data.date), amountCents, reference: reference || null, createdById },
        });
        return null;
      });
      if (refused) return sendRefusal(reply, refused);
      return sendMachine(reply, id, 201);
    });

    // R27: a mistyped payment is deleted. When it was the machine's last, the lock of R7 is gone with it.
    guarded.delete<{ Params: { payoutId: string } }>('/payouts/:payoutId', { preHandler: requireMachinesEdit }, async (req, reply) => {
      const { payoutId } = req.params;
      const payout = await prisma.machinePayout.findUnique({
        where: { id: payoutId },
        select: { investor: { select: { assetId: true } } },
      });
      if (!payout) return reply.code(404).send({ error: 'payment not found' });

      await prisma.machinePayout.delete({ where: { id: payoutId } });
      return sendMachine(reply, payout.investor.assetId);
    });

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
