import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ExpenseCategory } from '@prisma/client';
import type {
  ExpenseDto,
  JobDto,
  CreateJobReportInput,
  CreateExpenseInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

const CreateReportSchema = z.object({
  title: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  incomeCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative().optional(),
  clientName: z.string().trim().max(200).optional(),
  clientPhone: z.string().trim().max(30).optional(),
  clientLocation: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
}) satisfies z.ZodType<CreateJobReportInput>;

const CreateExpenseSchema = z.object({
  category: z.enum(['MATERIALS', 'TRANSPORT', 'EMPLOYEE_PAY', 'LUNCH', 'MISCELLANEOUS']),
  amountCents: z.number().int().positive(),
  description: z.string().trim().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
}) satisfies z.ZodType<CreateExpenseInput>;

export const jobReportsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // List own submitted reports.
  app.get('/', async (req, reply) => {
    const rows = await prisma.job.findMany({
      where: { createdById: req.auth!.sub, status: { in: ['PENDING', 'APPROVED'] } },
      include: {
        expenses: { orderBy: { date: 'desc' } },
        reportedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ reports: rows.map(toJobDto) });
  });

  // Submit a new job report (creates as PENDING).
  app.post('/', async (req, reply) => {
    const parsed = CreateReportSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await prisma.job.create({
      data: {
        title: parsed.data.title,
        date: new Date(parsed.data.date),
        incomeCents: parsed.data.incomeCents,
        discountCents: parsed.data.discountCents ?? 0,
        status: 'PENDING',
        clientName: parsed.data.clientName,
        clientPhone: parsed.data.clientPhone,
        clientLocation: parsed.data.clientLocation,
        notes: parsed.data.notes,
        createdById: req.auth!.sub,
        reportedById: req.auth!.sub,
      },
      include: { expenses: true, reportedBy: { select: { fullName: true } } },
    });
    return reply.code(201).send({ report: toJobDto(row) });
  });

  // Delete own pending report.
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.createdById !== req.auth!.sub || existing.status !== 'PENDING') {
      return reply.code(404).send({ error: 'report not found' });
    }
    await prisma.job.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });

  // Add an expense to own pending report.
  app.post<{ Params: { id: string } }>('/:id/expenses', async (req, reply) => {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job || job.createdById !== req.auth!.sub || job.status !== 'PENDING') {
      return reply.code(404).send({ error: 'report not found' });
    }

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

  // Delete an expense from own pending report.
  app.delete<{ Params: { id: string; expenseId: string } }>(
    '/:id/expenses/:expenseId',
    async (req, reply) => {
      const job = await prisma.job.findUnique({ where: { id: req.params.id } });
      if (!job || job.createdById !== req.auth!.sub || job.status !== 'PENDING') {
        return reply.code(404).send({ error: 'report not found' });
      }
      const expense = await prisma.expense.findUnique({ where: { id: req.params.expenseId } });
      if (!expense || expense.jobId !== job.id) return reply.code(404).send({ error: 'expense not found' });
      await prisma.expense.delete({ where: { id: expense.id } });
      return reply.send({ ok: true });
    },
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────

type JobRow = {
  id: string;
  title: string;
  date: Date;
  incomeCents: number;
  discountCents: number;
  status: 'OWNER_ENTRY' | 'PENDING' | 'APPROVED';
  clientName: string | null;
  clientPhone: string | null;
  clientLocation: string | null;
  notes: string | null;
  createdAt: Date;
  expenses: ExpenseRow[];
  reportedBy: { fullName: string } | null;
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
  const totalExpensesCents = expenses.reduce((acc, e) => acc + e.amountCents, 0);
  const actualIncomeCents = row.incomeCents - row.discountCents;
  return {
    id: row.id,
    title: row.title,
    date: row.date.toISOString().slice(0, 10),
    incomeCents: row.incomeCents,
    discountCents: row.discountCents,
    actualIncomeCents,
    status: row.status,
    reportedByName: row.reportedBy?.fullName ?? null,
    clientName: row.clientName,
    clientPhone: row.clientPhone,
    clientLocation: row.clientLocation,
    notes: row.notes,
    expenses,
    totalExpensesCents,
    netCents: actualIncomeCents - totalExpensesCents,
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
