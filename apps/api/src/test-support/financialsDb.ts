/**
 * Route-test support for Financials and project money: an in-memory stand-in
 * for the Prisma calls those routes make on users, projects, jobs and costs,
 * and one helper that signs a token and calls a route. A test file mocks
 * '../db.js' with `db` and seeds the tables in `t`. Not built:
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
};

export function resetDb() {
  t.users = [];
  t.projects = [];
  t.jobs = [];
  t.expenses = [];
  seq = 0;
}

/** The subset of Prisma's `where` the routes use: equality, null, `not` and `in`. */
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) =>
    v === null ? row[k] == null
    : typeof v === 'object' && 'not' in v ? row[k] !== v.not
    : typeof v === 'object' && 'in' in v ? (v.in as unknown[]).includes(row[k])
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

let seq = 0;

/** A cost answers a `job: {...}` filter through the job it belongs to; a cost with no job never does. */
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

export const db = {
  user: {
    findUnique: vi.fn(async ({ where }: Where) => t.users.find((u) => matches(u, where)) ?? null),
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
    /** A new job takes the columns' defaults: not yet sorted, under no project. */
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
    aggregate: vi.fn(async (args: Partial<Where> & Row) => aggregate(t.expenses.filter((e) => costMatches(e, args.where)), args)),
  },
  /** Runs the callback against the same tables. It does not undo writes when the callback throws. */
  $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
};

/** Call a Financials route as a seeded user. The one place tokens are made. */
export async function as(userId: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const { signAccessToken } = await import('../auth/jwt.js');
  const { financialsRoutes } = await import('../routes/financials.js');
  const { token } = await signAccessToken(userId, t.users.find((u) => u.id === userId)!.role);
  const server = Fastify();
  await server.register(financialsRoutes, { prefix: '/admin/financials' });
  return server.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}
