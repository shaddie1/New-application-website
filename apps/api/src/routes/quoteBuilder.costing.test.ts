import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── A small in-memory database: just the calls the quote-builder routes make ──

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let users: Row[] = [];
let quotes: Row[] = [];
let surveys: Row[] = [];
let costings: Row[] = [];
let estimates: Row[] = [];
let assets: Row[] = [];
let ratesRow: Row | null = null;
let seq = 0;
const nextId = (prefix: string) => `${prefix}${++seq}`;
const tick = () => new Date(Date.UTC(2026, 10, 2, 9, 0, ++seq));
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const person = (id: string | null | undefined) => (id ? { fullName: users.find((u) => u.id === id)?.fullName ?? null } : null);
const currentEstimates = (quoteId: string) =>
  estimates
    .filter((e) => e.quoteRequestId === quoteId && e.status !== 'SUPERSEDED')
    .sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime());
const upsertBy = (table: Row[], quoteRequestId: string, create: Row, update: Row) => {
  const existing = table.find((r) => r.quoteRequestId === quoteRequestId);
  if (existing) return Object.assign(existing, copy(update), { updatedAt: tick() });
  const row = { id: nextId('row'), ...copy(create), createdAt: tick(), updatedAt: tick() };
  table.push(row);
  return row;
};

const db = {
  user: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null),
  },
  quoteRequest: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const q = quotes.find((r) => r.id === where.id);
      if (!q) return null;
      return {
        ...q,
        survey: surveys.find((s) => s.quoteRequestId === q.id) ?? null,
        costing: costings.find((c) => c.quoteRequestId === q.id) ?? null,
      };
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const q = quotes.find((r) => r.id === where.id);
      if (!q) throw new Error('not found');
      const survey = surveys.find((s) => s.quoteRequestId === q.id);
      const costing = costings.find((c) => c.quoteRequestId === q.id);
      return {
        ...q,
        serviceLine: { id: 'sl1', code: 'OFFICE', name: 'Office cleaning' },
        user: { fullName: 'Grace Wanjiru', phone: '+254712000999' },
        survey: survey ? { ...survey, updatedBy: person(survey.updatedById) } : null,
        costing: costing ? { ...costing, updatedBy: person(costing.updatedById) } : null,
        estimates: currentEstimates(q.id).slice(0, 1).map((e) => ({
          ...e,
          computedBy: person(e.computedById),
          submittedBy: person(e.submittedById),
          decidedBy: person(e.decidedById),
        })),
      };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) =>
      Object.assign(quotes.find((q) => q.id === where.id)!, data)),
  },
  quoteSurvey: {
    upsert: vi.fn(async ({ where, create, update }: { where: { quoteRequestId: string }; create: Row; update: Row }) =>
      upsertBy(surveys, where.quoteRequestId, create, update)),
    create: vi.fn(async ({ data }: { data: Row }) => upsertBy(surveys, data.quoteRequestId, data, data)),
  },
  quoteCosting: {
    upsert: vi.fn(async ({ where, create, update }: { where: { quoteRequestId: string }; create: Row; update: Row }) =>
      upsertBy(costings, where.quoteRequestId, create, update)),
  },
  quoteEstimate: {
    updateMany: vi.fn(async ({ where, data }: { where: { quoteRequestId: string; status: { not: string } }; data: Row }) => {
      const rows = estimates.filter((e) => e.quoteRequestId === where.quoteRequestId && e.status !== where.status.not);
      rows.forEach((e) => Object.assign(e, data));
      return { count: rows.length };
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = {
        id: nextId('est'), submittedById: null, submittedAt: null, decidedById: null, decidedAt: null,
        decisionNote: null, ...data, computedAt: tick(),
        // JSON columns are stored by value, as the database would.
        surveySnapshot: copy(data.surveySnapshot), ratesSnapshot: copy(data.ratesSnapshot),
        costingSnapshot: copy(data.costingSnapshot ?? null), output: copy(data.output),
      };
      estimates.push(row);
      return row;
    }),
    findFirst: vi.fn(async ({ where }: { where: { quoteRequestId: string } }) => currentEstimates(where.quoteRequestId)[0] ?? null),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) =>
      Object.assign(estimates.find((e) => e.id === where.id)!, data)),
  },
  quoteRates: {
    findUnique: vi.fn(async () => (ratesRow ? { ...ratesRow, updatedBy: person(ratesRow.updatedById) } : null)),
    upsert: vi.fn(async ({ create }: { create: Row }) => {
      ratesRow = { ...copy(create), updatedAt: tick() };
      return { ...ratesRow, updatedBy: person(ratesRow.updatedById) };
    }),
  },
  asset: {
    findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; retiredAt?: null } }) =>
      assets.filter((a) => (where.id ? where.id.in.includes(a.id) : true) && (where.retiredAt === null ? a.retiredAt === null : true))),
  },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
