import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ExpenseCategory } from '@prisma/client';
import type {
  ExpenseDto,
  FinancialSummary,
  CreateExpenseInput,
  JobDto,
  CreateJobInput,
  UpdateJobInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

const DateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
});

const CreateJobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  incomeCents: z.number().int().nonnegative(),
  notes: z.string().trim().max(1000).optional(),
}) satisfies z.ZodType<CreateJobInput>;

const UpdateJobSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  incomeCents: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional(),
}) satisfies z.ZodType<UpdateJobInput>;

const CreateExpenseSchema = z.object({
  category: z.enum(['MATERIALS', 'TRANSPORT', 'EMPLOYEE_PAY', 'LUNCH', 'MISCELLANEOUS']),
  amountCents: z.number().int().positive(),
  description: z.string().trim().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
}) satisfies z.ZodType<CreateExpenseInput>;

export const financialsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireOwner);

  // ── Summary ────────────────────────────────────────────────────────────────

  // Monthly financial summary — income from jobs, expenses from all entries.
  app.get('/summary', async (req, reply) => {
    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { from, to } = dateRange(parsed.data.from, parsed.data.to);

    const [jobs, expenses] = await Promise.all([
      prisma.job.findMany({
        where: { date: { gte: from, lte: to } },
        select: { incomeCents: true },
      }),
      prisma.expense.findMany({
        where: { date: { gte: from, lte: to } },
        select: { category: true, amountCents: true },
      }),
    ]);

    const incomeCents = jobs.reduce((acc, j) => acc + j.incomeCents, 0);

    const catTotal = (cat: ExpenseCategory): number =>
      expenses.filter((e) => e.category === cat).reduce((acc, e) => acc + e.amountCents, 0);
    const expensesByCategoryCents: Record<ExpenseCategory, number> = {
      MATERIALS: catTotal('MATERIALS'),
      TRANSPORT: catTotal('TRANSPORT'),
      EMPLOYEE_PAY: catTotal('EMPLOYEE_PAY'),
      LUNCH: catTotal('LUNCH'),
      MISCELLANEOUS: catTotal('MISCELLANEOUS'),
    };

    const totalExpensesCents = expenses.reduce((acc, e) => acc + e.amountCents, 0);

    const summary: FinancialSummary = {
      incomeCents,
      expensesByCategoryCents,
      totalExpensesCents,
      netCents: incomeCents - totalExpensesCents,
      fromDate: parsed.data.from,
      toDate: parsed.data.to,
    };
    return reply.send({ summary });
  });

  // ── Jobs ───────────────────────────────────────────────────────────────────

  // List jobs (with their expenses) for a date range.
  app.get('/jobs', async (req, reply) => {
    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { from, to } = dateRange(parsed.data.from, parsed.data.to);

    const rows = await prisma.job.findMany({
      where: { date: { gte: from, lte: to } },
      include: { expenses: { orderBy: { date: 'desc' } } },
      orderBy: { date: 'desc' },
    });
    return reply.send({ jobs: rows.map(toJobDto) });
  });

  // Create a job.
  app.post('/jobs', async (req, reply) => {
    const parsed = CreateJobSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await prisma.job.create({
      data: {
        title: parsed.data.title,
        date: new Date(parsed.data.date),
        incomeCents: parsed.data.incomeCents,
        notes: parsed.data.notes,
        createdById: req.auth!.sub,
      },
      include: { expenses: true },
    });
    return reply.code(201).send({ job: toJobDto(row) });
  });

  // Update a job's title, income, or notes.
  app.patch<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const parsed = UpdateJobSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'job not found' });

    const row = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.incomeCents !== undefined && { incomeCents: parsed.data.incomeCents }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      },
      include: { expenses: { orderBy: { date: 'desc' } } },
    });
    return reply.send({ job: toJobDto(row) });
  });

  // Delete a job (cascades its expenses).
  app.delete<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'job not found' });
    await prisma.job.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });

  // ── Job expenses ───────────────────────────────────────────────────────────

  // Add an expense to a specific job.
  app.post<{ Params: { id: string } }>('/jobs/:id/expenses', async (req, reply) => {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return reply.code(404).send({ error: 'job not found' });

    const parsed = CreateExpenseSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await prisma.expense.create({
      data: {
        category: parsed.data.category as ExpenseCategory,
        amountCents: parsed.data.amountCents,
        description: parsed.data.description,
        date: new Date(parsed.data.date),
        jobId: job.id,
        createdById: req.auth!.sub,
      },
    });
    return reply.code(201).send({ expense: toExpenseDto(row) });
  });

  // Delete a specific expense from a job.
  app.delete<{ Params: { id: string; expenseId: string } }>(
    '/jobs/:id/expenses/:expenseId',
    async (req, reply) => {
      const row = await prisma.expense.findUnique({ where: { id: req.params.expenseId } });
      if (!row || row.jobId !== req.params.id) return reply.code(404).send({ error: 'expense not found' });
      await prisma.expense.delete({ where: { id: row.id } });
      return reply.send({ ok: true });
    },
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function requireOwner(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const u = await prisma.user.findUnique({ where: { id: req.auth.sub }, select: { isOwner: true } });
  if (!u?.isOwner) return reply.code(403).send({ error: 'owner access required' });
}

function dateRange(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  t.setHours(23, 59, 59, 999);
  return { from: f, to: t };
}

type JobRow = {
  id: string;
  title: string;
  date: Date;
  incomeCents: number;
  notes: string | null;
  createdAt: Date;
  expenses: ExpenseRow[];
};

type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  amountCents: number;
  description: string | null;
  date: Date;
  jobId: string | null;
  bookingId: string | null;
  createdAt: Date;
};

function toJobDto(row: JobRow): JobDto {
  const expenses = row.expenses.map(toExpenseDto);
  const totalExpensesCents = expenses.reduce((s, e) => s + e.amountCents, 0);
  return {
    id: row.id,
    title: row.title,
    date: row.date.toISOString().slice(0, 10),
    incomeCents: row.incomeCents,
    notes: row.notes,
    expenses,
    totalExpensesCents,
    netCents: row.incomeCents - totalExpensesCents,
    createdAt: row.createdAt.toISOString(),
  };
}

function toExpenseDto(row: ExpenseRow): ExpenseDto {
  return {
    id: row.id,
    category: row.category,
    amountCents: row.amountCents,
    description: row.description,
    date: row.date.toISOString().slice(0, 10),
    jobId: row.jobId,
    bookingId: row.bookingId,
    createdAt: row.createdAt.toISOString(),
  };
}
