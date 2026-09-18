/**
 * /admin/laundry   — laundry unit economics and the break-even stat
 * /admin/readiness — compliant-pay readiness gates and the reserve ledger
 *
 * Reads follow finance access. Writes are the owner's and the COO's, checked
 * against the database rather than the token.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ReserveEntryKind } from '@prisma/client';
import type {
  CreateReserveEntryInput,
  LaundryBreakEvenDto,
  ReadinessDto,
  ReadinessGateDto,
  ReserveEntryDto,
  ReserveLedgerDto,
  UpdateLaundrySettingsInput,
  UpdateReadinessInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import {
  breakEvenKgPerDay,
  breakEvenKgPerMonth,
  compliantFixedCostsPerMonthCents,
  compliantStaffCount,
  contributionPerKgCents,
  reserveBalanceCents,
  reserveGates,
  RESERVE_MONTHS_GATE_2,
  SALARY_MONTHS_GATE_3,
} from '../readiness/calc.js';
import {
  ensureLaundryLine,
  laundryGoDecision,
  loadLaundrySettings,
  loadReadiness,
  toLaundrySettingsDto,
} from '../readiness/laundry.js';

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

const UpdateLaundrySettingsSchema = z.object({
  pricePerKgCents: z.number().int().positive().max(10_000_000).optional(),
  consumablesPct: z.number().min(0).max(0.99).optional(),
  workingDaysPerMonth: z.number().int().min(1).max(31).optional(),
  fixedCostsNowCents: z.number().int().nonnegative().optional(),
  fixedCostsCompliantCents: z.number().int().nonnegative().optional(),
}) satisfies z.ZodType<UpdateLaundrySettingsInput>;

const UpdateReadinessSchema = z.object({
  payPhase: z.enum(['NOW', 'COMPLIANT']).optional(),
  gate1MarginMet: z.boolean().optional(),
  gate1FirstMetMonth: DateStr.nullable().optional(),
  laundryOperational: z.boolean().optional(),
}) satisfies z.ZodType<UpdateReadinessInput>;

const CreateReserveEntrySchema = z.object({
  kind: z.enum(['DEPOSIT', 'WITHDRAWAL']),
  amountCents: z.number().int().positive(),
  date: DateStr,
  note: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(200).optional(),
}) satisfies z.ZodType<CreateReserveEntryInput>;

// ── Access ──────────────────────────────────────────────────────────────────

async function actorFor(req: FastifyRequest) {
  if (!req.auth) return null;
  return prisma.user.findUnique({ where: { id: req.auth.sub }, select: { id: true, isOwner: true, role: true } });
}

type Actor = NonNullable<Awaited<ReturnType<typeof actorFor>>>;

const canRead = (u: Actor) => u.isOwner || ['ADMIN', 'FINANCIAL_MANAGER', 'SHAREHOLDER', 'COO'].includes(u.role);
const canEditReadiness = (u: Actor) => u.isOwner || u.role === 'COO';
const canEditLaundry = (u: Actor) => u.isOwner;

async function requireReader(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const u = await actorFor(req);
  if (!u) return reply.code(401).send({ error: 'unauthorized' });
  if (!canRead(u)) return reply.code(403).send({ error: 'finance access required' });
}

// ── Laundry ─────────────────────────────────────────────────────────────────

export const laundryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireReader);

  app.get('/', async (req, reply) => {
    const u = (await actorFor(req))!;
    return reply.send({ laundry: await breakEvenPayload(canEditLaundry(u)) });
  });

  // Owner-only: the unit economics behind the break-even stat.
  app.patch('/settings', async (req, reply) => {
    const u = (await actorFor(req))!;
    if (!canEditLaundry(u)) return reply.code(403).send({ error: 'owner access required' });
    const parsed = UpdateLaundrySettingsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await loadLaundrySettings();
    const row = await prisma.laundrySettings.update({
      where: { id: 'default' },
      data: { ...parsed.data, updatedById: u.id },
    });
    // Keep the catalog's "from" price in step so job forms read one figure.
    if ((await laundryGoDecision()) === 'GO') await ensureLaundryLine(row.pricePerKgCents);
    return reply.send({ laundry: await breakEvenPayload(true) });
  });
};

async function breakEvenPayload(canEditSettings: boolean): Promise<LaundryBreakEvenDto> {
  const [settingsRow, readiness, goDecision] = await Promise.all([loadLaundrySettings(), loadReadiness(), laundryGoDecision()]);
  const settings = toLaundrySettingsDto(settingsRow);
  const base = {
    pricePerKgCents: settings.pricePerKgCents,
    consumablesPct: settings.consumablesPct,
    workingDaysPerMonth: settings.workingDaysPerMonth,
  };
  const fixedCostsCents = readiness.payPhase === 'COMPLIANT' ? settings.fixedCostsCompliantCents : settings.fixedCostsNowCents;
  return {
    goDecision,
    payPhase: readiness.payPhase,
    settings,
    fixedCostsCents,
    contributionPerKgCents: contributionPerKgCents(settings.pricePerKgCents, settings.consumablesPct),
    breakEvenKgPerDay: breakEvenKgPerDay({ ...base, fixedCostsCents }),
    breakEvenKgPerMonth: breakEvenKgPerMonth({ ...base, fixedCostsCents }),
    breakEvenKgPerDayNow: breakEvenKgPerDay({ ...base, fixedCostsCents: settings.fixedCostsNowCents }),
    breakEvenKgPerDayCompliant: breakEvenKgPerDay({ ...base, fixedCostsCents: settings.fixedCostsCompliantCents }),
    canEditSettings,
  };
}

// ── Readiness gates and the reserve ledger ──────────────────────────────────

export const readinessRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireReader);

  app.get('/', async (req, reply) => {
    const u = (await actorFor(req))!;
    return reply.send({ readiness: await readinessPayload(canEditReadiness(u)) });
  });

  app.patch('/', async (req, reply) => {
    const u = (await actorFor(req))!;
    if (!canEditReadiness(u)) return reply.code(403).send({ error: 'owner or COO access required' });
    const parsed = UpdateReadinessSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const d = parsed.data;
    await loadReadiness();
    await prisma.compliantPayReadiness.update({
      where: { id: 'default' },
      data: {
        ...(d.payPhase !== undefined && { payPhase: d.payPhase }),
        ...(d.gate1MarginMet !== undefined && { gate1MarginMet: d.gate1MarginMet }),
        ...(d.gate1FirstMetMonth !== undefined && {
          gate1FirstMetMonth: d.gate1FirstMetMonth ? firstOfMonth(d.gate1FirstMetMonth) : null,
        }),
        ...(d.laundryOperational !== undefined && { laundryOperational: d.laundryOperational }),
        updatedById: u.id,
      },
    });
    return reply.send({ readiness: await readinessPayload(true) });
  });

  app.get('/reserve', async (req, reply) => {
    const u = (await actorFor(req))!;
    return reply.send({ ledger: await ledgerPayload(canEditReadiness(u)) });
  });

  app.post('/reserve', async (req, reply) => {
    const u = (await actorFor(req))!;
    if (!canEditReadiness(u)) return reply.code(403).send({ error: 'owner or COO access required' });
    const parsed = CreateReserveEntrySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await prisma.reserveEntry.create({
      data: {
        kind: parsed.data.kind as ReserveEntryKind,
        amountCents: parsed.data.amountCents,
        date: new Date(parsed.data.date),
        note: parsed.data.note,
        reference: parsed.data.reference,
        createdById: u.id,
      },
    });
    return reply.code(201).send({ ledger: await ledgerPayload(true) });
  });

  app.delete<{ Params: { id: string } }>('/reserve/:id', async (req, reply) => {
    const u = (await actorFor(req))!;
    if (!canEditReadiness(u)) return reply.code(403).send({ error: 'owner or COO access required' });
    const existing = await prisma.reserveEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'entry not found' });
    await prisma.reserveEntry.delete({ where: { id: req.params.id } });
    return reply.send({ ledger: await ledgerPayload(true) });
  });
};

function firstOfMonth(ymd: string): Date {
  return new Date(`${ymd.slice(0, 7)}-01T00:00:00Z`);
}

async function balance(): Promise<number> {
  const rows = await prisma.reserveEntry.findMany({ select: { kind: true, amountCents: true } });
  return reserveBalanceCents(rows);
}

function kes(cents: number): string {
  return `KSh ${Math.round(cents / 100).toLocaleString('en-KE')}`;
}

async function readinessPayload(canEdit: boolean): Promise<ReadinessDto> {
  const [row, reserve] = await Promise.all([loadReadiness(), balance()]);
  const staffCount = compliantStaffCount(row.laundryOperational);
  const monthly = compliantFixedCostsPerMonthCents(staffCount);
  const g = reserveGates(reserve, monthly);
  const firstMet = row.gate1FirstMetMonth ? row.gate1FirstMetMonth.toISOString().slice(0, 10) : null;

  const gates: ReadinessGateDto[] = [
    {
      key: 'MARGIN',
      label: 'Operating margin ≥ 10% for 3 consecutive months (compliant-pay basis)',
      met: row.gate1MarginMet,
      detail: row.gate1MarginMet
        ? `COO confirmed${firstMet ? ` · first met ${monthLabel(firstMet)}` : ''}`
        : 'COO monthly call, from the margin figures on Finance',
      requiredCents: null,
      actualCents: null,
    },
    {
      key: 'RESERVE_3_MONTHS',
      label: `Reserve account ≥ ${RESERVE_MONTHS_GATE_2} months of compliant fixed costs`,
      met: g.gate2Met,
      detail: `${kes(reserve)} of ${kes(g.gate2RequiredCents)} (${staffCount} staff × ${kes(monthly / staffCount)} × ${RESERVE_MONTHS_GATE_2})`,
      requiredCents: g.gate2RequiredCents,
      actualCents: reserve,
    },
    {
      key: 'SALARIES_12_MONTHS',
      label: `${SALARY_MONTHS_GATE_3} months of compliant-phase salaries covered`,
      met: g.gate3Met,
      detail: `${kes(reserve)} of ${kes(g.gate3RequiredCents)} — reserve balance only, cash on hand is not counted`,
      requiredCents: g.gate3RequiredCents,
      actualCents: reserve,
    },
  ];

  return {
    payPhase: row.payPhase,
    gate1MarginMet: row.gate1MarginMet,
    gate1FirstMetMonth: firstMet,
    laundryOperational: row.laundryOperational,
    staffCount,
    compliantFixedCostsPerMonthCents: monthly,
    reserveBalanceCents: reserve,
    gates,
    allMet: gates.every((x) => x.met),
    canEdit,
    updatedByName: row.updatedBy?.fullName ?? null,
    updatedAt: row.updatedById ? row.updatedAt.toISOString() : null,
  };
}

function monthLabel(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
}

async function ledgerPayload(canEdit: boolean): Promise<ReserveLedgerDto> {
  const rows = await prisma.reserveEntry.findMany({
    include: { createdBy: { select: { fullName: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  const entries: ReserveEntryDto[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    amountCents: r.amountCents,
    date: r.date.toISOString().slice(0, 10),
    note: r.note,
    reference: r.reference,
    createdByName: r.createdBy.fullName,
    createdAt: r.createdAt.toISOString(),
  }));
  return { entries, balanceCents: reserveBalanceCents(rows), canEdit };
}
