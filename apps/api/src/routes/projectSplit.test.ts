import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// A project's money split (owner's rules, 20 November 2026): the machines it
// uses, the shareholders' pay-ins split by stake, and its profit with 5% for
// marketing and the rest by stake.

type Row = Record<string, any>;
const s = {
  payIns: [] as Row[],
  investments: [] as Row[],
  listed: [] as Row[],
  events: [] as Row[],
  seq: 0,
};

const USERS: Record<string, Row> = {
  owner: { id: 'owner', fullName: 'Test Owner', role: 'ADMIN', isOwner: true },
  finance: { id: 'finance', fullName: 'Fin Manager', role: 'FINANCIAL_MANAGER', isOwner: false },
  sup: { id: 'sup', fullName: 'Sam Supervisor', role: 'CLEANING_SUPERVISOR', isOwner: false },
};

const HOLDERS = [
  { id: 'a', name: 'Amina', basisPoints: 5_000, sortOrder: 0 },
  { id: 'b', name: 'Brian', basisPoints: 3_000, sortOrder: 1 },
  { id: 'c', name: 'Chege', basisPoints: 2_000, sortOrder: 2 },
];

const ASSETS: Row[] = [
  { id: 'm1', name: 'Scrubber', projectRateCents: 50_000, countsFrom: new Date('2026-01-01'), retiredAt: null },
  { id: 'm2', name: 'Old buffer', projectRateCents: 30_000, countsFrom: new Date('2026-01-01'), retiredAt: new Date('2026-06-01') },
];

// The owner's example: paid 10,000; costs 5,000; machine 2 days at 500.
const JOBS = [{
  id: 'j1', title: 'Invoice OH-2026-0001', date: new Date('2026-11-10'), incomeCents: 1_000_000, discountCents: 0,
  status: 'OWNER_ENTRY', placement: 'PROJECT', projectId: 'p1',
  expenses: [{ category: 'MATERIALS', amountCents: 500_000 }], machineLines: [{ amountCents: 100_000 }],
}];

const payInWithRelations = (p: Row) => ({
  ...p,
  createdBy: { fullName: USERS[p.createdById]?.fullName ?? null },
  investments: s.investments
    .filter((i) => i.payInId === p.id)
    .map((i) => {
      const h = HOLDERS.find((x) => x.id === i.shareholderId)!;
      return { amountCents: i.amountCents, shareholderId: i.shareholderId, shareholder: { name: h.name, sortOrder: h.sortOrder } };
    }),
});

const db = {
  user: { findUnique: vi.fn(async ({ where }: Row) => USERS[where.id] ?? null) },
  project: {
    findUnique: vi.fn(async ({ where }: Row) => (where.id === 'p1' ? { id: 'p1', title: 'Office contract' } : null)),
  },
  job: { findMany: vi.fn(async () => JOBS) },
  shareholder: { findMany: vi.fn(async () => HOLDERS) },
  projectEvent: { create: vi.fn(async ({ data }: Row) => s.events.push(data)) },
  projectPayIn: {
    findMany: vi.fn(async () => s.payIns.map(payInWithRelations)),
    findUnique: vi.fn(async ({ where }: Row) => s.payIns.find((p) => p.id === where.id) ?? null),
    create: vi.fn(async ({ data }: Row) => {
      const { investments, ...rest } = data;
      const row = { id: `pi${++s.seq}`, createdAt: new Date(), ...rest };
      s.payIns.push(row);
      for (const inv of investments.create) s.investments.push({ ...inv, payInId: row.id });
      return payInWithRelations(row);
    }),
    delete: vi.fn(async ({ where }: Row) => {
      s.payIns = s.payIns.filter((p) => p.id !== where.id);
      s.investments = s.investments.filter((i) => i.payInId !== where.id);
    }),
  },
  projectMachine: {
    findMany: vi.fn(async ({ select }: Row) =>
      s.listed.map((l) => (select.asset ? { halfDaysPerVisit: l.halfDaysPerVisit, asset: ASSETS.find((a) => a.id === l.assetId) } : l)),
    ),
    deleteMany: vi.fn(async ({ where }: Row) => {
      s.listed = s.listed.filter((l) => where.assetId.notIn.includes(l.assetId));
    }),
    upsert: vi.fn(async ({ create, update }: Row) => {
      const found = s.listed.find((l) => l.assetId === create.assetId);
      if (found) Object.assign(found, update);
      else s.listed.push({ ...create });
    }),
  },
  asset: {
    findMany: vi.fn(async () => ASSETS.filter((a) => !a.retiredAt)),
    count: vi.fn(async ({ where }: Row) => ASSETS.filter((a) => where.id.in.includes(a.id) && !a.retiredAt).length),
  },
  $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
};
vi.mock('../db.js', () => ({ prisma: db }));

const { signAccessToken } = await import('../auth/jwt.js');
const { projectSplitRoutes } = await import('./projectSplit.js');

async function call(who: keyof typeof USERS, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) {
  const server = Fastify();
  await server.register(projectSplitRoutes, { prefix: '/admin/projects' });
  const token = (await signAccessToken(who, USERS[who]!.role)).token;
  return server.inject({ method, url: `/admin/projects${url}`, payload, headers: { authorization: `Bearer ${token}` } });
}

vi.useFakeTimers({ toFake: ['Date'] });
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-20T09:00:00Z'));
  Object.assign(s, { payIns: [], investments: [], listed: [], events: [], seq: 0 });
});

