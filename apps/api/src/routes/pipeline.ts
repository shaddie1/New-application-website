/**
 * Pipeline tracker: leads, tenders, their activity logs, the locked funnel
 * targets, the month's actuals against them, the required-activity
 * calculator, and commission on won leads.
 *
 * Every stage or status change is written to the activity log; the funnel
 * actuals are computed from those log rows, never from hand-entered counts.
 * Field names follow the Pipeline_Tracker and Tender_Tracker sheets.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  LeadEventKind,
  LeadStage,
  Prisma,
  QuoteStatus,
  RecurrenceFrequency,
  TenderEventKind,
  TenderType,
  UserRole,
} from '@prisma/client';
import type {
  ChangeLeadStageInput,
  ChangeTenderStatusInput,
  CommissionSummary,
  CreateLeadInput,
  CreateTenderInput,
  LeadDto,
  LeadEventDto,
  RequiredActivityInput,
  TenderDto,
  TenderEventDto,
  UpdateLeadInput,
  UpdateTenderInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { generateUniqueReferralCode } from '../auth/referral.js';
import { attachActor } from '../quotes/access.js';
import { loadRates } from '../quotes/rates.js';
import {
  householdOnly,
  requireCommission,
  requireFullPipeline,
  requirePipeline,
  requireTargetsEdit,
  requireTargetsView,
} from '../pipeline/access.js';
import {
  classifyChannel,
  computeActuals,
  isHouseholdSegment,
  isRecurringContract,
  leadCommission,
  requiredActivity,
} from '../pipeline/funnel.js';
import { FunnelTargetsSchema, loadFunnelTargets, saveFunnelTargets } from '../pipeline/targets.js';

// ── Validation ──────────────────────────────────────────────────────────────

const STAGES = ['CONTACTED', 'CONVERSATION', 'SITE_VISIT', 'PROPOSAL_SENT', 'WON', 'LOST'] as const;
const TENDER_TYPES = ['TENDER', 'EOI', 'RFQ', 'PREQUALIFICATION'] as const;
const BID_DECISIONS = ['BID', 'NO_BID'] as const;
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const MonthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM');
const cents = z.number().int().nonnegative();
const text = (max: number) => z.string().trim().max(max);

const LeadBase = {
  dateLogged: DateStr.optional(),
  clientOrg: text(160).min(1),
  segment: text(80).min(1),
  broughtInById: z.string().nullish(),
  channel: text(80).min(1),
  contactName: text(120).min(1),
  contactPhone: text(40).nullish(),
  quoteValueCents: cents.nullish(),
  contractType: text(60).nullish(),
  expectedClose: DateStr.nullish(),
  notes: text(4000).nullish(),
};
const CreateLeadSchema = z.object(LeadBase) satisfies z.ZodType<CreateLeadInput>;
const UpdateLeadSchema = z.object(LeadBase).partial() satisfies z.ZodType<UpdateLeadInput>;

const StageSchema = z.object({
  stage: z.enum(STAGES),
  note: text(1000).optional(),
  revenueReceivedCents: cents.optional(),
  actualDirectCostsCents: cents.optional(),
  lostReason: text(500).optional(),
}) satisfies z.ZodType<ChangeLeadStageInput>;

const NoteSchema = z.object({ note: text(2000).min(1) });
const PaidSchema = z.object({ reference: text(120).optional() });

const TenderBase = {
  tenderRef: text(120).min(1),
  title: text(200).min(1),
  issuingOrg: text(160).min(1),
  sourcePortal: text(160).nullish(),
  type: z.enum(TENDER_TYPES),
  agpoReserved: z.boolean().optional(),
  dateFound: DateStr.optional(),
  submissionDeadline: DateStr,
  packToCooBy: DateStr.nullish(),
  bidDecision: z.enum(BID_DECISIONS).nullish(),
  status: text(80).optional(),
  dateSentToCoo: DateStr.nullish(),
  notes: text(4000).nullish(),
};
const CreateTenderSchema = z.object(TenderBase) satisfies z.ZodType<CreateTenderInput>;
const UpdateTenderSchema = z.object(TenderBase).partial() satisfies z.ZodType<UpdateTenderInput>;
const TenderStatusSchema = z.object({
  status: text(80).min(1),
  note: text(1000).optional(),
  dateSentToCoo: DateStr.nullish(),
}) satisfies z.ZodType<ChangeTenderStatusInput>;

const CalculatorSchema = z.object({
  winsWantedPerYear: z.number().min(0).max(10_000),
  year: z.union([z.literal(1), z.literal(2)]),
  channelMix: z.object({
    DIRECT_OUTREACH: z.number().min(0).max(1),
    WARM_INTRO: z.number().min(0).max(1),
    PUBLIC_TENDER: z.number().min(0).max(1),
    PRIVATE_RFQ: z.number().min(0).max(1),
    HOUSEHOLD: z.number().min(0).max(1),
  }),
}) satisfies z.ZodType<RequiredActivityInput>;

// ── Includes & DTOs ─────────────────────────────────────────────────────────

const person = { select: { fullName: true } } as const;

const leadInclude = {
  broughtInBy: person,
  createdBy: person,
  linkedQuote: { select: { status: true } },
  _count: { select: { events: true } },
} satisfies Prisma.LeadInclude;
type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

const tenderInclude = {
  createdBy: person,
  _count: { select: { events: true } },
} satisfies Prisma.TenderInclude;
type TenderRow = Prisma.TenderGetPayload<{ include: typeof tenderInclude }>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const todayNairobi = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

function toLeadDto(r: LeadRow): LeadDto {
  const netProfitCents =
    r.revenueReceivedCents != null && r.actualDirectCostsCents != null ? r.revenueReceivedCents - r.actualDirectCostsCents : null;
  return {
    id: r.id,
    leadId: r.leadId,
    dateLogged: day(r.dateLogged)!,
    clientOrg: r.clientOrg,
    segment: r.segment,
    broughtInById: r.broughtInById,
    broughtInByName: r.broughtInBy?.fullName ?? null,
    channel: r.channel,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    stage: r.stage,
    quoteValueCents: r.quoteValueCents,
    contractType: r.contractType,
    expectedClose: day(r.expectedClose),
    linkedQuoteId: r.linkedQuoteId,
    linkedQuoteStatus: r.linkedQuote?.status ?? null,
    notes: r.notes,
    wonAt: iso(r.wonAt),
    lostAt: iso(r.lostAt),
    lostReason: r.lostReason,
    revenueReceivedCents: r.revenueReceivedCents,
    actualDirectCostsCents: r.actualDirectCostsCents,
    netProfitCents,
    commissionPct: r.commissionPct,
    commissionCents: r.commissionCents,
    commissionPaidAt: iso(r.commissionPaidAt),
    commissionReference: r.commissionReference,
    eventCount: r._count.events,
    createdByName: r.createdBy?.fullName ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Whole days from today (Nairobi) to a date; negative once past. */
