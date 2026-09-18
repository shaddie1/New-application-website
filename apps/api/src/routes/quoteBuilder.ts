/**
 * Quote Builder: the rates card, the site survey on a quote request, the
 * internal estimate and its approval, and the client-facing quotation.
 *
 * State machine on QuoteRequest.status:
 *
 *   PENDING / SITE_VISIT_SCHEDULED ──(survey saved → estimate DRAFT)
 *     └─ submit ──► AWAITING_APPROVAL ──approve──► APPROVED ──respond QUOTED──► QUOTED
 *                        │  └─ reject ──► SITE_VISIT_SCHEDULED (estimate REJECTED)
 *                        └─ withdraw ──► SITE_VISIT_SCHEDULED (estimate DRAFT)
 *
 * Editing the survey or recomputing supersedes the current estimate, and is
 * refused once the quote is awaiting approval or approved — withdraw first.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { EstimateStatus, Prisma, QuoteStatus } from '@prisma/client';
import type {
  ClientQuotationDto,
  QuoteBuilderOptions,
  QuoteEstimateOutput,
  QuoteRates,
  QuoteSurveyInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { attachActor, canViewEstimate, requireApprover, requireEstimateAccess } from '../quotes/access.js';
import { adminQuoteInclude, toAdminQuoteDto } from '../quotes/dto.js';
import { computeEstimate } from '../quotes/estimate.js';
import {
  CLEAN_LEVELS,
  DISTANCE_ZONES,
  ROOM_SIZE_PRESETS,
  RatesSchema,
  SOIL_LEVELS,
  loadRates,
  saveRates,
} from '../quotes/rates.js';

const SurveySchema = z.object({
  distanceZone: z.enum(DISTANCE_ZONES),
  soilLevel: z.enum(SOIL_LEVELS),
  frequencyLabel: z.string().trim().min(1).max(60),
  workingWindowHours: z.number().positive().max(24),
  supervisorOnSite: z.boolean(),
  traineeSourced: z.boolean(),
  notes: z.string().trim().max(2000).nullish(),
  areas: z
    .array(
      z.object({
        areaType: z.string().trim().min(1).max(80),
        cleanLevel: z.enum(CLEAN_LEVELS),
        roomCount: z.number().int().min(1).max(500),
        sizePreset: z.enum(ROOM_SIZE_PRESETS),
        measuredM2: z.number().positive().max(100_000).nullish(),
      }),
    )
    .max(100),
  items: z
    .array(z.object({ itemType: z.string().trim().min(1).max(80), quantity: z.number().int().min(1).max(10_000) }))
    .max(100),
}) satisfies z.ZodType<QuoteSurveyInput>;

const NoteSchema = z.object({ note: z.string().trim().max(1000).optional() });
const RejectSchema = z.object({ note: z.string().trim().min(1).max(1000) });

/** States in which the survey may still change and the estimate be recomputed. */
const EDITABLE: QuoteStatus[] = [QuoteStatus.PENDING, QuoteStatus.SITE_VISIT_SCHEDULED];

