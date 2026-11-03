import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * In-memory tables behind the Prisma calls these routes make. Filters and
 * ordering are applied as the database would, and `select` is ignored, so a
 * route that forgets a filter or sends a whole row shows it in its response.
 */
const db = {
  users: [] as Row[],
  shareholders: [] as Row[],
  jobs: [] as Row[],
  expenses: [] as Row[],
  investments: [] as Row[],
  distributions: [] as Row[],
  serviceLines: [] as Row[],
};

const OPS: Record<string, (value: any, arg: any) => boolean> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  in: (v, arg) => arg.includes(v),
  not: (v, arg) => v !== arg,
  gte: (v, arg) => v >= arg,
  lt: (v, arg) => v < arg,
  lte: (v, arg) => v <= arg,
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([field, cond]) => {
    const value = row[field];
    if (cond === null || typeof cond !== 'object') return value === cond;
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    const keys = Object.keys(cond);
    if (keys.every((k) => k in OPS)) return keys.every((k) => OPS[k]!(value, cond[k]));
    return value != null && matches(value, cond); // a relation filter, e.g. job: { status: ... }
  });
}

function sorted(rows: Row[], orderBy: Row | Row[] = []) {
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [field, dir] = Object.entries(order)[0]!;
      if (a[field] < b[field]) return dir === 'desc' ? 1 : -1;
      if (a[field] > b[field]) return dir === 'desc' ? -1 : 1;
    }
    return 0;
  });
}

function aggregate(rows: Row[], args: Row) {
  const pick = (spec: Row = {}, fold: (vals: any[]) => any) => // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.fromEntries(Object.keys(spec).map((k) => [k, rows.length ? fold(rows.map((r) => r[k])) : null]));
  return {
    _sum: pick(args._sum, (vals) => vals.reduce((a, v) => a + v, 0)),
    _min: pick(args._min, (vals) => vals.reduce((a, v) => (v < a ? v : a))),
    _count: { _all: rows.length },
  };
}

const expensesWithJob = () => db.expenses.map((e) => ({ ...e, job: db.jobs.find((j) => j.id === e.jobId) ?? null }));

vi.mock('../db.js', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: Row) => {
        const user = db.users.find((u) => u.id === where.id);
        if (!user) return null;
        const holder = db.shareholders.find((s) => s.userId === user.id);
        return { ...user, shareholder: holder ? { id: holder.id } : null };
      },
    },
    shareholder: {
      findMany: async ({ where, orderBy }: Row = {}) => sorted(db.shareholders.filter((r) => matches(r, where)), orderBy),
    },
    job: {
      findMany: async ({ where }: Row) => db.jobs.filter((r) => matches(r, where)),
      aggregate: async (args: Row) => aggregate(db.jobs.filter((r) => matches(r, args.where)), args),
      groupBy: async (args: Row) => {
        const field = args.by[0];
        const groups = new Map<unknown, Row[]>();
        for (const r of db.jobs.filter((row) => matches(row, args.where))) {
          groups.set(r[field], [...(groups.get(r[field]) ?? []), r]);
        }
        return [...groups].map(([key, rows]) => ({ [field]: key, ...aggregate(rows, args) }));
      },
    },
    expense: {
      findMany: async ({ where }: Row) => expensesWithJob().filter((r) => matches(r, where)),
      aggregate: async (args: Row) => aggregate(expensesWithJob().filter((r) => matches(r, args.where)), args),
    },
    investment: {
      findMany: async ({ where, orderBy }: Row = {}) => sorted(db.investments.filter((r) => matches(r, where)), orderBy),
    },
    profitDistribution: {
      findMany: async ({ where, orderBy }: Row = {}) => sorted(db.distributions.filter((r) => matches(r, where)), orderBy),
    },
    serviceLine: { findMany: async ({ where }: Row = {}) => db.serviceLines.filter((r) => matches(r, where)) },
  },
}));

process.env.LOG_LEVEL = 'warn';
const { signAccessToken } = await import('../auth/jwt.js');
// The whole server, so these tests also prove where the routes are mounted.
const { buildServer } = await import('../server.js');

// ── Seeding ─────────────────────────────────────────────────────────────────

let seq = 0;
const at = (date: string) => new Date(`${date}T00:00:00.000Z`);

function user(id: string, role: string, over: Row = {}) {
  db.users.push({ id, role, isOwner: false, deletedAt: null, fullName: `${id} full name`, ...over });
}

function holder(id: string, name: string, basisPoints: number, over: Row = {}) {
  const row = {
    id,
    name,
    title: null,
    kind: 'INDIVIDUAL',
    basisPoints,
    notes: `${name} private note`,
    userId: null,
    sortOrder: db.shareholders.length,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, ++seq)),
    ...over,
  };
  db.shareholders.push(row);
  return row;
}

