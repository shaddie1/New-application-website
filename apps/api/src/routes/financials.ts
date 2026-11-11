import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ClientSegment, ExpenseCategory, JobPlacement, JobStatus, ShareholderKind } from '@prisma/client';
import type {
  ExpenseDto,
  FinancialSummary,
  CreateExpenseInput,
  JobDto,
  CreateJobInput,
  UpdateJobInput,
  JobPlaceInput,
  ApproveReportInput,
  PlaceJobsInput,
  MonthlyTrendItem,
  ShareholderDto,
  CreateShareholderInput,
  UpdateShareholderInput,
  ShareholderAllocation,
  AllTimeTotals,
  EquityOverview,
  UnsortedJobDto,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { COUNTED_STATUSES, allTimeTotalsOf } from '../projectMoney/figures.js';
import { suggestProjects } from '../projectMoney/suggest.js';

const DateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
});

const SEGMENTS = ['RESIDENTIAL', 'COMMERCIAL', 'MEDICAL', 'DEVELOPER'] as const;

// A job's place as the owner chooses it: one project, or one-off. Strict, so
// one-off sent together with a project is refused. "Not yet sorted" is not a choice.
const PlaceSchema = z.discriminatedUnion('placement', [
  z.object({ placement: z.literal('PROJECT'), projectId: z.string().trim().min(1) }).strict(),
  z.object({ placement: z.literal('STANDALONE') }).strict(),
]) satisfies z.ZodType<JobPlaceInput>;

const CHOOSE_PLACE = 'choose a project or mark the job one-off';

const CreateJobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  incomeCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative().optional(),
  clientName: z.string().trim().max(200).optional(),
  clientPhone: z.string().trim().max(30).optional(),
  clientLocation: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
  serviceLineCode: z.string().trim().max(60).optional(),
  region: z.string().trim().max(120).optional(),
  clientSegment: z.enum(SEGMENTS).optional(),
  place: PlaceSchema,
}) satisfies z.ZodType<CreateJobInput>;

const UpdateJobSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  incomeCents: z.number().int().nonnegative().optional(),
  discountCents: z.number().int().nonnegative().optional(),
  clientName: z.string().trim().max(200).optional(),
  clientPhone: z.string().trim().max(30).optional(),
  clientLocation: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
  serviceLineCode: z.string().trim().max(60).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  clientSegment: z.enum(SEGMENTS).nullable().optional(),
  place: PlaceSchema.optional(),
}) satisfies z.ZodType<UpdateJobInput>;

const ApproveReportSchema = z.object({ place: PlaceSchema }) satisfies z.ZodType<ApproveReportInput>;

const PlaceJobsSchema = z.object({
  jobIds: z.array(z.string().min(1)).min(1),
  place: PlaceSchema,
}) satisfies z.ZodType<PlaceJobsInput>;

const CreateExpenseSchema = z.object({
  category: z.enum(['MATERIALS', 'TRANSPORT', 'EMPLOYEE_PAY', 'LUNCH', 'MISCELLANEOUS']),
  amountCents: z.number().int().positive(),
  description: z.string().trim().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
}) satisfies z.ZodType<CreateExpenseInput>;

// 10000 basis points = 100.00%.
const BASIS_POINTS_TOTAL = 10_000;

const CreateShareholderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(100).nullable().optional(),
  kind: z.enum(['COMPANY', 'INDIVIDUAL']),
  basisPoints: z.number().int().min(0).max(BASIS_POINTS_TOTAL),
  notes: z.string().trim().max(500).optional(),
  userId: z.string().trim().min(1).nullable().optional(),
}) satisfies z.ZodType<CreateShareholderInput>;

const UpdateShareholderSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().max(100).nullable().optional(),
  kind: z.enum(['COMPANY', 'INDIVIDUAL']).optional(),
  basisPoints: z.number().int().min(0).max(BASIS_POINTS_TOTAL).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  userId: z.string().trim().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
}) satisfies z.ZodType<UpdateShareholderInput>;

