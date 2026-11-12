import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CastId, requestAs, seedCast } from '../test-support/cast.js';
import { resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// The data behind "This month", the trend and the breakdown is served at the
// addresses it always had, now behind the Dashboard's access list. The figures
// are the ones the same handlers gave before they moved; who may ask changed.

/** A date as the database gives a job's or a cost's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const job = (id: string, date: string, incomeCents: number, over: object = {}) => ({
  id, title: `Job ${id}`, date: day(date), incomeCents, discountCents: 0, status: 'OWNER_ENTRY',
  placement: 'UNSORTED', projectId: null, createdById: 'owner', createdAt: day(date), ...over,
});
const cost = (id: string, jobId: string, category: string, amountCents: number, date: string) => ({
  id, jobId, bookingId: null, category, amountCents, date: day(date), createdById: 'owner', createdAt: day(date),
});
const target = (year: number, month: number, revenueTargetCents: number, netProfitTargetCents: number, jobsTarget: number) => ({
  id: `target-${year}-${month}`, year, month, revenueTargetCents, netProfitTargetCents, jobsTarget, notes: null, createdById: 'owner',
});

const NOVEMBER = 'from=2026-11-01&to=2026-11-30';
const OVERVIEW = '/admin/finance/overview?year=2026&month=11';
const BREAKDOWN = `/admin/finance/revenue-breakdown?${NOVEMBER}`;
const SUMMARY = `/admin/financials/summary?${NOVEMBER}`;
const TARGETS = '/admin/finance/targets';

/** What a month's targets look like on the way in. */
const targetsFor = (year: number, month: number) => ({
  year, month, revenueTargetCents: 30_000_000, netProfitTargetCents: 12_000_000, jobsTarget: 9,
});

beforeEach(() => {
  resetDb();
  seedCast();
  // Midday on 12 November in Nairobi.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T09:00:00.000Z'));

  t.jobs = [
    job('oct5', '2026-10-05', 2_000_000),
    // KSh 40,000 typed, KSh 5,000 off.
    job('nov3', '2026-11-03', 4_000_000, {
      discountCents: 500_000, serviceLineCode: 'POST_BUILD', region: 'NAIROBI', clientSegment: 'RESIDENTIAL',
    }),
    job('nov20', '2026-11-20', 6_000_000, {
      status: 'APPROVED', serviceLineCode: 'POST_BUILD', region: null, clientSegment: 'COMMERCIAL',
    }),
    job('nov25', '2026-11-25', 1_000_000, { serviceLineCode: null, region: 'KIAMBU', clientSegment: 'RESIDENTIAL' }),
    // Waiting for approval: counted nowhere.
    job('nov6', '2026-11-06', 9_000_000, { status: 'PENDING', serviceLineCode: 'POST_BUILD', region: 'NAIROBI' }),
  ];
  t.expenses = [
    cost('e0', 'oct5', 'MATERIALS', 400_000, '2026-10-05'),
    cost('e1', 'nov3', 'MATERIALS', 1_000_000, '2026-11-03'),
    cost('e2', 'nov3', 'LUNCH', 50_000, '2026-11-03'),
    cost('e3', 'nov20', 'TRANSPORT', 2_000_000, '2026-11-20'),
    cost('e4', 'nov20', 'MISCELLANEOUS', 20_000, '2026-11-20'),
    cost('e5', 'nov25', 'EMPLOYEE_PAY', 300_000, '2026-11-25'),
    cost('e6', 'nov6', 'MISCELLANEOUS', 800_000, '2026-11-06'),
  ];
  t.monthlyTargets = [target(2026, 10, 1, 1, 1), target(2026, 11, 21_000_000, 10_000_000, 6)];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the handlers that moved answer the owner with the figures they gave before', () => {
  it('GET /admin/finance/overview: revenue, net profit, jobs and the comparison for the month', async () => {
    const res = await requestAs('owner', 'GET', OVERVIEW);

    expect(res.statusCode).toBe(200);
    const { series, ...figures } = res.json().overview;
    expect(figures).toEqual({
      year: 2026,
      month: 11,
      monthLabel: 'November 2026',
      revenue: { actual: 10_500_000, target: 21_000_000, percent: 50 }, // 3,500,000 + 6,000,000 + 1,000,000
      netProfit: { actual: 7_130_000, target: 10_000_000, percent: 71 }, // less 3,370,000 of costs
      jobs: { actual: 3, target: 6, percent: 50 },
      comparison: {
        mode: 'same-period',
        cutoffDay: 12,
        current: { revenueCents: 3_500_000, netCents: 2_450_000, jobCount: 1 },
        previous: { revenueCents: 2_000_000, netCents: 1_600_000, jobCount: 1 },
      },
      previousRevenueCents: 2_000_000,
      previousNetCents: 1_600_000,
      previousJobCount: 1,
      hasTargets: true,
    });
    expect(series.at(-1)).toEqual({
      year: 2026, month: 11, label: 'Nov', revenueCents: 10_500_000, netCents: 7_130_000, jobCount: 3,
    });
    expect(series.at(-2)).toEqual({
      year: 2026, month: 10, label: 'Oct', revenueCents: 2_000_000, netCents: 1_600_000, jobCount: 1,
    });
  });

  it('GET /admin/finance/revenue-breakdown: income by service line, region and segment, largest first', async () => {
    const res = await requestAs('owner', 'GET', BREAKDOWN);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      breakdown: {
        byServiceLine: [
          { key: 'POST_BUILD', label: 'Post build', incomeCents: 9_500_000, jobCount: 2 },
          { key: '__unknown', label: 'Unclassified', incomeCents: 1_000_000, jobCount: 1 },
        ],
        byRegion: [
          { key: '__unknown', label: 'Unspecified', incomeCents: 6_000_000, jobCount: 1 },
          { key: 'NAIROBI', label: 'Nairobi', incomeCents: 3_500_000, jobCount: 1 },
          { key: 'KIAMBU', label: 'Kiambu', incomeCents: 1_000_000, jobCount: 1 },
        ],
        bySegment: [
          { key: 'COMMERCIAL', label: 'Commercial', incomeCents: 6_000_000, jobCount: 1 },
          { key: 'RESIDENTIAL', label: 'Residential', incomeCents: 4_500_000, jobCount: 2 },
        ],
        totalIncomeCents: 10_500_000,
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
      },
    });
  });

  it('GET /admin/financials/summary: income, each kind of cost and what is left', async () => {
    const res = await requestAs('owner', 'GET', SUMMARY);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      summary: {
        incomeCents: 10_500_000,
        expensesByCategoryCents: {
          MATERIALS: 1_000_000,
          TRANSPORT: 2_000_000,
          EMPLOYEE_PAY: 300_000,
          LUNCH: 50_000,
          MISCELLANEOUS: 20_000,
        },
        totalExpensesCents: 3_370_000,
        netCents: 7_130_000,
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
      },
    });
  });

  it('GET /admin/finance/targets: every month that has targets, newest first', async () => {
    const res = await requestAs('owner', 'GET', TARGETS);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      targets: [
        { year: 2026, month: 11, revenueTargetCents: 21_000_000, netProfitTargetCents: 10_000_000, jobsTarget: 6, notes: null },
        { year: 2026, month: 10, revenueTargetCents: 1, netProfitTargetCents: 1, jobsTarget: 1, notes: null },
      ],
    });
  });

  it('PUT /admin/finance/targets: replaces the targets of a month that has them', async () => {
    const res = await requestAs('owner', 'PUT', TARGETS, { ...targetsFor(2026, 11), notes: 'Stretch' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ target: { ...targetsFor(2026, 11), notes: 'Stretch' } });
    expect(t.monthlyTargets).toHaveLength(2);
    expect(t.monthlyTargets.find((m) => m.month === 11)).toMatchObject({ ...targetsFor(2026, 11), notes: 'Stretch' });
  });

  it('PUT /admin/finance/targets: records who set the targets of a month that had none', async () => {
    const res = await requestAs('owner', 'PUT', TARGETS, targetsFor(2026, 9));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ target: { ...targetsFor(2026, 9), notes: null } });
    expect(t.monthlyTargets.find((m) => m.month === 9)).toMatchObject({ ...targetsFor(2026, 9), createdById: 'owner' });
  });
});

