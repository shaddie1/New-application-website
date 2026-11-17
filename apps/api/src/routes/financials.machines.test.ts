import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// A machine's days on a job are a cost of that job. Every place that adds up
// spent, profit or net takes them off, in the month of the job's date, and
// none of them changes while no days are logged.

/** A date as the database gives a job's or a cost's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const job = (id: string, title: string, ymd: string, incomeCents: number, over: object = {}) => ({
  id, title, date: day(ymd), incomeCents, discountCents: 0, status: 'OWNER_ENTRY', placement: 'STANDALONE',
  projectId: null, clientName: null, clientPhone: null, clientLocation: null, notes: null, serviceLineCode: null,
  region: null, clientSegment: null, createdById: 'owner', reportedById: null, createdAt: day(ymd), ...over,
});

const cost = (id: string, jobId: string, category: string, amountCents: number, ymd: string) => ({
  id, jobId, bookingId: null, category, amountCents, description: null, date: day(ymd), createdAt: day(ymd),
  createdById: 'owner',
});

const holder = (id: string, name: string, basisPoints: number, sortOrder: number, over: object = {}) => ({
  id, name, title: null, kind: 'INDIVIDUAL', basisPoints, notes: null, userId: null, sortOrder, removedAt: null,
  createdAt: day('2026-07-15'), updatedAt: day('2026-07-15'), ...over,
});

/** Days of the floor scrubber, at KSh 2,000 a day, on a job. Logged on 10 November, whatever the job's date. */
const scrubberDays = (id: string, jobId: string, halfDays: number) => ({
  id, assetId: 'scrubber', jobId, halfDays, rateCents: 200_000, amountCents: halfDays * 100_000, isHire: false,
  createdById: 'owner', createdAt: new Date('2026-11-10T08:00:00.000Z'), updatedAt: new Date('2026-11-10T08:00:00.000Z'),
});
/** AE1: 2.5 days on the October job, KSh 5,000. */
const AE1_LINE = () => scrubberDays('ml1', 'octJob', 5);

/** Sets the server clock. The instant is given in UTC; Nairobi is three hours ahead. */
function clockAt(utc: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(utc));
}

const OCTOBER = 'from=2026-10-01&to=2026-10-31';
const NOVEMBER = 'from=2026-11-01&to=2026-11-30';
const DECLARE = '/admin/finance/distributions/declare';
const DECLARE_OCTOBER = { label: 'October 2026', periodStart: '2026-10-01', periodEnd: '2026-10-31' };

const get = async (url: string) => {
  const res = await as('owner', 'GET', url);
  expect(res.statusCode).toBe(200);
  return res;
};

/** A supervisor's own job reports, as the Job reports page loads them. */
async function ownReports(userId: string) {
  const { signAccessToken } = await import('../auth/jwt.js');
  const { jobReportsRoutes } = await import('./jobReports.js');
  const server = Fastify();
  await server.register(jobReportsRoutes, { prefix: '/admin/job-reports' });
  const { token } = await signAccessToken(userId, t.users.find((u) => u.id === userId)!.role);
  const res = await server.inject({ method: 'GET', url: '/admin/job-reports', headers: { authorization: `Bearer ${token}` } });
  expect(res.statusCode).toBe(200);
  return res;
}

// The October job as each job list sends it with no machine days: KSh 100,000 charged, KSh 60,000 of costs.
const OCT_JOB_DTO = {
  id: 'octJob', title: 'Mall deep clean', date: '2026-10-14', incomeCents: 10_000_000, discountCents: 0,
  actualIncomeCents: 10_000_000, status: 'OWNER_ENTRY', reportedByName: null, clientName: null, clientPhone: null,
  clientLocation: null, notes: null, serviceLineCode: null, region: null, clientSegment: null,
  placement: 'PROJECT', projectId: 'pA', projectTitle: 'Bank branch',
  expenses: [
    { id: 'e1', category: 'MATERIALS', amountCents: 4_000_000, description: null, date: '2026-10-14', jobId: 'octJob', bookingId: null, createdAt: '2026-10-14T00:00:00.000Z' },
    { id: 'e2', category: 'EMPLOYEE_PAY', amountCents: 2_000_000, description: null, date: '2026-10-15', jobId: 'octJob', bookingId: null, createdAt: '2026-10-15T00:00:00.000Z' },
  ],
  totalExpensesCents: 6_000_000, netCents: 4_000_000, createdAt: '2026-10-14T00:00:00.000Z',
};

