/**
 * Project money: the contracts table and one contract's breakdown, for the
 * owner, the admin, the financial manager and the COO. Read-only. Every sum
 * comes from projectMoney/figures.ts, the module Financials adds up in too.
 *
 * Job data is opened to three more roles here, so each query selects only the
 * fields it serves: no client name, phone, location or job notes.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { CostLineDto, ProjectMoneyDetail, ProjectMoneyTable } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { lineDetail } from '../expenses/line.js';
import { requireProjectMoneyAccess } from '../projectMoney/access.js';
import { COUNTED_STATUSES, contractBreakdown, contractLines, moneyJobFields, moneyJobSelect } from '../projectMoney/figures.js';
import { attachActor } from '../quotes/access.js';

/**
 * Staff can type anything into a cost's receipt link, and the Money tab shows
 * it as a link. Only a web address is served; `javascript:` and the like are not.
 */
function webLink(stored: string | null): string | null {
  if (!stored || !URL.canParse(stored)) return null;
  const { protocol } = new URL(stored);
  return protocol === 'http:' || protocol === 'https:' ? stored : null;
}

/** Days are stored in halves: 5 reads "2.5 days", 2 reads "1 day". */
function daysText(halfDays: number): string {
  return `${halfDays / 2} ${halfDays === 2 ? 'day' : 'days'}`;
}

export const projectMoneyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', attachActor);
  app.addHook('preHandler', requireProjectMoneyAccess);

  app.get('/', async (_req, reply) => {
    const [projects, jobs] = await Promise.all([
      prisma.project.findMany({ select: { id: true }, orderBy: [{ updatedAt: 'desc' }] }),
      prisma.job.findMany({
        where: { status: { in: COUNTED_STATUSES } },
        select: moneyJobSelect,
      }),
    ]);

    const lines = contractLines(jobs, projects.map((p) => p.id));
    const table: ProjectMoneyTable = {
      projects: lines.projects,
      oneOff: lines.standalone,
      unsorted: lines.unsorted.jobCount > 0 ? lines.unsorted : null,
      totals: lines.totals,
    };
    return reply.send({ table });
  });

  app.get<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { id: true, paymentFrequency: true },
    });
    if (!project) return reply.code(404).send({ error: 'project not found' });

    const jobs = await prisma.job.findMany({
      where: { projectId: project.id, status: { in: COUNTED_STATUSES } },
      select: {
        ...moneyJobFields,
        expenses: {
          select: {
            id: true,
            date: true,
            category: true,
            description: true,
            amountCents: true,
            quantityThousandths: true,
            unit: true,
            unitPriceCents: true,
            receiptRef: true,
            receiptUrl: true,
            createdBy: { select: { fullName: true } },
          },
          orderBy: { date: 'desc' },
        },
        machineLines: {
          select: {
            id: true,
            halfDays: true,
            amountCents: true,
            asset: { select: { name: true } },
            createdBy: { select: { fullName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { date: 'desc' },
    });

    const breakdown = contractBreakdown(jobs, project.id, { byMonth: project.paymentFrequency !== 'ONE_OFF' });

    // A job's costs, then its machine days. A machine line takes the job's
    // date and has no receipt, so it carries no receipt fields.
    const costsOf = new Map<string, CostLineDto[]>(
      jobs.map((j) => [
        j.id,
        [
          ...j.expenses.map((e) => ({
            id: e.id,
            date: e.date.toISOString().slice(0, 10),
            category: e.category,
            description: e.description,
            amountCents: e.amountCents,
            enteredByName: e.createdBy.fullName,
            receiptRef: e.receiptRef,
            receiptUrl: webLink(e.receiptUrl),
            ...lineDetail(e),
          })),
          ...j.machineLines.map((l) => ({
            id: l.id,
            date: j.date.toISOString().slice(0, 10),
            category: 'MACHINES' as const,
            description: `${l.asset.name}, ${daysText(l.halfDays)}`,
            amountCents: l.amountCents,
            enteredByName: l.createdBy.fullName,
          })),
        ],
      ]),
    );

    const detail: ProjectMoneyDetail = {
      projectId: project.id,
      totals: breakdown.totals,
      spentByGroupCents: breakdown.spentByGroupCents,
      months: breakdown.months,
      jobs: breakdown.jobs.map((j) => ({ ...j, costs: costsOf.get(j.jobId) ?? [] })),
    };
    return reply.send({ detail });
  });
};