export const financialsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireOwner);

  // ── Summary ────────────────────────────────────────────────────────────────

  app.get('/summary', async (req, reply) => {
    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { from, to } = dateRange(parsed.data.from, parsed.data.to);

    const [jobs, expenses] = await Promise.all([
      prisma.job.findMany({
        where: { date: { gte: from, lte: to }, status: { in: COUNTED_STATUSES } },
        select: { incomeCents: true, discountCents: true },
      }),
      prisma.expense.findMany({
        where: { date: { gte: from, lte: to }, job: { status: { in: COUNTED_STATUSES } } },
        select: { category: true, amountCents: true },
      }),
    ]);

    const incomeCents = jobs.reduce((acc, j) => acc + j.incomeCents - j.discountCents, 0);

    const catTotal = (cat: ExpenseCategory): number =>
      expenses.filter((e) => e.category === cat).reduce((acc, e) => acc + e.amountCents, 0);
    const expensesByCategoryCents: Record<ExpenseCategory, number> = {
      MATERIALS: catTotal('MATERIALS'),
      TRANSPORT: catTotal('TRANSPORT'),
      EMPLOYEE_PAY: catTotal('EMPLOYEE_PAY'),
      LUNCH: catTotal('LUNCH'),
      MISCELLANEOUS: catTotal('MISCELLANEOUS'),
    };

    const totalExpensesCents = expenses.reduce((acc, e) => acc + e.amountCents, 0);

    const summary: FinancialSummary = {
      incomeCents,
      expensesByCategoryCents,
      totalExpensesCents,
      netCents: incomeCents - totalExpensesCents,
      fromDate: parsed.data.from,
      toDate: parsed.data.to,
    };
    return reply.send({ summary });
  });

  // ── Monthly trends ─────────────────────────────────────────────────────────

  app.get('/trends', async (req, reply) => {
    const MonthsSchema = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) });
    const parsed = MonthsSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const count = parsed.data.months;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    const monthSlots = Array.from({ length: count }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const daysInMonth = new Date(year, month, 0).getDate();
      const fromStr = `${year}-${pad(month)}-01`;
      const toStr = `${year}-${pad(month)}-${pad(daysInMonth)}`;
      const label = d.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
      return { year, month, label, ...dateRange(fromStr, toStr) };
    });

    const results = await Promise.all(
      monthSlots.map(async ({ year, month, label, from, to }) => {
        const [jobs, expenses] = await Promise.all([
          prisma.job.findMany({
            where: { date: { gte: from, lte: to }, status: { in: COUNTED_STATUSES } },
            select: { incomeCents: true, discountCents: true },
          }),
          prisma.expense.findMany({
            where: { date: { gte: from, lte: to }, job: { status: { in: COUNTED_STATUSES } } },
            select: { amountCents: true },
          }),
        ]);
        const incomeCents = jobs.reduce((acc, j) => acc + j.incomeCents - j.discountCents, 0);
        const totalExpensesCents = expenses.reduce((acc, e) => acc + e.amountCents, 0);
        const item: MonthlyTrendItem = {
          year, month, label, incomeCents, totalExpensesCents,
          netCents: incomeCents - totalExpensesCents,
          jobCount: jobs.length,
        };
        return item;
      }),
    );

    return reply.send({ trends: results });
  });

  // ── Jobs ───────────────────────────────────────────────────────────────────

  app.get('/jobs', async (req, reply) => {
    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { from, to } = dateRange(parsed.data.from, parsed.data.to);

    const rows = await prisma.job.findMany({
      where: { date: { gte: from, lte: to }, status: { in: COUNTED_STATUSES } },
      include: {
        expenses: { orderBy: { date: 'desc' } },
        reportedBy: { select: { fullName: true } },
        project: { select: { title: true } },
      },
      orderBy: { date: 'desc' },
    });
    return reply.send({ jobs: rows.map(toJobDto) });
  });

  app.post('/jobs', async (req, reply) => {
    const parsed = CreateJobSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(refusal(parsed.error));

    const place = await resolvePlace(parsed.data.place);
    if (!place) return reply.code(400).send({ error: 'project not found' });

    const row = await prisma.job.create({
      data: {
        title: parsed.data.title,
        date: new Date(parsed.data.date),
        incomeCents: parsed.data.incomeCents,
        discountCents: parsed.data.discountCents ?? 0,
        status: 'OWNER_ENTRY',
        clientName: parsed.data.clientName,
        clientPhone: parsed.data.clientPhone,
        clientLocation: parsed.data.clientLocation,
        notes: parsed.data.notes,
        serviceLineCode: parsed.data.serviceLineCode,
        region: parsed.data.region,
        clientSegment: parsed.data.clientSegment as ClientSegment | undefined,
        ...place,
        createdById: req.auth!.sub,
      },
      include: { expenses: true, reportedBy: { select: { fullName: true } }, project: { select: { title: true } } },
    });
    return reply.code(201).send({ job: toJobDto(row) });
  });

  app.patch<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const parsed = UpdateJobSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(refusal(parsed.error));

    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'job not found' });

    // A place in the body moves the job; without one it stays where it is.
    const place = parsed.data.place && (await resolvePlace(parsed.data.place));
    if (place === null) return reply.code(400).send({ error: 'project not found' });

    const row = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.incomeCents !== undefined && { incomeCents: parsed.data.incomeCents }),
        ...(parsed.data.discountCents !== undefined && { discountCents: parsed.data.discountCents }),
        ...(parsed.data.clientName !== undefined && { clientName: parsed.data.clientName }),
        ...(parsed.data.clientPhone !== undefined && { clientPhone: parsed.data.clientPhone }),
        ...(parsed.data.clientLocation !== undefined && { clientLocation: parsed.data.clientLocation }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
        ...(parsed.data.serviceLineCode !== undefined && { serviceLineCode: parsed.data.serviceLineCode }),
        ...(parsed.data.region !== undefined && { region: parsed.data.region }),
        ...(parsed.data.clientSegment !== undefined && {
          clientSegment: parsed.data.clientSegment as ClientSegment | null,
        }),
        ...place,
      },
      include: {
        expenses: { orderBy: { date: 'desc' } },
        reportedBy: { select: { fullName: true } },
        project: { select: { title: true } },
      },
    });
    return reply.send({ job: toJobDto(row) });
  });

  // Sort several jobs into one place. Every job is checked before any is
  // written, in one transaction, so a refusal changes nothing.
  app.post('/jobs/place', async (req, reply) => {
    const parsed = PlaceJobsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(refusal(parsed.error));

    const place = await resolvePlace(parsed.data.place);
    if (!place) return reply.code(400).send({ error: 'project not found' });

    const { jobIds } = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      const found = await tx.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, status: true } });
      const statusOf = new Map(found.map((j) => [j.id, j.status]));
      for (const jobId of jobIds) {
        const status = statusOf.get(jobId);
        if (!status) return { error: 'job not found', jobId };
        // A report's place is chosen when it is approved.
        if (status === 'PENDING') return { error: 'job is waiting for approval', jobId };
      }
      const { count } = await tx.job.updateMany({ where: { id: { in: jobIds } }, data: place });
      return { placed: count };
    });
    return reply.code('error' in result ? 400 : 200).send(result);
  });

  app.delete<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'job not found' });
    await prisma.job.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });

  // ── Job expenses ───────────────────────────────────────────────────────────

  app.post<{ Params: { id: string } }>('/jobs/:id/expenses', async (req, reply) => {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return reply.code(404).send({ error: 'job not found' });

    const parsed = CreateExpenseSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await prisma.expense.create({
      data: {
        category: parsed.data.category as ExpenseCategory,
        amountCents: parsed.data.amountCents,
        description: parsed.data.description,
        date: new Date(parsed.data.date),
        jobId: job.id,
        createdById: req.auth!.sub,
      },
    });
    return reply.code(201).send({ expense: toExpenseDto(row) });
  });

  app.delete<{ Params: { id: string; expenseId: string } }>(
    '/jobs/:id/expenses/:expenseId',
    async (req, reply) => {
      const row = await prisma.expense.findUnique({ where: { id: req.params.expenseId } });
      if (!row || row.jobId !== req.params.id) return reply.code(404).send({ error: 'expense not found' });
      await prisma.expense.delete({ where: { id: row.id } });
      return reply.send({ ok: true });
    },
  );

  // ── Pending report submissions (owner review) ──────────────────────────────

  app.get('/reports', async (_req, reply) => {
    const rows = await prisma.job.findMany({
      where: { status: 'PENDING' },
      include: {
        expenses: { orderBy: { date: 'desc' } },
        reportedBy: { select: { fullName: true } },
        project: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ reports: rows.map(toJobDto) });
  });

  app.patch<{ Params: { id: string } }>('/reports/:id/approve', async (req, reply) => {
    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.status !== 'PENDING') return reply.code(404).send({ error: 'pending report not found' });

    // The body holds the place and nothing else, so any bad body means no place was chosen.
    const parsed = ApproveReportSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: CHOOSE_PLACE });

    const place = await resolvePlace(parsed.data.place);
    if (!place) return reply.code(400).send({ error: 'project not found' });

    const row = await prisma.job.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', ...place },
      include: {
        expenses: { orderBy: { date: 'desc' } },
        reportedBy: { select: { fullName: true } },
        project: { select: { title: true } },
      },
    });
    return reply.send({ job: toJobDto(row) });
  });

  app.delete<{ Params: { id: string } }>('/reports/:id', async (req, reply) => {
    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.status !== 'PENDING') return reply.code(404).send({ error: 'pending report not found' });
    await prisma.job.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });

  // ── Jobs still to sort ─────────────────────────────────────────────────────
  // Counted jobs with no place yet, oldest first, each with the projects that
  // could be its home. A report still waiting for approval is not listed.

  app.get('/unsorted', async (_req, reply) => {
    const [rows, projects] = await Promise.all([
      prisma.job.findMany({
        where: { placement: JobPlacement.UNSORTED, status: { in: [...COUNTED_STATUSES] } },
        orderBy: { date: 'asc' },
      }),
      prisma.project.findMany({ select: { id: true, title: true, clientName: true, clientPhone: true, stage: true } }),
    ]);
    const jobs: UnsortedJobDto[] = rows.map((j) => ({
      jobId: j.id,
      date: j.date.toISOString().slice(0, 10),
      title: j.title,
      clientName: j.clientName,
      chargedCents: j.incomeCents - j.discountCents,
      ...suggestProjects(j, projects),
    }));
    return reply.send({ jobs });
  });

  // ── All-time totals ────────────────────────────────────────────────────────
  // "How many projects and how much income have we generated so far."

  app.get('/totals', async (_req, reply) => {
    return reply.send({ totals: await allTimeTotals() });
  });

  // ── Ownership / cap table ──────────────────────────────────────────────────

  app.get('/shareholders', async (_req, reply) => {
    const rows = await listShareholders();
    return reply.send({
      shareholders: rows,
      totalBasisPoints: rows.reduce((acc, s) => acc + s.basisPoints, 0),
    });
  });

  app.post('/shareholders', async (req, reply) => {
    const parsed = CreateShareholderSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    if (parsed.data.userId) {
      const linkErr = await checkLinkableUser(parsed.data.userId);
      if (linkErr) return reply.code(400).send({ error: linkErr });
    }

    // Append to the end of the table.
    const last = await prisma.shareholder.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });

    const row = await prisma.shareholder.create({
      data: {
        name: parsed.data.name,
        title: parsed.data.title ?? null,
        kind: parsed.data.kind as ShareholderKind,
        basisPoints: parsed.data.basisPoints,
        notes: parsed.data.notes,
        userId: parsed.data.userId ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      include: { user: { select: { fullName: true } } },
    });
    return reply.code(201).send({ shareholder: toShareholderDto(row) });
  });

  app.patch<{ Params: { id: string } }>('/shareholders/:id', async (req, reply) => {
    const parsed = UpdateShareholderSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.shareholder.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'shareholder not found' });

    if (parsed.data.userId) {
      const linkErr = await checkLinkableUser(parsed.data.userId, req.params.id);
      if (linkErr) return reply.code(400).send({ error: linkErr });
    }

    const row = await prisma.shareholder.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.kind !== undefined && { kind: parsed.data.kind as ShareholderKind }),
        ...(parsed.data.basisPoints !== undefined && { basisPoints: parsed.data.basisPoints }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
        ...(parsed.data.userId !== undefined && { userId: parsed.data.userId }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      },
      include: { user: { select: { fullName: true } } },
    });
    return reply.send({ shareholder: toShareholderDto(row) });
  });

  app.delete<{ Params: { id: string } }>('/shareholders/:id', async (req, reply) => {
    const existing = await prisma.shareholder.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'shareholder not found' });
    await prisma.shareholder.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });

  // ── Equity overview ────────────────────────────────────────────────────────
  // Each shareholder's cut of net profit (income − expenses), for the requested
  // period and for all time, alongside the all-time company totals.

  app.get('/equity', async (req, reply) => {
    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { from, to } = dateRange(parsed.data.from, parsed.data.to);

    const [shareholders, periodJobs, periodExpenses, allTime] = await Promise.all([
      listShareholders(),
      prisma.job.findMany({
        where: { date: { gte: from, lte: to }, status: { in: COUNTED_STATUSES } },
        select: { incomeCents: true, discountCents: true },
      }),
      prisma.expense.findMany({
        where: { date: { gte: from, lte: to }, job: { status: { in: COUNTED_STATUSES } } },
        select: { amountCents: true },
      }),
      allTimeTotals(),
    ]);

    const periodIncomeCents = periodJobs.reduce((acc, j) => acc + j.incomeCents - j.discountCents, 0);
    const periodExpensesCents = periodExpenses.reduce((acc, e) => acc + e.amountCents, 0);
    const periodNetCents = periodIncomeCents - periodExpensesCents;

    const period = allocate(periodNetCents, shareholders);
    const lifetime = allocate(allTime.totalNetCents, shareholders);

    const allocations: ShareholderAllocation[] = shareholders.map((s, i) => ({
      shareholder: s,
      periodShareCents: period.shares[i]!,
      allTimeShareCents: lifetime.shares[i]!,
    }));

    const overview: EquityOverview = {
      allocations,
      totalBasisPoints: shareholders.reduce((acc, s) => acc + s.basisPoints, 0),
      unallocatedPeriodCents: period.unallocatedCents,
      unallocatedAllTimeCents: lifetime.unallocatedCents,
      periodNetCents,
      fromDate: parsed.data.from,
      toDate: parsed.data.to,
      allTime,
    };
    return reply.send({ overview });
  });
};

