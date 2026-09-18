/**
 * Compliance checklist: the 56 seeded items, status changes with their log,
 * and the company readiness flags that decide which conditional must-haves
 * currently apply.
 *
 *   Read     owner, COO, BD lead, Comms (Marketing), financial manager
 *   Status   owner and COO always; otherwise the user's role must match the
 *            item's free-text owner by keyword ("BD Lead", "Comms", …)
 *   Flags    owner and COO
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ComplianceEventKind, ComplianceStatus, LaundryGoDecision, Prisma, UserRole } from '@prisma/client';
import type {
  ChangeComplianceStatusInput,
  CompanyReadinessFlags,
  CompanyReadinessFlagsDto,
  ComplianceChecklistDto,
  ComplianceEventDto,
  ComplianceItemDto,
  UpdateComplianceItemInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { canEditItem, isBlocker, isOverdue, priorityApplies, summarise } from '../compliance/rules.js';
import { seedComplianceItems } from '../compliance/seed.js';

// ── Access ──────────────────────────────────────────────────────────────────

interface Actor { id: string; fullName: string; role: UserRole; isOwner: boolean }

declare module 'fastify' {
  interface FastifyRequest {
    complianceActor?: Actor;
  }
}

const READ_ROLES = new Set<UserRole>([UserRole.COO, UserRole.BUSINESS_DEVELOPMENT_LEAD, UserRole.MARKETING, UserRole.FINANCIAL_MANAGER]);

function canRead(u: Actor) {
  return u.isOwner || READ_ROLES.has(u.role);
}
function canEditFlags(u: Actor) {
  return u.isOwner || u.role === UserRole.COO;
}

async function requireReader(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const u = await prisma.user.findUnique({ where: { id: req.auth.sub }, select: { id: true, fullName: true, role: true, isOwner: true } });
  if (!u) return reply.code(401).send({ error: 'unauthorized' });
  if (!canRead(u)) return reply.code(403).send({ error: 'the compliance checklist is visible to the owner, COO, BD lead, Comms and finance' });
  req.complianceActor = u;
}

// ── Validation ──────────────────────────────────────────────────────────────

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'NOT_APPLICABLE'] as const;

const StatusSchema = z.object({
  status: z.enum(STATUSES),
  note: z.string().trim().max(1000).optional(),
  dateDone: DateStr.nullish(),
}) satisfies z.ZodType<ChangeComplianceStatusInput>;

const UpdateSchema = z.object({
  owner: z.string().trim().min(1).max(120).optional(),
  targetDate: DateStr.optional(),
  costCents: z.number().int().nonnegative().optional(),
  costType: z.string().trim().min(1).max(60).optional(),
  sourceOrNote: z.string().trim().max(4000).nullish(),
}) satisfies z.ZodType<UpdateComplianceItemInput>;

const FlagsSchema = z.object({
  agpoEligible: z.boolean(),
  laundryGoDecision: z.enum(['PENDING', 'GO', 'NO_GO']),
  hiringStarted: z.boolean(),
}) satisfies z.ZodType<CompanyReadinessFlags>;

// ── DTOs ────────────────────────────────────────────────────────────────────

const itemInclude = { _count: { select: { events: true } } } satisfies Prisma.ComplianceItemInclude;
type ItemRow = Prisma.ComplianceItemGetPayload<{ include: typeof itemInclude }>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const todayNairobi = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

const STATUS_LABEL: Record<ComplianceStatus, string> = {
  NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', DONE: 'Done', BLOCKED: 'Blocked', NOT_APPLICABLE: 'Not applicable',
};

function toItemDto(r: ItemRow, flags: CompanyReadinessFlags, actor: Actor, today: string): ComplianceItemDto {
  const targetDate = day(r.targetDate)!;
  return {
    id: r.id,
    itemNo: r.itemNo,
    category: r.category,
    itemAction: r.itemAction,
    priority: r.priority,
    whyItMatters: r.whyItMatters,
    owner: r.owner,
    targetDate,
    costCents: r.costCents,
    costType: r.costType,
    status: r.status,
    dateDone: day(r.dateDone),
    sourceOrNote: r.sourceOrNote,
    statusNote: r.statusNote,
    applies: priorityApplies(r.priority, flags),
    isBlocker: isBlocker(r.priority, r.status, flags),
    overdue: priorityApplies(r.priority, flags) && isOverdue(targetDate, r.status, today),
    editable: canEditItem(actor, r.owner),
    eventCount: r._count.events,
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function loadFlags(): Promise<CompanyReadinessFlagsDto> {
  const row = await prisma.companyReadinessFlags.findUnique({ where: { id: 'default' }, include: { updatedBy: { select: { fullName: true } } } });
  if (!row) return { agpoEligible: false, laundryGoDecision: 'PENDING', hiringStarted: false, updatedAt: null, updatedByName: null };
  return {
    agpoEligible: row.agpoEligible,
    laundryGoDecision: row.laundryGoDecision,
    hiringStarted: row.hiringStarted,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy?.fullName ?? null,
  };
}

function shown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

// ── Routes ──────────────────────────────────────────────────────────────────

export const complianceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireReader);

  // The whole checklist, with the flags and the summary the page header needs.
  app.get('/', async (req, reply) => reply.send(await checklist(req.complianceActor!)));

  app.get<{ Params: { id: string } }>('/items/:id/events', async (req, reply) => {
    const rows = await prisma.complianceEvent.findMany({ where: { itemId: req.params.id }, orderBy: { createdAt: 'desc' } });
    const events: ComplianceEventDto[] = rows.map((e) => ({
      id: e.id, kind: e.kind, fromStatus: e.fromStatus, toStatus: e.toStatus, summary: e.summary, detail: e.detail, actorName: e.actorName, createdAt: e.createdAt.toISOString(),
    }));
    return reply.send({ events });
  });

  // Status changes are the audit trail. DONE stamps the date; BLOCKED needs a note.
  app.patch<{ Params: { id: string } }>('/items/:id/status', async (req, reply) => {
    const parsed = StatusSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const actor = req.complianceActor!;
    const existing = await prisma.complianceItem.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'item not found' });
    if (!canEditItem(actor, existing.owner)) {
      return reply.code(403).send({ error: `item ${existing.itemNo} is owned by “${existing.owner}” — only they, the COO or the owner can change it` });
    }
    const { status, note } = parsed.data;
    if (status === ComplianceStatus.BLOCKED && !note?.trim()) {
      return reply.code(400).send({ error: 'say what is blocking it — a note is required for BLOCKED' });
    }
    if (status === existing.status && !(status === ComplianceStatus.BLOCKED && note)) {
      return reply.code(409).send({ error: `item ${existing.itemNo} is already ${STATUS_LABEL[status].toLowerCase()}` });
    }

    const dateDone =
      status === ComplianceStatus.DONE ? new Date(parsed.data.dateDone ?? todayNairobi()) : null;
    await prisma.complianceItem.update({
      where: { id: existing.id },
      data: { status, dateDone, statusNote: status === ComplianceStatus.BLOCKED ? note!.trim() : null },
    });
    await log(existing.id, ComplianceEventKind.STATUS_CHANGED, existing.status, status,
      `${STATUS_LABEL[existing.status]} → ${STATUS_LABEL[status]}`, actor,
      [status === ComplianceStatus.DONE ? `done ${day(dateDone)}` : null, note?.trim() || null].filter(Boolean).join(' · ') || null);
    return reply.send(await checklist(actor));
  });

  app.patch<{ Params: { id: string } }>('/items/:id', async (req, reply) => {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const actor = req.complianceActor!;
    const existing = await prisma.complianceItem.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'item not found' });
    if (!canEditItem(actor, existing.owner)) {
      return reply.code(403).send({ error: `item ${existing.itemNo} is owned by “${existing.owner}” — only they, the COO or the owner can change it` });
    }
    const { targetDate, ...rest } = parsed.data;
    const changes = Object.entries(rest)
      .filter(([k, v]) => v !== undefined && (existing as Record<string, unknown>)[k] !== v)
      .map(([k, v]) => `${k}: ${shown((existing as Record<string, unknown>)[k])} → ${shown(v)}`);
    if (targetDate && targetDate !== day(existing.targetDate)) changes.push(`target: ${day(existing.targetDate)} → ${targetDate}`);
    await prisma.complianceItem.update({
      where: { id: existing.id },
      data: { ...rest, ...(targetDate ? { targetDate: new Date(targetDate) } : {}) },
    });
    if (changes.length) await log(existing.id, ComplianceEventKind.DETAILS_CHANGED, null, null, 'Details changed', actor, changes.join('; '));
    return reply.send(await checklist(actor));
  });

  app.post<{ Params: { id: string } }>('/items/:id/notes', async (req, reply) => {
    const parsed = z.object({ note: z.string().trim().min(1).max(2000) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await prisma.complianceItem.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: 'item not found' });
    await log(existing.id, ComplianceEventKind.NOTE_ADDED, null, null, 'Note', req.complianceActor!, parsed.data.note);
    return reply.send(await checklist(req.complianceActor!));
  });

  // Readiness flags — owner and COO. The UI confirms before saving.
  app.put('/flags', async (req, reply) => {
    const actor = req.complianceActor!;
    if (!canEditFlags(actor)) return reply.code(403).send({ error: 'only the owner or the COO can change the readiness flags' });
    const parsed = FlagsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    await prisma.companyReadinessFlags.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...parsed.data, laundryGoDecision: parsed.data.laundryGoDecision as LaundryGoDecision, updatedById: actor.id },
      update: { ...parsed.data, laundryGoDecision: parsed.data.laundryGoDecision as LaundryGoDecision, updatedById: actor.id },
    });
    return reply.send(await checklist(actor));
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function checklist(actor: Actor): Promise<ComplianceChecklistDto> {
    // First read seeds the 56 items; later reads fill in any that are missing.
    await seedComplianceItems();
    const [rows, flags] = await Promise.all([
      prisma.complianceItem.findMany({ include: itemInclude, orderBy: { itemNo: 'asc' } }),
      loadFlags(),
    ]);
    const today = todayNairobi();
    const items = rows.map((r) => toItemDto(r, flags, actor, today));
    const summary = summarise(
      rows.map((r) => ({ itemNo: r.itemNo, priority: r.priority, status: r.status, targetDate: day(r.targetDate)!, costCents: r.costCents })),
      flags,
      today,
    );
    return { items, flags, summary, canEditFlags: canEditFlags(actor) };
  }

  async function log(itemId: string, kind: ComplianceEventKind, fromStatus: ComplianceStatus | null, toStatus: ComplianceStatus | null, summary: string, actor: Actor, detail?: string | null) {
    await prisma.complianceEvent.create({
      data: { itemId, kind, fromStatus, toStatus, summary, detail: detail ?? null, actorId: actor.id, actorName: actor.fullName },
    });
  }
};
