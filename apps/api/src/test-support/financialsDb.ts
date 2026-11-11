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

export const db = {
  user: {
    findUnique: vi.fn(async ({ where }: Where) => t.users.find((u) => matches(u, where)) ?? null),
  },
  job: {
    findMany: vi.fn(async ({ where }: Partial<Where> = {}) => t.jobs.filter((j) => matches(j, where)).map(withCosts)),
    aggregate: vi.fn(async (args: Partial<Where> & Row) => aggregate(t.jobs.filter((j) => matches(j, args.where)), args)),
  },
  expense: {
    aggregate: vi.fn(async (args: Partial<Where> & Row) => aggregate(t.expenses.filter((e) => costMatches(e, args.where)), args)),
  },
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
