/**
 * Route-test support for Financials, project money, the finance overview and
 * the machine register: an in-memory stand-in for the Prisma calls those
 * routes make on users, projects, jobs, costs, assets and their repairs,
 * machine lines, machine investors and their payments, monthly targets,
 * shareholders and declared payouts,
 * and one helper that signs a token and calls a route under /admin/financials,
 * /admin/finance or /admin/machines. A test file mocks
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
  monthlyTargets: [] as Row[],
  shareholders: [] as Row[],
  profitDistributions: [] as Row[],
  assets: [] as Row[],
  assetMaintenance: [] as Row[],
  machineLines: [] as Row[],
  machineInvestors: [] as Row[],
  machinePayouts: [] as Row[],
};

export function resetDb() {
  t.users = [];
  t.projects = [];
  t.jobs = [];
  t.expenses = [];
  t.monthlyTargets = [];
  t.shareholders = [];
  t.profitDistributions = [];
  t.assets = [];
  t.assetMaintenance = [];
  t.machineLines = [];
  t.machineInvestors = [];
  t.machinePayouts = [];
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

/** A machine line with its machine's name, as selecting `asset` gives it. */
const withMachine = (line: Row) => ({ ...line, asset: { name: t.assets.find((a) => a.id === line.assetId)?.name ?? 'Machine' } });

/** A job with its costs and its machine lines, as `include` or `select` of `expenses` and `machineLines` gives it. */
const withCosts = (job: Row) => ({
  ...job,
  expenses: t.expenses.filter((e) => e.jobId === job.id),
  machineLines: t.machineLines.filter((l) => l.jobId === job.id).map(withMachine),
});

/** Whoever entered a row, as `createdBy: { select: { fullName } }` gives them. */
const creatorOf = (row: Row) => {
  const creator = t.users.find((u) => u.id === row.createdById);
  return creator ? { fullName: creator.fullName } : null;
};

/**
 * An asset with whoever entered it, its repairs (each with whoever entered
 * it), its machine lines (each with its whole job row) and its investors (each
 * with their payments), as the machine register and the asset list select
 * them. The whole rows come back, whatever was selected, in the order they
 * were seeded.
 */
const withRegister = (asset: Row) => ({
  ...asset,
  createdBy: creatorOf(asset),
  maintenance: t.assetMaintenance.filter((m) => m.assetId === asset.id).map((m) => ({ ...m, createdBy: creatorOf(m) })),
  machineLines: t.machineLines
    .filter((l) => l.assetId === asset.id)
    .map((l) => ({ ...l, job: t.jobs.find((j) => j.id === l.jobId) })),
  machineInvestors: t.machineInvestors
    .filter((i) => i.assetId === asset.id)
    .map((i) => ({ ...i, payouts: t.machinePayouts.filter((p) => p.investorId === i.id) })),
});

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

let seq = 0;

function costMatches(cost: Row, { job, ...own }: Row = {}) {
  if (!matches(cost, own)) return false;
  if (job === undefined) return true;
  const parent = t.jobs.find((j) => j.id === cost.jobId);
  return parent !== undefined && matches(parent, job);
}

