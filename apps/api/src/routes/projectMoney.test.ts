import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CostLineDto, MoneyFiguresDto, ProjectMoneyDetail, ProjectMoneyTable } from '@onyxhawk/types';

// Project money is for the owner, the admin, the financial manager and the
// COO. These tests cover who gets in, what the two answers hold, and what they
// leave out.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Role in the database; the token carries the role the user signed in with.
const users: Record<string, { role: string; isOwner: boolean; fullName: string; tokenRole?: string }> = {
  owner: { role: 'ADMIN', isOwner: true, fullName: 'Olive Owner' },
  admin: { role: 'ADMIN', isOwner: false, fullName: 'Adam Admin' },
  finance: { role: 'FINANCIAL_MANAGER', isOwner: false, fullName: 'Faith Finance' },
  coo: { role: 'COO', isOwner: false, fullName: 'Carol Coo' },
  support: { role: 'SUPPORT', isOwner: false, fullName: 'Sue Support' },
  marketing: { role: 'MARKETING', isOwner: false, fullName: 'Mark Marketing' },
  supervisor: { role: 'CLEANING_SUPERVISOR', isOwner: false, fullName: 'Sam Supervisor' },
  shareholder: { role: 'SHAREHOLDER', isOwner: false, fullName: 'Shah Shareholder' },
  crew: { role: 'CREW', isOwner: false, fullName: 'Chris Crew' },
  customer: { role: 'CUSTOMER', isOwner: false, fullName: 'Cate Customer' },
  // Signed in as ADMIN, since made support in the database.
  demoted: { role: 'SUPPORT', isOwner: false, fullName: 'Dan Demoted', tokenRole: 'ADMIN' },
};

const t = { projects: [] as Row[], jobs: [] as Row[], expenses: [] as Row[] };

/** The subset of Prisma's `where` these routes use: equality and `in`. */
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) =>
    v !== null && typeof v === 'object' && 'in' in v ? (v.in as unknown[]).includes(row[k]) : row[k] === v);

/** Prisma's `orderBy`: one `{ column: 'asc' | 'desc' }`, or a list of them. */
function sorted(rows: Row[], orderBy: Row | Row[] = []) {
  const keys = [orderBy].flat().map((o) => Object.entries(o)[0] as [string, 'asc' | 'desc']);
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      if (a[k] < b[k]) return dir === 'asc' ? -1 : 1;
      if (a[k] > b[k]) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

/** A job with its costs, each cost with who entered it. The whole row comes back, whatever was selected. */
const withCosts = (job: Row, costOrder?: Row) => ({
  ...job,
  expenses: sorted(t.expenses.filter((e) => e.jobId === job.id), costOrder).map((e) => ({
    ...e,
    createdBy: { fullName: users[e.createdById]!.fullName },
  })),
});

vi.mock('../db.js', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: Row) => (users[where.id] ? { id: where.id, ...users[where.id] } : null),
    },
    project: {
      findMany: async ({ orderBy }: Row = {}) => sorted(t.projects, orderBy),
      findUnique: async ({ where }: Row) => t.projects.find((p) => p.id === where.id) ?? null,
    },
    job: {
      findMany: async ({ where, orderBy, select }: Row = {}) =>
        sorted(t.jobs.filter((j) => matches(j, where)), orderBy).map((j) => withCosts(j, select?.expenses?.orderBy)),
    },
  },
}));

const { signAccessToken } = await import('../auth/jwt.js');
const { projectMoneyRoutes } = await import('./projectMoney.js');
const { projectRoutes } = await import('./projects.js');

async function get(url: string, userId?: string) {
  const server = Fastify();
  await server.register(projectMoneyRoutes, { prefix: '/admin/project-money' });
  await server.register(projectRoutes, { prefix: '/admin/projects' });
  const headers: Record<string, string> = {};
  if (userId) {
    const u = users[userId]!;
    headers.authorization = `Bearer ${(await signAccessToken(userId, u.tokenRole ?? u.role)).token}`;
  }
  return server.inject({ method: 'GET', url, headers });
}

const TABLE = '/admin/project-money';
const contract = (id: string) => `/admin/project-money/projects/${id}`;

async function table(userId = 'finance'): Promise<ProjectMoneyTable> {
  const res = await get(TABLE, userId);
  expect(res.statusCode).toBe(200);
  return res.json().table;
}

