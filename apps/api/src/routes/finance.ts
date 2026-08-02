import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AssetCategory,
  AssetCondition,
  DistributionStatus,
  InvestmentKind,
  JobStatus,
  MarketingChannel,
  Prisma,
} from '@prisma/client';
import type {
  AssetDto,
  AssetMaintenanceDto,
  CreateAssetInput,
  CreateAssetMaintenanceInput,
  CreateInvestmentInput,
  CreateMarketingSpendInput,
  DeclareDistributionInput,
  InvestmentDto,
  MarkDistributionPaidInput,
  MarketingSpendDto,
  ProfitDistributionDto,
  RevenueBreakdown,
  RevenueBreakdownItem,
  UnreconciledItem,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

const COUNTED_STATUSES: JobStatus[] = ['OWNER_ENTRY', 'APPROVED'];
const BASIS_POINTS_TOTAL = 10_000;

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const DateRangeSchema = z.object({ from: DateStr, to: DateStr });

// ── Schemas ─────────────────────────────────────────────────────────────────

const CHANNELS = [
  'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'GOOGLE', 'WHATSAPP', 'FLYERS', 'RADIO', 'REFERRAL', 'OTHER',
] as const;
const CATEGORIES = ['MACHINE', 'VEHICLE', 'EQUIPMENT', 'TOOL', 'IT', 'FURNITURE', 'OTHER'] as const;
const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'RETIRED'] as const;
const KINDS = ['CAPITAL_INJECTION', 'LOAN', 'GRANT', 'OTHER'] as const;

const CreateMarketingSchema = z.object({
  campaign: z.string().trim().min(1).max(200),
  channel: z.enum(CHANNELS),
  amountCents: z.number().int().positive(),
  date: DateStr,
  notes: z.string().trim().max(1000).optional(),
  leadsCount: z.number().int().nonnegative().optional(),
  bookingsCount: z.number().int().nonnegative().optional(),
  receiptRef: z.string().trim().max(200).optional(),
  receiptUrl: z.string().trim().url().max(500).optional(),
}) satisfies z.ZodType<CreateMarketingSpendInput>;

const CreateAssetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES),
  purchaseDate: DateStr,
  costCents: z.number().int().nonnegative(),
  supplier: z.string().trim().max(200).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  location: z.string().trim().max(200).optional(),
  usefulLifeMonths: z.number().int().positive().max(1200).optional(),
  salvageValueCents: z.number().int().nonnegative().optional(),
  condition: z.enum(CONDITIONS).optional(),
  notes: z.string().trim().max(1000).optional(),
  receiptRef: z.string().trim().max(200).optional(),
  receiptUrl: z.string().trim().url().max(500).optional(),
}) satisfies z.ZodType<CreateAssetInput>;

const CreateMaintenanceSchema = z.object({
  date: DateStr,
  description: z.string().trim().min(1).max(500),
  costCents: z.number().int().nonnegative().optional(),
  performedBy: z.string().trim().max(200).optional(),
  receiptRef: z.string().trim().max(200).optional(),
}) satisfies z.ZodType<CreateAssetMaintenanceInput>;

const CreateInvestmentSchema = z.object({
  source: z.string().trim().min(1).max(200),
  kind: z.enum(KINDS),
  amountCents: z.number().int().positive(),
  date: DateStr,
  purpose: z.string().trim().min(1).max(500),
  shareholderId: z.string().trim().min(1).nullable().optional(),
  reference: z.string().trim().max(200).optional(),
  documentUrl: z.string().trim().url().max(500).optional(),
}) satisfies z.ZodType<CreateInvestmentInput>;

const DeclareDistributionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  periodStart: DateStr,
  periodEnd: DateStr,
  netProfitCentsOverride: z.number().int().optional(),
}) satisfies z.ZodType<DeclareDistributionInput>;

const MarkPaidSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'CANCELLED']),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
}) satisfies z.ZodType<MarkDistributionPaidInput>;

// ── Routes ──────────────────────────────────────────────────────────────────