// ── Ownership helpers ──────────────────────────────────────────────────────

async function listShareholders(): Promise<ShareholderDto[]> {
  const rows = await prisma.shareholder.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { user: { select: { fullName: true } } },
  });
  return rows.map(toShareholderDto);
}

function toShareholderDto(row: {
  id: string;
  name: string;
  title: string | null;
  kind: ShareholderKind;
  basisPoints: number;
  notes: string | null;
  userId: string | null;
  sortOrder: number;
  user?: { fullName: string } | null;
}): ShareholderDto {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    kind: row.kind,
    basisPoints: row.basisPoints,
    notes: row.notes,
    userId: row.userId,
    userName: row.user?.fullName ?? null,
    sortOrder: row.sortOrder,
  };
}

// A shareholder may be linked to at most one staff account, and vice versa.
async function checkLinkableUser(userId: string, selfId?: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, shareholder: { select: { id: true } } },
  });
  if (!user) return 'user not found';
  if (user.shareholder && user.shareholder.id !== selfId) return 'that user is already on the cap table';
  return null;
}

// Split `netCents` across the stakes. Whole cents only: the leftover cents from
// rounding go to the largest fractional parts first (largest-remainder), so the
// shares add back up to the whole exactly rather than drifting a cent or two.
// Works for a loss (negative net) too — everyone shares it in proportion.
function allocate(
  netCents: number,
  shareholders: ShareholderDto[],
): { shares: number[]; unallocatedCents: number } {
  const totalBasisPoints = shareholders.reduce((acc, s) => acc + s.basisPoints, 0);
  if (shareholders.length === 0 || totalBasisPoints === 0) {
    return { shares: shareholders.map(() => 0), unallocatedCents: netCents };
  }

  // What the stakes actually cover. Equals netCents when they sum to 100%;
  // anything left over is retained by the business rather than silently spread.
  const distributableCents = Math.round((netCents * totalBasisPoints) / BASIS_POINTS_TOTAL);

  const exact = shareholders.map((s) => (netCents * s.basisPoints) / BASIS_POINTS_TOTAL);
  const shares = exact.map((v) => Math.floor(v));

  const leftover = distributableCents - shares.reduce((acc, v) => acc + v, 0);
  const byFraction = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < leftover; k += 1) {
    const target = byFraction[k % byFraction.length]!;
    shares[target.i] = shares[target.i]! + 1;
  }

  return { shares, unallocatedCents: netCents - distributableCents };
}

