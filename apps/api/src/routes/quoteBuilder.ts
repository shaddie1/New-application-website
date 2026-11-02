/**
 * Quote Builder: the rates card, the site survey and costing on a quote
 * request, the internal estimate and its approval, and the client-facing
 * quotation.
 *
 * State machine on QuoteRequest.status:
 *
 *   PENDING / SITE_VISIT_SCHEDULED ──(survey or costing saved → estimate DRAFT)
 *     └─ submit ──► AWAITING_APPROVAL ──approve──► APPROVED ──respond QUOTED──► QUOTED
 *                        │  └─ reject ──► SITE_VISIT_SCHEDULED (estimate REJECTED)
 *                        └─ withdraw ──► SITE_VISIT_SCHEDULED (estimate DRAFT)
 *
 * Editing the survey or costing, or recomputing, supersedes the current
 * estimate, and is refused once the quote is awaiting approval or approved —
 * withdraw first.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { EstimateStatus, Prisma, QuoteStatus, UserRole } from '@prisma/client';
import type {
  ClientQuotationDto,
  CreateBuilderQuoteInput,
  QuoteBuilderAssetDto,
  QuoteBuilderOptions,
  QuoteCosting,
  QuoteRates,
  QuoteSurveyInput,
  StoredQuoteEstimateOutput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { e164 } from '../auth/phone.js';
import { generateUniqueReferralCode } from '../auth/referral.js';
import { attachActor, canViewEstimate, requireApprover, requireEstimateAccess, requireStaff } from '../quotes/access.js';
import { CostingSchema, EMPTY_COSTING, MAX_PRICE_CENTS, copyOwnedMachines, defaultSurvey } from '../quotes/costing.js';
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

const CreateQuoteSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(1).max(30),
  serviceLineCode: z.enum(['residential', 'office', 'hospital', 'post_build', 'fumigation']),
  siteType: z.string().trim().min(1).max(200),
  frequency: z.enum(['NONE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  frequencyLabel: z.string().trim().min(1).max(60),
  scopeNotes: z.string().trim().max(2000).nullish(),
}) satisfies z.ZodType<CreateBuilderQuoteInput>;

const NoteSchema = z.object({ note: z.string().trim().max(1000).optional() });
const RejectSchema = z.object({ note: z.string().trim().min(1).max(1000) });

/** States in which the survey may still change and the estimate be recomputed. */
const EDITABLE: QuoteStatus[] = [QuoteStatus.PENDING, QuoteStatus.SITE_VISIT_SCHEDULED];

