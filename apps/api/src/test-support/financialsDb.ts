/**
 * Route-test support for Financials, project money, the finance overview and
 * the Dashboard: an in-memory stand-in for the Prisma calls those routes make
 * on users, projects, jobs, costs, monthly targets, shareholders, declared
 * payouts, bookings and their crew, quote requests, marketing spend, assets,
 * investments and the list of company documents, and one helper that signs a
 * token and calls a route under /admin/financials or /admin/finance. A test
 * file mocks '../db.js' with `db` and seeds the tables in `t`. Not built:
 * tsconfig.build.json excludes this folder.
 */
import Fastify from 'fastify';
import { vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const t = {
  users: [] as Row[],
  projects: [] as Row[],
  jobs: [] as Row[],
  expenses: [] as Row[],
  monthlyTargets: [] as Row[],
  shareholders: [] as Row[],
  profitDistributions: [] as Row[],
  bookings: [] as Row[],
  /** One row for each crew member on a booking: `{ bookingId, userId, role }`. */
  bookingCrew: [] as Row[],
  quoteRequests: [] as Row[],
  marketingSpends: [] as Row[],
  assets: [] as Row[],
  investments: [] as Row[],
  companyDocuments: [] as Row[],
};

export function resetDb() {
  t.users = [];
  t.projects = [];
  t.jobs = [];
  t.expenses = [];
  t.monthlyTargets = [];
  t.shareholders = [];
  t.profitDistributions = [];
  t.bookings = [];
  t.bookingCrew = [];
  t.quoteRequests = [];
  t.marketingSpends = [];
  t.assets = [];
  t.investments = [];
  t.companyDocuments = [];
  seq = 0;
}

const BOUNDS = ['gte', 'lte', 'gt', 'lt'] as const;

/** A column against any of `gte`, `lte`, `gt` and `lt`; a row with no value is outside every range. */
const withinBounds = (value: any, bounds: Row) => // eslint-disable-line @typescript-eslint/no-explicit-any
  value != null &&
  (bounds.gte === undefined || value >= bounds.gte) &&
  (bounds.lte === undefined || value <= bounds.lte) &&
  (bounds.gt === undefined || value > bounds.gt) &&
  (bounds.lt === undefined || value < bounds.lt);

/** The subset of Prisma's `where` the routes use: equality (dates by their instant), null, `not`, `in` and ranges. */
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) =>
    v === null ? row[k] == null
    : v instanceof Date ? row[k] instanceof Date && row[k].getTime() === v.getTime()
    : typeof v === 'object' && 'not' in v ? row[k] !== v.not
    : typeof v === 'object' && 'in' in v ? (v.in as unknown[]).includes(row[k])
    : typeof v === 'object' && BOUNDS.some((b) => b in v) ? withinBounds(row[k], v)
    : row[k] === v);

/** A job with its costs, as `include` or `select` of `expenses` gives it. */
const withCosts = (job: Row) => ({ ...job, expenses: t.expenses.filter((e) => e.jobId === job.id) });

/** A job with its costs, its project and whoever reported it, as the job routes include them. */
function withRelations(job: Row) {
  const project = t.projects.find((p) => p.id === job.projectId);
  const reporter = t.users.find((u) => u.id === job.reportedById);
  return {
    ...withCosts(job),
    project: project ? { title: project.title } : null,
    reportedBy: reporter ? { fullName: reporter.fullName } : null,
  };
}

type OrderBy = Record<string, 'asc' | 'desc'>;

/** A copy of the rows sorted by one `orderBy` or a list of them, the first entry deciding first. */
function ordered(rows: Row[], orderBy: OrderBy | OrderBy[] = []) {
  const columns = [orderBy].flat().flatMap((o) => Object.entries(o));
  return [...rows].sort((a, b) => {
    for (const [column, way] of columns) {
      if (a[column] < b[column]) return way === 'desc' ? 1 : -1;
      if (a[column] > b[column]) return way === 'desc' ? -1 : 1;
    }
    return 0;
  });
}

/** A user with the shareholder linked to the account, as selecting `shareholder` gives it. */
const withHolder = (user: Row) => ({ ...user, shareholder: t.shareholders.find((s) => s.userId === user.id) ?? null });

/** A shareholder with the linked account, as `include: { user }` gives it. */
function withUser(holder: Row) {
  const user = t.users.find((u) => u.id === holder.userId);
  return { ...holder, user: user ? { fullName: user.fullName } : null };
}

/** A declared payout with its shareholder and whoever declared it, removed shareholders included. */
function withHolderAndCreator(payout: Row) {
  const holder = t.shareholders.find((s) => s.id === payout.shareholderId);
  const creator = t.users.find((u) => u.id === payout.createdById);
  return {
    ...payout,
    shareholder: holder ? { name: holder.name } : null,
    createdBy: creator ? { fullName: creator.fullName } : null,
  };
}

