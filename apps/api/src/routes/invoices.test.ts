import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Invoices (owner's choices, 20 November 2026): made from the project's Payment
// setting, sent with 14 days to pay, and on payment added as income under the
// project, dated the day it was paid.

type Row = Record<string, any>;
const s = {
  invoices: [] as Row[],
  lines: [] as Row[],
  counters: new Map<number, number>(),
  jobs: [] as Row[],
  events: [] as Row[],
  costs: new Map<string, number>(),
  seq: 0,
};

const USERS: Record<string, Row> = {
  owner: { id: 'owner', fullName: 'Test Owner', role: 'ADMIN', isOwner: true },
  finance: { id: 'finance', fullName: 'Fin Manager', role: 'FINANCIAL_MANAGER', isOwner: false },
  sup: { id: 'sup', fullName: 'Sam Supervisor', role: 'CLEANING_SUPERVISOR', isOwner: false },
};

const PROJECT = {
  id: 'p1', title: 'Office contract', clientName: 'Amani Ltd', clientPhone: '0700000000', siteLocation: 'Westlands',
  serviceLineCode: 'office', clientSegment: 'COMMERCIAL', paymentFrequency: 'MONTHLY', valueCents: 1_250_000,
  kind: 'REPEATING', startDate: new Date('2026-11-20'), targetEndDate: null, repeatEvery: 1, repeatUnit: 'WEEK',
  serviceDays: [6, 7], weekOfMonth: null, deepCleanEveryMonths: 3, deepCleanPriceCents: 800_000,
};

function statusMatches(status: string, want: unknown) {
  if (want === undefined) return true;
  if (typeof want === 'string') return status === want;
  const w = want as { in?: string[]; not?: string };
  if (w.in) return w.in.includes(status);
  if (w.not) return status !== w.not;
  return true;
}

function withRelations(inv: Row) {
  return {
    ...inv,
    lines: s.lines.filter((l) => l.invoiceId === inv.id).sort((a, b) => a.sortOrder - b.sortOrder),
    project: PROJECT,
    createdBy: { fullName: USERS[inv.createdById]?.fullName ?? null },
  };
}

const find = (where: Row) =>
  s.invoices.filter(
    (i) =>
      (where.id === undefined || i.id === where.id) &&
      (where.jobId === undefined || i.jobId === where.jobId) &&
      (where.projectId === undefined || i.projectId === where.projectId) &&
      (where.periodStart === undefined || i.periodStart.getTime() === where.periodStart.getTime()) &&
      statusMatches(i.status, where.status),
  );

const db = {
  user: { findUnique: vi.fn(async ({ where }: Row) => USERS[where.id] ?? null) },
  project: {
    findUnique: vi.fn(async ({ where }: Row) => (where.id === PROJECT.id ? PROJECT : null)),
    findUniqueOrThrow: vi.fn(async () => PROJECT),
  },
  projectVisit: { findMany: vi.fn(async () => []) },
  projectEvent: { create: vi.fn(async ({ data }: Row) => s.events.push(data)) },
  invoiceCounter: {
    upsert: vi.fn(async ({ where }: Row) => {
      const last = (s.counters.get(where.year) ?? 0) + 1;
      s.counters.set(where.year, last);
      return { year: where.year, last };
    }),
  },
  invoice: {
    findUnique: vi.fn(async ({ where }: Row) => {
      const inv = find(where)[0];
      return inv ? withRelations(inv) : null;
    }),
    findFirst: vi.fn(async ({ where }: Row) => find(where)[0] ?? null),
    findMany: vi.fn(async ({ where }: Row) => find(where).map(withRelations)),
    count: vi.fn(async ({ where }: Row) => find(where).length),
    create: vi.fn(async ({ data }: Row) => {
      const { lines, ...rest } = data;
      const inv = {
        id: `inv${++s.seq}`, status: 'DRAFT', note: null, sentOn: null, dueOn: null, paidOn: null,
        paymentRef: null, jobId: null, createdAt: new Date(), ...rest,
      };
      s.invoices.push(inv);
      for (const l of lines.create) s.lines.push({ ...l, invoiceId: inv.id });
      return inv;
    }),
    update: vi.fn(async ({ where, data }: Row) => Object.assign(find(where)[0]!, data)),
    updateMany: vi.fn(async ({ where, data }: Row) => {
      const rows = find(where);
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    }),
    deleteMany: vi.fn(async ({ where }: Row) => {
      const rows = find(where);
      s.invoices = s.invoices.filter((i) => !rows.includes(i));
      return { count: rows.length };
    }),
  },
  invoiceLine: {
    deleteMany: vi.fn(async ({ where }: Row) => {
      s.lines = s.lines.filter((l) => l.invoiceId !== where.invoiceId);
    }),
    createMany: vi.fn(async ({ data }: Row) => s.lines.push(...data)),
  },
  job: {
    create: vi.fn(async ({ data }: Row) => {
      const job = { id: `job${++s.seq}`, ...data };
      s.jobs.push(job);
      return job;
    }),
    findUnique: vi.fn(async ({ where }: Row) => {
      const job = s.jobs.find((j) => j.id === where.id);
      return job ? { ...job, _count: { expenses: s.costs.get(job.id) ?? 0, machineLines: 0 } } : null;
    }),
    delete: vi.fn(async ({ where }: Row) => {
      s.jobs = s.jobs.filter((j) => j.id !== where.id);
    }),
  },
  $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
};
vi.mock('../db.js', () => ({ prisma: db }));

const { signAccessToken } = await import('../auth/jwt.js');
const { invoiceRoutes } = await import('./invoices.js');

async function call(who: keyof typeof USERS, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const server = Fastify();
  await server.register(invoiceRoutes, { prefix: '/admin/invoices' });
  const token = (await signAccessToken(who, USERS[who]!.role)).token;
  return server.inject({ method, url: `/admin/invoices${url}`, payload, headers: { authorization: `Bearer ${token}` } });
}

/** Make the February invoice and return it. */
async function february() {
  const res = await call('finance', 'POST', '/', { projectId: 'p1', periodStart: '2027-02-01', periodEnd: '2027-02-28' });
  expect(res.statusCode).toBe(201);
  return res.json().invoice;
}

// Only the clock's date is faked, so Fastify's own timers still run.
vi.useFakeTimers({ toFake: ['Date'] });
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  vi.setSystemTime(new Date('2027-02-10T09:00:00Z'));
  Object.assign(s, { invoices: [], lines: [], counters: new Map(), jobs: [], events: [], costs: new Map(), seq: 0 });
});