// The supervisor's approved November report: KSh 30,000 typed, KSh 2,000 off, KSh 5,000 of costs.
const NOV_JOB_DTO = {
  id: 'novJob', title: 'Sofa cleaning, Kilimani', date: '2026-11-05', incomeCents: 3_000_000, discountCents: 200_000,
  actualIncomeCents: 2_800_000, status: 'APPROVED', reportedByName: 'Achieng Otieno', clientName: null, clientPhone: null,
  clientLocation: null, notes: null, serviceLineCode: null, region: null, clientSegment: null,
  placement: 'STANDALONE', projectId: null, projectTitle: null,
  expenses: [
    { id: 'e3', category: 'TRANSPORT', amountCents: 500_000, description: null, date: '2026-11-05', jobId: 'novJob', bookingId: null, createdAt: '2026-11-05T00:00:00.000Z' },
  ],
  totalExpensesCents: 500_000, netCents: 2_300_000, createdAt: '2026-11-05T00:00:00.000Z',
};

// The supervisor's report still waiting for approval: KSh 9,000 typed, KSh 1,000 of costs.
const WAITING_DTO = {
  id: 'waiting', title: 'Window clean, Lavington', date: '2026-10-20', incomeCents: 900_000, discountCents: 0,
  actualIncomeCents: 900_000, status: 'PENDING', reportedByName: 'Achieng Otieno', clientName: null, clientPhone: null,
  clientLocation: null, notes: null, serviceLineCode: null, region: null, clientSegment: null,
  placement: 'UNSORTED', projectId: null, projectTitle: null,
  expenses: [
    { id: 'e4', category: 'LUNCH', amountCents: 100_000, description: null, date: '2026-10-20', jobId: 'waiting', bookingId: null, createdAt: '2026-10-20T00:00:00.000Z' },
  ],
  totalExpensesCents: 100_000, netCents: 800_000, createdAt: '2026-10-20T00:00:00.000Z',
};

const HOLDINGS = { id: 'h1', name: 'OnyxHawk Holdings', title: null, kind: 'COMPANY', basisPoints: 6000, notes: null, userId: null, userName: null, sortOrder: 0 };
const AMINA = { id: 'h2', name: 'Amina Yusuf', title: null, kind: 'INDIVIDUAL', basisPoints: 4000, notes: null, userId: null, userName: null, sortOrder: 1 };