/** A row with whoever recorded it, as `include: { createdBy }` gives it. */
function withCreator(row: Row) {
  const creator = t.users.find((u) => u.id === row.createdById);
  return { ...row, createdBy: creator ? { fullName: creator.fullName } : null };
}

/** A company document with whoever uploaded it, as `include: { uploadedBy }` gives it. */
function withUploader(document: Row) {
  const uploader = t.users.find((u) => u.id === document.uploadedById);
  return { ...document, uploadedBy: uploader ? { fullName: uploader.fullName } : null };
}

/** An investment with whoever recorded it and the shareholder it came from, if any. */
function withCreatorAndHolder(investment: Row) {
  const holder = t.shareholders.find((s) => s.id === investment.shareholderId);
  return { ...withCreator(investment), shareholder: holder ? { name: holder.name } : null };
}

/** A booking against `where`. `crew: { none: {} }`, the one crew filter the routes use, asks for a booking with no crew rows. */
function bookingMatches(booking: Row, { crew, ...own }: Row = {}) {
  if (!matches(booking, own)) return false;
  return crew === undefined || !t.bookingCrew.some((c) => c.bookingId === booking.id);
}

/** The values a write sets: Prisma leaves a column alone when its value is `undefined`. */
const given = (data: Row) => Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

let seq = 0;

function costMatches(cost: Row, { job, ...own }: Row = {}) {
  if (!matches(cost, own)) return false;
  if (job === undefined) return true;
  const parent = t.jobs.find((j) => j.id === cost.jobId);
  return parent !== undefined && matches(parent, job);
}

/** Prisma's `aggregate` over the rows: `_sum`, `_min` and `_max` of the named columns (null over no rows) and `_count._all`. */
function aggregate(rows: Row[], args: Row) {
  const fold = (columns: Row | undefined, pick: (a: any, b: any) => unknown) => // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.fromEntries(Object.keys(columns ?? {}).map((k) => [k, rows.length ? rows.map((r) => r[k]).reduce(pick) : null]));
  return {
    _sum: fold(args._sum, (a, b) => a + b),
    _min: fold(args._min, (a, b) => (b < a ? b : a)),
    _max: fold(args._max, (a, b) => (b > a ? b : a)),
    _count: { _all: rows.length },
  };
}

type Where = { where: Row };
type Data = { data: Row };
type Sorted = { orderBy?: OrderBy | OrderBy[] };