describe('saving targets', () => {
  it('AE11: saves for the COO', async () => {
    const res = await requestAs('coo', 'PUT', TARGETS, targetsFor(2026, 11));

    expect(res.statusCode).toBe(200);
    expect(t.monthlyTargets.find((m) => m.month === 11)).toMatchObject(targetsFor(2026, 11));
  });

  it('AE11: refuses a SHAREHOLDER account linked to a shareholder record, and changes nothing', async () => {
    const before = t.monthlyTargets.map((m) => ({ ...m }));

    const res = await requestAs('shareholderLinked', 'PUT', TARGETS, targetsFor(2026, 11));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'target-setting access required' });
    expect(t.monthlyTargets).toEqual(before);
  });

  it('saves next month in advance for an account that may set targets', async () => {
    const res = await requestAs('finance', 'PUT', TARGETS, targetsFor(2026, 12));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ target: { ...targetsFor(2026, 12), notes: null } });
    expect(t.monthlyTargets.find((m) => m.month === 12)).toMatchObject({ ...targetsFor(2026, 12), createdById: 'finance' });
  });
});

describe('who may ask for the data behind sections 2 to 4', () => {
  const ADDRESSES: Array<[string, 'GET' | 'PUT', string]> = [
    ['the overview', 'GET', OVERVIEW],
    ['the targets', 'GET', TARGETS],
    ['saving targets', 'PUT', TARGETS],
    ['the revenue breakdown', 'GET', BREAKDOWN],
    ['the expense summary', 'GET', SUMMARY],
  ];
  const ask = (who: CastId | null, method: 'GET' | 'PUT', url: string) =>
    requestAs(who, method, url, method === 'PUT' ? targetsFor(2026, 11) : undefined);

  describe.each(ADDRESSES)('%s', (_name, method, url) => {
    it.each<CastId>(['owner', 'admin', 'coo', 'cooLinked', 'finance'])('answers %s', async (who) => {
      expect((await ask(who, method, url)).statusCode).toBe(200);
    });

    // `demoted` signed in as ADMIN and is SUPPORT on the record: the record decides.
    it.each<CastId>(['shareholderLinked', 'shareholder', 'support', 'supportLinked', 'demoted', 'customer', 'crewLinked'])(
      'refuses %s',
      async (who) => {
        expect((await ask(who, method, url)).statusCode).toBe(403);
      },
    );

    it('answers 401 with no sign-in', async () => {
      expect((await ask(null, method, url)).statusCode).toBe(401);
    });
  });
});

