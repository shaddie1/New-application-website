import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * In-memory tables behind the payout and investment routes. A `where` is
 * applied as the database would; with none, every row comes back, so a route
 * that forgets to scope its rows shows them in its response.
 */
const db = { users: [] as Row[], shareholders: [] as Row[], distributions: [] as Row[], investments: [] as Row[] };

const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([field, value]) =>
    value instanceof Date ? row[field]?.getTime() === value.getTime() : row[field] === value,
  );

let seq = 0;
const nextId = (prefix: string) => `${prefix}${++seq}`;
const stamp = () => ({ createdAt: new Date('2026-10-01T08:00:00.000Z'), updatedAt: new Date('2026-10-01T08:00:00.000Z') });
const creator = (row: Row) => ({ fullName: db.users.find((u) => u.id === row.createdById)?.fullName ?? 'Unknown' });
const holderName = (id: string | null) => {
  const holder = db.shareholders.find((s) => s.id === id);
  return holder ? { name: holder.name } : null;
};
const withDistributionIncludes = (row: Row) => ({ ...row, shareholder: holderName(row.shareholderId), createdBy: creator(row) });
const withInvestmentIncludes = (row: Row) => ({ ...row, shareholder: holderName(row.shareholderId), createdBy: creator(row) });

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
      findMany: async () => [...db.shareholders],
      findUnique: async ({ where }: Row) => db.shareholders.find((s) => s.id === where.id) ?? null,
    },
    profitDistribution: {
      findMany: async ({ where }: Row = {}) => db.distributions.filter((r) => matches(r, where)).map(withDistributionIncludes),
      findFirst: async ({ where }: Row) => db.distributions.find((r) => matches(r, where)) ?? null,
      findUnique: async ({ where }: Row) => db.distributions.find((r) => r.id === where.id) ?? null,
      createMany: async ({ data }: Row) => {
        for (const row of data) db.distributions.push({ id: nextId('dist'), status: 'PENDING', paidAt: null, reference: null, notes: null, ...stamp(), ...row });
        return { count: data.length };
      },
      update: async ({ where, data }: Row) => {
        const row = db.distributions.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return withDistributionIncludes(row);
      },
      delete: async ({ where }: Row) => {
        db.distributions = db.distributions.filter((r) => r.id !== where.id);
      },
    },
    investment: {
      findMany: async ({ where }: Row = {}) => db.investments.filter((r) => matches(r, where)).map(withInvestmentIncludes),
      findUnique: async ({ where }: Row) => db.investments.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: Row) => {
        const row = { id: nextId('inv'), reference: null, documentUrl: null, ...stamp(), ...data };
        db.investments.push(row);
        return withInvestmentIncludes(row);
      },
      update: async ({ where, data }: Row) => {
        const row = db.investments.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return withInvestmentIncludes(row);
      },
      delete: async ({ where }: Row) => {
        db.investments = db.investments.filter((r) => r.id !== where.id);
      },
    },
  },
}));

const { signAccessToken } = await import('../auth/jwt.js');
const { financeRoutes } = await import('./finance.js');

async function as(userId: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const { token } = await signAccessToken(userId, db.users.find((u) => u.id === userId)!.role);
  const app = Fastify();
  await app.register(financeRoutes, { prefix: '/admin/finance' });
  return app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}

const at = (date: string) => new Date(`${date}T00:00:00.000Z`);

function payout(shareholderId: string, amountCents: number, status: string) {
  const row = {
    id: `dist-${shareholderId}`,
    label: 'Q3 2026',
    periodStart: at('2026-07-01'),
    periodEnd: at('2026-09-30'),
    shareholderId,
    netProfitCents: 1_000_000,
    basisPoints: 2_500,
    amountCents,
    status,
    paidAt: status === 'PAID' ? new Date('2026-10-05T10:00:00.000Z') : null,
    reference: null,
    notes: null,
    createdById: 'owner',
    ...stamp(),
  };
  db.distributions.push(row);
  return row;
}

function investment(id: string, shareholderId: string | null, amountCents: number, source: string) {
  db.investments.push({
    id,
    source,
    kind: 'CAPITAL_INJECTION',
    amountCents,
    date: at('2026-01-15'),
    purpose: 'Working capital',
    shareholderId,
    reference: null,
    documentUrl: null,
    createdById: 'owner',
    ...stamp(),
  });
}

beforeEach(() => {
  db.users = [
    { id: 'owner', role: 'ADMIN', isOwner: true, fullName: 'The Founder' },
    { id: 'amina', role: 'SHAREHOLDER', isOwner: false, fullName: 'Amina Wanjiru' },
    { id: 'kevin', role: 'ADMIN', isOwner: false, fullName: 'Kevin Mutua' },
    { id: 'fm', role: 'FINANCIAL_MANAGER', isOwner: false, fullName: 'Faith Njeri' },
  ];
  db.shareholders = [
    { id: 'sh-amina', name: 'Amina Wanjiru', basisPoints: 2_500, userId: 'amina' },
    { id: 'sh-kevin', name: 'Kevin Mutua', basisPoints: 2_500, userId: 'kevin' },
    { id: 'sh-brian', name: 'Brian Otieno', basisPoints: 5_000, userId: null },
  ];
  db.distributions = [];
  db.investments = [];
  payout('sh-amina', 250_000, 'PENDING');
  payout('sh-kevin', 250_000, 'PENDING');
  payout('sh-brian', 500_000, 'PAID');
  investment('inv-amina', 'sh-amina', 100_000, 'Amina Wanjiru');
  investment('inv-brian', 'sh-brian', 400_000, 'Brian Otieno');
  investment('inv-unlinked', null, 250_000, 'Brian Otieno, through his sacco');
});