function payoutMatches(payout: Row, { investor, ...own }: Row = {}) {
  if (!matches(payout, own)) return false;
  if (investor === undefined) return true;
  const paid = t.machineInvestors.find((i) => i.id === payout.investorId);
  return paid !== undefined && matches(paid, investor);
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
    /** The job's machine lines go with it, as the database deletes them. */
    delete: vi.fn(async ({ where }: Where) => {
      const job = t.jobs.find((j) => matches(j, where))!;
      t.jobs = t.jobs.filter((j) => j !== job);
      t.machineLines = t.machineLines.filter((l) => l.jobId !== job.id);
      return job;
    }),
    aggregate: vi.fn(async (args: Partial<Where> & Row) => aggregate(t.jobs.filter((j) => matches(j, args.where)), args)),
  },
  expense: {
    findMany: vi.fn(async ({ where }: Partial<Where> = {}) => t.expenses.filter((e) => costMatches(e, where))),
    aggregate: vi.fn(async (args: Partial<Where> & Row) => aggregate(t.expenses.filter((e) => costMatches(e, args.where)), args)),
  },
  asset: {
    /** A seeded asset says `dailyRateCents: null` when it has no rate, as the database does. */
    findMany: vi.fn(async ({ where, orderBy }: Partial<Where> & Sorted = {}) =>
      ordered(t.assets.filter((a) => matches(a, where)), orderBy).map(withRegister)),
    findUnique: vi.fn(async ({ where }: Where) => {
      const asset = t.assets.find((a) => matches(a, where));
      return asset ? withRegister(asset) : null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: Where) => withRegister(t.assets.find((a) => matches(a, where))!)),
    /** The columns the database fills in when a row is created without them. */
    create: vi.fn(async ({ data }: Data) => {
      const asset = {
        id: `asset${++seq}`, supplier: null, serialNumber: null, location: null, usefulLifeMonths: null,
        salvageValueCents: 0, condition: 'GOOD', retiredAt: null, notes: null, receiptRef: null, receiptUrl: null,
        dailyRateCents: null, countsFrom: null, createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      t.assets.push(asset);
      return withRegister(asset);
    }),
    update: vi.fn(async ({ where, data }: Where & Data) =>
      withRegister(Object.assign(t.assets.find((a) => matches(a, where))!, data, { updatedAt: new Date() }))),
    /**
     * The asset's repairs and investors go with it, as the database deletes
     * them. Like the database, it refuses while the asset has a machine line
     * or one of its investors has a payment.
     */
    delete: vi.fn(async ({ where }: Where) => {
      const asset = t.assets.find((a) => matches(a, where))!;
      const investorIds = t.machineInvestors.filter((i) => i.assetId === asset.id).map((i) => i.id);
      if (t.machineLines.some((l) => l.assetId === asset.id) || t.machinePayouts.some((p) => investorIds.includes(p.investorId))) {
        throw new Error('Foreign key constraint violated: the asset has machine lines or payments');
      }
      t.assets = t.assets.filter((a) => a !== asset);
      t.assetMaintenance = t.assetMaintenance.filter((m) => m.assetId !== asset.id);
      t.machineInvestors = t.machineInvestors.filter((i) => i.assetId !== asset.id);
      return asset;
    }),
  },
  assetMaintenance: {
    findUnique: vi.fn(async ({ where }: Where) => t.assetMaintenance.find((m) => matches(m, where)) ?? null),
    /** The columns the database fills in when a row is created without them. */
    create: vi.fn(async ({ data }: Data) => {
      const repair = { id: `repair${++seq}`, costCents: 0, performedBy: null, receiptRef: null, createdAt: new Date(), ...data };
      t.assetMaintenance.push(repair);
      return repair;
    }),
    delete: vi.fn(async ({ where }: Where) => {
      const repair = t.assetMaintenance.find((m) => matches(m, where))!;
      t.assetMaintenance = t.assetMaintenance.filter((m) => m !== repair);
      return repair;
    }),
  },
  machineLine: {
    /** `where` may filter on the line's own columns and on its `job`, as a cost's may. */
    findMany: vi.fn(async ({ where }: Partial<Where> = {}) => t.machineLines.filter((l) => costMatches(l, where)).map(withMachine)),
    aggregate: vi.fn(async (args: Partial<Where> & Row) => aggregate(t.machineLines.filter((l) => costMatches(l, args.where)), args)),
    count: vi.fn(async ({ where }: Partial<Where> = {}) => t.machineLines.filter((l) => costMatches(l, where)).length),
  },
  machineInvestor: {
    /** Each row gets a later `createdAt` than the one before it, so the list reads back in the order it was sent. */
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      const now = Date.now();
      data.forEach((d, i) => {
        const at = new Date(now + i);
        t.machineInvestors.push({ id: `investor${++seq}`, createdAt: at, updatedAt: at, ...d });
      });
      return { count: data.length };
    }),
    /** Like the database, it refuses while one of the investors has a payment. */
    deleteMany: vi.fn(async ({ where }: Partial<Where> = {}) => {
      const gone = t.machineInvestors.filter((i) => matches(i, where));
      if (t.machinePayouts.some((p) => gone.some((i) => i.id === p.investorId))) {
        throw new Error('Foreign key constraint violated: an investor has payments');
      }
      t.machineInvestors = t.machineInvestors.filter((i) => !gone.includes(i));
      return { count: gone.length };
    }),
  },
  machinePayout: {
    /** `where` may filter on the payment's own columns and on its `investor`. */
    count: vi.fn(async ({ where }: Partial<Where> = {}) => t.machinePayouts.filter((p) => payoutMatches(p, where)).length),
  },
  monthlyTarget: {
    /** Looked up by its compound key, `{ year_month: { year, month } }`. */
    findUnique: vi.fn(async ({ where }: Where) => t.monthlyTargets.find((m) => matches(m, where.year_month)) ?? null),
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

/**
 * The token carries the user's role, or the seeded `tokenRole` when the user
 * signed in before their role was changed in the database.
 */
export async function as(userId: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const { signAccessToken } = await import('../auth/jwt.js');
  const { financialsRoutes } = await import('../routes/financials.js');
  const { financeRoutes } = await import('../routes/finance.js');
  const { machinesRoutes } = await import('../routes/machines.js');
  const user = t.users.find((u) => u.id === userId)!;
  const { token } = await signAccessToken(userId, user.tokenRole ?? user.role);
  const server = Fastify();
  await server.register(financialsRoutes, { prefix: '/admin/financials' });
  await server.register(financeRoutes, { prefix: '/admin/finance' });
  await server.register(machinesRoutes, { prefix: '/admin/machines' });
  return server.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}