async function detail(id: string, userId = 'finance'): Promise<ProjectMoneyDetail> {
  const res = await get(contract(id), userId);
  expect(res.statusCode).toBe(200);
  return res.json().detail;
}

/** A date as the database gives a job's or a cost's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

// What a project and a job hold about the client. None of it may be served.
const PRIVATE = {
  projectClient: 'Acme Developers Ltd',
  projectPhone: '+254700111222',
  projectSite: 'Westlands, Mpaka Road',
  projectNotes: 'gate code 4411',
  jobClient: 'Jane Wanjiru',
  jobPhone: '+254711000999',
  jobLocation: 'Kilimani, Ring Road',
  jobNotes: 'client asked for a discount next time',
};

/** A project row as the Projects list loads it: a one-off contract with an empty checklist. */
function project(id: string, over: Row = {}) {
  t.projects.push({
    id, title: `Contract ${id}`, clientName: PRIVATE.projectClient, clientPhone: PRIVATE.projectPhone,
    siteLocation: PRIVATE.projectSite, serviceLineCode: null, clientSegment: null, stage: 'IN_PROGRESS',
    startDate: null, targetEndDate: null, completedAt: null, valueCents: 5_000_000, paymentFrequency: 'ONE_OFF',
    notes: PRIVATE.projectNotes, checklist: [], _count: { events: 0 }, createdBy: { fullName: 'Olive Owner' },
    createdAt: new Date('2026-01-05T08:00:00.000Z'), updatedAt: new Date('2026-01-05T08:00:00.000Z'), ...over,
  });
}

/** An owner-entered job, not yet sorted, with nothing charged. */
function job(id: string, over: Row = {}) {
  t.jobs.push({
    id, title: `Job ${id}`, date: day('2026-03-10'), incomeCents: 0, discountCents: 0, status: 'OWNER_ENTRY',
    placement: 'UNSORTED', projectId: null, clientName: PRIVATE.jobClient, clientPhone: PRIVATE.jobPhone,
    clientLocation: PRIVATE.jobLocation, notes: PRIVATE.jobNotes, ...over,
  });
}
const under = (projectId: string) => ({ placement: 'PROJECT', projectId });
const oneOff = { placement: 'STANDALONE', projectId: null };

/** A materials cost on a job, entered by the owner, with no receipt. */
function cost(id: string, jobId: string, amountCents: number, over: Row = {}) {
  t.expenses.push({
    id, jobId, category: 'MATERIALS', amountCents, description: null, date: day('2026-03-10'),
    receiptRef: null, receiptUrl: null, createdById: 'owner', ...over,
  });
}

const ZERO: MoneyFiguresDto = { jobCount: 0, typedCents: 0, discountCents: 0, chargedCents: 0, spentCents: 0, profitCents: 0 };

/** The figures of some fixture jobs, added up here from the seeded rows. */
function addUp(jobs: Row[]): MoneyFiguresDto {
  const ids = new Set(jobs.map((j) => j.id));
  const typedCents = jobs.reduce((acc, j) => acc + j.incomeCents, 0);
  const discountCents = jobs.reduce((acc, j) => acc + j.discountCents, 0);
  const spentCents = t.expenses.filter((e) => ids.has(e.jobId)).reduce((acc, e) => acc + e.amountCents, 0);
  return {
    jobCount: jobs.length, typedCents, discountCents, chargedCents: typedCents - discountCents,
    spentCents, profitCents: typedCents - discountCents - spentCents,
  };
}

beforeEach(() => {
  t.projects = [];
  t.jobs = [];
  t.expenses = [];
});

describe.each([TABLE, contract('p1')])('who may open %s', (url) => {
  beforeEach(() => project('p1'));

  it.each(['owner', 'admin', 'finance', 'coo'])('lets %s in', async (userId) => {
    expect((await get(url, userId)).statusCode).toBe(200);
  });

  it.each(['support', 'marketing', 'supervisor', 'shareholder', 'crew', 'customer'])('refuses %s', async (userId) => {
    const res = await get(url, userId);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'project money access required (owner, admin, financial manager or COO)' });
  });

  it('refuses a request with no sign-in as unauthorised', async () => {
    expect((await get(url)).statusCode).toBe(401);
  });

  it('refuses a user whose token says admin but whose record now says support', async () => {
    expect((await get(url, 'demoted')).statusCode).toBe(403);
  });
});

