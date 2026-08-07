import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ClientSegment, PaymentFrequency, Prisma, ProjectEventKind, ProjectStage } from '@prisma/client';
import type {
  AddProjectCheckInput,
  AnswerProjectCheckInput,
  CreateProjectInput,
  ProjectCheckDto,
  ProjectDto,
  ProjectEventDto,
  UpdateProjectInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

const STAGES = ['ENQUIRY', 'SURVEY', 'SCHEDULED', 'IN_PROGRESS', 'SNAGGING', 'COMPLETE', 'CANCELLED'] as const;
const SEGMENTS = ['RESIDENTIAL', 'COMMERCIAL', 'MEDICAL', 'DEVELOPER'] as const;
const FREQUENCIES = ['ONE_OFF', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

/**
 * The standard checklist seeded onto a new project. Written as questions with a
 * yes/no answer so the tracker means "has this been confirmed", not "has
 * someone ticked a box". Sections mirror how a job actually runs.
 */
const DEFAULT_QUESTIONS: { question: string; section: string }[] = [
  { section: 'Survey', question: 'Has the site been surveyed and the scope agreed with the client?' },
  { section: 'Survey', question: 'Is access confirmed (keys, gate, lift, parking)?' },
  { section: 'Survey', question: 'Are water and power available on site?' },
  { section: 'Quote', question: 'Has a written quote been sent and accepted?' },
  { section: 'Quote', question: 'Is the payment arrangement agreed (deposit, on completion, invoice)?' },
  { section: 'Resourcing', question: 'Has a crew been assigned with the right certification?' },
  { section: 'Resourcing', question: 'Are the required machines and materials available for the dates?' },
  { section: 'On site', question: 'Were before photos taken?' },
  { section: 'On site', question: 'Was any pre-existing damage recorded and reported to the client?' },
  { section: 'Handover', question: 'Were after photos taken?' },
  { section: 'Handover', question: 'Has the client walked the site and signed off?' },
  { section: 'Handover', question: 'Have all snags raised by the client been closed?' },
  { section: 'Closing', question: 'Has payment been received in full?' },
  { section: 'Closing', question: 'Has the job been recorded in Financials with its expenses?' },
];

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientName: z.string().trim().max(200).optional(),
  clientPhone: z.string().trim().max(30).optional(),
  siteLocation: z.string().trim().max(300).optional(),
  serviceLineCode: z.string().trim().max(60).optional(),
  clientSegment: z.enum(SEGMENTS).optional(),
  stage: z.enum(STAGES).optional(),
  startDate: DateStr.nullable().optional(),
  targetEndDate: DateStr.nullable().optional(),
  valueCents: z.number().int().nonnegative().optional(),
  paymentFrequency: z.enum(FREQUENCIES).optional(),
  notes: z.string().trim().max(2000).optional(),
  questions: z
    .array(z.object({ question: z.string().trim().min(1).max(300), section: z.string().trim().max(80).optional() }))
    .optional(),
}) satisfies z.ZodType<CreateProjectInput>;

const UpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  clientName: z.string().trim().max(200).nullable().optional(),
  clientPhone: z.string().trim().max(30).nullable().optional(),
  siteLocation: z.string().trim().max(300).nullable().optional(),
  serviceLineCode: z.string().trim().max(60).nullable().optional(),
  clientSegment: z.enum(SEGMENTS).nullable().optional(),
  stage: z.enum(STAGES).optional(),
  startDate: DateStr.nullable().optional(),
  targetEndDate: DateStr.nullable().optional(),
  valueCents: z.number().int().nonnegative().nullable().optional(),
  paymentFrequency: z.enum(FREQUENCIES).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}) satisfies z.ZodType<UpdateProjectInput>;

const AnswerSchema = z.object({
  answer: z.boolean().nullable().optional(),
  notApplicable: z.boolean().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
}) satisfies z.ZodType<AnswerProjectCheckInput>;

const AddCheckSchema = z.object({
  question: z.string().trim().min(1).max(300),
  section: z.string().trim().max(80).optional(),
}) satisfies z.ZodType<AddProjectCheckInput>;