export const quoteBuilderRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', attachActor);
  app.addHook('preHandler', requireStaff);

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

  // ── New quote ─────────────────────────────────────────────────────────────

  // Start a quote for a client who did not ask through the website or app
  // (phone, referral, tender). It opens with a visit scheduled, so it can be
  // costed at once and stays out of the dashboard's pending count. The survey
  // starts at the visits picked, since "how often" stops at weekly.
  app.post('/quotes', { preHandler: requireEstimateAccess }, async (req, reply) => {
    const parsed = CreateQuoteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const input = parsed.data;

    const phone = e164(input.customerPhone);
    if (!phone) return reply.code(400).send({ error: 'enter a valid phone number, e.g. 0712 345 678' });
    const line = await prisma.serviceLine.findUnique({ where: { code: input.serviceLineCode } });
    if (!line?.isActive) return reply.code(400).send({ error: 'that service line is not offered' });
    const { rates } = await loadRates();
    const labels = rates.frequencyTable.map((f) => f.label);
    if (!labels.includes(input.frequencyLabel)) {
      return reply.code(400).send({ error: `“${input.frequencyLabel}” is not a row of the rates card's frequency table` });
    }

    const actorId = req.actor!.id;
    const scope = input.scopeNotes || null;
    const survey = { ...defaultSurvey(input.frequency, labels), frequencyLabel: input.frequencyLabel };
    const quoteId = await prisma.$transaction(async (tx) => {
      // An existing account keeps its own name.
      const customer =
        (await tx.user.findUnique({ where: { phone }, select: { id: true } })) ??
        (await tx.user.create({
          data: { phone, fullName: input.customerName, role: UserRole.CUSTOMER, referralCode: await generateUniqueReferralCode() },
          select: { id: true },
        }));
      const quote = await tx.quoteRequest.create({
        data: {
          userId: customer.id,
          serviceLineId: line.id,
          siteType: input.siteType,
          frequency: input.frequency,
          notes: scope,
          status: QuoteStatus.SITE_VISIT_SCHEDULED,
        },
        select: { id: true },
      });
      await tx.quoteSurvey.create({ data: { quoteRequestId: quote.id, ...surveyData(survey, actorId) } });
      const costing: QuoteCosting = { ...EMPTY_COSTING, clientScope: scope };
      await tx.quoteCosting.create({
        data: { quoteRequestId: quote.id, data: costing as unknown as Prisma.InputJsonValue, updatedById: actorId },
      });
      return quote.id;
    });

    return reply.code(201).send({ quoteRequest: await dto(quoteId, req) });
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

    const data = surveyData(parsed.data, req.actor!.id);
    await prisma.quoteSurvey.upsert({
      where: { quoteRequestId: quote.id },
      create: { quoteRequestId: quote.id, ...data },
      update: data,
    });

    await recompute(quote.id, parsed.data, req.actor!.id);
    return reply.send({ quoteRequest: await dto(quote.id, req) });
  });

  // ── Costing ───────────────────────────────────────────────────────────────

  // Save (replace) the costing and recompute. A quote with no survey gets a
  // blank one, so a contract priced by phone can be costed straight away.
  app.put<{ Params: { id: string } }>('/:id/costing', { preHandler: requireEstimateAccess }, async (req, reply) => {
    const parsed = CostingSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const quote = await prisma.quoteRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, frequency: true, survey: true, costing: true },
    });
    if (!quote) return reply.code(404).send({ error: 'quote request not found' });
    if (!EDITABLE.includes(quote.status)) {
      return reply.code(409).send({ error: editBlockedReason(quote.status) });
    }

    const previous = (quote.costing?.data ?? null) as unknown as QuoteCosting | null;
    const copied = await copyOwnedMachines(parsed.data.ownedMachines, previous?.ownedMachines ?? []);
    if ('error' in copied) {
      return reply.code(400).send({ error: { formErrors: [], fieldErrors: { ownedMachines: [copied.error] } } });
    }

    const { rates } = await loadRates();
    const survey = quote.survey
      ? SurveySchema.parse(quote.survey)
      : defaultSurvey(quote.frequency, rates.frequencyTable.map((f) => f.label));
    if (!quote.survey) {
      await prisma.quoteSurvey.create({ data: { quoteRequestId: quote.id, ...surveyData(survey, req.actor!.id) } });
    }

    // The visits a client's price was entered at, kept until the price or its
    // basis changes, so the estimate can warn when the survey's visits move.
    const price = parsed.data.clientPriceCents ?? null;
    const basis = parsed.data.clientPriceBasis ?? null;
    const unchanged = previous && (previous.clientPriceCents ?? null) === price && (previous.clientPriceBasis ?? null) === basis;
    const visitsNow = rates.frequencyTable.find((f) => f.label === survey.frequencyLabel)?.visitsPerMonth ?? 1;
    const costing: QuoteCosting = {
      ...parsed.data,
      ownedMachines: copied.machines,
      clientPriceVisitsPerMonth: price == null ? null : unchanged ? previous.clientPriceVisitsPerMonth ?? visitsNow : visitsNow,
    };
    const stored = { data: costing as unknown as Prisma.InputJsonValue, updatedById: req.actor!.id };
    await prisma.quoteCosting.upsert({
      where: { quoteRequestId: quote.id },
      create: { quoteRequestId: quote.id, ...stored },
      update: stored,
    });

    await recompute(quote.id, survey, req.actor!.id);
    return reply.send({ quoteRequest: await dto(quote.id, req) });
  });

  // Owned machines a costing can pick. Only the figures it copies — the COO
  // has no finance access, so nothing else from the asset register.
  app.get('/assets', { preHandler: requireEstimateAccess }, async (_req, reply) => {
    const rows = await prisma.asset.findMany({
      where: { retiredAt: null },
      select: { id: true, name: true, category: true, costCents: true, salvageValueCents: true, usefulLifeMonths: true },
      orderBy: { name: 'asc' },
    });
    const assets: QuoteBuilderAssetDto[] = rows.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      costCents: a.costCents,
      salvageValueCents: a.salvageValueCents,
      usefulLifeMonths: a.usefulLifeMonths,
    }));
    return reply.send({ assets });
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
    // A thin or losing margin goes forward for the approver to judge; only a
    // price of nothing, or more than a quote can carry, is refused.
    const price = (estimate.output as unknown as StoredQuoteEstimateOutput).pricing.pricePerVisitCents;
    if (!(price > 0)) {
      return reply.code(409).send({ error: 'the quoted price is KSh 0 — enter the client’s price or survey the site first' });
    }
    if (price > MAX_PRICE_CENTS) {
      return reply.code(409).send({ error: 'the price per visit is above KSh 21,474,836.47, the most a quote can carry — check the crew, days and day rates' });
    }

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
    const output = estimate.output as unknown as StoredQuoteEstimateOutput;
    const costing = estimate.costingSnapshot as unknown as QuoteCosting | null;

    const surveyed = [
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
    ];
    const quotation: ClientQuotationDto = {
      quoteRequestId: row.id,
      customerName: row.user.fullName,
      siteType: row.siteType,
      serviceLineName: row.serviceLine.name,
      frequencyLabel: output.pricing.frequencyLabel,
      visitsPerMonth: output.pricing.visitsPerMonth,
      priceBasis: output.pricing.clientPriceBasis ?? 'VISIT',
      pricePerVisitCents: output.pricing.pricePerVisitCents,
      monthlyValueCents: output.pricing.monthlyValueCents,
      // Nothing surveyed: one line for the whole job, described by the scope
      // text written for the client — never the request's notes, which on a
      // pipeline quote are the lead's internal notes.
      scope: surveyed.length > 0
        ? surveyed
        : [{ label: row.serviceLine.name, detail: row.siteType, description: costing?.clientScope ?? '' }],
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

  /**
   * Compute a fresh DRAFT estimate from the survey, the stored costing and
   * today's rates, superseding any other. Owned machines are costed from the
   * register figures copied at the last costing save.
   */
  async function recompute(quoteId: string, survey: QuoteSurveyInput, actorId: string) {
    const { rates, updatedAt } = await loadRates();
    const quote = await prisma.quoteRequest.findUnique({
      where: { id: quoteId },
      select: { frequency: true, costing: { select: { data: true } } },
    });
    // A quote nobody has costed still gets lunch and the contract warnings.
    const costing = (quote?.costing?.data as unknown as QuoteCosting | undefined) ?? EMPTY_COSTING;
    const output = computeEstimate(survey, rates, { ...costing, requestFrequency: quote?.frequency });
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
          costingSnapshot: costing as unknown as Prisma.InputJsonValue,
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

function editBlockedReason(status: QuoteStatus): string {
  if (status === QuoteStatus.AWAITING_APPROVAL || status === QuoteStatus.APPROVED) {
    return `the estimate is ${label(status)} — withdraw it before changing the survey or costing, or recomputing`;
  }
  return `the quote is ${label(status)}; the survey and costing can no longer change`;
}

/** A survey as the QuoteSurvey row stores it. */
function surveyData(survey: QuoteSurveyInput, actorId: string) {
  const { areas, items, notes, ...scalars } = survey;
  return {
    ...scalars,
    notes: notes ?? null,
    areas: areas as unknown as Prisma.InputJsonValue,
    items: items as unknown as Prisma.InputJsonValue,
    updatedById: actorId,
  };
}

function label(status: QuoteStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

function cleanLevelLabel(level: QuoteSurveyInput['areas'][number]['cleanLevel']): string {
  return level === 'VACUUM_ONLY' ? 'Vacuum only' : level === 'DEEP' ? 'Deep clean' : 'Routine clean';
}