describe('GET /admin/projects, as support', () => {
  it('AE7: answers with the fields it has today and no charged, spent or profit figure', async () => {
    project('p1');
    job('j1', { ...under('p1'), incomeCents: 6_000_000 });
    cost('c1', 'j1', 2_000_000);

    const res = await get('/admin/projects', 'support');

    expect(res.statusCode).toBe(200);
    const { projects } = res.json();
    expect(projects).toHaveLength(1);
    expect(Object.keys(projects[0])).toEqual([
      'id', 'title', 'clientName', 'clientPhone', 'siteLocation', 'serviceLineCode', 'clientSegment', 'stage',
      'startDate', 'targetEndDate', 'completedAt', 'valueCents', 'paymentFrequency', 'billingPeriods',
      'estimatedTotalCents', 'notes', 'checklist', 'progressPercent', 'answeredCount', 'checklistCount',
      'blockerCount', 'eventCount', 'createdByName', 'createdAt', 'updatedAt',
    ]);
    expect(res.body).not.toMatch(/charged|spent|profit/i);
  });
});

describe('GET /admin/project-money', () => {
  it('AE3: with 20 of 50 jobs sorted, adds the other 30 in the not-yet-sorted line, and the totals hold every job', async () => {
    project('p1');
    project('p2');
    for (let i = 1; i <= 50; i += 1) {
      const place = i <= 12 ? under('p1') : i <= 16 ? under('p2') : i <= 20 ? oneOff : {};
      job(`j${i}`, {
        incomeCents: i * 100_000,
        discountCents: i % 5 === 0 ? 20_000 : 0,
        status: i % 2 === 0 ? 'APPROVED' : 'OWNER_ENTRY',
        ...place,
      });
      cost(`c${i}`, `j${i}`, i * 40_000);
    }
    const unsorted = t.jobs.filter((j) => j.placement === 'UNSORTED');
    expect(unsorted).toHaveLength(30);

    const answer = await table();

    expect(answer.unsorted).toEqual(addUp(unsorted));
    expect(answer.totals).toEqual(addUp(t.jobs));
    // Jobs 1 to 50: typed 1,275 x KSh 1,000; ten discounts of KSh 200; costs 1,275 x KSh 400.
    expect(answer.totals).toEqual({
      jobCount: 50, typedCents: 127_500_000, discountCents: 200_000,
      chargedCents: 127_300_000, spentCents: 51_000_000, profitCents: 76_300_000,
    });
    expect(answer.projects).toEqual([
      { projectId: 'p1', ...addUp(t.jobs.filter((j) => j.projectId === 'p1')) },
      { projectId: 'p2', ...addUp(t.jobs.filter((j) => j.projectId === 'p2')) },
    ]);
    expect(answer.oneOff).toEqual(addUp(t.jobs.filter((j) => j.placement === 'STANDALONE')));
  });

  it('has no not-yet-sorted line when every job is sorted', async () => {
    project('p1');
    job('j1', { ...under('p1'), incomeCents: 3_000_000 });
    job('j2', { ...oneOff, incomeCents: 1_000_000 });

    const answer = await table();

    expect(answer.unsorted).toBeNull();
    expect(answer.totals.jobCount).toBe(2);
  });

  it('lists every project, newest change first, with zero figures for one that has no jobs', async () => {
    project('p-old', { updatedAt: new Date('2026-02-01T08:00:00.000Z') });
    project('p-empty', { updatedAt: new Date('2026-05-01T08:00:00.000Z') });
    job('j1', { ...under('p-old'), incomeCents: 3_000_000 });
    cost('c1', 'j1', 1_000_000);

    const answer = await table();

    expect(answer.projects).toEqual([
      { projectId: 'p-empty', ...ZERO },
      {
        projectId: 'p-old', jobCount: 1, typedCents: 3_000_000, discountCents: 0,
        chargedCents: 3_000_000, spentCents: 1_000_000, profitCents: 2_000_000,
      },
    ]);
  });
});