/** One holder's line of a payout declared on 12 November for October. */
const declared = (id: string, shareholderId: string, shareholderName: string, netProfitCents: number, basisPoints: number, amountCents: number) => ({
  id, label: 'October 2026', periodStart: '2026-10-01', periodEnd: '2026-10-31', shareholderId, shareholderName,
  netProfitCents, basisPoints, amountCents, status: 'PENDING', paidAt: null, reference: null, notes: null,
  createdByName: 'Owner', createdAt: '2026-11-12T09:00:00.000Z', updatedAt: '2026-11-12T09:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  clockAt('2026-11-12T09:00:00.000Z'); // midday on 12 November in Nairobi
  t.users = [
    { id: 'owner', fullName: 'Owner', role: 'ADMIN', isOwner: true },
    { id: 'sup', fullName: 'Achieng Otieno', role: 'CLEANING_SUPERVISOR', isOwner: false },
  ];
  t.projects = [{ id: 'pA', title: 'Bank branch' }];
  t.shareholders = [
    holder('h1', 'OnyxHawk Holdings', 6000, 0, { kind: 'COMPANY' }),
    holder('h2', 'Amina Yusuf', 4000, 1),
  ];
  // One machine on the register with a repair in October, and one asset that is not on it.
  t.assets = [
    { id: 'scrubber', name: 'Floor scrubber', category: 'MACHINE', purchaseDate: day('2026-08-20'), costCents: 26_000_000, dailyRateCents: 200_000, countsFrom: day('2026-09-01'), retiredAt: null },
    { id: 'laptop', name: 'Office laptop', category: 'IT', purchaseDate: day('2026-10-02'), costCents: 8_000_000, dailyRateCents: null, countsFrom: null, retiredAt: null },
  ];
  t.assetMaintenance = [{ id: 'm1', assetId: 'scrubber', date: day('2026-10-16'), description: 'New brushes', costCents: 300_000 }];
  t.jobs = [
    job('octJob', 'Mall deep clean', '2026-10-14', 10_000_000, { placement: 'PROJECT', projectId: 'pA' }),
    job('novJob', 'Sofa cleaning, Kilimani', '2026-11-05', 3_000_000, { discountCents: 200_000, status: 'APPROVED', createdById: 'sup', reportedById: 'sup' }),
    // Waiting for approval: counted nowhere.
    job('waiting', 'Window clean, Lavington', '2026-10-20', 900_000, { status: 'PENDING', placement: 'UNSORTED', createdById: 'sup', reportedById: 'sup' }),
  ];
  t.expenses = [
    cost('e1', 'octJob', 'MATERIALS', 4_000_000, '2026-10-14'),
    cost('e2', 'octJob', 'EMPLOYEE_PAY', 2_000_000, '2026-10-15'),
    cost('e3', 'novJob', 'TRANSPORT', 500_000, '2026-11-05'),
    cost('e4', 'waiting', 'LUNCH', 100_000, '2026-10-20'),
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AE5: with machines on the register and no days logged, every answer is the one it gave before', () => {
  const ALL_TIME = {
    totalProjects: 2,
    totalIncomeCents: 12_800_000, // 10,000,000 + 2,800,000
    totalExpensesCents: 6_500_000, // 4,000,000 + 2,000,000 + 500,000
    totalNetCents: 6_300_000,
    firstJobDate: '2026-10-14',
    lastJobDate: '2026-11-05',
  };

  it('GET /summary', async () => {
    const res = await get(`/admin/financials/summary?${OCTOBER}`);

    expect(res.json()).toEqual({
      summary: {
        incomeCents: 10_000_000,
        expensesByCategoryCents: { MATERIALS: 4_000_000, TRANSPORT: 0, EMPLOYEE_PAY: 2_000_000, LUNCH: 0, MISCELLANEOUS: 0 },
        totalExpensesCents: 6_000_000,
        netCents: 4_000_000,
        fromDate: '2026-10-01',
        toDate: '2026-10-31',
      },
    });
    expect(res.body).not.toMatch(/machine/i);
  });

  it('GET /trends', async () => {
    const res = await get('/admin/financials/trends?months=2');

    expect(res.json()).toEqual({
      trends: [
        { year: 2026, month: 10, label: 'Oct 2026', incomeCents: 10_000_000, totalExpensesCents: 6_000_000, netCents: 4_000_000, jobCount: 1 },
        { year: 2026, month: 11, label: 'Nov 2026', incomeCents: 2_800_000, totalExpensesCents: 500_000, netCents: 2_300_000, jobCount: 1 },
      ],
    });
    expect(res.body).not.toMatch(/machine/i);
  });

  it('GET /totals', async () => {
    const res = await get('/admin/financials/totals');

    expect(res.json()).toEqual({ totals: ALL_TIME });
    expect(res.body).not.toMatch(/machine/i);
  });

  it('GET /equity', async () => {
    const res = await get(`/admin/financials/equity?${OCTOBER}`);

    expect(res.json()).toEqual({
      overview: {
        allocations: [
          { shareholder: HOLDINGS, periodShareCents: 2_400_000, allTimeShareCents: 3_780_000 },
          { shareholder: AMINA, periodShareCents: 1_600_000, allTimeShareCents: 2_520_000 },
        ],
        totalBasisPoints: 10_000,
        unallocatedPeriodCents: 0,
        unallocatedAllTimeCents: 0,
        periodNetCents: 4_000_000,
        periodIncomeCents: 10_000_000,
        periodExpensesCents: 6_000_000,
        periodProjects: 1,
        fromDate: '2026-10-01',
        toDate: '2026-10-31',
        allTime: ALL_TIME,
      },
    });
    expect(res.body).not.toMatch(/machine/i);
  });

  it('GET /equity/history', async () => {
    const res = await get('/admin/financials/equity/history?months=2');

    expect(res.json()).toEqual({
      history: {
        months: [
          {
            year: 2026, month: 10, label: 'Oct', netCents: 4_000_000,
            shares: [
              { shareholderId: 'h1', shareholderName: 'OnyxHawk Holdings', basisPoints: 6000, shareCents: 2_400_000 },
              { shareholderId: 'h2', shareholderName: 'Amina Yusuf', basisPoints: 4000, shareCents: 1_600_000 },
            ],
            unallocatedCents: 0, partial: false,
          },
          {
            year: 2026, month: 11, label: 'Nov', netCents: 2_300_000,
            shares: [
              { shareholderId: 'h1', shareholderName: 'OnyxHawk Holdings', basisPoints: 6000, shareCents: 1_380_000 },
              { shareholderId: 'h2', shareholderName: 'Amina Yusuf', basisPoints: 4000, shareCents: 920_000 },
            ],
            unallocatedCents: 0, partial: true,
          },
        ],
      },
    });
  });

  it('declaring a payout', async () => {
    const res = await as('owner', 'POST', DECLARE, DECLARE_OCTOBER);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      distributions: [
        declared('pd1', 'h1', 'OnyxHawk Holdings', 4_000_000, 6000, 2_400_000),
        declared('pd2', 'h2', 'Amina Yusuf', 4_000_000, 4000, 1_600_000),
      ],
    });
  });

  it("the owner's job list and the reports waiting for approval", async () => {
    const jobs = await get(`/admin/financials/jobs?${OCTOBER}`);
    const reports = await get('/admin/financials/reports');

    expect(jobs.json()).toEqual({ jobs: [OCT_JOB_DTO] });
    expect(reports.json()).toEqual({ reports: [WAITING_DTO] });
    expect(jobs.body + reports.body).not.toMatch(/machine/i);
  });

  it("a supervisor's own job reports", async () => {
    const res = await ownReports('sup');

    expect(res.json()).toEqual({ reports: [NOV_JOB_DTO, WAITING_DTO] });
    expect(res.body).not.toMatch(/machine/i);
  });
});

