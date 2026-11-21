import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// An expense on a job can carry a quantity, a unit, a price for one and a
// receipt number. The owner adds one on Jobs & costs and a supervisor on a job
// report; both go through the same checks. The amount is still the only figure
// any total adds up, so nothing here changes what a job, a month or a share comes to.

/** A date as the database gives a job's or a cost's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const job = (id: string, ymd: string, incomeCents: number, over: object = {}) => ({
  id, title: `Job ${id}`, date: day(ymd), incomeCents, discountCents: 0, status: 'OWNER_ENTRY', placement: 'STANDALONE',
  projectId: null, clientName: null, clientPhone: null, clientLocation: null, notes: null, serviceLineCode: null,
  region: null, clientSegment: null, createdById: 'owner', reportedById: null, createdAt: day(ymd), ...over,
});

/** An expense as every expense was stored before the detail columns: an amount and nothing to explain it. */
const cost = (id: string, jobId: string, category: string, amountCents: number, ymd: string) => ({
  id, jobId, bookingId: null, category, amountCents, description: null, date: day(ymd), createdAt: day(ymd),
  createdById: 'owner', quantityThousandths: null, unit: null, unitPriceCents: null, receiptRef: null,
});

const OWNER_EXPENSES = '/admin/financials/jobs/novJob/expenses';
const NOVEMBER = 'from=2026-11-01&to=2026-11-30';

/** 4 litres of bleach at KSh 250: KSh 1,000. */
const BLEACH = {
  category: 'MATERIALS', amountCents: 100_000, date: '2026-11-21', description: 'Bleach',
  quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000, receiptRef: 'QK7H2M4X1P',
};
const LUMP_SUM = { category: 'TRANSPORT', amountCents: 50_000, date: '2026-11-21', description: 'Matatu to Karen' };

/** A request to the job reports routes, as the given user. */
async function reportsAs(userId: string, method: 'GET' | 'POST', url: string, payload?: object) {
  const { signAccessToken } = await import('../auth/jwt.js');
  const { jobReportsRoutes } = await import('./jobReports.js');
  const server = Fastify();
  await server.register(jobReportsRoutes, { prefix: '/admin/job-reports' });
  const { token } = await signAccessToken(userId, t.users.find((u) => u.id === userId)!.role);
  return server.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}

const summary = async () => (await as('owner', 'GET', `/admin/financials/summary?${NOVEMBER}`)).json().summary;
const novJob = async () =>
  (await as('owner', 'GET', `/admin/financials/jobs?${NOVEMBER}`)).json().jobs.find((j: { id: string }) => j.id === 'novJob');

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [
    { id: 'owner', fullName: 'Olive Owner', role: 'ADMIN', isOwner: true },
    { id: 'supervisor', fullName: 'Sam Supervisor', role: 'CLEANING_SUPERVISOR', isOwner: false },
  ];
  t.jobs = [
    // KSh 20,000 charged, with KSh 3,000 of materials entered before the detail columns.
    job('novJob', '2026-11-20', 2_000_000),
    // A supervisor's report, waiting for approval.
    job('report', '2026-11-19', 800_000, { status: 'PENDING', createdById: 'supervisor', reportedById: 'supervisor', placement: 'UNSORTED' }),
  ];
  t.expenses = [cost('old', 'novJob', 'MATERIALS', 300_000, '2026-11-20')];
});