const ids = (rows: Row[]) => rows.map((r) => r.id).sort();

describe('GET /admin/finance/distributions', () => {
  it('sends a linked shareholder-role user and a linked admin only their own payout rows', async () => {
    const amina = await as('amina', 'GET', '/admin/finance/distributions');
    expect(amina.statusCode).toBe(200);
    expect(ids(amina.json().distributions)).toEqual(['dist-sh-amina']);
    expect(amina.body).not.toContain('Brian Otieno');
    expect(amina.body).not.toContain('Kevin Mutua');

    const kevin = await as('kevin', 'GET', '/admin/finance/distributions');
    expect(kevin.statusCode).toBe(200);
    expect(ids(kevin.json().distributions)).toEqual(['dist-sh-kevin']);
    expect(kevin.body).not.toContain('Brian Otieno');
    expect(kevin.body).not.toContain('Amina Wanjiru');
  });

  it('sends the owner every payout row', async () => {
    const res = await as('owner', 'GET', '/admin/finance/distributions');

    expect(res.statusCode).toBe(200);
    expect(ids(res.json().distributions)).toEqual(['dist-sh-amina', 'dist-sh-brian', 'dist-sh-kevin']);
  });
});

describe('payout writes are the owner\'s', () => {
  it('refuses a linked non-owner declaring, marking paid or deleting, their own rows included, and writes nothing', async () => {
    const before = structuredClone(db.distributions);

    const declare = await as('amina', 'POST', '/admin/finance/distributions/declare', {
      label: 'Q4 2026',
      periodStart: '2026-10-01',
      periodEnd: '2026-12-31',
      netProfitCentsOverride: 1_000_000,
    });
    expect(declare.statusCode).toBe(403);

    for (const id of ['dist-sh-amina', 'dist-sh-brian']) {
      expect((await as('amina', 'PATCH', `/admin/finance/distributions/${id}`, { status: 'PAID' })).statusCode).toBe(403);
      expect((await as('kevin', 'PATCH', `/admin/finance/distributions/${id}`, { status: 'PAID' })).statusCode).toBe(403);
      expect((await as('amina', 'DELETE', `/admin/finance/distributions/${id}`)).statusCode).toBe(403);
      expect((await as('kevin', 'DELETE', `/admin/finance/distributions/${id}`)).statusCode).toBe(403);
    }

    expect(db.distributions).toEqual(before);
  });
});

describe('GET /admin/finance/investments', () => {
  it('sends an unlinked financial manager no investments', async () => {
    const res = await as('fm', 'GET', '/admin/finance/investments');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ investments: [] });
  });

  it('sends a linked shareholder only their own linked rows, not an unlinked row naming another holder', async () => {
    const res = await as('amina', 'GET', '/admin/finance/investments');

    expect(res.statusCode).toBe(200);
    expect(ids(res.json().investments)).toEqual(['inv-amina']);
    expect(res.body).not.toContain('Brian');
  });

  it('sends the owner every investment', async () => {
    const res = await as('owner', 'GET', '/admin/finance/investments');

    expect(ids(res.json().investments)).toEqual(['inv-amina', 'inv-brian', 'inv-unlinked']);
  });
});

describe('investment writes are the owner\'s', () => {
  it('refuses a non-owner creating or deleting an investment, and writes nothing', async () => {
    const before = structuredClone(db.investments);

    for (const user of ['kevin', 'fm', 'amina']) {
      const create = await as(user, 'POST', '/admin/finance/investments', {
        source: 'A new investor',
        kind: 'CAPITAL_INJECTION',
        amountCents: 50_000,
        date: '2026-10-01',
        purpose: 'A second van',
      });
      expect(create.statusCode).toBe(403);
      expect((await as(user, 'DELETE', '/admin/finance/investments/inv-amina')).statusCode).toBe(403);
    }

    expect(db.investments).toEqual(before);
  });

  it('lets the owner link an investment to a holder and unlink it', async () => {
    const link = await as('owner', 'PATCH', '/admin/finance/investments/inv-unlinked', { shareholderId: 'sh-brian' });
    expect(link.statusCode).toBe(200);
    expect(link.json().investment).toMatchObject({ id: 'inv-unlinked', shareholderId: 'sh-brian', shareholderName: 'Brian Otieno' });
    expect(db.investments.find((i) => i.id === 'inv-unlinked')!.shareholderId).toBe('sh-brian');

    const unlink = await as('owner', 'PATCH', '/admin/finance/investments/inv-unlinked', { shareholderId: null });
    expect(unlink.statusCode).toBe(200);
    expect(unlink.json().investment).toMatchObject({ id: 'inv-unlinked', shareholderId: null, shareholderName: null });
    expect(db.investments.find((i) => i.id === 'inv-unlinked')!.shareholderId).toBeNull();
  });

  it('refuses a link to an unknown holder with 400, and a non-owner\'s link with 403', async () => {
    const before = structuredClone(db.investments);

    const unknown = await as('owner', 'PATCH', '/admin/finance/investments/inv-unlinked', { shareholderId: 'sh-nobody' });
    expect(unknown.statusCode).toBe(400);

    for (const user of ['amina', 'kevin']) {
      const res = await as(user, 'PATCH', '/admin/finance/investments/inv-unlinked', { shareholderId: 'sh-amina' });
      expect(res.statusCode).toBe(403);
    }

    expect(db.investments).toEqual(before);
  });
});
