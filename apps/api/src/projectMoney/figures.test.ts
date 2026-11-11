import { describe, expect, it } from 'vitest';
import type { ExpenseCategory } from '@prisma/client';

import { contractBreakdown, contractLines, type MoneyJob } from './figures.js';

/** A date as the database gives a job's or a cost's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

let seq = 0;
/** An owner-entered job under project A with nothing charged and no costs. */
const job = (over: Partial<MoneyJob> = {}): MoneyJob => ({
  id: `job${++seq}`, title: 'Office clean', date: day('2026-03-10'), incomeCents: 0, discountCents: 0,
  status: 'OWNER_ENTRY', placement: 'PROJECT', projectId: 'A', expenses: [], ...over,
});
const cost = (amountCents: number, category: ExpenseCategory = 'MATERIALS', date = day('2026-03-10')) =>
  ({ category, amountCents, date });

const zero = { jobCount: 0, typedCents: 0, discountCents: 0, chargedCents: 0, spentCents: 0, profitCents: 0 };

describe('contractLines', () => {
  it('adds two counted jobs under one project: charged after discounts, spent, and profit', () => {
    const jobs = [
      job({ incomeCents: 4_000_000, discountCents: 500_000, expenses: [cost(1_000_000), cost(250_000, 'TRANSPORT')] }),
      job({ status: 'APPROVED', incomeCents: 2_000_000, expenses: [cost(600_000, 'EMPLOYEE_PAY')] }),
    ];

    expect(contractLines(jobs, ['A']).projects).toEqual([{
      projectId: 'A', jobCount: 2, typedCents: 6_000_000, discountCents: 500_000,
      chargedCents: 5_500_000, spentCents: 1_850_000, profitCents: 3_650_000,
    }]);
  });

  it('AE2: a job waiting for approval, with costs, adds to no line and to no total', () => {
    const waiting = { status: 'PENDING' as const, incomeCents: 9_000_000, expenses: [cost(4_000_000)] };
    const counted = job({ incomeCents: 1_000_000, expenses: [cost(300_000)] });
    const jobs = [
      counted,
      job({ ...waiting, placement: 'UNSORTED', projectId: null }),
      job({ ...waiting, placement: 'STANDALONE', projectId: null }),
      job(waiting),
    ];
    const only = { jobCount: 1, typedCents: 1_000_000, discountCents: 0, chargedCents: 1_000_000, spentCents: 300_000, profitCents: 700_000 };

    const lines = contractLines(jobs, ['A']);

    expect(lines.projects).toEqual([{ projectId: 'A', ...only }]);
    expect(lines.standalone).toEqual(zero);
    expect(lines.unsorted).toEqual(zero);
    expect(lines.totals).toEqual(only);
    expect(contractBreakdown(jobs, 'A', { byMonth: true })).toMatchObject({
      totals: only,
      jobs: [{ jobId: counted.id }],
      months: [{ month: '2026-03', ...only }],
    });
  });

  it('AE3: jobs under two projects, one-off and not yet sorted give four lines that add up to the totals line', () => {
    const lines = contractLines([
      job({ incomeCents: 1_000_000, expenses: [cost(400_000)] }),
      job({ projectId: 'B', incomeCents: 2_000_000, discountCents: 100_000, expenses: [cost(500_000)] }),
      job({ placement: 'STANDALONE', projectId: null, incomeCents: 300_000, expenses: [cost(50_000)] }),
      job({ placement: 'UNSORTED', projectId: null, status: 'APPROVED', incomeCents: 700_000 }),
    ], ['A', 'B']);

    expect(lines.projects).toEqual([
      { projectId: 'A', jobCount: 1, typedCents: 1_000_000, discountCents: 0, chargedCents: 1_000_000, spentCents: 400_000, profitCents: 600_000 },
      { projectId: 'B', jobCount: 1, typedCents: 2_000_000, discountCents: 100_000, chargedCents: 1_900_000, spentCents: 500_000, profitCents: 1_400_000 },
    ]);
    expect(lines.standalone).toEqual({ jobCount: 1, typedCents: 300_000, discountCents: 0, chargedCents: 300_000, spentCents: 50_000, profitCents: 250_000 });
    expect(lines.unsorted).toEqual({ jobCount: 1, typedCents: 700_000, discountCents: 0, chargedCents: 700_000, spentCents: 0, profitCents: 700_000 });
    expect(lines.totals).toEqual({ jobCount: 4, typedCents: 4_000_000, discountCents: 100_000, chargedCents: 3_900_000, spentCents: 950_000, profitCents: 2_950_000 });
  });

  it('gives a project with no jobs zero figures and a job count of zero', () => {
    const lines = contractLines([job({ incomeCents: 1_000_000 })], ['A', 'C']);

    expect(lines.projects[1]).toEqual({ projectId: 'C', ...zero });
  });
});

