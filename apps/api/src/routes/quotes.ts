import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Prisma, RecurrenceFrequency } from '@prisma/client';
import type {
  CreateQuoteRequestInput,
  QuoteFrequency,
  QuoteRequestDto,
  QuoteStatus,
  ServiceLineCode,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

const CreateQuoteSchema = z.object({
  serviceLineCode: z.enum(['residential', 'office', 'hospital', 'post_build', 'fumigation']),
  siteType: z.string().trim().min(1).max(200),
  approxSqm: z.number().int().positive().max(1_000_000).optional(),
  floors: z.number().int().positive().max(500).optional(),
  frequency: z.enum(['NONE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  notes: z.string().trim().max(2000).optional(),
}) satisfies z.ZodType<CreateQuoteRequestInput>;

export const quoteRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // Submit a walkthrough/quote request (mockup 12).
  app.post('/', async (req, reply) => {
    const parsed = CreateQuoteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const serviceLine = await prisma.serviceLine.findUnique({
      where: { code: parsed.data.serviceLineCode },
    });
    if (!serviceLine || !serviceLine.isActive) {
      return reply.code(404).send({ error: 'service line not found' });
    }

    const row = await prisma.quoteRequest.create({
      data: {
        userId: req.auth!.sub,
        serviceLineId: serviceLine.id,
        siteType: parsed.data.siteType,
        approxSqm: parsed.data.approxSqm,
        floors: parsed.data.floors,
        frequency: parsed.data.frequency as RecurrenceFrequency,
        notes: parsed.data.notes,
      },
      include: { serviceLine: true },
    });
    return reply.code(201).send({ quoteRequest: toDto(row) });
  });

  // List the caller's quote requests, newest first.
  app.get('/', async (req, reply) => {
    const rows = await prisma.quoteRequest.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { createdAt: 'desc' },
      include: { serviceLine: true },
    });
    return reply.send({ quoteRequests: rows.map(toDto) });
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const row = await prisma.quoteRequest.findUnique({
      where: { id: req.params.id },
      include: { serviceLine: true },
    });
    if (!row || row.userId !== req.auth!.sub) return reply.code(404).send({ error: 'quote request not found' });
    return reply.send({ quoteRequest: toDto(row) });
  });
};

type QuoteRow = Prisma.QuoteRequestGetPayload<{ include: { serviceLine: true } }>;

function toDto(row: QuoteRow): QuoteRequestDto {
  return {
    id: row.id,
    serviceLineCode: row.serviceLine.code as ServiceLineCode,
    serviceLineName: row.serviceLine.name,
    siteType: row.siteType,
    approxSqm: row.approxSqm,
    floors: row.floors,
    frequency: row.frequency as QuoteFrequency,
    notes: row.notes,
    status: row.status as QuoteStatus,
    quotedAmountCents: row.quotedAmountCents,
    quotedAt: row.quotedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
