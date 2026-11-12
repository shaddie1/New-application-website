import { beforeEach, describe, expect, it, vi } from 'vitest';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// The equity overview carries the requested period's income, expenses and job
// count beside its net profit, so Ownership can show "This month" from the one
// request it already makes.

/** A date as the database gives it: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const holder = (id: string, name: string, basisPoints: number, sortOrder: number) => ({
  id, name, title: null, kind: 'INDIVIDUAL', basisPoints, notes: null, userId: null, sortOrder, removedAt: null,
  createdAt: day('2026-07-15'), updatedAt: day('2026-07-15'),
});

const job = (id: string, ymd: string, status: string, incomeCents: number, discountCents = 0) => ({
  id, title: `Job ${id}`, date: day(ymd), incomeCents, discountCents, status, placement: 'STANDALONE', projectId: null,
  createdById: 'owner',
});

const cost = (id: string, jobId: string, ymd: string, amountCents: number) => ({
  id, jobId, category: 'MATERIALS', amountCents, description: null, date: day(ymd),
});

const NOVEMBER = '/admin/financials/equity?from=2026-11-01&to=2026-11-30';

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [{ id: 'owner', fullName: 'Owner', role: 'ADMIN', isOwner: true }];
  t.shareholders = [
    holder('h1', 'OnyxHawk Holdings', 4000, 0),
    holder('h2', 'Amina Yusuf', 3000, 1),
    holder('h3', 'Brian Otieno', 3000, 2),
  ];
  t.jobs = [
    // November: two jobs that count and a report still waiting for approval.
    job('nov1', '2026-11-05', 'OWNER_ENTRY', 1_000_000, 100_000),
    job('nov2', '2026-11-20', 'APPROVED', 500_000),
    job('novPending', '2026-11-10', 'PENDING', 700_000),
    // October: counts for all time only.
    job('oct1', '2026-10-15', 'OWNER_ENTRY', 400_000),
  ];
  t.expenses = [
    cost('c1', 'nov1', '2026-11-05', 200_000),
    cost('c2', 'nov2', '2026-11-21', 50_000),
    cost('c3', 'novPending', '2026-11-10', 300_000),
    cost('c4', 'oct1', '2026-10-15', 100_000),
  ];
});

describe('GET /admin/financials/equity', () => {
  it("gives the period's income, expenses and job count, leaving out a pending job and its costs", async () => {
    const res = await as('owner', 'GET', NOVEMBER);

    expect(res.statusCode).toBe(200);
    const { overview } = res.json();
    // 10,000 less a 1,000 discount, plus 5,000. The pending 7,000 is not income.
    expect(overview.periodIncomeCents).toBe(1_400_000);
    // 2,000 plus 500. The pending job's 3,000 is not an expense.
    expect(overview.periodExpensesCents).toBe(250_000);
    expect(overview.periodProjects).toBe(2);
  });

  it("keeps the period's net profit as income less expenses, and the shares split from it", async () => {
    const { overview } = (await as('owner', 'GET', NOVEMBER)).json();

    expect(overview.periodNetCents).toBe(1_150_000);
    expect(overview.periodIncomeCents - overview.periodExpensesCents).toBe(overview.periodNetCents);
    expect(
      overview.allocations.map((a: { shareholder: { id: string }; periodShareCents: number }) =>
        [a.shareholder.id, a.periodShareCents]),
    ).toEqual([
      ['h1', 460_000],
      ['h2', 345_000],
      ['h3', 345_000],
    ]);
    expect(overview.unallocatedPeriodCents).toBe(0);
  });

  it('leaves the all-time figures as they were', async () => {
    const { overview } = (await as('owner', 'GET', NOVEMBER)).json();

    expect(overview.allTime).toEqual({
      totalProjects: 3,
      totalIncomeCents: 1_800_000,
      totalExpensesCents: 350_000,
      totalNetCents: 1_450_000,
      firstJobDate: '2026-10-15',
      lastJobDate: '2026-11-20',
    });
    expect(
      overview.allocations.map((a: { shareholder: { id: string }; allTimeShareCents: number }) =>
        [a.shareholder.id, a.allTimeShareCents]),
    ).toEqual([
      ['h1', 580_000],
      ['h2', 435_000],
      ['h3', 435_000],
    ]);
  });

  it('gives zeros for a period with no jobs', async () => {
    const { overview } = (await as('owner', 'GET', '/admin/financials/equity?from=2026-09-01&to=2026-09-30')).json();

    expect(overview.periodIncomeCents).toBe(0);
    expect(overview.periodExpensesCents).toBe(0);
    expect(overview.periodProjects).toBe(0);
    expect(overview.periodNetCents).toBe(0);
  });

  it("counts a cost dated the month after its job in the cost's own month, not the job's", async () => {
    // KSh 700 spent on 3 November on the job done on 15 October.
    t.expenses.push(cost('c5', 'oct1', '2026-11-03', 70_000));

    const november = (await as('owner', 'GET', NOVEMBER)).json().overview;
    const october = (await as('owner', 'GET', '/admin/financials/equity?from=2026-10-01&to=2026-10-31')).json().overview;

    // November: its own 2,000 and 500, and the 700. Its income and its job count do not move.
    expect(november.periodExpensesCents).toBe(320_000);
    expect(november.periodIncomeCents).toBe(1_400_000);
    expect(november.periodProjects).toBe(2);
    expect(november.periodNetCents).toBe(1_080_000);
    // October: the 4,000 job and the 1,000 spent in October, without the 700.
    expect(october.periodIncomeCents).toBe(400_000);
    expect(october.periodExpensesCents).toBe(100_000);
    expect(october.periodProjects).toBe(1);
    expect(october.periodNetCents).toBe(300_000);
  });
});