vi.mock('../db.js', () => ({ prisma: db }));

const { signAccessToken } = await import('../auth/jwt.js');
const { quoteBuilderRoutes } = await import('./quoteBuilder.js');
const { DEFAULT_RATES } = await import('../quotes/rates.js');

/** The one place tokens are made, so a change to signAccessToken's arguments is a one-line edit. */
async function tokenFor(userId: string) {
  const { token } = await signAccessToken(userId, users.find((u) => u.id === userId)!.role);
  return token;
}

async function as(userId: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  const server = Fastify();
  await server.register(quoteBuilderRoutes, { prefix: '/admin/quote-builder' });
  return server.inject({ method, url, payload, headers: { authorization: `Bearer ${await tokenFor(userId)}` } });
}

const staff = (id: string, role: string, isOwner = false) => ({ id, fullName: id, role, isOwner });
const weeklySurvey = {
  distanceZone: 'ZONE1', soilLevel: 'NORMAL', frequencyLabel: 'Weekly (4 visits)', workingWindowHours: 7,
  supervisorOnSite: false, traineeSourced: false, notes: null,
  areas: [{ areaType: 'Office room', cleanLevel: 'ROUTINE', roomCount: 4, sizePreset: 'MEDIUM' }],
  items: [],
};
const body = (over: object = {}) => ({
  extraMaterials: [], ownedMachines: [], boughtMachines: [], hiredMachines: [], upfrontPurchases: [], ...over,
});
const scrubber = {
  id: 'a-scrubber', name: 'Scrubber', category: 'MACHINE', costCents: 26_000_000, salvageValueCents: 2_000_000,
  usefulLifeMonths: 48, retiredAt: null, supplier: 'Kleen Ltd', notes: 'Bought for the bank contract', receiptUrl: 'https://x/r.pdf',
};
const newest = (quoteId: string) => currentEstimates(quoteId)[0]!;

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  users = [
    staff('owner', 'ADMIN', true), staff('admin', 'ADMIN'), staff('coo', 'COO'),
    staff('support', 'SUPPORT'), staff('supervisor', 'CLEANING_SUPERVISOR'),
  ];
  quotes = [
    { id: 'q1', userId: 'cust', serviceLineId: 'sl1', siteType: 'Bank branch', approxSqm: null, floors: null, frequency: 'WEEKLY',
      notes: null, status: 'SITE_VISIT_SCHEDULED', quotedAmountCents: null, quotedAt: null, createdAt: tick() },
    { id: 'q2', userId: 'cust', serviceLineId: 'sl1', siteType: 'Clinic', approxSqm: null, floors: null, frequency: 'WEEKLY',
      notes: null, status: 'PENDING', quotedAmountCents: null, quotedAt: null, createdAt: tick() },
  ];
  surveys = [{ id: 's1', quoteRequestId: 'q1', ...copy(weeklySurvey), updatedById: 'supervisor', createdAt: tick(), updatedAt: tick() }];
  costings = [];
  estimates = [{
    id: 'e0', quoteRequestId: 'q1', status: 'DRAFT', surveySnapshot: copy(weeklySurvey), ratesSnapshot: {}, costingSnapshot: null,
    ratesUpdatedAt: null, output: {}, computedById: 'admin', computedAt: tick(), submittedById: null, submittedAt: null,
    decidedById: null, decidedAt: null, decisionNote: null,
  }];
  assets = [copy(scrubber)];
  ratesRow = null;
});

