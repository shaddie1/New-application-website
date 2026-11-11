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
import { requireProjectMoneyAccess } from '../projectMoney/access.js';
import { COUNTED_STATUSES, contractBreakdown, contractLines } from '../projectMoney/figures.js';
import { attachActor } from '../quotes/access.js';

/** What the calculation needs of a job. */
const jobFields = {
  id: true,
  title: true,
  date: true,
  incomeCents: true,
  discountCents: true,
  status: true,
  placement: true,
  projectId: true,
} as const;

/**
 * Staff can type anything into a cost's receipt link, and the Money tab shows
 * it as a link. Only a web address is served; `javascript:` and the like are not.
 */
function webLink(stored: string | null): string | null {
  if (!stored || !URL.canParse(stored)) return null;
  const { protocol } = new URL(stored);
  return protocol === 'http:' || protocol === 'https:' ? stored : null;
}

export const projectMoneyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', attachActor);
  app.addHook('preHandler', requireProjectMoneyAccess);

  /** The contracts table: a line per project in the Projects list's order, one-off jobs, jobs not yet sorted, totals. */
  app.get('/', async (_req, reply) => {
    const [projects, jobs] = await Promise.all([
      prisma.project.findMany({ select: { id: true }, orderBy: [{ updatedAt: 'desc' }] }),
      prisma.job.findMany({
        where: { status: { in: COUNTED_STATUSES } },
        select: { ...jobFields, expenses: { select: { category: true, amountCents: true } } },
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

  /** One contract: totals, spending by group, month rows unless it is billed once, and its jobs with their cost lines. */
  app.get<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { id: true, paymentFrequency: true },
    });
    if (!project) return reply.code(404).send({ error: 'project not found' });

    const jobs = await prisma.job.findMany({
      where: { projectId: project.id, status: { in: COUNTED_STATUSES } },
      select: {
        ...jobFields,
        expenses: {
          select: {
            id: true,
            date: true,
            category: true,
            description: true,
            amountCents: true,
            receiptRef: true,
            receiptUrl: true,
            createdBy: { select: { fullName: true } },
          },
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { date: 'desc' },
    });

    const breakdown = contractBreakdown(jobs, project.id, { byMonth: project.paymentFrequency !== 'ONE_OFF' });

    const costsOf = new Map<string, CostLineDto[]>(
      jobs.map((j) => [
        j.id,
        j.expenses.map((e) => ({
          id: e.id,
          date: e.date.toISOString().slice(0, 10),
          category: e.category,
          description: e.description,
          amountCents: e.amountCents,
          enteredByName: e.createdBy.fullName,
          receiptRef: e.receiptRef,
          receiptUrl: webLink(e.receiptUrl),
        })),
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