describe('POST /admin/financials/jobs/:id/expenses', () => {
  it('saves an expense with its quantity, unit, price for one and receipt number', async () => {
    const res = await as('owner', 'POST', OWNER_EXPENSES, BLEACH);

    expect(res.statusCode).toBe(201);
    expect(res.json().expense).toMatchObject({
      category: 'MATERIALS', amountCents: 100_000, description: 'Bleach', date: '2026-11-21', jobId: 'novJob',
      quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000, receiptRef: 'QK7H2M4X1P',
    });
    expect(t.expenses.at(-1)).toMatchObject({
      jobId: 'novJob', createdById: 'owner', amountCents: 100_000,
      quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000, receiptRef: 'QK7H2M4X1P',
    });
  });

  it('still saves an expense typed as one amount, with nothing new on it', async () => {
    const res = await as('owner', 'POST', OWNER_EXPENSES, LUMP_SUM);

    expect(res.statusCode).toBe(201);
    const { id, createdAt, ...expense } = res.json().expense;
    expect(expense).toStrictEqual({
      category: 'TRANSPORT', amountCents: 50_000, description: 'Matatu to Karen', date: '2026-11-21',
      jobId: 'novJob', bookingId: null,
    });
    expect(t.expenses.at(-1)).toMatchObject({ quantityThousandths: null, unit: null, unitPriceCents: null, receiptRef: null });
  });

  it('saves a part of a unit at a price with cents, to the nearest cent', async () => {
    // Two and a half kilos at KSh 120.50: KSh 301.25.
    const res = await as('owner', 'POST', OWNER_EXPENSES, {
      category: 'MATERIALS', date: '2026-11-21', quantityThousandths: 2_500, unit: 'kg', unitPriceCents: 12_050, amountCents: 30_125,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().expense).toMatchObject({ amountCents: 30_125, quantityThousandths: 2_500, unitPriceCents: 12_050 });
  });

  it.each([
    ['an amount that is not the quantity times the price', { ...BLEACH, amountCents: 120_000 }, 'The amount must be the quantity times the price for one.'],
    ['a quantity with no price', { ...LUMP_SUM, quantityThousandths: 4_000 }, 'Give both a quantity and a price for one, or leave both empty.'],
    ['a price with no quantity', { ...LUMP_SUM, unitPriceCents: 25_000 }, 'Give both a quantity and a price for one, or leave both empty.'],
    ['a unit with no quantity', { ...LUMP_SUM, unit: 'litres' }, 'A unit needs a quantity and a price for one.'],
    ['a quantity of zero', { ...BLEACH, quantityThousandths: 0 }, 'The quantity must be more than zero, with at most three decimal places.'],
    ['a quantity below zero', { ...BLEACH, quantityThousandths: -4_000 }, 'The quantity must be more than zero, with at most three decimal places.'],
    ['a price of zero', { ...BLEACH, unitPriceCents: 0 }, 'The price for one must be more than zero.'],
    ['a price below zero', { ...BLEACH, unitPriceCents: -25_000 }, 'The price for one must be more than zero.'],
    ['an amount of zero', { ...LUMP_SUM, amountCents: 0 }, 'The amount must be more than zero, and at most KSh 20 million.'],
    ['an amount below zero', { ...LUMP_SUM, amountCents: -50_000 }, 'The amount must be more than zero, and at most KSh 20 million.'],
  ])('refuses %s, in a sentence, and saves nothing', async (_what, body, sentence) => {
    const res = await as('owner', 'POST', OWNER_EXPENSES, body);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: sentence });
    expect(t.expenses).toHaveLength(1);
  });

  it('answers 404 for a job that does not exist', async () => {
    const res = await as('owner', 'POST', '/admin/financials/jobs/nope/expenses', BLEACH);

    expect(res.statusCode).toBe(404);
    expect(t.expenses).toHaveLength(1);
  });
});

