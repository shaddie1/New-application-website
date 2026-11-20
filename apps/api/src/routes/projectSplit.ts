/**
 * The money split of one project (owner's rules, 20 November 2026):
 *
 * - the machines it uses and the half days each works per visit, from which an
 *   invoice's payment offers machine days (invoices/machineDays.ts);
 * - the shareholders' pay-ins towards its costs: a total entered once and
 *   split by stake into one investment each, kept in the company, not repaid;
 * - its profit so far, 5% of it for marketing and the rest by stake, beside
 *   what each shareholder paid in.
 *
 * Money roles see all of it and keep the machine list. A pay-in writes
 * shareholders' investments, so only the owner and admins add or remove one.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  CreateProjectPayInInput,
  ProjectMachinesDto,
  ProjectPayInDto,
  ProjectSplitDto,
  SetProjectMachinesInput,
} from '@onyxhawk/types';
import type { Prisma } from '@prisma/client';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { hasOwnerAccess } from '../auth/staff.js';
import { splitByStake } from '../finance/split.js';
import { daysText } from '../invoices/machineDays.js';
import { shillings } from '../invoices/invoices.js';
import { requireProjectMoneyAccess } from '../projectMoney/access.js';
import { COUNTED_STATUSES, contractBreakdown, moneyJobSelect } from '../projectMoney/figures.js';
import { projectHoldersOf } from '../projectMoney/holders.js';
import { nairobiToday } from '../projects/schedule.js';
import { attachActor } from '../quotes/access.js';

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

const MachinesSchema = z.object({
  machines: z
    .array(z.object({ assetId: z.string().min(1), halfDaysPerVisit: z.number().int().min(1).max(20) }))
    .max(20),
}) satisfies z.ZodType<SetProjectMachinesInput>;

const PayInSchema = z.object({
  totalCents: z.number().int().min(100).max(10_000_000_000),
  date: DateStr,
  note: z.string().trim().max(500).nullable().optional(),
}) satisfies z.ZodType<CreateProjectPayInInput>;

async function requireOwnerAccess(req: FastifyRequest, reply: FastifyReply) {
  if (!req.actor || !hasOwnerAccess(req.actor)) {
    return reply.code(403).send({ error: "Only the owner or an admin can record shareholders' pay-ins, because they are their investments." });
  }
}

/** One line in the project's history. A failure here never undoes the change itself. */
async function logEvent(req: FastifyRequest, projectId: string, summary: string, detail?: string | null) {
  try {
    await prisma.projectEvent.create({
      data: {
        projectId, kind: 'DETAILS_CHANGED', summary, detail: detail ?? null,
        actorId: req.actor?.id ?? null, actorName: req.actor?.fullName ?? null,
      },
    });
  } catch (err) {
    req.log.warn({ err }, 'could not log the project money change');
  }
}

const payInInclude = {
  createdBy: { select: { fullName: true } },
  investments: {
    select: { amountCents: true, shareholderId: true, shareholder: { select: { name: true, sortOrder: true } } },
  },
} satisfies Prisma.ProjectPayInInclude;

type PayInRow = Prisma.ProjectPayInGetPayload<{ include: typeof payInInclude }>;

