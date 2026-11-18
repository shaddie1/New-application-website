import { beforeEach, describe, expect, it, vi } from 'vitest';

import { contractLines, type MoneyJob } from '../projectMoney/figures.js';
import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

/** A date as the database gives a job's or a cost's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const job = (id: string, date: string, incomeCents: number, over: object = {}) => ({
  id, title: `Job ${id}`, date: day(date), incomeCents, discountCents: 0, status: 'OWNER_ENTRY',
  placement: 'UNSORTED', projectId: null, createdById: 'owner', ...over,
});
const cost = (id: string, jobId: string | null, category: string, amountCents: number, date: string, over: object = {}) => ({
  id, jobId, bookingId: null, category, amountCents, date: day(date), createdById: 'owner', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [{ id: 'owner', fullName: 'Owner', role: 'ADMIN', isOwner: true }];
  t.projects = [{ id: 'pA', title: 'Bank branch' }, { id: 'pB', title: 'Clinic' }];
  t.jobs = [
    job('j1', '2026-03-12', 5_000_000, { placement: 'PROJECT', projectId: 'pA' }),
    // Discounted: KSh 30,000 typed, KSh 5,000 off.
    job('j2', '2026-04-15', 3_000_000, { discountCents: 500_000, status: 'APPROVED', placement: 'PROJECT', projectId: 'pB' }),
    job('j3', '2026-01-10', 800_000, { placement: 'STANDALONE' }),
    // Dated on the last day of a month, and the latest counted job.
    job('j4', '2026-05-31', 1_500_000, { discountCents: 100_000, status: 'APPROVED' }),
    // Waiting for approval, and earlier than every counted job.
    job('j5', '2025-12-01', 9_000_000, { status: 'PENDING' }),
  ];
  t.expenses = [
    cost('e1', 'j1', 'MATERIALS', 1_200_000, '2026-04-02'),
    cost('e2', 'j1', 'TRANSPORT', 300_000, '2026-03-12'),
    cost('e3', 'j2', 'EMPLOYEE_PAY', 1_000_000, '2026-04-15'),
    cost('e4', 'j3', 'LUNCH', 50_000, '2026-01-10'),
    cost('e5', 'j4', 'MISCELLANEOUS', 200_000, '2026-05-31'),
    cost('e6', 'j5', 'MATERIALS', 4_000_000, '2025-12-01'),
    // Tied to a booking, with no job.
    cost('e7', null, 'MATERIALS', 700_000, '2026-02-01', { bookingId: 'b1' }),
  ];
});

describe('GET /admin/financials/totals', () => {
  it('returns the all-time totals with the same values and field names as before', async () => {
    const res = await as('owner', 'GET', '/admin/financials/totals');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      totals: {
        totalProjects: 4,
        totalIncomeCents: 9_700_000, // 5,000,000 + 2,500,000 + 800,000 + 1,400,000
        totalExpensesCents: 2_750_000, // 1,200,000 + 300,000 + 1,000,000 + 50,000 + 200,000
        totalNetCents: 6_950_000,
        firstJobDate: '2026-01-10',
        lastJobDate: '2026-05-31',
      },
    });
  });

  it('equals the totals line of the contracts table worked out from the same rows', async () => {
    const rows = t.jobs.map((j) => ({ ...j, expenses: t.expenses.filter((e) => e.jobId === j.id) })) as MoneyJob[];
    const line = contractLines(rows, t.projects.map((p) => p.id)).totals;

    const { totals } = (await as('owner', 'GET', '/admin/financials/totals')).json();

    expect({
      totalProjects: totals.totalProjects,
      totalIncomeCents: totals.totalIncomeCents,
      totalExpensesCents: totals.totalExpensesCents,
      totalNetCents: totals.totalNetCents,
    }).toEqual({
      totalProjects: line.jobCount,
      totalIncomeCents: line.chargedCents,
      totalExpensesCents: line.spentCents,
      totalNetCents: line.profitCents,
    });
  });
});