describe('the routes that did not move keep the guard they had', () => {
  // Finance records: the owner, admins, the financial manager and shareholders.
  // Declared payouts: the owner and anyone on the cap table.
  // Financials: the owner only.
  it.each<[string, number, number, number]>([
    [`/admin/finance/marketing?${NOVEMBER}`, 200, 200, 200],
    ['/admin/finance/assets', 200, 200, 200],
    ['/admin/finance/investments', 200, 200, 200],
    [`/admin/finance/unreconciled?${NOVEMBER}`, 200, 200, 200],
    ['/admin/finance/distributions', 200, 403, 200],
    ['/admin/financials/trends', 200, 403, 403],
    [`/admin/financials/jobs?${NOVEMBER}`, 200, 403, 403],
    ['/admin/financials/reports', 200, 403, 403],
    ['/admin/financials/unsorted', 200, 403, 403],
    ['/admin/financials/totals', 200, 403, 403],
    ['/admin/financials/shareholders', 200, 403, 403],
    [`/admin/financials/equity?${NOVEMBER}`, 200, 403, 403],
    ['/admin/financials/equity/history', 200, 403, 403],
  ])('GET %s: owner %i, ADMIN %i, linked SHAREHOLDER %i', async (url, owner, admin, shareholderLinked) => {
    expect((await requestAs('owner', 'GET', url)).statusCode).toBe(owner);
    expect((await requestAs('admin', 'GET', url)).statusCode).toBe(admin);
    expect((await requestAs('shareholderLinked', 'GET', url)).statusCode).toBe(shareholderLinked);
  });
});