export const quoteBuilderRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', attachActor);

  // ── Rates card ────────────────────────────────────────────────────────────

  app.get('/rates', { preHandler: requireEstimateAccess }, async (_req, reply) => {
    return reply.send(await loadRates());
  });

  app.put('/rates', { preHandler: requireEstimateAccess }, async (req, reply) => {
    const parsed = RatesSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    // Existing estimates keep the rates they were computed with; the UI flags
    // them as stale by comparing ratesUpdatedAt.
    return reply.send(await saveRates(parsed.data, req.actor!.id));
  });

  // What the survey form can pick from. Names and sizes only — the money
  // behind them stays with the rates card.
  app.get('/options', async (_req, reply) => {
    const { rates } = await loadRates();
    const options: QuoteBuilderOptions = {
      areaTypes: [...new Set(rates.areaRates.map((r) => r.areaType))],
      itemTypes: rates.itemRates.map((r) => r.itemType),
      frequencies: rates.frequencyTable.map((f) => ({ label: f.label, visitsPerMonth: f.visitsPerMonth })),
      roomSizePresetsM2: rates.roomSizePresetsM2,
    };
    return reply.send({ options });
  });

  // ── Survey ────────────────────────────────────────────────────────────────

  // Save (replace) the survey and recompute the estimate from it. Any staff
  // member can survey; only estimate roles get the figures back.
  app.put<{ Params: { id: string } }>('/:id/survey', async (req, reply) => {
    const parsed = SurveySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const quote = await prisma.quoteRequest.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
    if (!quote) return reply.code(404).send({ error: 'quote request not found' });
    if (!EDITABLE.includes(quote.status)) {
      return reply.code(409).send({ error: editBlockedReason(quote.status) });
    }

    const { areas, items, notes, ...scalars } = parsed.data;
    await prisma.quoteSurvey.upsert({
      where: { quoteRequestId: quote.id },
      create: {
        quoteRequestId: quote.id,
        ...scalars,
        notes: notes ?? null,
        areas: areas as unknown as Prisma.InputJsonValue,
        items: items as unknown as Prisma.InputJsonValue,
        updatedById: req.actor!.id,
      },
      update: {
        ...scalars,
        notes: notes ?? null,
        areas: areas as unknown as Prisma.InputJsonValue,
        items: items as unknown as Prisma.InputJsonValue,
        updatedById: req.actor!.id,
      },
    });

    await recompute(quote.id, parsed.data, req.actor!.id);
    return reply.send({ quoteRequest: await dto(quote.id, req) });
  });

  // Recompute with the current rates card (e.g. after the rates were edited).
  app.post<{ Params: { id: string } }>('/:id/estimate', { preHandler: requireEstimateAccess }, async (req, reply) => {
    const quote = await prisma.quoteRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, survey: true },
    });
    if (!quote) return reply.code(404).send({ error: 'quote request not found' });
    if (!quote.survey) return reply.code(409).send({ error: 'save a site survey before estimating' });
    if (!EDITABLE.includes(quote.status)) {
      return reply.code(409).send({ error: editBlockedReason(quote.status) });
    }

    const survey = SurveySchema.parse({
      ...quote.survey,
      areas: quote.survey.areas,
      items: quote.survey.items,
    });
    await recompute(quote.id, survey, req.actor!.id);
    return reply.send({ quoteRequest: await dto(quote.id, req) });
  });

  // ── Approval ──────────────────────────────────────────────────────────────

  app.post<{ Params: { id: string } }>('/:id/submit', { preHandler: requireEstimateAccess }, async (req, reply) => {
    const { quote, estimate } = await loadCurrent(req.params.id);
    if (!quote) return reply.code(404).send({ error: 'quote request not found' });
    if (!EDITABLE.includes(quote.status)) {
      return reply.code(409).send({ error: editBlockedReason(quote.status) });
    }
    if (!estimate || estimate.status === EstimateStatus.REJECTED) {
      return reply.code(409).send({ error: 'compute an estimate before sending it for approval' });
    }
    const blocked = belowMinimumReason(estimate.output as unknown as QuoteEstimateOutput);
    if (blocked) return reply.code(409).send({ error: blocked });

    await prisma.$transaction([
      prisma.quoteEstimate.update({
        where: { id: estimate.id },
        data: { status: EstimateStatus.SUBMITTED, submittedById: req.actor!.id, submittedAt: new Date(), decisionNote: null },
      }),
      prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: QuoteStatus.AWAITING_APPROVAL } }),
    ]);
    return reply.send({ quoteRequest: await dto(quote.id, req) });
  });

  // Take it back before (or after) a decision, so the survey can change.
  app.post<{ Params: { id: string } }>('/:id/withdraw', { preHandler: requireEstimateAccess }, async (req, reply) => {
    const { quote, estimate } = await loadCurrent(req.params.id);
    if (!quote) return reply.code(404).send({ error: 'quote request not found' });
    if (quote.status !== QuoteStatus.AWAITING_APPROVAL && quote.status !== QuoteStatus.APPROVED) {
      return reply.code(409).send({ error: `nothing to withdraw — the quote is ${label(quote.status)}` });
    }

    await prisma.$transaction([
      ...(estimate
        ? [prisma.quoteEstimate.update({
            where: { id: estimate.id },
            data: { status: EstimateStatus.DRAFT, submittedAt: null, submittedById: null, decidedAt: null, decidedById: null, decisionNote: null },
          })]
        : []),
      prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: QuoteStatus.SITE_VISIT_SCHEDULED } }),
    ]);
    return reply.send({ quoteRequest: await dto(quote.id, req) });
  });

  app.post<{ Params: { id: string } }>('/:id/approve', { preHandler: requireApprover }, async (req, reply) => {
    const parsed = NoteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { quote, estimate } = await loadCurrent(req.params.id);
    if (!quote) return reply.code(404).send({ error: 'quote request not found' });
    if (quote.status !== QuoteStatus.AWAITING_APPROVAL || estimate?.status !== EstimateStatus.SUBMITTED) {
      return reply.code(409).send({ error: `the quote is ${label(quote.status)}, not awaiting approval` });
    }
    // Belt and braces: the block is enforced on submit, but the rule is the
    // approver's, so it is checked again here against the frozen figures.
    const blocked = belowMinimumReason(estimate.output as unknown as QuoteEstimateOutput);
    if (blocked) return reply.code(409).send({ error: blocked });

    await prisma.$transaction([
      prisma.quoteEstimate.update({
        where: { id: estimate.id },
        data: {
          status: EstimateStatus.APPROVED,
          decidedById: req.actor!.id,
          decidedAt: new Date(),
          decisionNote: parsed.data.note || null,
        },
      }),
      prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: QuoteStatus.APPROVED } }),
    ]);
    return reply.send({ quoteRequest: await dto(quote.id, req) });
  });

  app.post<{ Params: { id: string } }>('/:id/reject', { preHandler: requireApprover }, async (req, reply) => {
    const parsed = RejectSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { quote, estimate } = await loadCurrent(req.params.id);
    if (!quote) return reply.code(404).send({ error: 'quote request not found' });
    if (quote.status !== QuoteStatus.AWAITING_APPROVAL || estimate?.status !== EstimateStatus.SUBMITTED) {
      return reply.code(409).send({ error: `the quote is ${label(quote.status)}, not awaiting approval` });
    }

    await prisma.$transaction([
      prisma.quoteEstimate.update({
        where: { id: estimate.id },
        data: { status: EstimateStatus.REJECTED, decidedById: req.actor!.id, decidedAt: new Date(), decisionNote: parsed.data.note },
      }),
      prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: QuoteStatus.SITE_VISIT_SCHEDULED } }),
    ]);
    return reply.send({ quoteRequest: await dto(quote.id, req) });
  });

  // ── Client quotation ──────────────────────────────────────────────────────

  // Scope and price only — nothing internal. Any staff member can pull it
  // once the estimate is approved, since that is what gets sent to the client.
  app.get<{ Params: { id: string } }>('/:id/client-quotation', async (req, reply) => {
    const row = await prisma.quoteRequest.findUnique({ where: { id: req.params.id }, include: adminQuoteInclude });
    if (!row) return reply.code(404).send({ error: 'quote request not found' });
    const estimate = row.estimates[0];
    if (!estimate || estimate.status !== EstimateStatus.APPROVED) {
      return reply.code(409).send({ error: 'the client quotation needs an approved estimate' });
    }

    const survey = estimate.surveySnapshot as unknown as QuoteSurveyInput;
    const rates = estimate.ratesSnapshot as unknown as QuoteRates;
    const output = estimate.output as unknown as QuoteEstimateOutput;

    const quotation: ClientQuotationDto = {
      quoteRequestId: row.id,
      customerName: row.user.fullName,
      siteType: row.siteType,
      serviceLineName: row.serviceLine.name,
      frequencyLabel: output.pricing.frequencyLabel,
      visitsPerMonth: output.pricing.visitsPerMonth,
      pricePerVisitCents: output.pricing.pricePerVisitCents,
      monthlyValueCents: output.pricing.monthlyValueCents,
      scope: [
        ...survey.areas.map((a) => {
          const m2 = a.sizePreset === 'MEASURED' ? a.measuredM2 ?? 0 : rates.roomSizePresetsM2[a.sizePreset];
          return {
            label: a.areaType,
            detail: `${a.roomCount} × approx. ${m2} m² · ${cleanLevelLabel(a.cleanLevel)}`,
            description: rates.workDescriptions[a.cleanLevel],
          };
        }),
        ...survey.items.map((i) => ({
          label: i.itemType,
          detail: `${i.quantity} unit${i.quantity === 1 ? '' : 's'}`,
          description: rates.workDescriptions.ITEM,
        })),
      ],
      contactPhone: rates.quoteContactPhone,
      contactEmail: rates.quoteContactEmail,
      approvedAt: estimate.decidedAt?.toISOString() ?? estimate.computedAt.toISOString(),
      issuedAt: new Date().toISOString(),
    };
    return reply.send({ quotation });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function dto(id: string, req: { actor?: { role: string; isOwner: boolean } }) {
    const row = await prisma.quoteRequest.findUniqueOrThrow({ where: { id }, include: adminQuoteInclude });
    return toAdminQuoteDto(row, !!req.actor && canViewEstimate(req.actor as Parameters<typeof canViewEstimate>[0]));
  }

  /** Compute a fresh DRAFT estimate from the survey and today's rates, superseding any other. */
  async function recompute(quoteId: string, survey: QuoteSurveyInput, actorId: string) {
    const { rates, updatedAt } = await loadRates();
    const output = computeEstimate(survey, rates);
    await prisma.$transaction([
      prisma.quoteEstimate.updateMany({
        where: { quoteRequestId: quoteId, status: { not: EstimateStatus.SUPERSEDED } },
        data: { status: EstimateStatus.SUPERSEDED },
      }),
      prisma.quoteEstimate.create({
        data: {
          quoteRequestId: quoteId,
          status: EstimateStatus.DRAFT,
          surveySnapshot: survey as unknown as Prisma.InputJsonValue,
          ratesSnapshot: rates as unknown as Prisma.InputJsonValue,
          ratesUpdatedAt: updatedAt ? new Date(updatedAt) : null,
          output: output as unknown as Prisma.InputJsonValue,
          computedById: actorId,
        },
      }),
    ]);
  }

  async function loadCurrent(id: string) {
    const quote = await prisma.quoteRequest.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!quote) return { quote: null, estimate: null };
    const estimate = await prisma.quoteEstimate.findFirst({
      where: { quoteRequestId: id, status: { not: EstimateStatus.SUPERSEDED } },
      orderBy: { computedAt: 'desc' },
    });
    return { quote, estimate };
  }
};

/** Why an estimate cannot go forward, or null when it can. */
export function belowMinimumReason(output: QuoteEstimateOutput): string | null {
  if (output.pricing.marginCheck !== 'BELOW MINIMUM') return null;
  const price = (output.pricing.pricePerVisitCents / 100).toLocaleString('en-KE');
  const min = (output.pricing.minimumPriceCents / 100).toLocaleString('en-KE');
  return `Blocked: price per visit KSh ${price} is below the minimum price KSh ${min} (BELOW MINIMUM). ` +
    'Change the scope, frequency or rates so the margin clears the minimum before sending for approval.';
}

function editBlockedReason(status: QuoteStatus): string {
  if (status === QuoteStatus.AWAITING_APPROVAL || status === QuoteStatus.APPROVED) {
    return `the estimate is ${label(status)} — withdraw it before changing the survey or recomputing`;
  }
  return `the quote is ${label(status)}; the survey can no longer change`;
}

function label(status: QuoteStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

function cleanLevelLabel(level: QuoteSurveyInput['areas'][number]['cleanLevel']): string {
  return level === 'VACUUM_ONLY' ? 'Vacuum only' : level === 'DEEP' ? 'Deep clean' : 'Routine clean';
}