describe('contractBreakdown', () => {
  it('AE9: KSh 100,000 typed with KSh 5,000 of discounts and KSh 110,000 of costs is KSh 95,000 charged and a loss of KSh 15,000', () => {
    const jobs = [
      job({ incomeCents: 6_000_000, discountCents: 300_000, expenses: [cost(7_000_000)] }),
      job({ incomeCents: 4_000_000, discountCents: 200_000, expenses: [cost(4_000_000, 'EMPLOYEE_PAY')] }),
    ];

    expect(contractBreakdown(jobs, 'A', { byMonth: false }).totals).toEqual({
      jobCount: 2, typedCents: 10_000_000, discountCents: 500_000, chargedCents: 9_500_000,
      spentCents: 11_000_000, profitCents: -1_500_000,
    });
  });

  it('splits spent over the five groups, and a group with no costs reads zero', () => {
    const jobs = [
      job({ expenses: [cost(100_000, 'MATERIALS'), cost(30_000, 'TRANSPORT'), cost(200_000, 'EMPLOYEE_PAY')] }),
      job({ expenses: [cost(50_000, 'MATERIALS'), cost(20_000, 'MISCELLANEOUS')] }),
    ];

    const out = contractBreakdown(jobs, 'A', { byMonth: false });

    expect(out.spentByGroupCents).toEqual({ MATERIALS: 150_000, TRANSPORT: 30_000, EMPLOYEE_PAY: 200_000, LUNCH: 0, MISCELLANEOUS: 20_000 });
    expect(out.totals.spentCents).toBe(400_000);
  });

  it('AE6: a monthly project with jobs in March, April and May gives three month rows in order that add up to the totals', () => {
    const jobs = [
      job({ date: day('2026-05-04'), incomeCents: 3_000_000, expenses: [cost(1_000_000)] }),
      job({ date: day('2026-03-02'), incomeCents: 3_000_000, discountCents: 200_000, expenses: [cost(900_000)] }),
      job({ date: day('2026-04-06'), incomeCents: 3_000_000, expenses: [cost(1_100_000)] }),
      job({ date: day('2026-04-20'), incomeCents: 500_000, expenses: [cost(100_000, 'LUNCH')] }),
    ];

    const out = contractBreakdown(jobs, 'A', { byMonth: true });

    expect(out.months).toEqual([
      { month: '2026-03', jobCount: 1, typedCents: 3_000_000, discountCents: 200_000, chargedCents: 2_800_000, spentCents: 900_000, profitCents: 1_900_000 },
      { month: '2026-04', jobCount: 2, typedCents: 3_500_000, discountCents: 0, chargedCents: 3_500_000, spentCents: 1_200_000, profitCents: 2_300_000 },
      { month: '2026-05', jobCount: 1, typedCents: 3_000_000, discountCents: 0, chargedCents: 3_000_000, spentCents: 1_000_000, profitCents: 2_000_000 },
    ]);
    expect(out.totals).toEqual({ jobCount: 4, typedCents: 9_500_000, discountCents: 200_000, chargedCents: 9_300_000, spentCents: 3_100_000, profitCents: 6_200_000 });
  });

  it('gives a zero row for April when a monthly project has jobs in March and May only', () => {
    const jobs = [
      job({ date: day('2026-03-02'), incomeCents: 3_000_000 }),
      job({ date: day('2026-05-04'), incomeCents: 3_000_000 }),
    ];

    const { months } = contractBreakdown(jobs, 'A', { byMonth: true });

    expect(months.map((m) => m.month)).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(months[1]).toEqual({ month: '2026-04', ...zero });
  });

  it('counts a cost dated in April on a job dated in March in March', () => {
    const jobs = [
      job({ date: day('2026-03-28'), incomeCents: 2_000_000, expenses: [cost(600_000, 'MATERIALS', day('2026-04-02'))] }),
      job({ date: day('2026-04-10'), incomeCents: 1_000_000 }),
    ];

    const { months } = contractBreakdown(jobs, 'A', { byMonth: true });

    expect(months).toMatchObject([
      { month: '2026-03', spentCents: 600_000, profitCents: 1_400_000 },
      { month: '2026-04', spentCents: 0, profitCents: 1_000_000 },
    ]);
  });

  it('keeps a job dated on the 31st in its own month', () => {
    const jobs = [
      job({ date: new Date(Date.UTC(2026, 0, 31)), incomeCents: 1_000_000 }),
      job({ date: new Date(Date.UTC(2026, 2, 31)), incomeCents: 2_000_000 }),
    ];

    const out = contractBreakdown(jobs, 'A', { byMonth: true });

    expect(out.jobs.map((j) => j.date)).toEqual(['2026-01-31', '2026-03-31']);
    expect(out.months.map((m) => [m.month, m.chargedCents])).toEqual([['2026-01', 1_000_000], ['2026-02', 0], ['2026-03', 2_000_000]]);
  });

  it('gives no month rows for a project billed as one-off', () => {
    const jobs = [job({ date: day('2026-03-02'), incomeCents: 3_000_000 }), job({ date: day('2026-05-04'), incomeCents: 3_000_000 })];

    expect(contractBreakdown(jobs, 'A', { byMonth: false }).months).toEqual([]);
  });
});