describe('PUT /admin/quote-builder/:id/costing', () => {
  it('saves the costing, supersedes the estimate and freezes a copy on the new draft', async () => {
    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 3, clientPriceCents: 500_000, clientPriceBasis: 'VISIT' }));

    expect(res.statusCode).toBe(200);
    expect(estimates.find((e) => e.id === 'e0')!.status).toBe('SUPERSEDED');
    const draft = newest('q1');
    expect(draft.status).toBe('DRAFT');
    expect(draft.costingSnapshot).toMatchObject({ crewSize: 3, clientPriceCents: 500_000, clientPriceBasis: 'VISIT', clientPriceVisitsPerMonth: 4 });
    expect(draft.output.hours.crewSize).toBe(3);
    expect(draft.output.pricing.pricePerVisitCents).toBe(500_000);
    expect(res.json().quoteRequest.costing).toMatchObject({ crewSize: 3, updatedByName: 'admin' });
  });

  it('refuses SUPPORT, and hides the costing and estimate from SUPPORT', async () => {
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 3 }));

    const save = await as('support', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 9 }));
    expect(save.statusCode).toBe(403);
    expect(costings[0]!.data.crewSize).toBe(3);

    const survey = await as('support', 'PUT', '/admin/quote-builder/q1/survey', weeklySurvey);
    expect(survey.statusCode).toBe(200);
    expect(survey.json().quoteRequest.costing).toBeNull();
    expect(survey.json().quoteRequest.estimate).toBeNull();
  });

  it.each(['AWAITING_APPROVAL', 'APPROVED', 'QUOTED'])('refuses a save while the quote is %s, and writes nothing', async (status) => {
    quotes[0]!.status = status;

    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 3 }));

    expect(res.statusCode).toBe(409);
    expect(costings).toHaveLength(0);
    expect(estimates.map((e) => e.status)).toEqual(['DRAFT']);
  });

  it('starts a blank survey from the request frequency when the quote has none', async () => {
    const res = await as('admin', 'PUT', '/admin/quote-builder/q2/costing', body({ crewSize: 2, jobDays: 1 }));

    expect(res.statusCode).toBe(200);
    expect(surveys.find((s) => s.quoteRequestId === 'q2')).toMatchObject({ frequencyLabel: 'Weekly (4 visits)', areas: [], items: [] });
    expect(newest('q2').output.hours.crewSize).toBe(2);
  });

  it('AE4: refuses an owned machine with no useful life until its wear is typed', async () => {
    assets.push({ ...copy(scrubber), id: 'a-vacuum', name: 'Old vacuum', usefulLifeMonths: null });

    const refused = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ ownedMachines: [{ assetId: 'a-vacuum' }] }));
    expect(refused.statusCode).toBe(400);
    expect(JSON.stringify(refused.json())).toContain('Old vacuum');
    expect(costings).toHaveLength(0);

    const typed = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ ownedMachines: [{ assetId: 'a-vacuum', wearPerDayCents: 15_000 }] }));
    expect(typed.statusCode).toBe(200);
    expect(newest('q1').output.machines[0]).toMatchObject({ name: 'Old vacuum', perJobDayCents: 15_000 });
  });

  it('keeps the last copy of a machine deleted from the register since, with a warning', async () => {
    const machines = { ownedMachines: [{ assetId: 'a-scrubber' }] };
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body(machines));
    assets = [];

    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body(machines));

    expect(res.statusCode).toBe(200);
    expect(costings[0]!.data.ownedMachines[0].asset).toMatchObject({ name: 'Scrubber', costCents: 26_000_000, deleted: true });
    expect(newest('q1').output.warnings).toEqual(expect.arrayContaining([expect.stringContaining('deleted')]));
  });

  it('keeps a retired machine, with a warning', async () => {
    assets = [{ ...copy(scrubber), retiredAt: new Date('2026-10-01') }];

    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ ownedMachines: [{ assetId: 'a-scrubber' }] }));

    expect(res.statusCode).toBe(200);
    expect(costings[0]!.data.ownedMachines[0].asset.retired).toBe(true);
    expect(newest('q1').output.warnings).toEqual(expect.arrayContaining([expect.stringContaining('retired')]));
  });

  it('refuses a monthly price on a quote with no contract length', async () => {
    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ clientPriceCents: 8_800_000, clientPriceBasis: 'MONTH' }));

    expect(res.statusCode).toBe(400);
    expect(costings).toHaveLength(0);
  });
});