export const db = {
  user: {
    findUnique: vi.fn(async ({ where }: Where) => {
      const user = t.users.find((u) => matches(u, where));
      return user ? withHolder(user) : null;
    }),
    findFirst: vi.fn(async ({ where }: Where) => {
      const user = t.users.find((u) => matches(u, where));
      return user ? withHolder(user) : null;
    }),
  },
  project: {
    findUnique: vi.fn(async ({ where }: Where) => t.projects.find((p) => matches(p, where)) ?? null),
    findMany: vi.fn(async ({ where }: Partial<Where> = {}) => t.projects.filter((p) => matches(p, where))),
  },
  job: {
    /** `orderBy` is honoured for a single ascending or descending column. */
    findMany: vi.fn(async ({ where, orderBy }: Partial<Where> & { orderBy?: Record<string, 'asc' | 'desc'> } = {}) => {
      const rows = t.jobs.filter((j) => matches(j, where));
      const [[column, way] = []] = Object.entries(orderBy ?? {});
      if (column) rows.sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (way === 'desc' ? -1 : 1));
      return rows.map(withRelations);
    }),
    findUnique: vi.fn(async ({ where }: Where) => {
      const job = t.jobs.find((j) => matches(j, where));
      return job ? withRelations(job) : null;
    }),
    create: vi.fn(async ({ data }: Data) => {
      const job = { id: `job${++seq}`, placement: 'UNSORTED', projectId: null, reportedById: null, createdAt: new Date(), ...data };
      t.jobs.push(job);
      return withRelations(job);
    }),
    update: vi.fn(async ({ where, data }: Where & Data) => withRelations(Object.assign(t.jobs.find((j) => matches(j, where))!, data))),
    updateMany: vi.fn(async ({ where, data }: Where & Data) => {
      const rows = t.jobs.filter((j) => matches(j, where));
      rows.forEach((j) => Object.assign(j, data));
      return { count: rows.length };
    }),
    delete: vi.fn(async ({ where }: Where) => {
      const job = t.jobs.find((j) => matches(j, where))!;
      t.jobs = t.jobs.filter((j) => j !== job);
      return job;
    }),
    aggregate: vi.fn(async (args: Partial<Where> & Row) => aggregate(t.jobs.filter((j) => matches(j, args.where)), args)),
  },
  expense: {
    findMany: vi.fn(async ({ where }: Partial<Where> = {}) => t.expenses.filter((e) => costMatches(e, where))),
    aggregate: vi.fn(async (args: Partial<Where> & Row) => aggregate(t.expenses.filter((e) => costMatches(e, args.where)), args)),
  },
  monthlyTarget: {
    /** Looked up by its compound key, `{ year_month: { year, month } }`. */
    findUnique: vi.fn(async ({ where }: Where) => t.monthlyTargets.find((m) => matches(m, where.year_month)) ?? null),
    findMany: vi.fn(async ({ orderBy }: Sorted = {}) => ordered(t.monthlyTargets, orderBy)),
    /** Found by the same compound key; a new row gets the columns the database fills in. */
    upsert: vi.fn(async ({ where, create, update }: Where & { create: Row; update: Row }) => {
      const existing = t.monthlyTargets.find((m) => matches(m, where.year_month));
      if (existing) return Object.assign(existing, given(update), { updatedAt: new Date() });
      const target = { id: `mt${++seq}`, notes: null, createdAt: new Date(), updatedAt: new Date(), ...given(create) };
      t.monthlyTargets.push(target);
      return target;
    }),
  },
  booking: {
    count: vi.fn(async ({ where }: Partial<Where> = {}) => t.bookings.filter((b) => bookingMatches(b, where)).length),
  },
  quoteRequest: {
    count: vi.fn(async ({ where }: Partial<Where> = {}) => t.quoteRequests.filter((q) => matches(q, where)).length),
  },
  marketingSpend: {
    findMany: vi.fn(async ({ where, orderBy }: Partial<Where> & Sorted = {}) =>
      ordered(t.marketingSpends.filter((m) => matches(m, where)), orderBy).map(withCreator)),
  },
  asset: {
    /** There is no maintenance table: every asset comes back with none. */
    findMany: vi.fn(async ({ where, orderBy }: Partial<Where> & Sorted = {}) =>
      ordered(t.assets.filter((a) => matches(a, where)), orderBy).map((a) => ({ ...withCreator(a), maintenance: [] }))),
  },
  investment: {
    findMany: vi.fn(async ({ where, orderBy }: Partial<Where> & Sorted = {}) =>
      ordered(t.investments.filter((i) => matches(i, where)), orderBy).map(withCreatorAndHolder)),
  },
  companyDocument: {
    findMany: vi.fn(async ({ orderBy }: Sorted = {}) => ordered(t.companyDocuments, orderBy).map(withUploader)),
  },
  shareholder: {
    findMany: vi.fn(async ({ where, orderBy }: Partial<Where> & Sorted = {}) =>
      ordered(t.shareholders.filter((s) => matches(s, where)), orderBy).map(withUser)),
    findUnique: vi.fn(async ({ where }: Where) => {
      const holder = t.shareholders.find((s) => matches(s, where));
      return holder ? withUser(holder) : null;
    }),
    findFirst: vi.fn(async ({ where, orderBy }: Partial<Where> & Sorted = {}) => {
      const [holder] = ordered(t.shareholders.filter((s) => matches(s, where)), orderBy);
      return holder ? withUser(holder) : null;
    }),
    /** The columns the database fills in when a row is created without them. */
    create: vi.fn(async ({ data }: Data) => {
      const holder = {
        id: `sh${++seq}`, title: null, kind: 'INDIVIDUAL', notes: null, userId: null, sortOrder: 0, removedAt: null,
        createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      t.shareholders.push(holder);
      return withUser(holder);
    }),
    update: vi.fn(async ({ where, data }: Where & Data) => withUser(Object.assign(t.shareholders.find((s) => matches(s, where))!, data))),
  },
  profitDistribution: {
    findFirst: vi.fn(async ({ where }: Partial<Where> = {}) => {
      const payout = t.profitDistributions.find((d) => matches(d, where));
      return payout ? withHolderAndCreator(payout) : null;
    }),
    findMany: vi.fn(async ({ where, orderBy }: Partial<Where> & Sorted = {}) =>
      ordered(t.profitDistributions.filter((d) => matches(d, where)), orderBy).map(withHolderAndCreator)),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      for (const d of data) {
        t.profitDistributions.push({
          id: `pd${++seq}`, status: 'PENDING', paidAt: null, reference: null, notes: null,
          createdAt: new Date(), updatedAt: new Date(), ...d,
        });
      }
      return { count: data.length };
    }),
  },
  /**
   * Runs the callback against the same tables, whatever options it is given.
   * It does not undo writes when the callback throws.
   */
  $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>, _options?: unknown) => run(db)),
};

export async function as(userId: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const { signAccessToken } = await import('../auth/jwt.js');
  const { financialsRoutes, financialsDashboardRoutes } = await import('../routes/financials.js');
  const { financeRoutes, financeDashboardRoutes } = await import('../routes/finance.js');
  const { token } = await signAccessToken(userId, t.users.find((u) => u.id === userId)!.role);
  const server = Fastify();
  await server.register(financialsRoutes, { prefix: '/admin/financials' });
  await server.register(financialsDashboardRoutes, { prefix: '/admin/financials' });
  await server.register(financeRoutes, { prefix: '/admin/finance' });
  await server.register(financeDashboardRoutes, { prefix: '/admin/finance' });
  return server.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}
