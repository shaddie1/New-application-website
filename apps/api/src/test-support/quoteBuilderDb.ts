/**
 * Route-test support for the quote builder: an in-memory stand-in for the
 * Prisma calls the quote-builder and admin quote routes make, and one helper
 * that signs a token and calls a route. A test file mocks '../db.js' with
 * `db` and seeds the tables in `t`. JSON columns are stored by value, as the
 * database would. Not built: tsconfig.build.json excludes this folder.
 */
import Fastify from 'fastify';
import { vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const t = {
  users: [] as Row[],
  serviceLines: [] as Row[],
  quotes: [] as Row[],
  surveys: [] as Row[],
  costings: [] as Row[],
  estimates: [] as Row[],
  assets: [] as Row[],
  notifications: [] as Row[],
  rates: null as Row | null,
};

let seq = 0;
const nextId = (prefix: string) => `${prefix}${++seq}`;
/** A strictly increasing timestamp, so "newest" is always well defined. */
export const tick = () => new Date(Date.UTC(2026, 10, 2, 9, 0, ++seq));
export const copy = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function resetDb() {
  seq = 0;
  t.users = [];
  t.serviceLines = [];
  t.quotes = [];
  t.surveys = [];
  t.costings = [];
  t.estimates = [];
  t.assets = [];
  t.notifications = [];
  t.rates = null;
}

/** The subset of Prisma's `where` the routes use: equality, null, `not` and `in`. */
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) =>
    v === null ? row[k] == null
    : typeof v === 'object' && 'not' in v ? row[k] !== v.not
    : typeof v === 'object' && 'in' in v ? (v.in as unknown[]).includes(row[k])
    : row[k] === v);

const person = (id: string | null | undefined) => (id ? { fullName: t.users.find((u) => u.id === id)?.fullName ?? null } : null);
const newestFirst = (rows: Row[]) => [...rows].sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime());

/** A quote with every relation the routes include or select. */
function withRelations(q: Row) {
  const survey = t.surveys.find((s) => s.quoteRequestId === q.id);
  const costing = t.costings.find((c) => c.quoteRequestId === q.id);
  const customer = t.users.find((u) => u.id === q.userId);
  return {
    ...q,
    serviceLine: t.serviceLines.find((s) => s.id === q.serviceLineId) ?? null,
    user: customer ? { fullName: customer.fullName, phone: customer.phone } : null,
    survey: survey ? { ...survey, updatedBy: person(survey.updatedById) } : null,
    costing: costing ? { ...costing, updatedBy: person(costing.updatedById) } : null,
    estimates: newestFirst(t.estimates.filter((e) => e.quoteRequestId === q.id && e.status !== 'SUPERSEDED'))
      .slice(0, 1)
      .map((e) => ({ ...e, computedBy: person(e.computedById), submittedBy: person(e.submittedById), decidedBy: person(e.decidedById) })),
  };
}

function insert(table: Row[], prefix: string, data: Row) {
  const row = { id: nextId(prefix), createdAt: tick(), updatedAt: tick(), ...data };
  table.push(row);
  return row;
}

function upsertBy(table: Row[], quoteRequestId: string, create: Row, update: Row) {
  const existing = table.find((r) => r.quoteRequestId === quoteRequestId);
  if (existing) return Object.assign(existing, copy(update), { updatedAt: tick() });
  return insert(table, 'row', copy(create));
}

type Where = { where: Row };
type Data = { data: Row };
type Upsert = { where: { quoteRequestId: string }; create: Row; update: Row };