describe('GET /admin/project-money/projects/:id', () => {
  it('lists the jobs newest first, each with its figures and its cost lines', async () => {
    project('p1');
    job('jA', { ...under('p1'), title: 'Deep clean, block A', date: day('2026-03-10'), incomeCents: 6_000_000, discountCents: 500_000 });
    job('jB', { ...under('p1'), title: 'Window clean, block B', date: day('2026-04-22'), incomeCents: 4_000_000, status: 'APPROVED' });
    cost('cA1', 'jA', 1_200_000, { description: 'Detergent and mops', date: day('2026-03-09'), receiptRef: 'QK7H2M4X1P' });
    cost('cA2', 'jA', 2_000_000, { category: 'EMPLOYEE_PAY', date: day('2026-03-10'), createdById: 'supervisor' });
    cost('cB1', 'jB', 300_000, { category: 'TRANSPORT', description: 'Van hire', date: day('2026-04-22') });
    // Another project's job and a one-off job stay out.
    project('p2');
    job('jC', { ...under('p2'), incomeCents: 9_000_000 });
    job('jD', { ...oneOff, incomeCents: 7_000_000 });

    expect(await detail('p1')).toEqual({
      projectId: 'p1',
      totals: {
        jobCount: 2, typedCents: 10_000_000, discountCents: 500_000,
        chargedCents: 9_500_000, spentCents: 3_500_000, profitCents: 6_000_000,
      },
      spentByGroupCents: { MATERIALS: 1_200_000, TRANSPORT: 300_000, EMPLOYEE_PAY: 2_000_000, LUNCH: 0, MISCELLANEOUS: 0 },
      months: [],
      jobs: [
        {
          jobId: 'jB', date: '2026-04-22', title: 'Window clean, block B',
          typedCents: 4_000_000, discountCents: 0, chargedCents: 4_000_000, spentCents: 300_000, profitCents: 3_700_000,
          costs: [
            {
              id: 'cB1', date: '2026-04-22', category: 'TRANSPORT', description: 'Van hire', amountCents: 300_000,
              enteredByName: 'Olive Owner', receiptRef: null, receiptUrl: null,
            },
          ],
        },
        {
          jobId: 'jA', date: '2026-03-10', title: 'Deep clean, block A',
          typedCents: 6_000_000, discountCents: 500_000, chargedCents: 5_500_000, spentCents: 3_200_000, profitCents: 2_300_000,
          costs: [
            {
              id: 'cA2', date: '2026-03-10', category: 'EMPLOYEE_PAY', description: null, amountCents: 2_000_000,
              enteredByName: 'Sam Supervisor', receiptRef: null, receiptUrl: null,
            },
            {
              id: 'cA1', date: '2026-03-09', category: 'MATERIALS', description: 'Detergent and mops', amountCents: 1_200_000,
              enteredByName: 'Olive Owner', receiptRef: 'QK7H2M4X1P', receiptUrl: null,
            },
          ],
        },
      ],
    });
  });

  /** The one cost line of a contract with one job, stored with the given receipt fields. */
  async function costLine(stored: Row): Promise<CostLineDto> {
    project('p1');
    job('j1', { ...under('p1'), incomeCents: 2_000_000 });
    cost('c1', 'j1', 450_000, { createdById: 'supervisor', ...stored });
    return (await detail('p1')).jobs[0]!.costs[0]!;
  }

  it('AE5: a cost line with no receipt carries who entered it and an empty receipt', async () => {
    const line = await costLine({ receiptRef: null, receiptUrl: null });

    expect(line.enteredByName).toBe('Sam Supervisor');
    expect(line.receiptRef).toBeNull();
    expect(line.receiptUrl).toBeNull();
  });

  it('a cost line with only a receipt link carries the link', async () => {
    const line = await costLine({ receiptUrl: 'https://files.example.com/receipts/r-17.jpg' });

    expect(line.receiptUrl).toBe('https://files.example.com/receipts/r-17.jpg');
    expect(line.receiptRef).toBeNull();
  });

  it.each(['javascript:alert(document.cookie)', 'data:text/html,<script>alert(1)</script>', 'in the blue folder'])(
    'a cost line whose stored link is %j carries no link',
    async (receiptUrl) => {
      const line = await costLine({ receiptUrl });

      expect(line.receiptUrl).toBeNull();
    },
  );

  it('AE6: a monthly contract has a row for each month; a one-off contract has none', async () => {
    for (const [id, paymentFrequency] of [['pm', 'MONTHLY'], ['po', 'ONE_OFF']] as const) {
      project(id, { paymentFrequency });
      job(`${id}-mar`, { ...under(id), date: day('2026-03-14'), incomeCents: 3_000_000 });
      job(`${id}-apr`, { ...under(id), date: day('2026-04-02'), incomeCents: 2_000_000, discountCents: 100_000 });
      job(`${id}-may`, { ...under(id), date: day('2026-05-30'), incomeCents: 4_000_000 });
      cost(`${id}-c1`, `${id}-mar`, 1_000_000, { date: day('2026-03-14') });
      cost(`${id}-c2`, `${id}-apr`, 500_000, { date: day('2026-04-02') });
      cost(`${id}-c3`, `${id}-may`, 4_500_000, { date: day('2026-05-30') });
    }
    const totals = {
      jobCount: 3, typedCents: 9_000_000, discountCents: 100_000,
      chargedCents: 8_900_000, spentCents: 6_000_000, profitCents: 2_900_000,
    };

    const monthly = await detail('pm');
    expect(monthly.months).toEqual([
      { month: '2026-03', jobCount: 1, typedCents: 3_000_000, discountCents: 0, chargedCents: 3_000_000, spentCents: 1_000_000, profitCents: 2_000_000 },
      { month: '2026-04', jobCount: 1, typedCents: 2_000_000, discountCents: 100_000, chargedCents: 1_900_000, spentCents: 500_000, profitCents: 1_400_000 },
      { month: '2026-05', jobCount: 1, typedCents: 4_000_000, discountCents: 0, chargedCents: 4_000_000, spentCents: 4_500_000, profitCents: -500_000 },
    ]);
    expect(monthly.totals).toEqual(totals);

    const once = await detail('po');
    expect(once.months).toEqual([]);
    expect(once.totals).toEqual(totals);
  });

  it('AE2: a job waiting for approval, with costs, is in no line and not in the contract', async () => {
    project('p1');
    job('counted', { ...under('p1'), incomeCents: 1_000_000 });
    cost('c-counted', 'counted', 300_000);
    // As stored while it waits: not yet sorted.
    job('waiting', { status: 'PENDING', incomeCents: 9_000_000 });
    cost('c-waiting', 'waiting', 400_000);
    // And one stored under the contract, so the contract's own answer is put to the test.
    job('waiting-here', { ...under('p1'), status: 'PENDING', incomeCents: 9_000_000 });
    cost('c-waiting-here', 'waiting-here', 400_000);
    const onlyCounted = {
      jobCount: 1, typedCents: 1_000_000, discountCents: 0,
      chargedCents: 1_000_000, spentCents: 300_000, profitCents: 700_000,
    };

    expect(await table()).toEqual({
      projects: [{ projectId: 'p1', ...onlyCounted }],
      oneOff: ZERO,
      unsorted: null,
      totals: onlyCounted,
    });
    const answer = await detail('p1');
    expect(answer.totals).toEqual(onlyCounted);
    expect(answer.jobs.map((j) => j.jobId)).toEqual(['counted']);
  });

  it('AE9: typed KSh 100,000 with KSh 5,000 of discounts and KSh 110,000 of costs is a loss of KSh 15,000', async () => {
    project('p1');
    job('j1', { ...under('p1'), incomeCents: 6_000_000, discountCents: 500_000 });
    job('j2', { ...under('p1'), incomeCents: 4_000_000, status: 'APPROVED' });
    cost('c1', 'j1', 7_000_000, { category: 'EMPLOYEE_PAY' });
    cost('c2', 'j2', 4_000_000);
    const loss = {
      jobCount: 2, typedCents: 10_000_000, discountCents: 500_000,
      chargedCents: 9_500_000, spentCents: 11_000_000, profitCents: -1_500_000,
    };

    expect((await detail('p1')).totals).toEqual(loss);
    expect((await table()).projects).toEqual([{ projectId: 'p1', ...loss }]);
  });

  it('answers 404 for a contract that does not exist', async () => {
    const res = await get(contract('nope'), 'finance');

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'project not found' });
  });
});

describe('what the answers leave out', () => {
  it('neither answer holds a client name, a phone number, a location or notes', async () => {
    project('p1');
    job('j1', { ...under('p1'), incomeCents: 2_000_000 });
    job('j2', { incomeCents: 1_000_000 });
    cost('c1', 'j1', 450_000, { description: 'Detergent' });

    for (const url of [TABLE, contract('p1')]) {
      const res = await get(url, 'finance');

      expect(res.statusCode).toBe(200);
      expect(res.body).not.toMatch(/clientName|clientPhone|clientLocation|siteLocation|notes/i);
      for (const value of Object.values(PRIVATE)) expect(res.body).not.toContain(value);
    }
  });
});
