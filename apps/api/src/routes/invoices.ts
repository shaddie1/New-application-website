/**
 * Invoices for projects (owner's choices, 20 November 2026): the system makes
 * each invoice from the project's Payment setting and schedule, staff record
 * when it was sent (due 14 days later) and when it was paid. Marking it paid
 * adds the amount as income: a job under the project, dated the day it was
 * paid, so it counts in Charged, Insights and profit like any other job.
 *
 * Money roles (owner, admin, financial manager, COO) make, send and cancel
 * invoices. Marking paid, and undoing that, adds or removes income, so it is
 * kept to the owner and admins, who also own Jobs & costs.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  CreateInvoiceInput,
  OpenInvoicesDto,
  PayInvoiceInput,
  ProjectInvoicesDto,
  SendInvoiceInput,
  UpdateInvoiceInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { hasOwnerAccess } from '../auth/staff.js';
import { requireProjectMoneyAccess } from '../projectMoney/access.js';
import { attachActor } from '../quotes/access.js';
import { addDays, nairobiToday } from '../projects/schedule.js';
import {
  billingProjectOf,
  invoiceInclude,
  linesFor,
  nextInvoiceNumber,
  periodsWithInvoices,
  shillings,
  toInvoiceDto,
} from '../invoices/invoices.js';
import { PAYMENT_TERMS_DAYS, invoiceablePeriods } from '../invoices/periods.js';

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

const CreateSchema = z.object({
  projectId: z.string().min(1),
  periodStart: DateStr,
  periodEnd: DateStr,
}) satisfies z.ZodType<CreateInvoiceInput>;

const LineSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(1000),
  unitCents: z.number().int().min(0).max(10_000_000_000),
  amountCents: z.number().int(),
});

const UpdateSchema = z.object({
  lines: z.array(LineSchema).min(1).max(30).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
}) satisfies z.ZodType<UpdateInvoiceInput>;

const SendSchema = z.object({ sentOn: DateStr.optional() }) satisfies z.ZodType<SendInvoiceInput>;

const PaySchema = z.object({
  paidOn: DateStr,
  paymentRef: z.string().trim().max(100).nullable().optional(),
}) satisfies z.ZodType<PayInvoiceInput>;

const projectForBilling = {
  id: true, title: true, clientName: true, clientPhone: true, siteLocation: true,
  serviceLineCode: true, clientSegment: true, paymentFrequency: true, valueCents: true,
  kind: true, startDate: true, targetEndDate: true, repeatEvery: true, repeatUnit: true,
  serviceDays: true, weekOfMonth: true, deepCleanEveryMonths: true, deepCleanPriceCents: true,
} as const;

/** Thrown inside a transaction when the invoice moved on meanwhile. */
class Conflict extends Error {}

async function requireOwnerAccess(req: FastifyRequest, reply: FastifyReply) {
  if (!req.actor || !hasOwnerAccess(req.actor)) {
    return reply.code(403).send({ error: 'Only the owner or an admin can record a payment, because it adds income.' });
  }
}

/** One line in the project's history. A failure here never undoes the change itself. */
async function logInvoiceEvent(req: FastifyRequest, projectId: string, summary: string, detail?: string | null) {
  try {
    await prisma.projectEvent.create({
      data: {
        projectId, kind: 'INVOICE_CHANGED', summary, detail: detail ?? null,
        actorId: req.actor?.id ?? null, actorName: req.actor?.fullName ?? null,
      },
    });
  } catch (err) {
    req.log.warn({ err }, 'could not log the invoice change');
  }
}

function load(id: string) {
  return prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
}

