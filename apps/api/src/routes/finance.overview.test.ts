import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardOverview } from '@onyxhawk/types';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

/** A date as the database gives a job's or a cost's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const job = (id: string, date: string, incomeCents: number, over: object = {}) => ({
  id, title: `Job ${id}`, date: day(date), incomeCents, discountCents: 0, status: 'OWNER_ENTRY',
  placement: 'UNSORTED', projectId: null, createdById: 'owner', ...over,
});
const cost = (id: string, jobId: string, amountCents: number, date: string) => ({
  id, jobId, bookingId: null, category: 'MATERIALS', amountCents, date: day(date), createdById: 'owner',
});

/** Sets the server clock. The instant is given in UTC; Nairobi is three hours ahead. */
function clockAt(utc: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(utc));
}

async function overviewFor(year: number, month: number): Promise<DashboardOverview> {
  const res = await as('owner', 'GET', `/admin/finance/overview?year=${year}&month=${month}`);
  expect(res.statusCode).toBe(200);
  return res.json().overview;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [{ id: 'owner', fullName: 'Owner', role: 'ADMIN', isOwner: true }];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /admin/finance/overview', () => {
  describe('on 12 November, with jobs on 5 and 20 October and on 5 and 25 November', () => {
    beforeEach(() => {
      clockAt('2026-11-12T09:00:00.000Z'); // midday on 12 November in Nairobi
      t.jobs = [
        // KSh 40,000 typed, KSh 5,000 off.
        job('oct5', '2026-10-05', 4_000_000, { discountCents: 500_000 }),
        job('oct20', '2026-10-20', 6_000_000, { status: 'APPROVED' }),
        job('nov5', '2026-11-05', 7_000_000),
        job('nov25', '2026-11-25', 3_000_000, { status: 'APPROVED' }),
        // Waiting for approval: counted nowhere.
        job('nov6', '2026-11-06', 9_000_000, { status: 'PENDING' }),
      ];
      t.expenses = [
        cost('e1', 'oct5', 1_000_000, '2026-10-05'),
        cost('e2', 'oct20', 2_000_000, '2026-10-20'),
        cost('e3', 'nov5', 1_500_000, '2026-11-05'),
        cost('e4', 'nov25', 500_000, '2026-11-25'),
        cost('e5', 'nov6', 800_000, '2026-11-06'),
      ];
    });

    it('sets the 5 November job against the 5 October job, and the headline counts both November jobs (AE1)', async () => {
      const overview = await overviewFor(2026, 11);

      expect(overview).toEqual({
        year: 2026,
        month: 11,
        monthLabel: 'November 2026',
        revenue: { actual: 10_000_000, target: 0, percent: 0 }, // 7,000,000 + 3,000,000
        netProfit: { actual: 8_000_000, target: 0, percent: 0 }, // less 1,500,000 and 500,000
        jobs: { actual: 2, target: 0, percent: 0 },
        comparison: {
          mode: 'same-period',
          cutoffDay: 12,
          current: { revenueCents: 7_000_000, netCents: 5_500_000, jobCount: 1 },
          previous: { revenueCents: 3_500_000, netCents: 2_500_000, jobCount: 1 },
        },
        previousRevenueCents: 3_500_000,
        previousNetCents: 2_500_000,
        previousJobCount: 1,
        hasTargets: false,
      });
    });

    it('measures the targets against the whole month, not the days compared', async () => {
      t.monthlyTargets = [
        { year: 2026, month: 11, revenueTargetCents: 20_000_000, netProfitTargetCents: 10_000_000, jobsTarget: 4, notes: null },
        { year: 2026, month: 10, revenueTargetCents: 1, netProfitTargetCents: 1, jobsTarget: 1, notes: null },
      ];

      const overview = await overviewFor(2026, 11);

      expect(overview.revenue).toEqual({ actual: 10_000_000, target: 20_000_000, percent: 50 });
      expect(overview.netProfit).toEqual({ actual: 8_000_000, target: 10_000_000, percent: 80 });
      expect(overview.jobs).toEqual({ actual: 2, target: 4, percent: 50 });
      expect(overview.hasTargets).toBe(true);
    });

    it('compares October whole with September whole, because October is over (AE4)', async () => {
      const overview = await overviewFor(2026, 10);

      expect(overview.comparison).toEqual({
        mode: 'full-month',
        cutoffDay: null,
        current: { revenueCents: 9_500_000, netCents: 6_500_000, jobCount: 2 },
        previous: { revenueCents: 0, netCents: 0, jobCount: 0 },
      });
      expect(overview.revenue.actual).toBe(9_500_000);
    });
  });

  it('counts the cut-off day on both sides and nothing dated after it', async () => {
    clockAt('2026-11-12T09:00:00.000Z');
    t.jobs = [
      job('oct12', '2026-10-12', 1_000_000),
      job('oct13', '2026-10-13', 2_000_000),
      job('nov12', '2026-11-12', 4_000_000),
      job('nov13', '2026-11-13', 8_000_000),
    ];

    const overview = await overviewFor(2026, 11);

    expect(overview.comparison.current).toEqual({ revenueCents: 4_000_000, netCents: 4_000_000, jobCount: 1 });
    expect(overview.comparison.previous).toEqual({ revenueCents: 1_000_000, netCents: 1_000_000, jobCount: 1 });
    expect(overview.revenue.actual).toBe(12_000_000);
    expect(overview.jobs.actual).toBe(2);
  });

  it('gives previous figures of zero when the previous range holds no jobs', async () => {
    clockAt('2026-11-12T09:00:00.000Z');
    t.jobs = [job('oct20', '2026-10-20', 6_000_000), job('nov5', '2026-11-05', 7_000_000)];

    const overview = await overviewFor(2026, 11);

    expect(overview.comparison.mode).toBe('same-period');
    expect(overview.comparison.previous).toEqual({ revenueCents: 0, netCents: 0, jobCount: 0 });
    expect(overview.previousRevenueCents).toBe(0);
    expect(overview.previousNetCents).toBe(0);
    expect(overview.previousJobCount).toBe(0);
  });

  it('compares a past month whole with the whole month before it, to the first and last day of each (AE4)', async () => {
    clockAt('2026-11-12T09:00:00.000Z');
    t.jobs = [
      job('jul31', '2026-07-31', 100_000),
      job('aug1', '2026-08-01', 200_000),
      job('aug31', '2026-08-31', 400_000),
      job('sep1', '2026-09-01', 800_000),
      job('sep30', '2026-09-30', 1_600_000),
      job('oct1', '2026-10-01', 3_200_000),
    ];
    t.expenses = [cost('e1', 'aug31', 150_000, '2026-08-31'), cost('e2', 'sep30', 600_000, '2026-09-30')];

    const overview = await overviewFor(2026, 9);

    expect(overview.comparison).toEqual({
      mode: 'full-month',
      cutoffDay: null,
      current: { revenueCents: 2_400_000, netCents: 1_800_000, jobCount: 2 },
      previous: { revenueCents: 600_000, netCents: 450_000, jobCount: 2 },
    });
    expect(overview.revenue.actual).toBe(2_400_000);
    expect(overview.netProfit.actual).toBe(1_800_000);
    expect(overview.jobs.actual).toBe(2);
    expect(overview.previousRevenueCents).toBe(600_000);
  });

  it('stops the previous side at the end of February when today is 31 March (AE2)', async () => {
    clockAt('2026-03-31T09:00:00.000Z');
    t.jobs = [
      job('feb28', '2026-02-28', 1_000_000),
      job('mar1', '2026-03-01', 2_000_000),
      job('mar31', '2026-03-31', 4_000_000),
    ];

    const overview = await overviewFor(2026, 3);

    expect(overview.comparison.cutoffDay).toBe(31);
    expect(overview.comparison.previous).toEqual({ revenueCents: 1_000_000, netCents: 1_000_000, jobCount: 1 });
    expect(overview.comparison.current).toEqual({ revenueCents: 6_000_000, netCents: 6_000_000, jobCount: 2 });
  });

  describe('at 22:00 UTC on 31 October, which is 01:00 on 1 November in Nairobi (AE3)', () => {
    beforeEach(() => {
      clockAt('2026-10-31T22:00:00.000Z');
      t.jobs = [
        job('oct1', '2026-10-01', 1_000_000),
        job('oct2', '2026-10-02', 2_000_000),
        job('nov1', '2026-11-01', 4_000_000),
      ];
    });

    it('treats November as the current month and compares 1 November with 1 October only', async () => {
      const overview = await overviewFor(2026, 11);

      expect(overview.comparison).toEqual({
        mode: 'same-period',
        cutoffDay: 1,
        current: { revenueCents: 4_000_000, netCents: 4_000_000, jobCount: 1 },
        previous: { revenueCents: 1_000_000, netCents: 1_000_000, jobCount: 1 },
      });
    });

    it('treats October as over and compares it whole', async () => {
      const overview = await overviewFor(2026, 10);

      expect(overview.comparison.mode).toBe('full-month');
      expect(overview.comparison.current).toEqual({ revenueCents: 3_000_000, netCents: 3_000_000, jobCount: 2 });
    });
  });
});