export const financeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireFinanceAccess);

  // ── Marketing spend ───────────────────────────────────────────────────────

  app.get('/marketing', async (req, reply) => {
    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { from, to } = dateRange(parsed.data.from, parsed.data.to);

    const rows = await prisma.marketingSpend.findMany({
      where: { date: { gte: from, lte: to } },
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { date: 'desc' },
    });
    return reply.send({ spends: rows.map(toMarketingDto) });
  });

  app.post('/marketing', async (req, reply) => {
    const parsed = CreateMarketingSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await prisma.marketingSpend.create({
      data: {
        ...parsed.data,
        channel: parsed.data.channel as MarketingChannel,
        date: new Date(parsed.data.date),
        createdById: req.auth!.sub,
      },
      include: { createdBy: { select: { fullName: true } } },
    });
    return reply.code(201).send({ spend: toMarketingDto(row) });
  });

  app.delete<{ Params: { id: string } }>('/marketing/:id', async (req, reply) => {
    const existing = await prisma.marketingSpend.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'marketing spend not found' });
    await prisma.marketingSpend.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });

  // ── Assets ────────────────────────────────────────────────────────────────

  app.get('/assets', async (_req, reply) => {
    const rows = await prisma.asset.findMany({
      include: {
        createdBy: { select: { fullName: true } },
        maintenance: {
          orderBy: { date: 'desc' },
          include: { createdBy: { select: { fullName: true } } },
        },
      },
      orderBy: { purchaseDate: 'desc' },
    });
    return reply.send({ assets: rows.map(toAssetDto) });
  });

  app.post('/assets', async (req, reply) => {
    const parsed = CreateAssetSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await prisma.asset.create({
      data: {
        ...parsed.data,
        category: parsed.data.category as AssetCategory,
        condition: (parsed.data.condition ?? 'GOOD') as AssetCondition,
        purchaseDate: new Date(parsed.data.purchaseDate),
        createdById: req.auth!.sub,
      },
      include: {
        createdBy: { select: { fullName: true } },
        maintenance: { include: { createdBy: { select: { fullName: true } } } },
      },
    });
    return reply.code(201).send({ asset: toAssetDto(row) });
  });

  app.patch<{ Params: { id: string } }>('/assets/:id', async (req, reply) => {
    const parsed = CreateAssetSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'asset not found' });

    const { purchaseDate, category, condition, ...rest } = parsed.data;
    const row = await prisma.asset.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(category !== undefined && { category: category as AssetCategory }),
        ...(condition !== undefined && { condition: condition as AssetCondition }),
        ...(purchaseDate !== undefined && { purchaseDate: new Date(purchaseDate) }),
        // Retiring an asset stamps the date, un-retiring clears it.
        ...(condition === 'RETIRED' && !existing.retiredAt ? { retiredAt: new Date() } : {}),
        ...(condition !== undefined && condition !== 'RETIRED' ? { retiredAt: null } : {}),
      },
      include: {
        createdBy: { select: { fullName: true } },
        maintenance: {
          orderBy: { date: 'desc' },
          include: { createdBy: { select: { fullName: true } } },
        },
      },
    });
    return reply.send({ asset: toAssetDto(row) });
  });

  app.delete<{ Params: { id: string } }>('/assets/:id', async (req, reply) => {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'asset not found' });
    await prisma.asset.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>('/assets/:id/maintenance', async (req, reply) => {
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!asset) return reply.code(404).send({ error: 'asset not found' });

    const parsed = CreateMaintenanceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await prisma.assetMaintenance.create({
      data: {
        ...parsed.data,
        date: new Date(parsed.data.date),
        assetId: asset.id,
        createdById: req.auth!.sub,
      },
    });

    const row = await prisma.asset.findUniqueOrThrow({
      where: { id: asset.id },
      include: {
        createdBy: { select: { fullName: true } },
        maintenance: {
          orderBy: { date: 'desc' },
          include: { createdBy: { select: { fullName: true } } },
        },
      },
    });
    return reply.code(201).send({ asset: toAssetDto(row) });
  });

  // ── Investments ───────────────────────────────────────────────────────────

  app.get('/investments', async (_req, reply) => {
    const rows = await prisma.investment.findMany({
      include: {
        createdBy: { select: { fullName: true } },
        shareholder: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });
    return reply.send({ investments: rows.map(toInvestmentDto) });
  });

  app.post('/investments', async (req, reply) => {
    const parsed = CreateInvestmentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await prisma.investment.create({
      data: {
        ...parsed.data,
        kind: parsed.data.kind as InvestmentKind,
        shareholderId: parsed.data.shareholderId ?? null,
        date: new Date(parsed.data.date),
        createdById: req.auth!.sub,
      },
      include: {
        createdBy: { select: { fullName: true } },
        shareholder: { select: { name: true } },
      },
    });
    return reply.code(201).send({ investment: toInvestmentDto(row) });
  });

  app.delete<{ Params: { id: string } }>('/investments/:id', async (req, reply) => {
    const existing = await prisma.investment.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'investment not found' });
    await prisma.investment.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });

  // ── Revenue breakdown ─────────────────────────────────────────────────────

  app.get('/revenue-breakdown', async (req, reply) => {
    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { from, to } = dateRange(parsed.data.from, parsed.data.to);

    const jobs = await prisma.job.findMany({
      where: { date: { gte: from, lte: to }, status: { in: COUNTED_STATUSES } },
      select: {
        incomeCents: true,
        discountCents: true,
        serviceLineCode: true,
        region: true,
        clientSegment: true,
      },
    });

    const tally = (pick: (j: (typeof jobs)[number]) => string | null, unknownLabel: string) => {
      const map = new Map<string, RevenueBreakdownItem>();
      for (const job of jobs) {
        const key = pick(job) ?? '__unknown';
        const label = key === '__unknown' ? unknownLabel : humanise(key);
        const entry = map.get(key) ?? { key, label, incomeCents: 0, jobCount: 0 };
        entry.incomeCents += job.incomeCents - job.discountCents;
        entry.jobCount += 1;
        map.set(key, entry);
      }
      return [...map.values()].sort((a, b) => b.incomeCents - a.incomeCents);
    };

    const breakdown: RevenueBreakdown = {
      byServiceLine: tally((j) => j.serviceLineCode, 'Unclassified'),
      byRegion: tally((j) => j.region, 'Unspecified'),
      bySegment: tally((j) => j.clientSegment, 'Unspecified'),
      totalIncomeCents: jobs.reduce((acc, j) => acc + j.incomeCents - j.discountCents, 0),
      fromDate: parsed.data.from,
      toDate: parsed.data.to,
    };
    return reply.send({ breakdown });
  });

  // ── Reconciliation: what is missing a source document ─────────────────────

  app.get('/unreconciled', async (req, reply) => {
    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { from, to } = dateRange(parsed.data.from, parsed.data.to);

    const [expenses, marketing] = await Promise.all([
      prisma.expense.findMany({
        where: { date: { gte: from, lte: to }, reconciled: false },
        orderBy: { date: 'desc' },
      }),
      prisma.marketingSpend.findMany({
        where: { date: { gte: from, lte: to }, reconciled: false },
        orderBy: { date: 'desc' },
      }),
    ]);

    const items: UnreconciledItem[] = [
      ...expenses.map((e) => ({
        id: e.id,
        kind: 'EXPENSE' as const,
        date: isoDate(e.date),
        description: e.description ?? humanise(e.category),
        amountCents: e.amountCents,
        hasReceipt: Boolean(e.receiptRef || e.receiptUrl),
      })),
      ...marketing.map((m) => ({
        id: m.id,
        kind: 'MARKETING' as const,
        date: isoDate(m.date),
        description: `${m.campaign} (${humanise(m.channel)})`,
        amountCents: m.amountCents,
        hasReceipt: Boolean(m.receiptRef || m.receiptUrl),
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    return reply.send({ items });
  });

  app.patch<{ Params: { kind: string; id: string } }>('/reconcile/:kind/:id', async (req, reply) => {
    const BodySchema = z.object({
      reconciled: z.boolean().optional(),
      receiptRef: z.string().trim().max(200).nullable().optional(),
      receiptUrl: z.string().trim().url().max(500).nullable().optional(),
    });
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const data = parsed.data;
    if (req.params.kind === 'EXPENSE') {
      const row = await prisma.expense.findUnique({ where: { id: req.params.id } });
      if (!row) return reply.code(404).send({ error: 'expense not found' });
      await prisma.expense.update({ where: { id: row.id }, data });
    } else if (req.params.kind === 'MARKETING') {
      const row = await prisma.marketingSpend.findUnique({ where: { id: req.params.id } });
      if (!row) return reply.code(404).send({ error: 'marketing spend not found' });
      await prisma.marketingSpend.update({ where: { id: row.id }, data });
    } else {
      return reply.code(400).send({ error: 'unknown record kind' });
    }
    return reply.send({ ok: true });
  });

  // ── Profit distributions (cap-table holders and the owner only) ───────────

  app.get('/distributions', { preHandler: requireEquityAccess }, async (_req, reply) => {
    const rows = await prisma.profitDistribution.findMany({
      include: {
        shareholder: { select: { name: true } },
        createdBy: { select: { fullName: true } },
      },
      orderBy: [{ periodStart: 'desc' }, { amountCents: 'desc' }],
    });
    return reply.send({ distributions: rows.map(toDistributionDto) });
  });

  /**
   * Declare a period: computes net profit for the range, splits it across the
   * current cap table, and writes one row per shareholder. The stake and the
   * profit figure are snapshotted so later cap-table edits cannot rewrite a
   * declared payout.
   */
  app.post('/distributions/declare', { preHandler: requireEquityAccess }, async (req, reply) => {
    const parsed = DeclareDistributionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { label, periodStart, periodEnd, netProfitCentsOverride } = parsed.data;

    if (periodEnd < periodStart) {
      return reply.code(400).send({ error: 'periodEnd must be on or after periodStart' });
    }

    const existing = await prisma.profitDistribution.findFirst({
      where: { periodStart: new Date(periodStart), periodEnd: new Date(periodEnd) },
    });
    if (existing) {
      return reply.code(409).send({ error: 'That period has already been declared.' });
    }

    const shareholders = await prisma.shareholder.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (shareholders.length === 0) {
      return reply.code(400).send({ error: 'The cap table is empty — add shareholders first.' });
    }

    const netProfitCents = netProfitCentsOverride ?? (await netProfitForPeriod(periodStart, periodEnd));
    const shares = allocate(netProfitCents, shareholders.map((s) => s.basisPoints));

    await prisma.profitDistribution.createMany({
      data: shareholders.map((s, i) => ({
        label,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        shareholderId: s.id,
        netProfitCents,
        basisPoints: s.basisPoints,
        amountCents: shares[i]!,
        createdById: req.auth!.sub,
      })),
    });

    const rows = await prisma.profitDistribution.findMany({
      where: { periodStart: new Date(periodStart), periodEnd: new Date(periodEnd) },
      include: {
        shareholder: { select: { name: true } },
        createdBy: { select: { fullName: true } },
      },
      orderBy: { amountCents: 'desc' },
    });
    return reply.code(201).send({ distributions: rows.map(toDistributionDto) });
  });

  app.patch<{ Params: { id: string } }>(
    '/distributions/:id',
    { preHandler: requireEquityAccess },
    async (req, reply) => {
      const parsed = MarkPaidSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const existing = await prisma.profitDistribution.findUnique({ where: { id: req.params.id } });
      if (!existing) return reply.code(404).send({ error: 'distribution not found' });

      const row = await prisma.profitDistribution.update({
        where: { id: req.params.id },
        data: {
          status: parsed.data.status as DistributionStatus,
          ...(parsed.data.reference !== undefined && { reference: parsed.data.reference }),
          ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
          paidAt: parsed.data.status === 'PAID' ? (existing.paidAt ?? new Date()) : null,
        },
        include: {
          shareholder: { select: { name: true } },
          createdBy: { select: { fullName: true } },
        },
      });
      return reply.send({ distribution: toDistributionDto(row) });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/distributions/:id',
    { preHandler: requireEquityAccess },
    async (req, reply) => {
      const existing = await prisma.profitDistribution.findUnique({ where: { id: req.params.id } });
      if (!existing) return reply.code(404).send({ error: 'distribution not found' });
      if (existing.status === 'PAID') {
        return reply.code(409).send({ error: 'A paid distribution cannot be deleted — cancel it instead.' });
      }
      await prisma.profitDistribution.delete({ where: { id: req.params.id } });
      return reply.send({ ok: true });
    },
  );
};

// ── Access control ──────────────────────────────────────────────────────────

/** Finance data: the owner, admins, the financial manager, and shareholders. */
async function requireFinanceAccess(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const user = await prisma.user.findUnique({
    where: { id: req.auth.sub },
    select: { isOwner: true, role: true },
  });
  if (!user) return reply.code(401).send({ error: 'unauthorized' });

  const allowed = user.isOwner || ['ADMIN', 'FINANCIAL_MANAGER', 'SHAREHOLDER'].includes(user.role);
  if (!allowed) return reply.code(403).send({ error: 'finance access required' });
}

/**
 * Equity data (who is owed what). Access follows the person: the owner, or
 * anyone actually on the cap table — a role alone never grants it, so a future
 * non-shareholder ops hire cannot see the ledger.
 */
async function requireEquityAccess(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const user = await prisma.user.findUnique({
    where: { id: req.auth.sub },
    select: { isOwner: true, shareholder: { select: { id: true } } },
  });
  if (!user) return reply.code(401).send({ error: 'unauthorized' });
  if (!user.isOwner && !user.shareholder) {
    return reply.code(403).send({ error: 'shareholder access required' });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function dateRange(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  t.setHours(23, 59, 59, 999);
  return { from: f, to: t };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "POST_BUILD" / "post_build" → "Post build". */
function humanise(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Net profit (counted job income less discounts and expenses) over a period. */
async function netProfitForPeriod(from: string, to: string): Promise<number> {
  const range = dateRange(from, to);
  const [jobs, expenses] = await Promise.all([
    prisma.job.aggregate({
      where: { date: { gte: range.from, lte: range.to }, status: { in: COUNTED_STATUSES } },
      _sum: { incomeCents: true, discountCents: true },
    }),
    prisma.expense.aggregate({
      where: { date: { gte: range.from, lte: range.to }, job: { status: { in: COUNTED_STATUSES } } },
      _sum: { amountCents: true },
    }),
  ]);
  const income = (jobs._sum.incomeCents ?? 0) - (jobs._sum.discountCents ?? 0);
  return income - (expenses._sum.amountCents ?? 0);
}

/**
 * Split `netCents` across stakes in whole cents, giving leftover cents to the
 * largest fractional parts so the shares reconcile to the whole exactly.
 * Mirrors the allocation used by the equity overview.
 */
function allocate(netCents: number, stakes: number[]): number[] {
  const total = stakes.reduce((acc, bp) => acc + bp, 0);
  if (stakes.length === 0 || total === 0) return stakes.map(() => 0);

  const distributable = Math.round((netCents * total) / BASIS_POINTS_TOTAL);
  const exact = stakes.map((bp) => (netCents * bp) / BASIS_POINTS_TOTAL);
  const shares = exact.map((v) => Math.floor(v));

  const leftover = distributable - shares.reduce((acc, v) => acc + v, 0);
  const byFraction = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < leftover; k += 1) {
    const target = byFraction[k % byFraction.length]!;
    shares[target.i] = shares[target.i]! + 1;
  }
  return shares;
}

// ── DTO mappers ─────────────────────────────────────────────────────────────

type WithCreator = { createdBy: { fullName: string } | null; createdAt: Date; updatedAt: Date };

function provenance(row: WithCreator) {
  return {
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type MarketingRow = Prisma.MarketingSpendGetPayload<{ include: { createdBy: { select: { fullName: true } } } }>;

function toMarketingDto(row: MarketingRow): MarketingSpendDto {
  return {
    id: row.id,
    campaign: row.campaign,
    channel: row.channel,
    amountCents: row.amountCents,
    date: isoDate(row.date),
    notes: row.notes,
    leadsCount: row.leadsCount,
    bookingsCount: row.bookingsCount,
    receiptRef: row.receiptRef,
    receiptUrl: row.receiptUrl,
    reconciled: row.reconciled,
    costPerBookingCents: row.bookingsCount ? Math.round(row.amountCents / row.bookingsCount) : null,
    ...provenance(row),
  };
}

type AssetRow = Prisma.AssetGetPayload<{
  include: {
    createdBy: { select: { fullName: true } };
    maintenance: { include: { createdBy: { select: { fullName: true } } } };
  };
}>;

function toAssetDto(row: AssetRow): AssetDto {
  const maintenance: AssetMaintenanceDto[] = row.maintenance.map((m) => ({
    id: m.id,
    date: isoDate(m.date),
    description: m.description,
    costCents: m.costCents,
    performedBy: m.performedBy,
    receiptRef: m.receiptRef,
    createdByName: m.createdBy?.fullName ?? null,
    createdAt: m.createdAt.toISOString(),
  }));

  // Straight-line: the depreciable amount spread evenly over the useful life,
  // stopping once fully depreciated.
  let accumulated = 0;
  if (row.usefulLifeMonths && row.usefulLifeMonths > 0) {
    const months = monthsBetween(row.purchaseDate, new Date());
    const depreciable = Math.max(0, row.costCents - row.salvageValueCents);
    const elapsed = Math.min(Math.max(months, 0), row.usefulLifeMonths);
    accumulated = Math.round((depreciable * elapsed) / row.usefulLifeMonths);
  }

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    purchaseDate: isoDate(row.purchaseDate),
    costCents: row.costCents,
    supplier: row.supplier,
    serialNumber: row.serialNumber,
    location: row.location,
    usefulLifeMonths: row.usefulLifeMonths,
    salvageValueCents: row.salvageValueCents,
    condition: row.condition,
    retiredAt: row.retiredAt ? row.retiredAt.toISOString() : null,
    notes: row.notes,
    receiptRef: row.receiptRef,
    receiptUrl: row.receiptUrl,
    accumulatedDepreciationCents: accumulated,
    bookValueCents: row.costCents - accumulated,
    maintenance,
    totalMaintenanceCents: maintenance.reduce((acc, m) => acc + m.costCents, 0),
    ...provenance(row),
  };
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

type InvestmentRow = Prisma.InvestmentGetPayload<{
  include: { createdBy: { select: { fullName: true } }; shareholder: { select: { name: true } } };
}>;

function toInvestmentDto(row: InvestmentRow): InvestmentDto {
  return {
    id: row.id,
    source: row.source,
    kind: row.kind,
    amountCents: row.amountCents,
    date: isoDate(row.date),
    purpose: row.purpose,
    shareholderId: row.shareholderId,
    shareholderName: row.shareholder?.name ?? null,
    reference: row.reference,
    documentUrl: row.documentUrl,
    ...provenance(row),
  };
}

type DistributionRow = Prisma.ProfitDistributionGetPayload<{
  include: { createdBy: { select: { fullName: true } }; shareholder: { select: { name: true } } };
}>;

function toDistributionDto(row: DistributionRow): ProfitDistributionDto {
  return {
    id: row.id,
    label: row.label,
    periodStart: isoDate(row.periodStart),
    periodEnd: isoDate(row.periodEnd),
    shareholderId: row.shareholderId,
    shareholderName: row.shareholder.name,
    netProfitCents: row.netProfitCents,
    basisPoints: row.basisPoints,
    amountCents: row.amountCents,
    status: row.status,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    reference: row.reference,
    notes: row.notes,
    ...provenance(row),
  };
}