const withChecklist = {
  createdBy: { select: { fullName: true } },
  checklist: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: { answeredBy: { select: { fullName: true } } },
  },
  _count: { select: { events: true } },
};

/** Labels used in event summaries, kept next to the enums they describe. */
const STAGE_LABELS: Record<string, string> = {
  ENQUIRY: 'Enquiry', SURVEY: 'Survey', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress',
  SNAGGING: 'Snagging', COMPLETE: 'Complete', CANCELLED: 'Cancelled',
};
const FIELD_LABELS: Record<string, string> = {
  title: 'Title', clientName: 'Client', clientPhone: 'Client phone', siteLocation: 'Site',
  serviceLineCode: 'Service line', clientSegment: 'Segment', startDate: 'Start date',
  targetEndDate: 'Target completion', valueCents: 'Value', paymentFrequency: 'Payment frequency',
};

/**
 * Append one line to a project's history. Deliberately fire-and-forget at the
 * call site: a failure to log must never fail the change the user asked for,
 * so callers await it but the route wraps its own work first.
 */
async function logEvent(
  projectId: string,
  kind: ProjectEventKind,
  summary: string,
  actorId: string | null,
  detail?: string | null,
) {
  const actor = actorId
    ? await prisma.user.findUnique({ where: { id: actorId }, select: { fullName: true } })
    : null;
  await prisma.projectEvent.create({
    data: { projectId, kind, summary, detail: detail ?? null, actorId, actorName: actor?.fullName ?? null },
  });
}

/** Re-read a project with everything the DTO needs, after a write. */
function reload(id: string) {
  return prisma.project.findUniqueOrThrow({ where: { id }, include: withChecklist });
}