describe('AE1: 2.5 days of the scrubber on the October job, KSh 5,000', () => {
  beforeEach(() => {
    t.machineLines = [AE1_LINE()];
  });

  const DAYS = [{ id: 'ml1', machineName: 'Floor scrubber', halfDays: 5, rateCents: 200_000, amountCents: 500_000, isHire: false }];
  const OCT_JOB_WITH_DAYS = { ...OCT_JOB_DTO, totalExpensesCents: 6_500_000, netCents: 3_500_000, machineCents: 500_000, machineLines: DAYS };

  it("the job's profit is KSh 35,000, its total costs hold the KSh 5,000, and it lists the days", async () => {
    const res = await get(`/admin/financials/jobs?${OCTOBER}`);

    expect(res.json()).toEqual({ jobs: [OCT_JOB_WITH_DAYS] });
  });

  it('GET /summary: Machines is its own group, the groups add up to total expenses, and net is KSh 5,000 lower', async () => {
    const { summary } = (await get(`/admin/financials/summary?${OCTOBER}`)).json();

    expect(summary).toEqual({
      incomeCents: 10_000_000,
      expensesByCategoryCents: { MATERIALS: 4_000_000, TRANSPORT: 0, EMPLOYEE_PAY: 2_000_000, LUNCH: 0, MISCELLANEOUS: 0, MACHINES: 500_000 },
      totalExpensesCents: 6_500_000,
      netCents: 3_500_000,
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
    });
    expect(4_000_000 + 2_000_000 + 500_000).toBe(summary.totalExpensesCents);
  });

  it("GET /trends: October's net is KSh 5,000 lower and November is untouched", async () => {
    const res = await get('/admin/financials/trends?months=2');

    expect(res.json()).toEqual({
      trends: [
        { year: 2026, month: 10, label: 'Oct 2026', incomeCents: 10_000_000, totalExpensesCents: 6_500_000, machineCents: 500_000, netCents: 3_500_000, jobCount: 1 },
        { year: 2026, month: 11, label: 'Nov 2026', incomeCents: 2_800_000, totalExpensesCents: 500_000, netCents: 2_300_000, jobCount: 1 },
      ],
    });
  });

  it('GET /totals: all-time net is KSh 5,000 lower', async () => {
    const res = await get('/admin/financials/totals');

    expect(res.json()).toEqual({
      totals: {
        totalProjects: 2,
        totalIncomeCents: 12_800_000,
        totalExpensesCents: 7_000_000,
        totalMachineCents: 500_000,
        totalNetCents: 5_800_000,
        firstJobDate: '2026-10-14',
        lastJobDate: '2026-11-05',
      },
    });
  });

  it("GET /equity: October's net and each holder's share are lower, and the amount set aside is stated", async () => {
    const { overview } = (await get(`/admin/financials/equity?${OCTOBER}`)).json();

    expect(overview).toMatchObject({
      periodNetCents: 3_500_000,
      periodIncomeCents: 10_000_000,
      periodExpensesCents: 6_500_000,
      periodMachineCents: 500_000,
      periodProjects: 1,
      unallocatedPeriodCents: 0,
      allTime: { totalExpensesCents: 7_000_000, totalMachineCents: 500_000, totalNetCents: 5_800_000 },
    });
    expect(
      overview.allocations.map((a: { shareholder: { id: string }; periodShareCents: number; allTimeShareCents: number }) =>
        [a.shareholder.id, a.periodShareCents, a.allTimeShareCents]),
    ).toEqual([
      ['h1', 2_100_000, 3_480_000],
      ['h2', 1_400_000, 2_320_000],
    ]);
  });

  it('GET /equity/history: October splits the lower net', async () => {
    const { months } = (await get('/admin/financials/equity/history?months=2')).json().history;

    expect(months.map((m: { month: number; netCents: number; shares: { shareCents: number }[] }) =>
      [m.month, m.netCents, m.shares.map((s) => s.shareCents)])).toEqual([
      [10, 3_500_000, [2_100_000, 1_400_000]],
      [11, 2_300_000, [1_380_000, 920_000]],
    ]);
  });

  it('gives October the same net profit on every screen: KSh 35,000', async () => {
    const summary = (await get(`/admin/financials/summary?${OCTOBER}`)).json().summary;
    const trends = (await get('/admin/financials/trends?months=2')).json().trends;
    const overview = (await get('/admin/finance/overview?year=2026&month=10')).json().overview;
    const equity = (await get(`/admin/financials/equity?${OCTOBER}`)).json().overview;
    const history = (await get('/admin/financials/equity/history?months=2')).json().history;
    const payout = (await as('owner', 'POST', DECLARE, DECLARE_OCTOBER)).json().distributions;
    const [jobLine] = (await get(`/admin/financials/jobs?${OCTOBER}`)).json().jobs;

    expect({
      summary: summary.netCents,
      trends: trends[0].netCents,
      overview: overview.netProfit.actual,
      overviewSeries: overview.series[5].netCents,
      equity: equity.periodNetCents,
      history: history.months[0].netCents,
      payout: payout[0].netProfitCents,
      job: jobLine.netCents,
    }).toEqual({
      summary: 3_500_000, trends: 3_500_000, overview: 3_500_000, overviewSeries: 3_500_000,
      equity: 3_500_000, history: 3_500_000, payout: 3_500_000, job: 3_500_000,
    });
  });

  it('counts the days in October, the month of the job, though they were logged in November', async () => {
    const summary = await get(`/admin/financials/summary?${NOVEMBER}`);
    const equity = await get(`/admin/financials/equity?${NOVEMBER}`);
    const overview = (await get('/admin/finance/overview?year=2026&month=11')).json().overview;

    expect(summary.json().summary).toEqual({
      incomeCents: 2_800_000,
      expensesByCategoryCents: { MATERIALS: 0, TRANSPORT: 500_000, EMPLOYEE_PAY: 0, LUNCH: 0, MISCELLANEOUS: 0 },
      totalExpensesCents: 500_000,
      netCents: 2_300_000,
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
    });
    expect(equity.json().overview).toMatchObject({ periodNetCents: 2_300_000, periodExpensesCents: 500_000 });
    expect(equity.json().overview).not.toHaveProperty('periodMachineCents');
    expect(overview.netProfit.actual).toBe(2_300_000);
    // The month before, in the same overview, holds them.
    expect(overview.series[4]).toMatchObject({ month: 10, netCents: 3_500_000 });
    // A payout declared for November starts from November's own net.
    const payout = await as('owner', 'POST', DECLARE, { label: 'November 2026', periodStart: '2026-11-01', periodEnd: '2026-11-30' });
    expect(payout.json().distributions[0].netProfitCents).toBe(2_300_000);
  });

  it('a cost of KSh 5,000 dated in November on the October job still counts in November, as before', async () => {
    t.expenses.push(cost('e5', 'octJob', 'MISCELLANEOUS', 500_000, '2026-11-03'));

    const october = (await get(`/admin/financials/summary?${OCTOBER}`)).json().summary;
    const november = (await get(`/admin/financials/summary?${NOVEMBER}`)).json().summary;

    // October: the costs dated in October and the machine days.
    expect(october).toMatchObject({ totalExpensesCents: 6_500_000, netCents: 3_500_000 });
    expect(october.expensesByCategoryCents).toMatchObject({ MISCELLANEOUS: 0, MACHINES: 500_000 });
    // November: its own 500,000 and the late cost, and no machine days.
    expect(november).toMatchObject({ totalExpensesCents: 1_000_000, netCents: 1_800_000 });
    expect(november.expensesByCategoryCents).toEqual({ MATERIALS: 0, TRANSPORT: 500_000, EMPLOYEE_PAY: 0, LUNCH: 0, MISCELLANEOUS: 500_000 });
  });

  it('editing the job returns it with its days and the right profit', async () => {
    const res = await as('owner', 'PATCH', '/admin/financials/jobs/octJob', { title: 'Mall deep clean, phase 2' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ job: { ...OCT_JOB_WITH_DAYS, title: 'Mall deep clean, phase 2' } });
  });

  it('deleting the job removes its days from every figure', async () => {
    const res = await as('owner', 'DELETE', '/admin/financials/jobs/octJob');

    expect(res.statusCode).toBe(200);
    // The database deletes a job's machine days with the job.
    expect(t.machineLines).toEqual([]);
    expect((await get(`/admin/financials/summary?${OCTOBER}`)).json().summary).toEqual({
      incomeCents: 0,
      expensesByCategoryCents: { MATERIALS: 0, TRANSPORT: 0, EMPLOYEE_PAY: 0, LUNCH: 0, MISCELLANEOUS: 0 },
      totalExpensesCents: 0,
      netCents: 0,
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
    });
    expect((await get('/admin/financials/totals')).json().totals).toEqual({
      totalProjects: 1, totalIncomeCents: 2_800_000, totalExpensesCents: 500_000, totalNetCents: 2_300_000,
      firstJobDate: '2026-11-05', lastJobDate: '2026-11-05',
    });
    const equity = (await get(`/admin/financials/equity?${OCTOBER}`)).json().overview;
    expect(equity.periodNetCents).toBe(0);
    expect(equity).not.toHaveProperty('periodMachineCents');
    expect((await get('/admin/finance/overview?year=2026&month=10')).json().overview.netProfit.actual).toBe(0);
  });
});