function job(date: string, incomeCents: number, over: Row = {}) {
  const row = { id: `job${++seq}`, date: at(date), incomeCents, discountCents: 0, status: 'APPROVED', serviceLineCode: null, ...over };
  db.jobs.push(row);
  return row;
}

function expense(jobId: string, date: string, amountCents: number) {
  db.expenses.push({ id: `exp${++seq}`, jobId, date: at(date), amountCents });
}

function investment(shareholderId: string | null, kind: string, amountCents: number, source = 'Founders') {
  db.investments.push({ id: `inv${++seq}`, shareholderId, kind, amountCents, source, date: at('2026-01-15'), purpose: 'Equipment' });
}

function payout(shareholderId: string, label: string, periodStart: string, periodEnd: string, amountCents: number, status: string, paidAt: Date | null = null) {
  db.distributions.push({
    id: `dist${++seq}`,
    shareholderId,
    label,
    periodStart: at(periodStart),
    periodEnd: at(periodEnd),
    amountCents,
    status,
    paidAt,
    netProfitCents: amountCents * 4,
    basisPoints: 2_500,
    notes: 'payout note',
  });
}

async function get(userId: string, url: string) {
  const role = db.users.find((u) => u.id === userId)?.role ?? 'ADMIN';
  const { token } = await signAccessToken(userId, role);
  const app = await buildServer();
  return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
}

beforeEach(() => {
  for (const table of Object.values(db)) table.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T09:00:00.000Z')); // 12:00 on 3 November in Nairobi
});

afterEach(() => {
  vi.useRealTimers();
});

const NOT_LINKED = { error: expect.any(String), code: 'NOT_SHAREHOLDER' };
const monthOf = (body: Row, key: string) => body.months.find((m: Row) => m.key === key);

// ── Who may open which page ─────────────────────────────────────────────────

describe('GET /admin/my-shares: access', () => {
  it('opens a linked COO\'s own page, and refuses a shareholder-role account linked to nothing (AE7)', async () => {
    user('coo', 'COO');
    user('unlinked', 'SHAREHOLDER');
    holder('sh-coo', 'Wanjiru', 2_000, { userId: 'coo', title: 'COO' });
    holder('sh-company', 'OnyxHawk Ltd', 8_000, { kind: 'COMPANY' });

    const coo = await get('coo', '/admin/my-shares');
    expect(coo.statusCode).toBe(200);
    expect(coo.json().holder).toEqual({ id: 'sh-coo', name: 'Wanjiru', title: 'COO', kind: 'INDIVIDUAL', basisPoints: 2_000 });
    expect((await get('coo', '/admin/my-shares/access')).json()).toEqual({ shareholderId: 'sh-coo', canViewAll: false });

    const unlinked = await get('unlinked', '/admin/my-shares');
    expect(unlinked.statusCode).toBe(403);
    expect(unlinked.json()).toEqual(NOT_LINKED);
    const access = await get('unlinked', '/admin/my-shares/access');
    expect(access.statusCode).toBe(200);
    expect(access.json()).toEqual({ shareholderId: null, canViewAll: false });
  });

  it('treats a revoked account that kept its link, and a deleted one, as not on the list', async () => {
    user('revoked', 'CUSTOMER'); // Team's revoke demotes to CUSTOMER and keeps the link
    user('deleted', 'COO', { deletedAt: new Date('2026-10-01T00:00:00.000Z') });
    holder('sh-revoked', 'Peter', 5_000, { userId: 'revoked' });
    holder('sh-deleted', 'Grace', 5_000, { userId: 'deleted' });

    for (const id of ['revoked', 'deleted']) {
      const page = await get(id, '/admin/my-shares');
      expect(page.statusCode).toBe(403);
      expect(page.json()).toEqual(NOT_LINKED);
      expect((await get(id, '/admin/my-shares/access')).json()).toEqual({ shareholderId: null, canViewAll: false });
    }
  });

  it('lets the owner open any holder, and picks one when none is named', async () => {
    user('owner', 'ADMIN', { isOwner: true });
    holder('sh-brian', 'Brian', 4_000, { sortOrder: 1 });
    holder('sh-amina', 'Amina', 6_000, { sortOrder: 0 });

    const brian = await get('owner', '/admin/my-shares?shareholderId=sh-brian');
    expect(brian.statusCode).toBe(200);
    expect(brian.json().holder).toMatchObject({ id: 'sh-brian', name: 'Brian' });

    const unknown = await get('owner', '/admin/my-shares?shareholderId=sh-nobody');
    expect(unknown.statusCode).toBe(404);

    // Unlinked owner, no id: the first holder by the list's order.
    const first = await get('owner', '/admin/my-shares');
    expect(first.json().holder).toMatchObject({ id: 'sh-amina' });
    expect((await get('owner', '/admin/my-shares/access')).json()).toEqual({ shareholderId: null, canViewAll: true });
  });

  it('opens the owner\'s own holding when the owner is linked', async () => {
    user('owner', 'ADMIN', { isOwner: true });
    holder('sh-amina', 'Amina', 6_000);
    holder('sh-owner', 'Founder', 4_000, { userId: 'owner' });

    expect((await get('owner', '/admin/my-shares')).json().holder).toMatchObject({ id: 'sh-owner' });
    expect((await get('owner', '/admin/my-shares/access')).json()).toEqual({ shareholderId: 'sh-owner', canViewAll: true });
  });

  it('gives an owner with an empty list a page with no holder', async () => {
    user('owner', 'ADMIN', { isOwner: true });

    const res = await get('owner', '/admin/my-shares');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ holder: null });
  });

  it('refuses a shareholder who names another holder, and serves one who names their own', async () => {
    user('amina', 'SHAREHOLDER');
    holder('sh-amina', 'Amina', 6_000, { userId: 'amina' });
    holder('sh-brian', 'Brian', 4_000);

    const other = await get('amina', '/admin/my-shares?shareholderId=sh-brian');
    expect(other.statusCode).toBe(403);
    expect(other.body).not.toContain('Brian');

    const own = await get('amina', '/admin/my-shares?shareholderId=sh-amina');
    expect(own.statusCode).toBe(200);
    expect(own.json().holder).toMatchObject({ id: 'sh-amina' });
  });
});