/** Human-readable value for a diff line. */
function shown(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'valueCents' && typeof value === 'number') {
    return `KSh ${(value / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export const projectRoutes: FastifyPluginAsync = async (app) => {
  // Projects are day-to-day operations, so any signed-in staff member can use
  // them — the same bar as bookings and quotes.
  app.addHook('preHandler', requireAuth);

  app.get('/', async (_req, reply) => {
    const rows = await prisma.project.findMany({
      include: withChecklist,
      orderBy: [{ updatedAt: 'desc' }],
    });
    return reply.send({ projects: rows.map(toDto) });
  });

  app.post('/', async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { questions, startDate, targetEndDate, stage, clientSegment, paymentFrequency, ...rest } = parsed.data;
    const seed = questions?.length ? questions : DEFAULT_QUESTIONS;

    const row = await prisma.project.create({
      data: {
        ...rest,
        stage: (stage ?? 'ENQUIRY') as ProjectStage,
        clientSegment: clientSegment as ClientSegment | undefined,
        paymentFrequency: (paymentFrequency ?? 'ONE_OFF') as PaymentFrequency,
        startDate: startDate ? new Date(startDate) : null,
        targetEndDate: targetEndDate ? new Date(targetEndDate) : null,
        createdById: req.auth!.sub,
        checklist: {
          create: seed.map((q, i) => ({
            question: q.question,
            section: q.section ?? null,
            sortOrder: i,
          })),
        },
      },
      include: withChecklist,
    });

    await logEvent(
      row.id,
      'CREATED',
      'Project created',
      req.auth!.sub,
      `${seed.length} question${seed.length === 1 ? '' : 's'} added to the checklist`,
    );
    return reply.code(201).send({ project: toDto(await reload(row.id)) });
  });

  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'project not found' });

    const { startDate, targetEndDate, stage, clientSegment, paymentFrequency, ...rest } = parsed.data;
    const row = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(stage !== undefined && { stage: stage as ProjectStage }),
        ...(clientSegment !== undefined && { clientSegment: clientSegment as ClientSegment | null }),
        ...(paymentFrequency !== undefined && { paymentFrequency: paymentFrequency as PaymentFrequency }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(targetEndDate !== undefined && { targetEndDate: targetEndDate ? new Date(targetEndDate) : null }),
        // Stamp completion once, when the project first reaches COMPLETE.
        ...(stage === 'COMPLETE' && !existing.completedAt ? { completedAt: new Date() } : {}),
        ...(stage !== undefined && stage !== 'COMPLETE' ? { completedAt: null } : {}),
      },
      include: withChecklist,
    });

    // A stage move is the headline change, so it gets its own entry. Everything
    // else collapses into one "details changed" line listing what moved.
    if (stage !== undefined && stage !== existing.stage) {
      await logEvent(
        row.id,
        'STAGE_CHANGED',
        `Stage moved to ${STAGE_LABELS[stage] ?? stage}`,
        req.auth!.sub,
        `from ${STAGE_LABELS[existing.stage] ?? existing.stage}`,
      );
    }

    if (rest.notes !== undefined && rest.notes !== existing.notes) {
      await logEvent(row.id, 'NOTE_CHANGED', 'Notes updated', req.auth!.sub, rest.notes || null);
    }

    const changes: string[] = [];
    const before = existing as unknown as Record<string, unknown>;
    const after = row as unknown as Record<string, unknown>;
    for (const field of Object.keys(FIELD_LABELS)) {
      if (!(field in parsed.data)) continue;
      const a = shown(field, before[field]);
      const b = shown(field, after[field]);
      if (a !== b) changes.push(`${FIELD_LABELS[field]}: ${a} → ${b}`);
    }
    if (changes.length > 0) {
      await logEvent(
        row.id,
        'DETAILS_CHANGED',
        `${changes.length} detail${changes.length === 1 ? '' : 's'} updated`,
        req.auth!.sub,
        changes.join(' · '),
      );
    }

    return reply.send({ project: toDto(await reload(row.id)) });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'project not found' });
    await prisma.project.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });

  // ── Checklist ─────────────────────────────────────────────────────────────

  app.post<{ Params: { id: string } }>('/:id/checks', async (req, reply) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return reply.code(404).send({ error: 'project not found' });

    const parsed = AddCheckSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const last = await prisma.projectCheck.findFirst({
      where: { projectId: project.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    await prisma.projectCheck.create({
      data: {
        projectId: project.id,
        question: parsed.data.question,
        section: parsed.data.section ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });

    await logEvent(project.id, 'QUESTION_ADDED', 'Question added', req.auth!.sub, parsed.data.question);
    return reply.code(201).send({ project: toDto(await reload(project.id)) });
  });

  app.patch<{ Params: { id: string; checkId: string } }>('/:id/checks/:checkId', async (req, reply) => {
    const parsed = AnswerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const check = await prisma.projectCheck.findUnique({ where: { id: req.params.checkId } });
    if (!check || check.projectId !== req.params.id) {
      return reply.code(404).send({ error: 'checklist item not found' });
    }

    // Answering stamps who and when; clearing an answer clears the trail too,
    // so a blank row never carries a stale name.
    const isAnswering =
      (parsed.data.answer !== undefined && parsed.data.answer !== null) || parsed.data.notApplicable === true;
    const isClearing = parsed.data.answer === null && parsed.data.notApplicable !== true;

    await prisma.projectCheck.update({
      where: { id: check.id },
      data: {
        ...(parsed.data.answer !== undefined && { answer: parsed.data.answer }),
        ...(parsed.data.notApplicable !== undefined && { notApplicable: parsed.data.notApplicable }),
        ...(parsed.data.note !== undefined && { note: parsed.data.note }),
        ...(isAnswering ? { answeredById: req.auth!.sub, answeredAt: new Date() } : {}),
        ...(isClearing ? { answeredById: null, answeredAt: null } : {}),
      },
    });

    // Only log a real change of position. A note edited on its own logs the note.
    const answerChanged =
      (parsed.data.answer !== undefined && parsed.data.answer !== check.answer) ||
      (parsed.data.notApplicable !== undefined && parsed.data.notApplicable !== check.notApplicable);

    if (answerChanged) {
      const verdict = parsed.data.notApplicable
        ? 'N/A'
        : parsed.data.answer === true
          ? 'Yes'
          : parsed.data.answer === false
            ? 'No'
            : 'cleared';
      await logEvent(
        req.params.id,
        'QUESTION_ANSWERED',
        `Answered ${verdict}`,
        req.auth!.sub,
        check.question,
      );
    } else if (parsed.data.note !== undefined && parsed.data.note !== check.note) {
      await logEvent(
        req.params.id,
        'NOTE_CHANGED',
        'Note updated on a question',
        req.auth!.sub,
        `${check.question} — ${parsed.data.note || 'note cleared'}`,
      );
    }

    return reply.send({ project: toDto(await reload(req.params.id)) });
  });

  app.delete<{ Params: { id: string; checkId: string } }>('/:id/checks/:checkId', async (req, reply) => {
    const check = await prisma.projectCheck.findUnique({ where: { id: req.params.checkId } });
    if (!check || check.projectId !== req.params.id) {
      return reply.code(404).send({ error: 'checklist item not found' });
    }
    await prisma.projectCheck.delete({ where: { id: check.id } });

    await logEvent(req.params.id, 'QUESTION_REMOVED', 'Question removed', req.auth!.sub, check.question);
    return reply.send({ project: toDto(await reload(req.params.id)) });
  });

  // ── History ───────────────────────────────────────────────────────────────

  /** Newest first. Loaded on demand, so the projects list stays light. */
  app.get<{ Params: { id: string } }>('/:id/events', async (req, reply) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!project) return reply.code(404).send({ error: 'project not found' });

    const rows = await prisma.projectEvent.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const events: ProjectEventDto[] = rows.map((e) => ({
      id: e.id,
      kind: e.kind,
      summary: e.summary,
      detail: e.detail,
      actorName: e.actorName,
      createdAt: e.createdAt.toISOString(),
    }));
    return reply.send({ events });
  });
};

type Row = Prisma.ProjectGetPayload<{
  include: {
    createdBy: { select: { fullName: true } };
    checklist: { include: { answeredBy: { select: { fullName: true } } } };
    _count: { select: { events: true } };
  };
}>;

/**
 * Whole billing periods between two dates, inclusive of the start day. Months
 * count calendar months rather than 30-day blocks, so a 1 Jan → 31 Mar contract
 * bills three months rather than 2.97.
 */
function periodsBetween(from: Date, to: Date, frequency: PaymentFrequency): number | null {
  if (frequency === 'ONE_OFF') return null;
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days <= 0) return null;

  if (frequency === 'DAILY') return days;
  if (frequency === 'WEEKLY') return Math.max(1, Math.ceil(days / 7));

  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) + 1;
  return Math.max(1, months);
}

function toDto(row: Row): ProjectDto {
  const checklist: ProjectCheckDto[] = row.checklist.map((c) => ({
    id: c.id,
    question: c.question,
    section: c.section,
    sortOrder: c.sortOrder,
    answer: c.answer,
    notApplicable: c.notApplicable,
    note: c.note,
    answeredByName: c.answeredBy?.fullName ?? null,
    answeredAt: c.answeredAt ? c.answeredAt.toISOString() : null,
  }));

  // "Answered" counts a yes, a no, or an explicit N/A — anything that has been
  // decided. Only an untouched question is outstanding.
  const answered = checklist.filter((c) => c.notApplicable || c.answer !== null).length;
  const blockers = checklist.filter((c) => c.answer === false && !c.notApplicable).length;

  const periods =
    row.startDate && row.targetEndDate
      ? periodsBetween(row.startDate, row.targetEndDate, row.paymentFrequency)
      : null;

  return {
    id: row.id,
    title: row.title,
    clientName: row.clientName,
    clientPhone: row.clientPhone,
    siteLocation: row.siteLocation,
    serviceLineCode: row.serviceLineCode,
    clientSegment: row.clientSegment,
    stage: row.stage,
    startDate: row.startDate ? row.startDate.toISOString().slice(0, 10) : null,
    targetEndDate: row.targetEndDate ? row.targetEndDate.toISOString().slice(0, 10) : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    valueCents: row.valueCents,
    paymentFrequency: row.paymentFrequency,
    billingPeriods: periods,
    estimatedTotalCents: periods !== null && row.valueCents !== null ? periods * row.valueCents : null,
    notes: row.notes,
    checklist,
    progressPercent: checklist.length > 0 ? Math.round((answered / checklist.length) * 100) : 0,
    answeredCount: answered,
    checklistCount: checklist.length,
    blockerCount: blockers,
    eventCount: row._count.events,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