describe('recomputing with a costing', () => {
  it('keeps the hand-set figures and the client price when a supervisor saves the survey', async () => {
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 3, clientPriceCents: 500_000, clientPriceBasis: 'VISIT' }));

    const res = await as('supervisor', 'PUT', '/admin/quote-builder/q1/survey', { ...weeklySurvey, soilLevel: 'HEAVY' });

    expect(res.statusCode).toBe(200);
    const draft = newest('q1');
    expect(draft.surveySnapshot.soilLevel).toBe('HEAVY');
    expect(draft.output.hours.crewSize).toBe(3);
    expect(draft.output.pricing.pricePerVisitCents).toBe(500_000);
  });

  it('charges lunch at the rates card figure on a surveyed quote nobody has costed', async () => {
    ratesRow = { id: 'default', data: { ...DEFAULT_RATES, lunchPerPersonPerDayCents: 15_000 }, updatedById: 'owner', updatedAt: tick() };

    const res = await as('admin', 'POST', '/admin/quote-builder/q1/estimate');

    expect(res.statusCode).toBe(200);
    expect(newest('q1').output.costs.lunchCents).toBe(15_000); // 1 cleaner × 1 day
  });

  it('AE6: an approved estimate keeps its figures when the cleaner day rate is raised', async () => {
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 2, clientPriceCents: 600_000, clientPriceBasis: 'VISIT' }));
    expect((await as('admin', 'POST', '/admin/quote-builder/q1/submit')).statusCode).toBe(200);
    expect((await as('coo', 'POST', '/admin/quote-builder/q1/approve', {})).statusCode).toBe(200);
    const approved = copy(newest('q1'));

    const rates = await as('admin', 'PUT', '/admin/quote-builder/rates', { ...DEFAULT_RATES, cleanerPayPerDayCents: 120_000 });
    expect(rates.statusCode).toBe(200);
    expect((await as('admin', 'POST', '/admin/quote-builder/q1/estimate')).statusCode).toBe(409);

    const after = newest('q1');
    expect(after.status).toBe('APPROVED');
    expect(after.output).toEqual(approved.output);
    expect(after.costingSnapshot).toEqual(approved.costingSnapshot);
  });
});

describe('GET /admin/quote-builder/assets', () => {
  it('lists non-retired assets with only the figures a costing copies', async () => {
    assets.push({ ...copy(scrubber), id: 'a-old', name: 'Old dryer', retiredAt: new Date('2026-01-01') });

    const res = await as('coo', 'GET', '/admin/quote-builder/assets');

    expect(res.statusCode).toBe(200);
    expect(res.json().assets).toEqual([
      { id: 'a-scrubber', name: 'Scrubber', category: 'MACHINE', costCents: 26_000_000, salvageValueCents: 2_000_000, usefulLifeMonths: 48 },
    ]);
  });

  it('refuses SUPPORT', async () => {
    expect((await as('support', 'GET', '/admin/quote-builder/assets')).statusCode).toBe(403);
  });
});