export const db = {
  user: {
    findUnique: vi.fn(async ({ where }: Where) => t.users.find((u) => matches(u, where)) ?? null),
    create: vi.fn(async ({ data }: Data) => insert(t.users, 'user', { isOwner: false, ...data })),
  },
  serviceLine: {
    findUnique: vi.fn(async ({ where }: Where) => t.serviceLines.find((s) => matches(s, where)) ?? null),
  },
  quoteRequest: {
    findUnique: vi.fn(async ({ where }: Where) => {
      const q = t.quotes.find((r) => r.id === where.id);
      return q ? withRelations(q) : null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: Where) => {
      const q = t.quotes.find((r) => r.id === where.id);
      if (!q) throw new Error('not found');
      return withRelations(q);
    }),
    findMany: vi.fn(async ({ where }: Partial<Where> = {}) => t.quotes.filter((q) => matches(q, where)).map(withRelations)),
    create: vi.fn(async ({ data }: Data) =>
      withRelations(insert(t.quotes, 'quote', {
        approxSqm: null, floors: null, frequency: 'NONE', notes: null, status: 'PENDING',
        quotedAmountCents: null, quotedAt: null, convertedBookingId: null, ...data,
      }))),
    update: vi.fn(async ({ where, data }: Where & Data) => withRelations(Object.assign(t.quotes.find((q) => q.id === where.id)!, data))),
  },
  quoteSurvey: {
    upsert: vi.fn(async ({ where, create, update }: Upsert) => upsertBy(t.surveys, where.quoteRequestId, create, update)),
    create: vi.fn(async ({ data }: Data) => insert(t.surveys, 'survey', copy(data))),
  },
  quoteCosting: {
    upsert: vi.fn(async ({ where, create, update }: Upsert) => upsertBy(t.costings, where.quoteRequestId, create, update)),
    create: vi.fn(async ({ data }: Data) => insert(t.costings, 'costing', copy(data))),
  },
  quoteEstimate: {
    updateMany: vi.fn(async ({ where, data }: Where & Data) => {
      const rows = t.estimates.filter((e) => matches(e, where));
      rows.forEach((e) => Object.assign(e, data));
      return { count: rows.length };
    }),
    create: vi.fn(async ({ data }: Data) =>
      insert(t.estimates, 'est', {
        submittedById: null, submittedAt: null, decidedById: null, decidedAt: null, decisionNote: null,
        ...data,
        computedAt: tick(),
        surveySnapshot: copy(data.surveySnapshot),
        ratesSnapshot: copy(data.ratesSnapshot),
        costingSnapshot: copy(data.costingSnapshot ?? null),
        output: copy(data.output),
      })),
    findFirst: vi.fn(async ({ where }: Where) => newestFirst(t.estimates.filter((e) => matches(e, where)))[0] ?? null),
    update: vi.fn(async ({ where, data }: Where & Data) => Object.assign(t.estimates.find((e) => e.id === where.id)!, data)),
  },
  quoteRates: {
    findUnique: vi.fn(async () => (t.rates ? { ...t.rates, updatedBy: person(t.rates.updatedById) } : null)),
    upsert: vi.fn(async ({ create }: Upsert) => {
      t.rates = { ...copy(create), updatedAt: tick() };
      return { ...t.rates, updatedBy: person(t.rates.updatedById) };
    }),
  },
  asset: {
    findMany: vi.fn(async ({ where }: Where) => t.assets.filter((a) => matches(a, where))),
  },
  notification: {
    create: vi.fn(async ({ data }: Data) => insert(t.notifications, 'note', copy(data))),
  },
  notificationPreference: {
    findUnique: vi.fn(async () => null),
  },
  $transaction: vi.fn(async (arg: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
    typeof arg === 'function' ? arg(db) : Promise.all(arg)),
};

export const staff = (id: string, role: string, isOwner = false) => ({ id, fullName: id, phone: null, role, isOwner });

export const weeklySurvey = {
  distanceZone: 'ZONE1', soilLevel: 'NORMAL', frequencyLabel: 'Weekly (4 visits)', workingWindowHours: 7,
  supervisorOnSite: false, traineeSourced: false, notes: null,
  areas: [{ areaType: 'Office room', cleanLevel: 'ROUTINE', roomCount: 4, sizePreset: 'MEDIUM' }],
  items: [] as Row[],
};

/** A costing save body with nothing listed. */
export const costingBody = (over: object = {}) => ({
  extraMaterials: [], ownedMachines: [], boughtMachines: [], hiredMachines: [], upfrontPurchases: [], ...over,
});

/**
 * Call an admin or quote-builder route as a seeded user. The one place tokens
 * are made, so a change to signAccessToken's arguments is a one-line edit.
 */
export async function as(userId: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  const { signAccessToken } = await import('../auth/jwt.js');
  const { adminRoutes } = await import('../routes/admin.js');
  const { quoteBuilderRoutes } = await import('../routes/quoteBuilder.js');
  const { token } = await signAccessToken(userId, t.users.find((u) => u.id === userId)!.role);
  const server = Fastify();
  await server.register(adminRoutes, { prefix: '/admin' });
  await server.register(quoteBuilderRoutes, { prefix: '/admin/quote-builder' });
  return server.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}