describe('machine days on a job that is not counted', () => {
  it('are in no period figure and no total while the report waits for approval', async () => {
    t.machineLines = [scrubberDays('ml1', 'waiting', 2)];

    expect((await get(`/admin/financials/summary?${OCTOBER}`)).json().summary).toMatchObject({ totalExpensesCents: 6_000_000, netCents: 4_000_000 });
    expect((await get('/admin/financials/trends?months=2')).json().trends[0]).toMatchObject({ totalExpensesCents: 6_000_000, netCents: 4_000_000 });
    expect((await get(`/admin/financials/equity?${OCTOBER}`)).json().overview.periodNetCents).toBe(4_000_000);
    expect((await get('/admin/financials/totals')).json().totals.totalNetCents).toBe(6_300_000);
    expect((await as('owner', 'POST', DECLARE, DECLARE_OCTOBER)).json().distributions[0].netProfitCents).toBe(4_000_000);
  });

  it('approving the report returns the job with its days and the right profit', async () => {
    t.machineLines = [scrubberDays('ml1', 'waiting', 2)];

    const res = await as('owner', 'PATCH', '/admin/financials/reports/waiting/approve', { place: { placement: 'STANDALONE' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      job: {
        ...WAITING_DTO,
        status: 'APPROVED',
        placement: 'STANDALONE',
        // KSh 1,000 of costs and one day of the scrubber.
        totalExpensesCents: 300_000,
        netCents: 600_000,
        machineCents: 200_000,
        machineLines: [{ id: 'ml1', machineName: 'Floor scrubber', halfDays: 2, rateCents: 200_000, amountCents: 200_000, isHire: false }],
      },
    });
  });
});

describe('saving a new job', () => {
  it('returns it with no machine field and a profit equal to what was charged', async () => {
    const res = await as('owner', 'POST', '/admin/financials/jobs', {
      title: 'Hospital wing deep clean', date: '2026-11-11', incomeCents: 2_500_000, place: { placement: 'STANDALONE' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().job).toMatchObject({ expenses: [], totalExpensesCents: 0, netCents: 2_500_000 });
    expect(res.body).not.toMatch(/machine/i);
  });
});

describe('R29: a job report, for the person who reported it', () => {
  it('carries one Machines amount inside its costs and the lower profit, and no machine name, days or rate', async () => {
    // One day of the scrubber on the approved November job.
    t.machineLines = [scrubberDays('ml2', 'novJob', 2)];

    const res = await ownReports('sup');

    expect(res.json()).toEqual({
      reports: [{ ...NOV_JOB_DTO, totalExpensesCents: 700_000, netCents: 2_100_000, machineCents: 200_000 }, WAITING_DTO],
    });
    expect(res.body).not.toMatch(/scrubber|halfDays|rateCents|machineLines|machineName/i);
  });
});

describe('AE6: a declared payout and machine days logged afterwards', () => {
  it('keeps the net profit and the amounts it was declared with, while October itself falls', async () => {
    await as('owner', 'POST', DECLARE, DECLARE_OCTOBER);

    t.machineLines = [AE1_LINE()];

    expect((await get('/admin/finance/distributions')).json()).toEqual({
      distributions: [
        declared('pd1', 'h1', 'OnyxHawk Holdings', 4_000_000, 6000, 2_400_000),
        declared('pd2', 'h2', 'Amina Yusuf', 4_000_000, 4000, 1_600_000),
      ],
    });
    expect((await get(`/admin/financials/summary?${OCTOBER}`)).json().summary.netCents).toBe(3_500_000);
  });

  it('starts from the lower net profit when the days were logged first', async () => {
    t.machineLines = [AE1_LINE()];

    const res = await as('owner', 'POST', DECLARE, DECLARE_OCTOBER);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      distributions: [
        declared('pd1', 'h1', 'OnyxHawk Holdings', 3_500_000, 6000, 2_100_000),
        declared('pd2', 'h2', 'Amina Yusuf', 3_500_000, 4000, 1_400_000),
      ],
    });
  });
});
