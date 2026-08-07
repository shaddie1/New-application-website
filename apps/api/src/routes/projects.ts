import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ClientSegment, Prisma, ProjectStage } from '@prisma/client';
import type {
  AddProjectCheckInput,
  AnswerProjectCheckInput,
  CreateProjectInput,
  ProjectCheckDto,
  ProjectDto,
  UpdateProjectInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

const STAGES = ['ENQUIRY', 'SURVEY', 'SCHEDULED', 'IN_PROGRESS', 'SNAGGING', 'COMPLETE', 'CANCELLED'] as const;
const SEGMENTS = ['RESIDENTIAL', 'COMMERCIAL', 'MEDICAL', 'DEVELOPER'] as const;
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
};

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

    const { questions, startDate, targetEndDate, stage, clientSegment, ...rest } = parsed.data;
    const seed = questions?.length ? questions : DEFAULT_QUESTIONS;

    const row = await prisma.project.create({
      data: {
        ...rest,
        stage: (stage ?? 'ENQUIRY') as ProjectStage,
        clientSegment: clientSegment as ClientSegment | undefined,
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
    return reply.code(201).send({ project: toDto(row) });
  });

  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'project not found' });

    const { startDate, targetEndDate, stage, clientSegment, ...rest } = parsed.data;
    const row = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(stage !== undefined && { stage: stage as ProjectStage }),
        ...(clientSegment !== undefined && { clientSegment: clientSegment as ClientSegment | null }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(targetEndDate !== undefined && { targetEndDate: targetEndDate ? new Date(targetEndDate) : null }),
        // Stamp completion once, when the project first reaches COMPLETE.
        ...(stage === 'COMPLETE' && !existing.completedAt ? { completedAt: new Date() } : {}),
        ...(stage !== undefined && stage !== 'COMPLETE' ? { completedAt: null } : {}),
      },
      include: withChecklist,
    });
    return reply.send({ project: toDto(row) });
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

    const row = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: withChecklist });
    return reply.code(201).send({ project: toDto(row) });
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

    const row = await prisma.project.findUniqueOrThrow({ where: { id: req.params.id }, include: withChecklist });
    return reply.send({ project: toDto(row) });
  });

  app.delete<{ Params: { id: string; checkId: string } }>('/:id/checks/:checkId', async (req, reply) => {
    const check = await prisma.projectCheck.findUnique({ where: { id: req.params.checkId } });
    if (!check || check.projectId !== req.params.id) {
      return reply.code(404).send({ error: 'checklist item not found' });
    }
    await prisma.projectCheck.delete({ where: { id: check.id } });

    const row = await prisma.project.findUniqueOrThrow({ where: { id: req.params.id }, include: withChecklist });
    return reply.send({ project: toDto(row) });
  });
};

type Row = Prisma.ProjectGetPayload<{
  include: {
    createdBy: { select: { fullName: true } };
    checklist: { include: { answeredBy: { select: { fullName: true } } } };
  };
}>;

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
    notes: row.notes,
    checklist,
    progressPercent: checklist.length > 0 ? Math.round((answered / checklist.length) * 100) : 0,
    answeredCount: answered,
    checklistCount: checklist.length,
    blockerCount: blockers,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