describe('who can use invoices', () => {
  it('keeps them from staff without the money roles', async () => {
    expect((await call('sup', 'GET', '/projects/p1')).statusCode).toBe(403);
  });

  it('lets the financial manager make and send, but only the owner or an admin record a payment', async () => {
    const inv = await february();
    expect((await call('finance', 'POST', `/${inv.id}/send`, {})).statusCode).toBe(200);
    const res = await call('finance', 'POST', `/${inv.id}/paid`, { paidOn: '2027-02-10' });
    expect(res.statusCode).toBe(403);
    expect(s.jobs).toHaveLength(0);
  });
});

describe('the periods and making an invoice', () => {
  it('lists every month from the start, next month included, newest first', async () => {
    const res = await call('finance', 'GET', '/projects/p1');
    const periods = res.json().periods;
    expect(periods.map((p: Row) => p.label)).toEqual(['March 2027', 'February 2027', 'January 2027', 'December 2026', 'November 2026']);
    // February holds the first deep clean (Sat 6 Feb): 12,500 + 8,000.
    expect(periods[1]).toMatchObject({ start: '2027-02-01', end: '2027-02-28', suggestedTotalCents: 2_050_000, invoiceId: null });
  });

  it('makes a numbered draft with the month and the deep clean as lines', async () => {
    const inv = await february();
    expect(inv).toMatchObject({
      number: 'OH-2027-0001', status: 'DRAFT', periodLabel: 'February 2027', totalCents: 2_050_000,
      clientName: 'Amani Ltd',
    });
    expect(inv.lines).toEqual([
      { description: 'Cleaning service, February 2027', quantity: 1, unitCents: 1_250_000, amountCents: 1_250_000 },
      { description: 'Deep clean (6 Feb)', quantity: 1, unitCents: 800_000, amountCents: 800_000 },
    ]);
    expect(s.events[0]).toMatchObject({ kind: 'INVOICE_CHANGED', summary: 'Invoice OH-2027-0001 made', actorName: 'Fin Manager' });
    // The next one gets the next number.
    const jan = await call('finance', 'POST', '/', { projectId: 'p1', periodStart: '2027-01-01', periodEnd: '2027-01-31' });
    expect(jan.json().invoice.number).toBe('OH-2027-0002');
  });

  it('refuses a period that isn’t one of the project’s, and a second invoice for a period', async () => {
    const odd = await call('finance', 'POST', '/', { projectId: 'p1', periodStart: '2027-02-03', periodEnd: '2027-02-28' });
    expect(odd.statusCode).toBe(400);
    await february();
    const again = await call('finance', 'POST', '/', { projectId: 'p1', periodStart: '2027-02-01', periodEnd: '2027-02-28' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('This period already has invoice OH-2027-0001.');
  });

  it('lets a cancelled invoice’s period be invoiced again', async () => {
    const inv = await february();
    await call('finance', 'POST', `/${inv.id}/cancel`);
    expect((await call('finance', 'POST', '/', { projectId: 'p1', periodStart: '2027-02-01', periodEnd: '2027-02-28' })).statusCode).toBe(201);
  });
});

describe('changing a draft', () => {
  it('works out the amounts and total itself', async () => {
    const inv = await february();
    const res = await call('finance', 'PATCH', `/${inv.id}`, {
      lines: [{ description: 'Cleaning service, February 2027', quantity: 2, unitCents: 1_000_000, amountCents: 1 }],
      note: 'Two sites this month',
    });
    expect(res.json().invoice).toMatchObject({ totalCents: 2_000_000, note: 'Two sites this month' });
    expect(res.json().invoice.lines[0].amountCents).toBe(2_000_000);
  });

  it('refuses once it was sent', async () => {
    const inv = await february();
    await call('finance', 'POST', `/${inv.id}/send`, {});
    expect((await call('finance', 'PATCH', `/${inv.id}`, { note: 'x' })).statusCode).toBe(409);
  });
});

describe('sending', () => {
  it('makes it due 14 days after it was sent', async () => {
    const inv = await february();
    const res = await call('finance', 'POST', `/${inv.id}/send`, { sentOn: '2027-02-01' });
    expect(res.json().invoice).toMatchObject({ status: 'SENT', sentOn: '2027-02-01', dueOn: '2027-02-15', isOverdue: false });
  });

  it('refuses an invoice for KSh 0', async () => {
    const inv = await february();
    await call('finance', 'PATCH', `/${inv.id}`, { lines: [{ description: 'Nothing', quantity: 1, unitCents: 0, amountCents: 0 }] });
    expect((await call('finance', 'POST', `/${inv.id}/send`, {})).statusCode).toBe(400);
  });

  it('lists sent invoices past their due date as overdue', async () => {
    const a = await february();
    await call('finance', 'POST', `/${a.id}/send`, { sentOn: '2027-01-20' });
    const b = (await call('finance', 'POST', '/', { projectId: 'p1', periodStart: '2027-01-01', periodEnd: '2027-01-31' })).json().invoice;
    await call('finance', 'POST', `/${b.id}/send`, { sentOn: '2027-02-05' });
    const open = (await call('finance', 'GET', '/open')).json();
    expect(open.overdue.map((i: Row) => i.number)).toEqual(['OH-2027-0001']);
    expect(open.awaiting.map((i: Row) => i.number)).toEqual(['OH-2027-0002']);
  });
});

describe('recording the payment', () => {
  it('marks it paid and adds the amount as income under the project, dated the paid day', async () => {
    const inv = await february();
    await call('finance', 'POST', `/${inv.id}/send`, {});
    const res = await call('owner', 'POST', `/${inv.id}/paid`, { paidOn: '2027-02-09', paymentRef: 'QK12ABC' });
    expect(res.statusCode).toBe(200);
    expect(s.jobs).toHaveLength(1);
    expect(s.jobs[0]).toMatchObject({
      title: 'Invoice OH-2027-0001: Office contract', date: new Date('2027-02-09'), incomeCents: 2_050_000,
      status: 'OWNER_ENTRY', placement: 'PROJECT', projectId: 'p1', clientName: 'Amani Ltd', createdById: 'owner',
    });
    expect(res.json().invoice).toMatchObject({ status: 'PAID', paidOn: '2027-02-09', paymentRef: 'QK12ABC', jobId: s.jobs[0]!.id });
  });

  it('refuses a draft, a future date and a second payment', async () => {
    const inv = await february();
    expect((await call('owner', 'POST', `/${inv.id}/paid`, { paidOn: '2027-02-09' })).statusCode).toBe(409);
    await call('finance', 'POST', `/${inv.id}/send`, {});
    expect((await call('owner', 'POST', `/${inv.id}/paid`, { paidOn: '2027-02-11' })).statusCode).toBe(400);
    await call('owner', 'POST', `/${inv.id}/paid`, { paidOn: '2027-02-10' });
    expect((await call('owner', 'POST', `/${inv.id}/paid`, { paidOn: '2027-02-10' })).statusCode).toBe(409);
    expect(s.jobs).toHaveLength(1);
  });

  it('can be undone, taking the income off again, unless costs were added to it', async () => {
    const inv = await february();
    await call('finance', 'POST', `/${inv.id}/send`, {});
    await call('owner', 'POST', `/${inv.id}/paid`, { paidOn: '2027-02-10' });
    const jobId = s.jobs[0]!.id;

    s.costs.set(jobId, 1);
    expect((await call('owner', 'POST', `/${inv.id}/unpaid`)).statusCode).toBe(409);
    expect(s.jobs).toHaveLength(1);

    s.costs.clear();
    const res = await call('owner', 'POST', `/${inv.id}/unpaid`);
    expect(res.json().invoice).toMatchObject({ status: 'SENT', paidOn: null, jobId: null });
    expect(s.jobs).toHaveLength(0);
  });

  it('won’t cancel a paid invoice, and deletes only drafts', async () => {
    const inv = await february();
    await call('finance', 'POST', `/${inv.id}/send`, {});
    expect((await call('finance', 'DELETE', `/${inv.id}`)).statusCode).toBe(409);
    await call('owner', 'POST', `/${inv.id}/paid`, { paidOn: '2027-02-10' });
    expect((await call('finance', 'POST', `/${inv.id}/cancel`)).statusCode).toBe(409);
    const draft = (await call('finance', 'POST', '/', { projectId: 'p1', periodStart: '2027-01-01', periodEnd: '2027-01-31' })).json().invoice;
    expect((await call('finance', 'DELETE', `/${draft.id}`)).statusCode).toBe(200);
  });
});