// Adds up in the project-money module, so the contracts table's totals line
// and these figures cannot drift apart.
async function allTimeTotals(): Promise<AllTimeTotals> {
  const jobs = await prisma.job.findMany({
    where: { status: { in: COUNTED_STATUSES } },
    select: {
      id: true,
      title: true,
      date: true,
      incomeCents: true,
      discountCents: true,
      status: true,
      placement: true,
      projectId: true,
      expenses: { select: { category: true, amountCents: true } },
    },
  });
  return allTimeTotalsOf(jobs);
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function requireOwner(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const u = await prisma.user.findUnique({ where: { id: req.auth.sub }, select: { isOwner: true } });
  if (!u?.isOwner) return reply.code(403).send({ error: 'owner access required' });
}

/** A body refused only for its place gets the sentence the owner can act on; any other fault keeps the field errors. */
function refusal(error: z.ZodError) {
  const onlyThePlace = error.issues.every((issue) => issue.path[0] === 'place');
  return { error: onlyThePlace ? CHOOSE_PLACE : error.flatten() };
}

/** The columns to write for a chosen place, or null when its project does not exist. */
async function resolvePlace(
  place: JobPlaceInput,
): Promise<{ placement: 'PROJECT'; projectId: string } | { placement: 'STANDALONE'; projectId: null } | null> {
  if (place.placement === 'STANDALONE') return { placement: 'STANDALONE', projectId: null };
  const project = await prisma.project.findUnique({ where: { id: place.projectId }, select: { id: true } });
  return project ? { placement: 'PROJECT', projectId: project.id } : null;
}

function dateRange(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  t.setHours(23, 59, 59, 999);
  return { from: f, to: t };
}

type JobRow = {
  id: string;
  title: string;
  date: Date;
  incomeCents: number;
  discountCents: number;
  status: JobStatus;
  clientName: string | null;
  clientPhone: string | null;
  clientLocation: string | null;
  notes: string | null;
  serviceLineCode: string | null;
  region: string | null;
  clientSegment: ClientSegment | null;
  placement: JobPlacement;
  projectId: string | null;
  createdAt: Date;
  expenses: ExpenseRow[];
  reportedBy: { fullName: string } | null;
  project: { title: string } | null;
};

type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  amountCents: number;
  description: string | null;
  date: Date;
  jobId: string | null;
  bookingId: string | null;
  createdAt: Date;
};