function daysUntil(d: Date): number {
  const today = new Date(todayNairobi());
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** The sheet's rule: the pack reaches the COO two days before the deadline (5 pm). */
function defaultPackDate(deadline: string): string {
  const d = new Date(`${deadline}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}

function toTenderDto(r: TenderRow): TenderDto {
  return {
    id: r.id,
    tenderRef: r.tenderRef,
    title: r.title,
    issuingOrg: r.issuingOrg,
    sourcePortal: r.sourcePortal,
    type: r.type,
    agpoReserved: r.agpoReserved,
    dateFound: day(r.dateFound)!,
    submissionDeadline: day(r.submissionDeadline)!,
    packToCooBy: day(r.packToCooBy)!,
    bidDecision: r.bidDecision,
    status: r.status,
    dateSentToCoo: day(r.dateSentToCoo),
    sentOnTime: r.dateSentToCoo ? r.dateSentToCoo.getTime() <= r.packToCooBy.getTime() : null,
    daysToDeadline: daysUntil(r.submissionDeadline),
    daysToPack: daysUntil(r.packToCooBy),
    notes: r.notes,
    eventCount: r._count.events,
    createdByName: r.createdBy?.fullName ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const STAGE_LABEL: Record<LeadStage, string> = {
  CONTACTED: 'Contacted', CONVERSATION: 'Conversation', SITE_VISIT: 'Site visit', PROPOSAL_SENT: 'Proposal sent', WON: 'Won', LOST: 'Lost',
};

function shown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

/** Month bounds in UTC for a YYYY-MM. */
function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

/** Kenyan numbers as typed → E.164; anything else passed through if it already is. */
function e164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const candidate =
    digits.startsWith('254') ? `+${digits}`
    : digits.startsWith('0') ? `+254${digits.slice(1)}`
    : digits.length === 9 ? `+254${digits}`
    : `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}

/** Contract type wording (the Quote Builder's frequency labels) → quote request frequency. */
function frequencyFor(contractType: string | null): RecurrenceFrequency {
  const t = (contractType ?? '').toLowerCase();
  if (/daily|weekly|twice/.test(t)) return RecurrenceFrequency.WEEKLY;
  if (/fortnight|biweekly/.test(t)) return RecurrenceFrequency.BIWEEKLY;
  if (/month/.test(t)) return RecurrenceFrequency.MONTHLY;
  return RecurrenceFrequency.NONE;
}

// ── Routes ──────────────────────────────────────────────────────────────────

export const pipelineRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', attachActor);

  // ── Leads ─────────────────────────────────────────────────────────────────

  app.get('/leads', { preHandler: requirePipeline }, async (req, reply) => {
    const q = req.query as { stage?: string; segment?: string; channel?: string; broughtInById?: string };
    const where: Prisma.LeadWhereInput = {
      ...(q.stage && STAGES.includes(q.stage as never) ? { stage: q.stage as LeadStage } : {}),
      ...(q.segment ? { segment: { contains: q.segment, mode: 'insensitive' } } : {}),
      ...(q.channel ? { channel: { contains: q.channel, mode: 'insensitive' } } : {}),
      ...(q.broughtInById ? { broughtInById: q.broughtInById } : {}),
    };
    let rows = await prisma.lead.findMany({ where, include: leadInclude, orderBy: [{ updatedAt: 'desc' }], take: 500 });
    // Segment is free text, so Marketing's slice is decided by wording.
    if (householdOnly(req.actor!)) rows = rows.filter((r) => isHouseholdSegment(r.segment));
    return reply.send({ leads: rows.map(toLeadDto), commission: await commissionSummary() });
  });

  app.post('/leads', { preHandler: requirePipeline }, async (req, reply) => {
    const parsed = CreateLeadSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (householdOnly(req.actor!) && !isHouseholdSegment(parsed.data.segment)) {
      return reply.code(403).send({ error: 'marketing can log household leads only' });
    }
    const { dateLogged, expectedClose, broughtInById, ...rest } = parsed.data;

    // "L-001" style reference; retried on the rare collision between two people logging at once.
    let row: { id: string } | null = null;
    for (let attempt = 0; attempt < 5 && !row; attempt++) {
      const n = (await prisma.lead.count()) + 1 + attempt;
      try {
        row = await prisma.lead.create({
          data: {
            ...rest,
            leadId: `L-${String(n).padStart(3, '0')}`,
            dateLogged: new Date(dateLogged ?? todayNairobi()),
            expectedClose: expectedClose ? new Date(expectedClose) : null,
            // Whoever logs it first brings it in, unless they say otherwise.
            broughtInById: broughtInById === undefined ? req.actor!.id : broughtInById,
            createdById: req.actor!.id,
          },
          select: { id: true },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    if (!row) return reply.code(500).send({ error: 'could not allocate a lead reference' });

    await logLead(row.id, LeadEventKind.CREATED, null, LeadStage.CONTACTED, `Lead logged — ${STAGE_LABEL.CONTACTED}`, req.actor!.id,
      `${rest.channel} · ${rest.segment}`);
    return reply.code(201).send({ lead: await leadDto(row.id) });
  });

  app.patch<{ Params: { id: string } }>('/leads/:id', { preHandler: requirePipeline }, async (req, reply) => {
    const parsed = UpdateLeadSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await guardLead(req, reply, req.params.id);
    if (!existing) return;

    const { dateLogged, expectedClose, ...rest } = parsed.data;
    const changes = Object.entries(rest)
      .filter(([k, v]) => v !== undefined && (existing as Record<string, unknown>)[k] !== v)
      .map(([k, v]) => `${k}: ${shown((existing as Record<string, unknown>)[k])} → ${shown(v)}`);
    if (dateLogged !== undefined && day(existing.dateLogged) !== dateLogged) changes.push(`date logged: ${day(existing.dateLogged)} → ${dateLogged}`);
    if (expectedClose !== undefined && day(existing.expectedClose) !== (expectedClose ?? null)) {
      changes.push(`expected close: ${shown(day(existing.expectedClose))} → ${shown(expectedClose)}`);
    }

    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(dateLogged !== undefined ? { dateLogged: new Date(dateLogged) } : {}),
        ...(expectedClose !== undefined ? { expectedClose: expectedClose ? new Date(expectedClose) : null } : {}),
      },
    });
    if (changes.length) await logLead(existing.id, LeadEventKind.DETAILS_CHANGED, null, null, 'Details changed', req.actor!.id, changes.join('; '));
    return reply.send({ lead: await leadDto(existing.id) });
  });

  app.delete<{ Params: { id: string } }>('/leads/:id', { preHandler: requireFullPipeline }, async (req, reply) => {
    const existing = await prisma.lead.findUnique({ where: { id: req.params.id }, select: { id: true, commissionPaidAt: true } });
    if (!existing) return reply.code(404).send({ error: 'lead not found' });
    if (existing.commissionPaidAt) return reply.code(409).send({ error: 'commission has been paid on this lead — it cannot be deleted' });
    await prisma.lead.delete({ where: { id: existing.id } });
    return reply.send({ ok: true });
  });

  // Stage moves are the funnel's raw data. WON needs the money; LOST needs a reason.
  app.post<{ Params: { id: string } }>('/leads/:id/stage', { preHandler: requirePipeline }, async (req, reply) => {
    const parsed = StageSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await guardLead(req, reply, req.params.id);
    if (!existing) return;
    const { stage, note } = parsed.data;
    if (stage === existing.stage) return reply.code(409).send({ error: `the lead is already at ${STAGE_LABEL[stage]}` });
    if (existing.commissionPaidAt) return reply.code(409).send({ error: 'commission has been paid on this lead — its outcome is final' });

    const data: Prisma.LeadUpdateInput = { stage };
    let detail = note ?? null;

    if (stage === LeadStage.WON) {
      const { revenueReceivedCents, actualDirectCostsCents } = parsed.data;
      if (revenueReceivedCents === undefined || actualDirectCostsCents === undefined) {
        return reply.code(400).send({ error: 'revenueReceivedCents and actualDirectCostsCents are required to mark a lead won' });
      }
      // Commission goes to whoever brought the lead in, at the rate on the rates card at the time of the win.
      const { rates } = await loadRates();
      const { netProfitCents, commissionCents } = leadCommission(revenueReceivedCents, actualDirectCostsCents, rates.commissionPct);
      Object.assign(data, {
        wonAt: new Date(), lostAt: null, lostReason: null,
        revenueReceivedCents, actualDirectCostsCents,
        commissionPct: rates.commissionPct, commissionCents,
      });
      detail = [
        `revenue ${money(revenueReceivedCents)} − costs ${money(actualDirectCostsCents)} = net ${money(netProfitCents)}`,
        `commission ${money(commissionCents)} (${Math.round(rates.commissionPct * 100)}%) to ${(await prisma.user.findUnique({ where: { id: existing.broughtInById ?? '' }, select: { fullName: true } }))?.fullName ?? 'unassigned'}`,
        note,
      ].filter(Boolean).join(' · ');
    } else if (stage === LeadStage.LOST) {
      if (!parsed.data.lostReason) return reply.code(400).send({ error: 'lostReason is required to mark a lead lost' });
      Object.assign(data, { lostAt: new Date(), lostReason: parsed.data.lostReason, wonAt: null });
      detail = [parsed.data.lostReason, note].filter(Boolean).join(' · ');
    } else if (existing.stage === LeadStage.WON || existing.stage === LeadStage.LOST) {
      // Reopening: the outcome no longer stands.
      Object.assign(data, {
        wonAt: null, lostAt: null, lostReason: null, revenueReceivedCents: null, actualDirectCostsCents: null,
        commissionPct: null, commissionCents: null,
      });
    }

    await prisma.lead.update({ where: { id: existing.id }, data });
    await logLead(existing.id, LeadEventKind.STAGE_CHANGED, existing.stage, stage, `${STAGE_LABEL[existing.stage]} → ${STAGE_LABEL[stage]}`, req.actor!.id, detail);
    return reply.send({ lead: await leadDto(existing.id) });
  });

  app.post<{ Params: { id: string } }>('/leads/:id/notes', { preHandler: requirePipeline }, async (req, reply) => {
    const parsed = NoteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await guardLead(req, reply, req.params.id);
    if (!existing) return;
    await logLead(existing.id, LeadEventKind.NOTE_ADDED, null, null, 'Note', req.actor!.id, parsed.data.note);
    return reply.send({ lead: await leadDto(existing.id) });
  });

  app.get<{ Params: { id: string } }>('/leads/:id/events', { preHandler: requirePipeline }, async (req, reply) => {
    const existing = await guardLead(req, reply, req.params.id);
    if (!existing) return;
    const rows = await prisma.leadEvent.findMany({ where: { leadId: existing.id }, orderBy: { createdAt: 'desc' } });
    const events: LeadEventDto[] = rows.map((e) => ({
      id: e.id, kind: e.kind, fromStage: e.fromStage, toStage: e.toStage, summary: e.summary, detail: e.detail, actorName: e.actorName, createdAt: e.createdAt.toISOString(),
    }));
    return reply.send({ events });
  });

  // "Create quote" from Proposal sent: a quote request for the lead's contact,
  // opened on the Quotes page with the survey ready to fill.
  app.post<{ Params: { id: string } }>('/leads/:id/create-quote', { preHandler: requirePipeline }, async (req, reply) => {
    const existing = await guardLead(req, reply, req.params.id);
    if (!existing) return;
    if (existing.stage !== LeadStage.PROPOSAL_SENT) {
      return reply.code(409).send({ error: `move the lead to ${STAGE_LABEL.PROPOSAL_SENT} before creating a quote` });
    }
    if (existing.linkedQuoteId) return reply.code(409).send({ error: 'this lead already has a quote', quoteRequestId: existing.linkedQuoteId });
    const phone = existing.contactPhone ? e164(existing.contactPhone) : null;
    if (!phone) return reply.code(400).send({ error: 'add a valid contact phone to the lead first — the quote is filed under the customer' });

    const customer =
      (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) ??
      (await prisma.user.create({
        data: { phone, fullName: existing.contactName, role: UserRole.CUSTOMER, referralCode: await generateUniqueReferralCode() },
        select: { id: true },
      }));

    const lineCode = isHouseholdSegment(existing.segment) ? 'residential' : /clinic|lab|medical|hospital|health/i.test(existing.segment) ? 'hospital' : 'office';
    const line =
      (await prisma.serviceLine.findFirst({ where: { code: lineCode, isActive: true }, select: { id: true } })) ??
      (await prisma.serviceLine.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true } }));
    if (!line) return reply.code(500).send({ error: 'no active service line to file the quote under' });

    const quote = await prisma.quoteRequest.create({
      data: {
        userId: customer.id,
        serviceLineId: line.id,
        siteType: existing.clientOrg,
        frequency: frequencyFor(existing.contractType),
        notes: existing.notes,
        status: QuoteStatus.SITE_VISIT_SCHEDULED,
      },
    });
    await prisma.lead.update({ where: { id: existing.id }, data: { linkedQuoteId: quote.id } });
    await logLead(existing.id, LeadEventKind.QUOTE_LINKED, null, null, 'Quote created', req.actor!.id, `Quote request for “${existing.clientOrg}” opened in the Quote Builder`);
    return reply.code(201).send({ lead: await leadDto(existing.id), quoteRequestId: quote.id });
  });

  // ── Commission ────────────────────────────────────────────────────────────

  app.post<{ Params: { id: string } }>('/leads/:id/commission-paid', { preHandler: requireCommission }, async (req, reply) => {
    const parsed = PaidSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'lead not found' });
    if (existing.stage !== LeadStage.WON || !existing.commissionCents) return reply.code(409).send({ error: 'no commission is due on this lead' });
    if (existing.commissionPaidAt) return reply.code(409).send({ error: 'commission already marked paid' });
    await prisma.lead.update({
      where: { id: existing.id },
      data: { commissionPaidAt: new Date(), commissionReference: parsed.data.reference || null },
    });
    await logLead(existing.id, LeadEventKind.COMMISSION_PAID, null, null, `Commission ${money(existing.commissionCents)} paid`, req.actor!.id,
      parsed.data.reference ? `Ref ${parsed.data.reference}` : null);
    return reply.send({ lead: await leadDto(existing.id) });
  });

  // ── Tenders ───────────────────────────────────────────────────────────────

  app.get('/tenders', { preHandler: requireFullPipeline }, async (_req, reply) => {
    const rows = await prisma.tender.findMany({ include: tenderInclude, orderBy: [{ submissionDeadline: 'asc' }], take: 500 });
    return reply.send({ tenders: rows.map(toTenderDto) });
  });

  app.post('/tenders', { preHandler: requireFullPipeline }, async (req, reply) => {
    const parsed = CreateTenderSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { dateFound, submissionDeadline, packToCooBy, dateSentToCoo, status, agpoReserved, ...rest } = parsed.data;
    const pack = packToCooBy ?? defaultPackDate(submissionDeadline);
    if (pack > submissionDeadline) return reply.code(400).send({ error: 'the pack must reach the COO before the submission deadline' });
    const row = await prisma.tender.create({
      data: {
        ...rest,
        agpoReserved: agpoReserved ?? false,
        status: status || 'Identified',
        dateFound: new Date(dateFound ?? todayNairobi()),
        submissionDeadline: new Date(submissionDeadline),
        packToCooBy: new Date(pack),
        dateSentToCoo: dateSentToCoo ? new Date(dateSentToCoo) : null,
        createdById: req.actor!.id,
      },
    });
    await logTender(row.id, TenderEventKind.CREATED, null, row.status, `Tender logged — ${row.status}`, req.actor!.id,
      `deadline ${submissionDeadline} · pack to COO by ${pack}${packToCooBy ? '' : ' (default: two days before, 5 pm)'}`);
    return reply.code(201).send({ tender: await tenderDto(row.id) });
  });

  app.patch<{ Params: { id: string } }>('/tenders/:id', { preHandler: requireFullPipeline }, async (req, reply) => {
    const parsed = UpdateTenderSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'tender not found' });

    const { dateFound, submissionDeadline, packToCooBy, dateSentToCoo, ...rest } = parsed.data;
    const nextDeadline = submissionDeadline ?? day(existing.submissionDeadline)!;
    const nextPack = packToCooBy ?? day(existing.packToCooBy)!;
    if (nextPack > nextDeadline) return reply.code(400).send({ error: 'the pack must reach the COO before the submission deadline' });

    const changes = Object.entries(rest)
      .filter(([k, v]) => v !== undefined && (existing as Record<string, unknown>)[k] !== v)
      .map(([k, v]) => `${k}: ${shown((existing as Record<string, unknown>)[k])} → ${shown(v)}`);
    const dates: [string, string | null | undefined, Date | null][] = [
      ['date found', dateFound, existing.dateFound],
      ['deadline', submissionDeadline, existing.submissionDeadline],
      ['pack to COO', packToCooBy, existing.packToCooBy],
      ['sent to COO', dateSentToCoo, existing.dateSentToCoo],
    ];
    for (const [label, next, prev] of dates) {
      if (next !== undefined && (next ?? null) !== day(prev)) changes.push(`${label}: ${shown(day(prev))} → ${shown(next)}`);
    }

    await prisma.tender.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(dateFound ? { dateFound: new Date(dateFound) } : {}),
        ...(submissionDeadline ? { submissionDeadline: new Date(submissionDeadline) } : {}),
        ...(packToCooBy ? { packToCooBy: new Date(packToCooBy) } : {}),
        ...(dateSentToCoo !== undefined ? { dateSentToCoo: dateSentToCoo ? new Date(dateSentToCoo) : null } : {}),
      },
    });
    if (rest.status !== undefined && rest.status !== existing.status) {
      await logTender(existing.id, TenderEventKind.STATUS_CHANGED, existing.status, rest.status, `${existing.status} → ${rest.status}`, req.actor!.id, null);
    }
    const other = changes.filter((c) => !c.startsWith('status:'));
    if (other.length) await logTender(existing.id, TenderEventKind.DETAILS_CHANGED, null, null, 'Details changed', req.actor!.id, other.join('; '));
    return reply.send({ tender: await tenderDto(existing.id) });
  });

  app.delete<{ Params: { id: string } }>('/tenders/:id', { preHandler: requireFullPipeline }, async (req, reply) => {
    const existing = await prisma.tender.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: 'tender not found' });
    await prisma.tender.delete({ where: { id: existing.id } });
    return reply.send({ ok: true });
  });

  // Status is free text; the log keeps every change and the funnel reads
  // "submitted" / "awarded" from the wording.
  app.post<{ Params: { id: string } }>('/tenders/:id/status', { preHandler: requireFullPipeline }, async (req, reply) => {
    const parsed = TenderStatusSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'tender not found' });
    const { status, note } = parsed.data;
    if (status === existing.status) return reply.code(409).send({ error: `the tender is already “${status}”` });

    // Sending the pack stamps dateSentToCoo (explicit date wins; otherwise today).
    const sentToCoo = parsed.data.dateSentToCoo !== undefined
      ? parsed.data.dateSentToCoo
      : /sent to coo/i.test(status) && !existing.dateSentToCoo ? todayNairobi() : undefined;

    await prisma.tender.update({
      where: { id: existing.id },
      data: { status, ...(sentToCoo !== undefined ? { dateSentToCoo: sentToCoo ? new Date(sentToCoo) : null } : {}) },
    });
    await logTender(existing.id, TenderEventKind.STATUS_CHANGED, existing.status, status, `${existing.status} → ${status}`, req.actor!.id,
      [sentToCoo ? `sent to COO ${sentToCoo}` : null, note].filter(Boolean).join(' · ') || null);
    return reply.send({ tender: await tenderDto(existing.id) });
  });

  app.post<{ Params: { id: string } }>('/tenders/:id/notes', { preHandler: requireFullPipeline }, async (req, reply) => {
    const parsed = NoteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await prisma.tender.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: 'tender not found' });
    await logTender(existing.id, TenderEventKind.NOTE_ADDED, null, null, 'Note', req.actor!.id, parsed.data.note);
    return reply.send({ tender: await tenderDto(existing.id) });
  });

  app.get<{ Params: { id: string } }>('/tenders/:id/events', { preHandler: requireFullPipeline }, async (req, reply) => {
    const rows = await prisma.tenderEvent.findMany({ where: { tenderId: req.params.id }, orderBy: { createdAt: 'desc' } });
    const events: TenderEventDto[] = rows.map((e) => ({
      id: e.id, kind: e.kind, fromStatus: e.fromStatus, toStatus: e.toStatus, summary: e.summary, detail: e.detail, actorName: e.actorName, createdAt: e.createdAt.toISOString(),
    }));
    return reply.send({ events });
  });

  // ── Targets, actuals, calculator ──────────────────────────────────────────

  app.get('/targets', { preHandler: requireTargetsView }, async (_req, reply) => reply.send(await loadFunnelTargets()));

  app.put('/targets', { preHandler: requireTargetsEdit }, async (req, reply) => {
    const parsed = FunnelTargetsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return reply.send(await saveFunnelTargets(parsed.data, req.actor!.id));
  });

  app.get('/actuals', { preHandler: requireTargetsView }, async (req, reply) => {
    const parsed = MonthStr.safeParse((req.query as { month?: string }).month);
    if (!parsed.success) return reply.code(400).send({ error: 'month must be YYYY-MM' });
    const { from, to } = monthRange(parsed.data);
    const [{ targets }, leadEvents, tenderEvents] = await Promise.all([
      loadFunnelTargets(),
      prisma.leadEvent.findMany({
        where: { createdAt: { gte: from, lt: to }, toStage: { not: null }, kind: { in: [LeadEventKind.CREATED, LeadEventKind.STAGE_CHANGED] } },
        select: { toStage: true, lead: { select: { channel: true, segment: true, contractType: true } } },
      }),
      prisma.tenderEvent.findMany({
        where: { createdAt: { gte: from, lt: to }, toStatus: { not: null }, kind: { in: [TenderEventKind.CREATED, TenderEventKind.STATUS_CHANGED] } },
        select: { toStatus: true, tender: { select: { type: true } } },
      }),
    ]);
    const actuals = computeActuals(
      parsed.data,
      leadEvents.map((e) => ({
        stage: e.toStage!,
        channel: classifyChannel(e.lead.channel),
        household: isHouseholdSegment(e.lead.segment),
        recurring: isRecurringContract(e.lead.contractType),
      })),
      tenderEvents.map((e) => ({ status: e.toStatus!, type: e.tender.type })),
      targets,
    );
    return reply.send({ actuals });
  });

  app.post('/calculator', { preHandler: requireTargetsView }, async (req, reply) => {
    const parsed = CalculatorSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const mixTotal = Object.values(parsed.data.channelMix).reduce((a, b) => a + b, 0);
    if (Math.abs(mixTotal - 1) > 0.001) return reply.code(400).send({ error: `channel mix must add up to 100% (got ${Math.round(mixTotal * 100)}%)` });
    const { targets } = await loadFunnelTargets();
    return reply.send({ result: requiredActivity(parsed.data, targets) });
  });

  // People a lead can be brought in by.
  app.get('/people', { preHandler: requirePipeline }, async (_req, reply) => {
    const rows = await prisma.user.findMany({
      where: { deletedAt: null, OR: [{ isOwner: true }, { role: { in: [UserRole.BUSINESS_DEVELOPMENT_LEAD, UserRole.COO, UserRole.ADMIN, UserRole.MARKETING, UserRole.SUPPORT, UserRole.CLEANING_SUPERVISOR] } }] },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });
    return reply.send({ people: rows });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Load a lead the actor may touch (Marketing: household only). */
  async function guardLead(req: { actor?: { role: UserRole; isOwner: boolean } }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }, id: string) {
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) { reply.code(404).send({ error: 'lead not found' }); return null; }
    if (householdOnly(req.actor!) && !isHouseholdSegment(existing.segment)) { reply.code(403).send({ error: 'marketing can work household leads only' }); return null; }
    return existing;
  }

  async function leadDto(id: string) {
    return toLeadDto(await prisma.lead.findUniqueOrThrow({ where: { id }, include: leadInclude }));
  }
  async function tenderDto(id: string) {
    return toTenderDto(await prisma.tender.findUniqueOrThrow({ where: { id }, include: tenderInclude }));
  }

  async function commissionSummary(): Promise<CommissionSummary> {
    const [due, paid] = await Promise.all([
      prisma.lead.aggregate({ where: { stage: LeadStage.WON, commissionPaidAt: null, commissionCents: { gt: 0 } }, _sum: { commissionCents: true }, _count: true }),
      prisma.lead.aggregate({ where: { stage: LeadStage.WON, commissionPaidAt: { not: null } }, _sum: { commissionCents: true } }),
    ]);
    return { dueCents: due._sum.commissionCents ?? 0, dueCount: due._count, paidCents: paid._sum.commissionCents ?? 0 };
  }

  async function logLead(leadId: string, kind: LeadEventKind, fromStage: LeadStage | null, toStage: LeadStage | null, summary: string, actorId: string, detail?: string | null) {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { fullName: true } });
    await prisma.leadEvent.create({ data: { leadId, kind, fromStage, toStage, summary, detail: detail ?? null, actorId, actorName: actor?.fullName ?? null } });
  }
  async function logTender(tenderId: string, kind: TenderEventKind, fromStatus: string | null, toStatus: string | null, summary: string, actorId: string, detail?: string | null) {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { fullName: true } });
    await prisma.tenderEvent.create({ data: { tenderId, kind, fromStatus, toStatus, summary, detail: detail ?? null, actorId, actorName: actor?.fullName ?? null } });
  }
};

function money(cents: number) {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