describe('who can see and change it', () => {
  it('keeps it from staff without the money roles', async () => {
    expect((await call('sup', 'GET', '/p1/split')).statusCode).toBe(403);
  });

  it('lets the financial manager see it and keep the machine list, but not record a pay-in', async () => {
    expect((await call('finance', 'GET', '/p1/split')).statusCode).toBe(200);
    expect((await call('finance', 'PUT', '/p1/machines', { machines: [{ assetId: 'm1', halfDaysPerVisit: 1 }] })).statusCode).toBe(200);
    const res = await call('finance', 'POST', '/p1/pay-ins', { totalCents: 500_000, date: '2026-11-05' });
    expect(res.statusCode).toBe(403);
    expect(s.payIns).toHaveLength(0);
  });
});

describe('pay-ins', () => {
  it('splits the total by stake into one investment each, kept as their investment', async () => {
    const res = await call('owner', 'POST', '/p1/pay-ins', { totalCents: 500_000, date: '2026-11-05', note: 'Chemicals' });

    expect(res.statusCode).toBe(201);
    expect(res.json().payIn).toMatchObject({
      totalCents: 500_000, date: '2026-11-05', note: 'Chemicals', companyCents: 0,
      shares: [
        { shareholderId: 'a', shareholderName: 'Amina', amountCents: 250_000 },
        { shareholderId: 'b', shareholderName: 'Brian', amountCents: 150_000 },
        { shareholderId: 'c', shareholderName: 'Chege', amountCents: 100_000 },
      ],
    });
    expect(s.investments.map((i) => [i.shareholderId, i.kind, i.amountCents, i.purpose])).toEqual([
      ['a', 'CAPITAL_INJECTION', 250_000, 'Costs paid in for the project Office contract'],
      ['b', 'CAPITAL_INJECTION', 150_000, 'Costs paid in for the project Office contract'],
      ['c', 'CAPITAL_INJECTION', 100_000, 'Costs paid in for the project Office contract'],
    ]);
    expect(s.events[0]).toMatchObject({ summary: 'Shareholders paid in KSh 5,000 towards costs' });
  });

  it('refuses a future day and an amount under KSh 1', async () => {
    expect((await call('owner', 'POST', '/p1/pay-ins', { totalCents: 500_000, date: '2026-11-21' })).statusCode).toBe(400);
    expect((await call('owner', 'POST', '/p1/pay-ins', { totalCents: 50, date: '2026-11-05' })).statusCode).toBe(400);
  });

  it('removes a pay-in with its investments', async () => {
    const { payIn } = (await call('owner', 'POST', '/p1/pay-ins', { totalCents: 500_000, date: '2026-11-05' })).json();

    expect((await call('owner', 'DELETE', `/p1/pay-ins/${payIn.id}`)).statusCode).toBe(200);
    expect(s.payIns).toHaveLength(0);
    expect(s.investments).toHaveLength(0);
    expect((await call('owner', 'DELETE', `/p1/pay-ins/${payIn.id}`)).statusCode).toBe(404);
  });
});

describe('the split', () => {
  it("gives the owner's example: profit 4,000, marketing 200, 3,800 by stake beside what each paid in", async () => {
    await call('owner', 'POST', '/p1/pay-ins', { totalCents: 500_000, date: '2026-11-05' });

    const res = await call('finance', 'GET', '/p1/split');

    expect(res.json()).toMatchObject({
      profitCents: 400_000,
      marketingCents: 20_000,
      sharedCents: 380_000,
      unallocatedCents: 0,
      paidInCents: 500_000,
      holders: [
        { shareholderId: 'a', name: 'Amina', basisPoints: 5_000, paidInCents: 250_000, profitShareCents: 190_000 },
        { shareholderId: 'b', name: 'Brian', basisPoints: 3_000, paidInCents: 150_000, profitShareCents: 114_000 },
        { shareholderId: 'c', name: 'Chege', basisPoints: 2_000, paidInCents: 100_000, profitShareCents: 76_000 },
      ],
    });
  });
});

describe('machines', () => {
  it('lists the machines with their days per visit, and offers the rest of the register', async () => {
    const res = await call('owner', 'PUT', '/p1/machines', { machines: [{ assetId: 'm1', halfDaysPerVisit: 2 }] });

    expect(res.json()).toEqual({
      machines: [{ assetId: 'm1', name: 'Scrubber', halfDaysPerVisit: 2, projectRateCents: 50_000, retired: false }],
      available: [],
    });
    expect(s.events[0]).toMatchObject({ summary: 'Machines changed', detail: 'Scrubber: 1 day per visit' });
  });

  it('refuses adding a retired machine, and the same machine twice', async () => {
    const retired = await call('owner', 'PUT', '/p1/machines', { machines: [{ assetId: 'm2', halfDaysPerVisit: 1 }] });
    expect(retired.statusCode).toBe(400);
    const twice = await call('owner', 'PUT', '/p1/machines', {
      machines: [{ assetId: 'm1', halfDaysPerVisit: 1 }, { assetId: 'm1', halfDaysPerVisit: 2 }],
    });
    expect(twice.statusCode).toBe(400);
    expect(s.listed).toHaveLength(0);
  });

  it('takes a machine off the list', async () => {
    await call('owner', 'PUT', '/p1/machines', { machines: [{ assetId: 'm1', halfDaysPerVisit: 1 }] });
    const res = await call('owner', 'PUT', '/p1/machines', { machines: [] });
    expect(res.json().machines).toEqual([]);
    expect(s.listed).toHaveLength(0);
  });
});