function toJobDto(row: JobRow): JobDto {
  const expenses = row.expenses.map(toExpenseDto);
  const totalExpensesCents = expenses.reduce((acc, e) => acc + e.amountCents, 0);
  const actualIncomeCents = row.incomeCents - row.discountCents;
  return {
    id: row.id,
    title: row.title,
    date: row.date.toISOString().slice(0, 10),
    incomeCents: row.incomeCents,
    discountCents: row.discountCents,
    actualIncomeCents,
    status: row.status,
    reportedByName: row.reportedBy?.fullName ?? null,
    clientName: row.clientName,
    clientPhone: row.clientPhone,
    clientLocation: row.clientLocation,
    notes: row.notes,
    serviceLineCode: row.serviceLineCode,
    region: row.region,
    clientSegment: row.clientSegment,
    placement: row.placement,
    projectId: row.projectId,
    projectTitle: row.project?.title ?? null,
    expenses,
    totalExpensesCents,
    netCents: actualIncomeCents - totalExpensesCents,
    createdAt: row.createdAt.toISOString(),
  };
}

function toExpenseDto(row: ExpenseRow): ExpenseDto {
  return {
    id: row.id,
    category: row.category,
    amountCents: row.amountCents,
    description: row.description,
    date: row.date.toISOString().slice(0, 10),
    jobId: row.jobId,
    bookingId: row.bookingId,
    createdAt: row.createdAt.toISOString(),
  };
}