describe('the figures', () => {
  it('an expense entered before the detail columns is listed and added up exactly as before', async () => {
    expect((await novJob()).expenses).toStrictEqual([
      {
        id: 'old', category: 'MATERIALS', amountCents: 300_000, description: null, date: '2026-11-20',
        jobId: 'novJob', bookingId: null, createdAt: '2026-11-20T00:00:00.000Z',
      },
    ]);
    expect(await novJob()).toMatchObject({ totalExpensesCents: 300_000, netCents: 1_700_000 });
    expect(await summary()).toMatchObject({ incomeCents: 2_000_000, totalExpensesCents: 300_000, netCents: 1_700_000 });
  });

  it('a detailed expense counts by its amount alone, the same as a lump sum of that amount', async () => {
    await as('owner', 'POST', OWNER_EXPENSES, BLEACH);
    const detailed = { job: await novJob(), summary: await summary() };

    t.expenses = t.expenses.slice(0, 1);
    await as('owner', 'POST', OWNER_EXPENSES, { category: 'MATERIALS', amountCents: 100_000, date: '2026-11-21' });
    const lumpSum = { job: await novJob(), summary: await summary() };

    // KSh 3,000 before and KSh 1,000 now: KSh 4,000 spent, KSh 16,000 left of KSh 20,000.
    expect(detailed.job).toMatchObject({ totalExpensesCents: 400_000, netCents: 1_600_000 });
    expect(detailed.summary).toMatchObject({ totalExpensesCents: 400_000, netCents: 1_600_000 });
    expect(detailed.summary.expensesByCategoryCents.MATERIALS).toBe(400_000);
    expect(detailed.summary).toStrictEqual(lumpSum.summary);
    expect(detailed.job.totalExpensesCents).toBe(lumpSum.job.totalExpensesCents);
    expect(detailed.job.netCents).toBe(lumpSum.job.netCents);
  });

  it('the job list shows a detailed expense with its quantity, unit, price and receipt number', async () => {
    await as('owner', 'POST', OWNER_EXPENSES, BLEACH);

    expect((await novJob()).expenses).toEqual(expect.arrayContaining([
      expect.objectContaining({ description: 'Bleach', quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000, receiptRef: 'QK7H2M4X1P' }),
    ]));
  });
});

describe('POST /admin/job-reports/:id/expenses', () => {
  it('a supervisor adds a detailed expense to their own waiting report, and sees it on the report', async () => {
    const res = await reportsAs('supervisor', 'POST', '/admin/job-reports/report/expenses', BLEACH);

    expect(res.statusCode).toBe(201);
    expect(res.json().expense).toMatchObject({
      amountCents: 100_000, quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000, receiptRef: 'QK7H2M4X1P',
    });
    expect(t.expenses.at(-1)).toMatchObject({ jobId: 'report', createdById: 'supervisor', quantityThousandths: 4_000 });

    const [report] = (await reportsAs('supervisor', 'GET', '/admin/job-reports')).json().reports;
    expect(report).toMatchObject({ totalExpensesCents: 100_000, netCents: 700_000 });
    expect(report.expenses[0]).toMatchObject({ quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000 });
  });

  it('the owner sees the supervisor\'s detail on the waiting report', async () => {
    await reportsAs('supervisor', 'POST', '/admin/job-reports/report/expenses', BLEACH);

    const [report] = (await as('owner', 'GET', '/admin/financials/reports')).json().reports;
    expect(report.expenses[0]).toMatchObject({
      description: 'Bleach', amountCents: 100_000, quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000, receiptRef: 'QK7H2M4X1P',
    });
  });

  it('still takes an expense typed as one amount', async () => {
    const res = await reportsAs('supervisor', 'POST', '/admin/job-reports/report/expenses', LUMP_SUM);

    expect(res.statusCode).toBe(201);
    const { id, createdAt, ...expense } = res.json().expense;
    expect(expense).toStrictEqual({
      category: 'TRANSPORT', amountCents: 50_000, description: 'Matatu to Karen', date: '2026-11-21',
      jobId: 'report', bookingId: null,
    });
  });

  it('applies the same checks as the owner\'s form', async () => {
    const wrongTotal = await reportsAs('supervisor', 'POST', '/admin/job-reports/report/expenses', { ...BLEACH, amountCents: 120_000 });
    const noPrice = await reportsAs('supervisor', 'POST', '/admin/job-reports/report/expenses', { ...LUMP_SUM, quantityThousandths: 4_000 });
    const belowZero = await reportsAs('supervisor', 'POST', '/admin/job-reports/report/expenses', { ...BLEACH, quantityThousandths: -1 });

    expect(wrongTotal.statusCode).toBe(400);
    expect(wrongTotal.json()).toEqual({ error: 'The amount must be the quantity times the price for one.' });
    expect(noPrice.statusCode).toBe(400);
    expect(belowZero.statusCode).toBe(400);
    expect(t.expenses).toHaveLength(1);
  });
});
