import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ExpenseCategory, PaymentStatus } from '@prisma/client';
import type { ExpenseDto, FinancialSummary, CreateExpenseInput } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

const DateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
});

const CreateExpenseSchema = z.object({
  category: z.enum(['MATERIALS', 'TRANSPORT', 'EMPLOYEE_PAY', 'LUNCH', 'MISCELLANEOUS']),
  amountCents: z.number().int().positive(),
  description: z.string().trim().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
}) satisfies z.ZodType<CreateExpenseInput>;

export const financialsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireOwner);

  // Financial summary for a date range — income from payments + expenses by category.
  app.get('/summary', async (req, reply) => {
    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    to.setHours(23, 59, 59, 999);

    const [payments, expenses] = await Promise.all([
      prisma.payment.findMany({
        where: { status: PaymentStatus.SUCCEEDED, completedAt: { gte: from, lte: to } },
        select: { amountCents: true },
      }),
      prisma.expense.findMany({
        where: { date: { gte: from, lte: to } },
        select: { category: true, amountCents: true },
      }),
    ]);

    const incomeCents = payments.reduce((sum, p) => sum + p.amountCents, 0);

    const expensesByCategoryCents: Record<string, number> = {
      MATERIALS: 0, TRANSPORT: 0, EMPLOYEE_PAY: 0, LUNCH: 0, MISCELLANEOUS: 0,
    };
    for (const e of expenses) {
      expensesByCategoryCents[e.category] += e.amountCents;
    }

    const totalExpensesCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);

    const summary: FinancialSummary = {
      incomeCents,
      expensesByCategoryCents: expensesByCategoryCents as FinancialSummary['expensesByCategoryCents'],
      totalExpensesCents,
      netCents: incomeCents - totalExpensesCents,
      fromDate: parsed.data.from,
      toDate: parsed.data.to,
    };
    return reply.send({ summary });
  });

  // List expense entries for a date range.
  app.get('/expenses', async (req, reply) => {
    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    to.setHours(23, 59, 59, 999);

    const rows = await prisma.expense.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: 'desc' },
    });
    return reply.send({ expenses: rows.map(toExpenseDto) });
  });

  // Record a new expense.
  app.post('/expenses', async (req, reply) => {
    const parsed = CreateExpenseSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await prisma.expense.create({
      data: {
        category: parsed.data.category as ExpenseCategory,
        amountCents: parsed.data.amountCents,
        description: parsed.data.description,
        date: new Date(parsed.data.date),
        createdById: req.auth!.sub,
      },
    });
    return reply.code(201).send({ expense: toExpenseDto(row) });
  });

  // Delete an expense entry.
  app.delete<{ Params: { id: string } }>('/expenses/:id', async (req, reply) => {
    const row = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!row) return reply.code(404).send({ error: 'expense not found' });
    await prisma.expense.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });
};

async function requireOwner(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const u = await prisma.user.findUnique({ where: { id: req.auth.sub }, select: { isOwner: true } });
  if (!u?.isOwner) return reply.code(403).send({ error: 'owner access required' });
}

function toExpenseDto(row: {
  id: string;
  category: ExpenseCategory;
  amountCents: number;
  description: string | null;
  date: Date;
  bookingId: string | null;
  createdAt: Date;
}): ExpenseDto {
  return {
    id: row.id,
    category: row.category,
    amountCents: row.amountCents,
    description: row.description,
    date: row.date.toISOString().slice(0, 10),
    bookingId: row.bookingId,
    createdAt: row.createdAt.toISOString(),
  };
}