export const invoiceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', attachActor);
  app.addHook('preHandler', requireProjectMoneyAccess);

  /** Sent and not paid yet, for the Dashboard: the overdue ones first. */
  app.get('/open', async (_req, reply) => {
    const today = nairobiToday();
    const [sent, draftCount] = await Promise.all([
      prisma.invoice.findMany({ where: { status: 'SENT' }, include: invoiceInclude, orderBy: [{ dueOn: 'asc' }] }),
      prisma.invoice.count({ where: { status: 'DRAFT' } }),
    ]);
    const all = sent.map((row) => toInvoiceDto(row, today));
    const open: OpenInvoicesDto = {
      overdue: all.filter((i) => i.isOverdue),
      awaiting: all.filter((i) => !i.isOverdue),
      draftCount,
    };
    return reply.send(open);
  });

  /** A project's invoices and the periods it can be invoiced for. */
  app.get<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: projectForBilling });
    if (!project) return reply.code(404).send({ error: 'project not found' });
    const rows = await prisma.invoice.findMany({
      where: { projectId: project.id },
      include: invoiceInclude,
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
    });
    const today = nairobiToday();
    const result: ProjectInvoicesDto = {
      invoices: rows.map((row) => toInvoiceDto(row, today)),
      periods: await periodsWithInvoices({ id: project.id, ...billingProjectOf(project) }, rows, today),
    };
    return reply.send(result);
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const row = await load(req.params.id);
    if (!row) return reply.code(404).send({ error: 'invoice not found' });
    return reply.send({ invoice: toInvoiceDto(row) });
  });

  /** Make a draft for one period, with the lines the project's setting gives. */
  app.post('/', async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { projectId, periodStart, periodEnd } = parsed.data;

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: projectForBilling });
    if (!project) return reply.code(404).send({ error: 'project not found' });
    const billing = { id: project.id, ...billingProjectOf(project) };

    const period = invoiceablePeriods(billing, nairobiToday()).find(
      (p) => p.start === periodStart && p.end === periodEnd,
    );
    if (!period) {
      return reply.code(400).send({
        error: billing.schedule.startDate
          ? 'That period doesn’t match the project’s Payment setting. Pick one from the list.'
          : 'Give the project a start date first: invoices are made from it.',
      });
    }

    const existing = await prisma.invoice.findFirst({
      where: { projectId, periodStart: new Date(periodStart), status: { not: 'CANCELLED' } },
      select: { number: true },
    });
    if (existing) {
      return reply.code(409).send({ error: `This period already has invoice ${existing.number}.` });
    }

    const lines = await linesFor(billing, period);
    const created = await prisma.$transaction(async (tx) => {
      const number = await nextInvoiceNumber(tx, Number(nairobiToday().slice(0, 4)));
      return tx.invoice.create({
        data: {
          number,
          projectId,
          periodStart: new Date(period.start),
          periodEnd: new Date(period.end),
          totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0),
          createdById: req.actor!.id,
          lines: { create: lines.map((l, i) => ({ ...l, sortOrder: i })) },
        },
      });
    });

    await logInvoiceEvent(req, projectId, `Invoice ${created.number} made`, `${period.label}, ${shillings(created.totalCents)}`);
    return reply.code(201).send({ invoice: toInvoiceDto((await load(created.id))!) });
  });

  /** Change a draft's lines or note. Amounts are worked out here, not taken from the form. */
  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await load(req.params.id);
    if (!row) return reply.code(404).send({ error: 'invoice not found' });
    if (row.status !== 'DRAFT') {
      return reply.code(409).send({ error: 'Only a draft can be changed. Set it back to draft first.' });
    }

    const lines = parsed.data.lines?.map((l, i) => ({
      description: l.description, quantity: l.quantity, unitCents: l.unitCents,
      amountCents: l.quantity * l.unitCents, sortOrder: i,
    }));
    await prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: row.id } });
        await tx.invoiceLine.createMany({ data: lines.map((l) => ({ ...l, invoiceId: row.id })) });
      }
      await tx.invoice.update({
        where: { id: row.id },
        data: {
          ...(lines && { totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0) }),
          ...(parsed.data.note !== undefined && { note: parsed.data.note || null }),
        },
      });
    });

    const updated = (await load(row.id))!;
    if (updated.totalCents !== row.totalCents) {
      await logInvoiceEvent(req, row.projectId, `Invoice ${row.number} changed`, `${shillings(row.totalCents)} → ${shillings(updated.totalCents)}`);
    }
    return reply.send({ invoice: toInvoiceDto(updated) });
  });

  /** Record that it went to the client. It is due 14 days later. */
  app.post<{ Params: { id: string } }>('/:id/send', async (req, reply) => {
    const parsed = SendSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await load(req.params.id);
    if (!row) return reply.code(404).send({ error: 'invoice not found' });
    if (row.status !== 'DRAFT') return reply.code(409).send({ error: 'This invoice was already sent.' });
    if (row.totalCents <= 0) {
      return reply.code(400).send({ error: 'This invoice comes to KSh 0. Add the amount before sending it.' });
    }
    const today = nairobiToday();
    const sentOn = parsed.data.sentOn ?? today;
    if (sentOn > today) return reply.code(400).send({ error: 'The day it was sent can’t be in the future.' });
    const dueOn = addDays(sentOn, PAYMENT_TERMS_DAYS);

    const { count } = await prisma.invoice.updateMany({
      where: { id: row.id, status: 'DRAFT' },
      data: { status: 'SENT', sentOn: new Date(sentOn), dueOn: new Date(dueOn) },
    });
    if (count === 0) return reply.code(409).send({ error: 'This invoice was already sent.' });

    await logInvoiceEvent(req, row.projectId, `Invoice ${row.number} sent`, `${shillings(row.totalCents)}, due ${dueOn}`);
    return reply.send({ invoice: toInvoiceDto((await load(row.id))!) });
  });

  /** Take a sent invoice back to a draft, to correct it. */
  app.post<{ Params: { id: string } }>('/:id/draft', async (req, reply) => {
    const row = await load(req.params.id);
    if (!row) return reply.code(404).send({ error: 'invoice not found' });
    const { count } = await prisma.invoice.updateMany({
      where: { id: row.id, status: 'SENT' },
      data: { status: 'DRAFT', sentOn: null, dueOn: null },
    });
    if (count === 0) return reply.code(409).send({ error: 'Only a sent invoice that isn’t paid can go back to a draft.' });
    await logInvoiceEvent(req, row.projectId, `Invoice ${row.number} set back to draft`);
    return reply.send({ invoice: toInvoiceDto((await load(row.id))!) });
  });

  /**
   * Record the payment. In one go: the invoice is marked paid and the amount is
   * added as income under the project, dated the day it was paid.
   */
  app.post<{ Params: { id: string } }>('/:id/paid', { preHandler: requireOwnerAccess }, async (req, reply) => {
    const parsed = PaySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await load(req.params.id);
    if (!row) return reply.code(404).send({ error: 'invoice not found' });
    if (row.status !== 'SENT') {
      return reply.code(409).send({
        error: row.status === 'PAID' ? 'This invoice is already paid.' : 'Mark the invoice sent before recording its payment.',
      });
    }
    const { paidOn } = parsed.data;
    const paymentRef = parsed.data.paymentRef || null;
    if (paidOn > nairobiToday()) return reply.code(400).send({ error: 'The day it was paid can’t be in the future.' });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: row.projectId }, select: projectForBilling });
    try {
      await prisma.$transaction(async (tx) => {
        const job = await tx.job.create({
          data: {
            title: `Invoice ${row.number}: ${project.title}`,
            date: new Date(paidOn),
            incomeCents: row.totalCents,
            status: 'OWNER_ENTRY',
            placement: 'PROJECT',
            projectId: project.id,
            clientName: project.clientName,
            clientPhone: project.clientPhone,
            clientLocation: project.siteLocation,
            serviceLineCode: project.serviceLineCode,
            clientSegment: project.clientSegment,
            notes: `Payment of invoice ${row.number} (${toInvoiceDto(row).periodLabel})${paymentRef ? `, ref ${paymentRef}` : ''}. Added by the invoice: to undo it, mark the invoice not paid.`,
            createdById: req.actor!.id,
          },
        });
        const { count } = await tx.invoice.updateMany({
          where: { id: row.id, status: 'SENT' },
          data: { status: 'PAID', paidOn: new Date(paidOn), paymentRef, jobId: job.id },
        });
        if (count === 0) throw new Conflict();
      });
    } catch (err) {
      if (err instanceof Conflict) return reply.code(409).send({ error: 'This invoice is already paid.' });
      throw err;
    }

    await logInvoiceEvent(
      req, row.projectId, `Invoice ${row.number} paid`,
      `${shillings(row.totalCents)} on ${paidOn}${paymentRef ? `, ref ${paymentRef}` : ''}; added to Jobs & costs`,
    );
    return reply.send({ invoice: toInvoiceDto((await load(row.id))!) });
  });

  /** Undo a payment recorded by mistake: the income it added is taken off again. */
  app.post<{ Params: { id: string } }>('/:id/unpaid', { preHandler: requireOwnerAccess }, async (req, reply) => {
    const row = await load(req.params.id);
    if (!row) return reply.code(404).send({ error: 'invoice not found' });
    if (row.status !== 'PAID') return reply.code(409).send({ error: 'This invoice isn’t marked paid.' });

    if (row.jobId) {
      const job = await prisma.job.findUnique({
        where: { id: row.jobId },
        select: { _count: { select: { expenses: true, machineLines: true } } },
      });
      if (job && job._count.expenses + job._count.machineLines > 0) {
        return reply.code(409).send({
          error: 'Its income job in Jobs & costs now has costs on it. Move or remove those costs first.',
        });
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.invoice.updateMany({
          where: { id: row.id, status: 'PAID' },
          data: { status: 'SENT', paidOn: null, paymentRef: null, jobId: null },
        });
        if (count === 0) throw new Conflict();
        if (row.jobId) await tx.job.delete({ where: { id: row.jobId } });
      });
    } catch (err) {
      if (err instanceof Conflict) return reply.code(409).send({ error: 'This invoice isn’t marked paid.' });
      throw err;
    }

    await logInvoiceEvent(req, row.projectId, `Invoice ${row.number} marked not paid`, `${shillings(row.totalCents)} taken off Jobs & costs`);
    return reply.send({ invoice: toInvoiceDto((await load(row.id))!) });
  });

  /** Cancel an invoice that won't be paid. It stays on the list, and its period can be invoiced again. */
  app.post<{ Params: { id: string } }>('/:id/cancel', async (req, reply) => {
    const row = await load(req.params.id);
    if (!row) return reply.code(404).send({ error: 'invoice not found' });
    const { count } = await prisma.invoice.updateMany({
      where: { id: row.id, status: { in: ['DRAFT', 'SENT'] } },
      data: { status: 'CANCELLED' },
    });
    if (count === 0) {
      return reply.code(409).send({
        error: row.status === 'PAID' ? 'A paid invoice can’t be cancelled. Mark it not paid first.' : 'This invoice is already cancelled.',
      });
    }
    await logInvoiceEvent(req, row.projectId, `Invoice ${row.number} cancelled`, shillings(row.totalCents));
    return reply.send({ invoice: toInvoiceDto((await load(row.id))!) });
  });

  /** Delete a draft that was never sent. */
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const row = await load(req.params.id);
    if (!row) return reply.code(404).send({ error: 'invoice not found' });
    const { count } = await prisma.invoice.deleteMany({ where: { id: row.id, status: 'DRAFT' } });
    if (count === 0) {
      return reply.code(409).send({ error: 'Only a draft can be deleted. Cancel a sent invoice instead.' });
    }
    await logInvoiceEvent(req, row.projectId, `Draft invoice ${row.number} deleted`);
    return reply.send({ ok: true });
  });
};