// ── What the page receives ──────────────────────────────────────────────────

describe('GET /admin/my-shares: figures', () => {
  it('shows a share of a loss as negative and leaves payouts as recorded (AE1)', async () => {
    user('amina', 'SHAREHOLDER');
    holder('sh-amina', 'Amina', 2_500, { userId: 'amina' });
    holder('sh-company', 'OnyxHawk Ltd', 7_500, { kind: 'COMPANY' });
    const sept = job('2026-09-10', 0, { status: 'OWNER_ENTRY' });
    expense(sept.id, '2026-09-12', 4_000_000); // KSh 40,000
    payout('sh-amina', 'Q2 2026', '2026-04-01', '2026-06-30', 500_000, 'PAID', new Date('2026-07-05T10:00:00.000Z'));

    const body = (await get('amina', '/admin/my-shares')).json();

    expect(monthOf(body, '2026-09')).toMatchObject({ inProgress: false, revenueCents: 0, netCents: -4_000_000, ownShareCents: -1_000_000 });
    expect(body.payouts).toMatchObject({ paidCents: 500_000, pendingCents: 0 });
  });

  it("sends a shareholder their own figures and company totals, and nothing about anyone else (AE2)", async () => {
    user('amina', 'COO');
    user('brian', 'SHAREHOLDER');
    holder('sh-amina', 'Amina Wanjiru', 6_283, { userId: 'amina', title: 'COO' });
    holder('sh-brian', 'Brian Otieno', 3_717, { userId: 'brian', title: 'Director' });
    const oct = job('2026-10-14', 2_000_000);
    expense(oct.id, '2026-10-14', 500_000);
    investment('sh-amina', 'CAPITAL_INJECTION', 100_000, 'Amina Wanjiru');
    investment('sh-brian', 'CAPITAL_INJECTION', 777_777, 'Brian Otieno');
    investment(null, 'LOAN', 888_888, 'Brian Otieno, via his sacco');
    payout('sh-amina', 'Q3 2026', '2026-07-01', '2026-09-30', 311_111, 'PENDING');
    payout('sh-brian', 'Q3 2026', '2026-07-01', '2026-09-30', 424_242, 'PAID', new Date('2026-10-02T10:00:00.000Z'));

    const res = await get('amina', '/admin/my-shares');

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Her own figures and the company's.
    expect(body.holder).toEqual({ id: 'sh-amina', name: 'Amina Wanjiru', title: 'COO', kind: 'INDIVIDUAL', basisPoints: 6_283 });
    expect(monthOf(body, '2026-10')).toMatchObject({ revenueCents: 2_000_000, netCents: 1_500_000, ownShareCents: 942_450 });
    expect(body.invested).toEqual({ capitalCents: 100_000, lentCents: 0 });
    expect(body.payouts.pendingCents).toBe(311_111);
    // Nothing about Brian: name, id, stake, share, investments or payouts.
    for (const leak of ['Brian', 'sh-brian', '3717', '557550', '777777', '888888', '424242']) {
      expect(res.body).not.toContain(leak);
    }
    // No private fields of her own row either.
    for (const key of ['"notes"', 'private note', 'userName', 'userId']) {
      expect(res.body).not.toContain(key);
    }
  });

  it('marks months before the first counted job as having no records, and a quiet month after it as zero (AE5)', async () => {
    user('amina', 'SHAREHOLDER');
    holder('sh-amina', 'Amina', 10_000, { userId: 'amina' });
    job('2025-06-10', 80_000, { status: 'PENDING' }); // not counted, so not a record
    job('2026-03-10', 100_000); // the first counted job, eight months before today
    job('2026-04-15', 50_000);
    job('2026-06-02', 70_000);

    const body = (await get('amina', '/admin/my-shares')).json();

    expect(body.currentMonth).toBe('2026-11');
    expect(body.months).toHaveLength(25);
    expect(body.months.filter((m: Row) => m.hasRecords).map((m: Row) => m.key)).toEqual([
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
    ]);
    // Every shown month's year-earlier month predates the first job.
    for (let i = 13; i < 25; i += 1) {
      expect(body.months[i - 12].hasRecords).toBe(false);
    }
    expect(monthOf(body, '2026-05')).toMatchObject({ hasRecords: true, revenueCents: 0, netCents: 0, jobs: 0 });
    expect(body.comparisons.sameMonthLastYear).toMatchObject({ key: '2025-11', hasRecords: false });
    expect(body.comparisons.previousMonth).toMatchObject({ key: '2026-10', hasRecords: true });
  });

  it('splits profit over the whole cap table by largest remainder before sending one holder', async () => {
    user('owner', 'ADMIN', { isOwner: true });
    holder('sh-a', 'Achieng', 3_333);
    holder('sh-b', 'Baraka', 3_333);
    holder('sh-c', 'Chebet', 3_334);
    job('2026-10-05', 100);

    const shares: number[] = [];
    for (const id of ['sh-a', 'sh-b', 'sh-c']) {
      const body = (await get('owner', `/admin/my-shares?shareholderId=${id}`)).json();
      shares.push(monthOf(body, '2026-10').ownShareCents);
      expect(body.periods.allTime.ownShareCents).toBe(monthOf(body, '2026-10').ownShareCents);
    }

    expect(shares).toEqual([33, 33, 34]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('totals payouts to date by status and leaves cancelled ones out', async () => {
    user('amina', 'SHAREHOLDER');
    holder('sh-amina', 'Amina', 2_500, { userId: 'amina' });
    payout('sh-amina', 'Q1 2026', '2026-01-01', '2026-03-31', 50_000, 'PAID', new Date('2026-04-10T08:00:00.000Z'));
    payout('sh-amina', 'Q2 2026', '2026-04-01', '2026-06-30', 20_000, 'PENDING');
    payout('sh-amina', 'Q3 2026', '2026-07-01', '2026-09-30', 10_000, 'CANCELLED');

    const body = (await get('amina', '/admin/my-shares')).json();

    expect(body.payouts).toEqual({
      paidCents: 50_000,
      pendingCents: 20_000,
      rows: [
        { label: 'Q2 2026', periodStart: '2026-04-01', periodEnd: '2026-06-30', amountCents: 20_000, status: 'PENDING', paidAt: null },
        { label: 'Q1 2026', periodStart: '2026-01-01', periodEnd: '2026-03-31', amountCents: 50_000, status: 'PAID', paidAt: '2026-04-10T08:00:00.000Z' },
      ],
    });
  });

  it('counts linked capital as invested and linked loans as lent, and nothing else', async () => {
    user('amina', 'SHAREHOLDER');
    holder('sh-amina', 'Amina', 2_500, { userId: 'amina' });
    investment('sh-amina', 'CAPITAL_INJECTION', 100_000);
    investment('sh-amina', 'LOAN', 30_000);
    investment('sh-amina', 'OTHER', 7_000);
    investment(null, 'GRANT', 55_000);

    const body = (await get('amina', '/admin/my-shares')).json();

    expect(body.invested).toEqual({ capitalCents: 100_000, lentCents: 30_000 });
  });

  it('gives the all-time share as all-time net profit at the current stake', async () => {
    user('amina', 'SHAREHOLDER');
    holder('sh-amina', 'Amina', 2_500, { userId: 'amina' });
    holder('sh-company', 'OnyxHawk Ltd', 7_500, { kind: 'COMPANY' });
    const old = job('2023-02-01', 1_000_000); // long before the 25 months loaded
    expense(old.id, '2023-02-05', 200_000);
    job('2026-10-20', 234_500);

    const body = (await get('amina', '/admin/my-shares')).json();

    expect(body.periods.allTime).toMatchObject({
      from: '2023-02-01',
      to: '2026-11-03',
      revenueCents: 1_234_500,
      netCents: 1_034_500,
      jobs: 2,
      ownShareCents: 258_625,
    });
  });
});