function toPayInDto(row: PayInRow): ProjectPayInDto {
  const shares = row.investments
    .filter((i) => i.shareholderId && i.shareholder)
    .sort((a, b) => a.shareholder!.sortOrder - b.shareholder!.sortOrder)
    .map((i) => ({ shareholderId: i.shareholderId!, shareholderName: i.shareholder!.name, amountCents: i.amountCents }));
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    totalCents: row.totalCents,
    note: row.note,
    shares,
    companyCents: row.totalCents - shares.reduce((acc, s) => acc + s.amountCents, 0),
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadMachines(projectId: string): Promise<ProjectMachinesDto> {
  const [listed, register] = await Promise.all([
    prisma.projectMachine.findMany({
      where: { projectId },
      select: {
        halfDaysPerVisit: true,
        asset: { select: { id: true, name: true, projectRateCents: true, retiredAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.asset.findMany({
      where: { projectRateCents: { not: null }, countsFrom: { not: null }, retiredAt: null },
      select: { id: true, name: true, projectRateCents: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const used = new Set(listed.map((l) => l.asset.id));
  return {
    machines: listed.map((l) => ({
      assetId: l.asset.id,
      name: l.asset.name,
      halfDaysPerVisit: l.halfDaysPerVisit,
      projectRateCents: l.asset.projectRateCents ?? 0,
      retired: l.asset.retiredAt !== null || l.asset.projectRateCents === null,
    })),
    available: register
      .filter((a) => !used.has(a.id))
      .map((a) => ({ assetId: a.id, name: a.name, projectRateCents: a.projectRateCents! })),
  };
}

export const projectSplitRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', attachActor);
  app.addHook('preHandler', requireProjectMoneyAccess);

  // ── Machines the project uses ─────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/:id/machines', async (req, reply) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!project) return reply.code(404).send({ error: 'project not found' });
    return reply.send(await loadMachines(project.id));
  });

  /** Replace the list. A machine taken off keeps the days already on paid invoices. */
  app.put<{ Params: { id: string } }>('/:id/machines', async (req, reply) => {
    const parsed = MachinesSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Give each machine at least half a day per visit.' });
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!project) return reply.code(404).send({ error: 'project not found' });

    const wanted = parsed.data.machines;
    if (new Set(wanted.map((m) => m.assetId)).size !== wanted.length) {
      return reply.code(400).send({ error: 'Each machine can be listed once.' });
    }
    const before = await prisma.projectMachine.findMany({ where: { projectId: project.id }, select: { assetId: true } });
    const kept = new Set(before.map((b) => b.assetId));
    // A machine already on the list may stay after it is retired; a new one must be on the register and working.
    const added = wanted.filter((m) => !kept.has(m.assetId)).map((m) => m.assetId);
    if (added.length) {
      const ok = await prisma.asset.count({
        where: { id: { in: added }, projectRateCents: { not: null }, countsFrom: { not: null }, retiredAt: null },
      });
      if (ok !== added.length) {
        return reply.code(400).send({ error: 'Only machines on the machine register that are still working can be added.' });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectMachine.deleteMany({
        where: { projectId: project.id, assetId: { notIn: wanted.map((m) => m.assetId) } },
      });
      for (const m of wanted) {
        await tx.projectMachine.upsert({
          where: { projectId_assetId: { projectId: project.id, assetId: m.assetId } },
          create: { projectId: project.id, assetId: m.assetId, halfDaysPerVisit: m.halfDaysPerVisit },
          update: { halfDaysPerVisit: m.halfDaysPerVisit },
        });
      }
    });

    const result = await loadMachines(project.id);
    await logEvent(
      req, project.id, 'Machines changed',
      result.machines.length
        ? result.machines.map((m) => `${m.name}: ${daysText(m.halfDaysPerVisit)} per visit`).join('; ')
        : 'No machines',
    );
    return reply.send(result);
  });

  // ── Profit split and pay-ins ──────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/:id/split', async (req, reply) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!project) return reply.code(404).send({ error: 'project not found' });

    const [jobs, holders, payIns] = await Promise.all([
      prisma.job.findMany({ where: { projectId: project.id, status: { in: COUNTED_STATUSES } }, select: moneyJobSelect }),
      prisma.shareholder.findMany({
        where: { removedAt: null },
        select: { id: true, name: true, basisPoints: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.projectPayIn.findMany({
        where: { projectId: project.id },
        include: payInInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const { profitCents } = contractBreakdown(jobs, project.id, { byMonth: false }).totals;
    const payInDtos = payIns.map(toPayInDto);
    const split = projectHoldersOf(
      profitCents,
      holders,
      payInDtos.flatMap((p) => p.shares.map((s) => ({ shareholderId: s.shareholderId, name: s.shareholderName, amountCents: s.amountCents }))),
    );
    const result: ProjectSplitDto = {
      profitCents,
      marketingCents: split.marketingCents,
      sharedCents: split.sharedCents,
      holders: split.holders,
      unallocatedCents: split.unallocatedCents,
      paidInCents: payInDtos.reduce((acc, p) => acc + p.totalCents, 0),
      payIns: payInDtos,
    };
    return reply.send(result);
  });

  /** Record the costs the shareholders paid in: split by today's stakes, one investment each. */
  app.post<{ Params: { id: string } }>('/:id/pay-ins', { preHandler: requireOwnerAccess }, async (req, reply) => {
    const parsed = PayInSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Give the amount paid in (at least KSh 1) and the day.' });
    const { totalCents, date } = parsed.data;
    const note = parsed.data.note || null;
    if (date > nairobiToday()) return reply.code(400).send({ error: 'The day it was paid in can’t be in the future.' });

    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true, title: true } });
    if (!project) return reply.code(404).send({ error: 'project not found' });

    const holders = await prisma.shareholder.findMany({
      where: { removedAt: null, basisPoints: { gt: 0 } },
      select: { id: true, name: true, basisPoints: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (holders.length === 0) {
      return reply.code(400).send({ error: 'There are no shareholders on the cap table to split it between. Add them on the Ownership page first.' });
    }
    const { shares } = splitByStake(totalCents, holders.map((h) => h.basisPoints));

    const created = await prisma.projectPayIn.create({
      data: {
        projectId: project.id,
        totalCents,
        date: new Date(date),
        note,
        createdById: req.actor!.id,
        investments: {
          create: holders
            .map((h, i) => ({ h, amountCents: shares[i]! }))
            .filter((x) => x.amountCents > 0)
            .map(({ h, amountCents }) => ({
              source: h.name,
              kind: 'CAPITAL_INJECTION' as const,
              amountCents,
              date: new Date(date),
              purpose: `Costs paid in for the project ${project.title}`,
              shareholderId: h.id,
              reference: note,
              createdById: req.actor!.id,
            })),
        },
      },
      include: payInInclude,
    });

    const dto = toPayInDto(created);
    await logEvent(
      req, project.id, `Shareholders paid in ${shillings(totalCents)} towards costs`,
      dto.shares.map((s) => `${s.shareholderName} ${shillings(s.amountCents)}`).join('; '),
    );
    return reply.code(201).send({ payIn: dto });
  });

  /** Remove a pay-in entered by mistake, with each shareholder's part of it. */
  app.delete<{ Params: { id: string; payInId: string } }>(
    '/:id/pay-ins/:payInId',
    { preHandler: requireOwnerAccess },
    async (req, reply) => {
      const row = await prisma.projectPayIn.findUnique({ where: { id: req.params.payInId } });
      if (!row || row.projectId !== req.params.id) return reply.code(404).send({ error: 'pay-in not found' });
      await prisma.projectPayIn.delete({ where: { id: row.id } });
      await logEvent(req, row.projectId, `Pay-in of ${shillings(row.totalCents)} removed`);
      return reply.send({ ok: true });
    },
  );
};
