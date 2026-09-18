/**
 * Probation tracker: the trainees' workplans with their status log, the
 * reporting calendar, and the KPI scorecard with its computed outcome.
 *
 *   COO      full edit — task status, calendar ticks, KPI actuals and
 *            targets (extension months), the critical-breach flag
 *   CEO      views everything; edits only the final probation decision
 *   Trainee  views their own workplan and the calendar; self-marks their
 *            own task status; never sees actuals or the outcome
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Prisma, ProbationDecision, ProbationRole, UserRole, WorkplanEventKind, WorkplanStatus } from '@prisma/client';
import type {
  ChangeWorkplanStatusInput,
  KpiRowDto,
  MarkReportingEventInput,
  ProbationAccess,
  ProbationDto,
  ProbationScorecardDto,
  ReportingEventDto,
  SetCriticalBreachInput,
  SetFinalDecisionInput,
  SetKpiActualInput,
  SetKpiTargetInput,
  WorkplanEventDto,
  WorkplanTaskDto,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { kpiScore, probationOutcome, weightedScore } from '../probation/score.js';
import { seedProbation } from '../probation/seed.js';
import { PROBATION_SEED } from '../probation/seed-data.js';

// ── Access ──────────────────────────────────────────────────────────────────

interface Actor { id: string; fullName: string; role: UserRole; isOwner: boolean }

declare module 'fastify' {
  interface FastifyRequest {
    probationActor?: Actor;
  }
}

function accessFor(u: Actor): ProbationAccess {
  const coo = u.role === UserRole.COO;
  const ceo = u.isOwner;
  const trainee: ProbationRole | null =
    u.role === UserRole.MARKETING ? ProbationRole.COMMS : u.role === UserRole.BUSINESS_DEVELOPMENT_LEAD ? ProbationRole.BD : null;
  return {
    roles: coo || ceo ? ['COMMS', 'BD'] : trainee ? [trainee] : [],
    canEditCalendar: coo,
    canSeeScorecard: coo || ceo,
    canEditActuals: coo,
    canSetBreach: coo,
    canDecide: ceo,
  };
}

function canEditTask(u: Actor, role: ProbationRole): boolean {
  if (u.role === UserRole.COO) return true;
  return (u.role === UserRole.MARKETING && role === ProbationRole.COMMS) || (u.role === UserRole.BUSINESS_DEVELOPMENT_LEAD && role === ProbationRole.BD);
}

async function requireViewer(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const u = await prisma.user.findUnique({ where: { id: req.auth.sub }, select: { id: true, fullName: true, role: true, isOwner: true } });
  if (!u) return reply.code(401).send({ error: 'unauthorized' });
  if (accessFor(u).roles.length === 0) return reply.code(403).send({ error: 'the probation tracker is visible to the COO, the CEO and the two trainees' });
  req.probationActor = u;
}

// ── Validation ──────────────────────────────────────────────────────────────

const MonthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM');
const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'HELD'] as const;
const ROLES = ['COMMS', 'BD'] as const;
const DECISIONS = ['CONFIRM', 'EXTEND_ONE_MONTH', 'NOT_CONFIRMED'] as const;

const StatusSchema = z.object({ status: z.enum(STATUSES), note: z.string().trim().max(1000).optional() }) satisfies z.ZodType<ChangeWorkplanStatusInput>;
const MarkSchema = z.object({ submitted: z.boolean().optional(), reviewed: z.boolean().optional() }) satisfies z.ZodType<MarkReportingEventInput>;
const ActualSchema = z.object({ month: MonthStr, actual: z.number().min(0).nullable() }) satisfies z.ZodType<SetKpiActualInput>;
const TargetSchema = z.object({ month: MonthStr, target: z.number().min(0) }) satisfies z.ZodType<SetKpiTargetInput>;
const AddMonthSchema = z.object({ role: z.enum(ROLES), month: MonthStr });
const BreachSchema = z.object({ criticalBreach: z.boolean(), note: z.string().trim().max(1000).optional() }) satisfies z.ZodType<SetCriticalBreachInput>;
const DecisionSchema = z.object({ finalDecision: z.enum(DECISIONS).nullable(), note: z.string().trim().max(1000).optional() }) satisfies z.ZodType<SetFinalDecisionInput>;

// ── DTOs ────────────────────────────────────────────────────────────────────

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const todayNairobi = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

const STATUS_LABEL: Record<WorkplanStatus, string> = {
  NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', DONE: 'Done', BLOCKED: 'Blocked', HELD: 'Held',
};

const taskInclude = { _count: { select: { events: true } } } satisfies Prisma.WorkplanTaskInclude;
type TaskRow = Prisma.WorkplanTaskGetPayload<{ include: typeof taskInclude }>;

function toTaskDto(t: TaskRow, actor: Actor, today: string): WorkplanTaskDto {
  const endDate = day(t.endDate);
  return {
    id: t.id,
    role: t.role,
    taskNo: t.taskNo,
    type: t.type,
    activity: t.activity,
    category: t.category,
    startDate: day(t.startDate),
    endDate,
    outputRequired: t.outputRequired,
    status: t.status,
    isDecisionGate: /^decision gate\b/i.test(t.activity),
    overdue: !!endDate && endDate < today && t.status !== 'DONE' && t.status !== 'HELD' && t.type !== 'STAGE',
    editable: t.type !== 'STAGE' && canEditTask(actor, t.role),
    eventCount: t._count.events,
    updatedAt: t.updatedAt.toISOString(),
  };
}

const eventInclude = { submittedBy: { select: { fullName: true } }, reviewedBy: { select: { fullName: true } } } satisfies Prisma.ReportingEventInclude;
type EventRow = Prisma.ReportingEventGetPayload<{ include: typeof eventInclude }>;

function toEventDto(e: EventRow, today: string): ReportingEventDto {
  const date = day(e.date)!;
  return {
    id: e.id,
    date,
    day: e.day,
    event: e.event,
    who: e.who,
    due: e.due,
    reviewer: e.reviewer,
    submitted: e.submitted,
    submittedAt: iso(e.submittedAt),
    submittedByName: e.submittedBy?.fullName ?? null,
    reviewed: e.reviewed,
    reviewedAt: iso(e.reviewedAt),
    reviewedByName: e.reviewedBy?.fullName ?? null,
    overdue: date < today && !e.submitted,
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

export const probationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireViewer);

  app.get('/', async (req, reply) => reply.send(await payload(req.probationActor!)));

  // ── Workplan ──────────────────────────────────────────────────────────────

  app.patch<{ Params: { id: string } }>('/tasks/:id/status', async (req, reply) => {
    const parsed = StatusSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const actor = req.probationActor!;
    const task = await prisma.workplanTask.findUnique({ where: { id: req.params.id } });
    if (!task) return reply.code(404).send({ error: 'task not found' });
    if (task.type === 'STAGE') return reply.code(409).send({ error: 'stage headers have no status of their own — mark the tasks under them' });
    if (!canEditTask(actor, task.role)) return reply.code(403).send({ error: 'only the COO or the trainee whose plan this is can change a task status' });
    const { status, note } = parsed.data;
    if (status === task.status) return reply.code(409).send({ error: `${task.taskNo} is already ${STATUS_LABEL[status].toLowerCase()}` });

    await prisma.workplanTask.update({ where: { id: task.id }, data: { status } });
    await prisma.workplanEvent.create({
      data: {
        taskId: task.id, kind: WorkplanEventKind.STATUS_CHANGED, fromStatus: task.status, toStatus: status,
        summary: `${STATUS_LABEL[task.status]} → ${STATUS_LABEL[status]}`, detail: note?.trim() || null, actorId: actor.id, actorName: actor.fullName,
      },
    });
    return reply.send(await payload(actor));
  });

  app.get<{ Params: { id: string } }>('/tasks/:id/events', async (req, reply) => {
    const task = await prisma.workplanTask.findUnique({ where: { id: req.params.id }, select: { role: true } });
    if (!task) return reply.code(404).send({ error: 'task not found' });
    if (!accessFor(req.probationActor!).roles.includes(task.role)) return reply.code(403).send({ error: 'not your workplan' });
    const rows = await prisma.workplanEvent.findMany({ where: { taskId: req.params.id }, orderBy: { createdAt: 'desc' } });
    const events: WorkplanEventDto[] = rows.map((e) => ({
      id: e.id, kind: e.kind, fromStatus: e.fromStatus, toStatus: e.toStatus, summary: e.summary, detail: e.detail, actorName: e.actorName, createdAt: e.createdAt.toISOString(),
    }));
    return reply.send({ events });
  });

  // ── Reporting calendar ────────────────────────────────────────────────────

  app.patch<{ Params: { id: string } }>('/calendar/:id', async (req, reply) => {
    const parsed = MarkSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const actor = req.probationActor!;
    if (!accessFor(actor).canEditCalendar) return reply.code(403).send({ error: 'only the COO marks reports submitted and reviewed' });
    const existing = await prisma.reportingEvent.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'calendar event not found' });
    const { submitted, reviewed } = parsed.data;
    const now = new Date();
    await prisma.reportingEvent.update({
      where: { id: existing.id },
      data: {
        ...(submitted !== undefined ? { submitted, submittedAt: submitted ? now : null, submittedById: submitted ? actor.id : null } : {}),
        ...(reviewed !== undefined ? { reviewed, reviewedAt: reviewed ? now : null, reviewedById: reviewed ? actor.id : null } : {}),
      },
    });
    return reply.send(await payload(actor));
  });

  // ── KPI scorecard ─────────────────────────────────────────────────────────

  app.put<{ Params: { id: string } }>('/kpis/:id/actual', async (req, reply) => {
    const parsed = ActualSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const actor = req.probationActor!;
    if (!accessFor(actor).canEditActuals) return reply.code(403).send({ error: 'KPI actuals are entered by the COO at the monthly review' });
    const kpi = await prisma.kpiDefinition.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!kpi) return reply.code(404).send({ error: 'KPI not found' });
    const { month, actual } = parsed.data;
    if (actual === null) {
      await prisma.kpiMonthlyActual.deleteMany({ where: { kpiId: kpi.id, month } });
    } else {
      await prisma.kpiMonthlyActual.upsert({
        where: { kpiId_month: { kpiId: kpi.id, month } },
        create: { kpiId: kpi.id, month, actual, enteredById: actor.id },
        update: { actual, enteredById: actor.id },
      });
    }
    return reply.send(await payload(actor));
  });

  app.put<{ Params: { id: string } }>('/kpis/:id/target', async (req, reply) => {
    const parsed = TargetSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const actor = req.probationActor!;
    if (!accessFor(actor).canEditActuals) return reply.code(403).send({ error: 'KPI targets are set by the COO' });
    const kpi = await prisma.kpiDefinition.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!kpi) return reply.code(404).send({ error: 'KPI not found' });
    const { month, target } = parsed.data;
    await prisma.kpiMonthlyTarget.upsert({
      where: { kpiId_month: { kpiId: kpi.id, month } },
      create: { kpiId: kpi.id, month, target },
      update: { target },
    });
    return reply.send(await payload(actor));
  });

  // An extension: a new month column for every KPI of the role, targets to be filled in.
  app.post('/months', async (req, reply) => {
    const parsed = AddMonthSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const actor = req.probationActor!;
    if (!accessFor(actor).canEditActuals) return reply.code(403).send({ error: 'only the COO adds a month' });
    const { role, month } = parsed.data;
    const kpis = await prisma.kpiDefinition.findMany({ where: { role }, select: { id: true } });
    for (const k of kpis) {
      await prisma.kpiMonthlyTarget.upsert({ where: { kpiId_month: { kpiId: k.id, month } }, create: { kpiId: k.id, month, target: 0 }, update: {} });
    }
    return reply.send(await payload(actor));
  });

  app.put<{ Params: { role: string } }>('/outcome/:role/breach', async (req, reply) => {
    const parsed = BreachSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const actor = req.probationActor!;
    if (!accessFor(actor).canSetBreach) return reply.code(403).send({ error: 'the critical-breach flag is the COO\'s call' });
    if (!ROLES.includes(req.params.role as never)) return reply.code(404).send({ error: 'unknown role' });
    const role = req.params.role as ProbationRole;
    await prisma.probationOutcome.upsert({
      where: { role },
      create: { role, criticalBreach: parsed.data.criticalBreach, breachNote: parsed.data.note || null },
      update: { criticalBreach: parsed.data.criticalBreach, breachNote: parsed.data.note || null },
    });
    return reply.send(await payload(actor));
  });

  app.put<{ Params: { role: string } }>('/outcome/:role/decision', async (req, reply) => {
    const parsed = DecisionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const actor = req.probationActor!;
    if (!accessFor(actor).canDecide) return reply.code(403).send({ error: 'the final probation decision is the CEO\'s' });
    if (!ROLES.includes(req.params.role as never)) return reply.code(404).send({ error: 'unknown role' });
    const role = req.params.role as ProbationRole;
    const decision = parsed.data.finalDecision as ProbationDecision | null;
    await prisma.probationOutcome.upsert({
      where: { role },
      create: { role, finalDecision: decision, finalDecisionNote: parsed.data.note || null, decidedById: decision ? actor.id : null, decidedAt: decision ? new Date() : null },
      update: { finalDecision: decision, finalDecisionNote: parsed.data.note || null, decidedById: decision ? actor.id : null, decidedAt: decision ? new Date() : null },
    });
    return reply.send(await payload(actor));
  });

  // ── Payload ───────────────────────────────────────────────────────────────

  async function payload(actor: Actor): Promise<ProbationDto> {
    await seedProbation();
    const access = accessFor(actor);
    const today = todayNairobi();
    const roles = access.roles.map((r) => r as ProbationRole);

    const [tasks, calendar] = await Promise.all([
      prisma.workplanTask.findMany({ where: { role: { in: roles } }, include: taskInclude, orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] }),
      prisma.reportingEvent.findMany({ include: eventInclude, orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }] }),
    ]);

    let scorecards: ProbationScorecardDto[] | null = null;
    if (access.canSeeScorecard) {
      const [defs, outcomes] = await Promise.all([
        prisma.kpiDefinition.findMany({ include: { targets: true, actuals: true }, orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] }),
        prisma.probationOutcome.findMany({ include: { decidedBy: { select: { fullName: true } } } }),
      ]);
      scorecards = (['COMMS', 'BD'] as const).map((role) => {
        const rows = defs.filter((d) => d.role === role);
        const months = [...new Set(rows.flatMap((d) => d.targets.map((t) => t.month)))].sort();
        const kpis: KpiRowDto[] = rows.map((d) => {
          const targets = Object.fromEntries(d.targets.map((t) => [t.month, t.target]));
          const actuals = Object.fromEntries(d.actuals.map((a) => [a.month, a.actual]));
          return { id: d.id, role, kpiName: d.kpiName, weight: d.weight, targets, actuals, ...kpiScore({ weight: d.weight, targets, actuals }) };
        });
        const outcome = outcomes.find((o) => o.role === role);
        const score = weightedScore(kpis);
        return {
          role,
          months,
          kpis,
          totalWeight: kpis.reduce((a, k) => a + k.weight, 0),
          weightedScore: score,
          criticalBreach: outcome?.criticalBreach ?? false,
          outcome: probationOutcome(score, outcome?.criticalBreach ?? false),
          finalDecision: outcome?.finalDecision ?? null,
          finalDecisionNote: outcome?.finalDecisionNote ?? null,
          decidedAt: iso(outcome?.decidedAt ?? null),
          decidedByName: outcome?.decidedBy?.fullName ?? null,
        };
      });
    }

    return {
      probationStart: PROBATION_SEED.probationDates.start,
      probationEnd: PROBATION_SEED.probationDates.end,
      decisionLetterBy: PROBATION_SEED.probationDates.decisionLetterBy,
      access,
      tasks: tasks.map((t) => toTaskDto(t, actor, today)),
      calendar: calendar.map((e) => toEventDto(e, today)),
      scorecards,
    };
  }
};
