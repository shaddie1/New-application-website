import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Repeating projects: the schedule is checked and stored, a repeating project
// gets its own questions, and planned visits can be listed and marked.

const userFindUnique = vi.fn();
const projectCreate = vi.fn();
const projectFindUnique = vi.fn();
const projectFindUniqueOrThrow = vi.fn();
const projectFindMany = vi.fn();
const projectUpdate = vi.fn();
const visitFindMany = vi.fn();
const visitFindUnique = vi.fn();
const visitUpsert = vi.fn();
const visitDelete = vi.fn();
const eventCreate = vi.fn();
vi.mock('../db.js', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    project: {
      create: projectCreate,
      findUnique: projectFindUnique,
      findUniqueOrThrow: projectFindUniqueOrThrow,
      findMany: projectFindMany,
      update: projectUpdate,
    },
    projectVisit: { findMany: visitFindMany, findUnique: visitFindUnique, upsert: visitUpsert, delete: visitDelete },
    projectEvent: { create: eventCreate },
  },
}));

const { signAccessToken } = await import('../auth/jwt.js');
const { projectRoutes } = await import('./projects.js');

async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) {
  const server = Fastify();
  await server.register(projectRoutes, { prefix: '/admin/projects' });
  const token = (await signAccessToken('sup', 'CLEANING_SUPERVISOR')).token;
  return server.inject({ method, url: `/admin/projects${url}`, payload, headers: { authorization: `Bearer ${token}` } });
}

/** A stored project row with everything toDto reads. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'p1', title: 'Office contract', clientName: 'Amani Ltd', clientPhone: null, siteLocation: 'Westlands',
    serviceLineCode: null, clientSegment: null, stage: 'SCHEDULED',
    startDate: new Date('2026-11-20'), targetEndDate: null, completedAt: null,
    valueCents: 1_250_000, paymentFrequency: 'MONTHLY',
    kind: 'REPEATING', repeatEvery: 1, repeatUnit: 'WEEK', serviceDays: [6], weekOfMonth: null,
    deepCleanEveryMonths: null, deepCleanPriceCents: null,
    notes: null, checklist: [], _count: { events: 0 }, createdBy: { fullName: 'Owner' },
    createdAt: new Date('2026-11-20T08:00:00Z'), updatedAt: new Date('2026-11-20T08:00:00Z'),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue({ role: 'CLEANING_SUPERVISOR', isOwner: false, fullName: 'Sam' });
  projectCreate.mockImplementation(async ({ data }) => ({ id: 'p1', ...data }));
  projectFindUniqueOrThrow.mockResolvedValue(row());
  projectUpdate.mockImplementation(async ({ data }) => row(data));
  eventCreate.mockResolvedValue({});
  visitFindMany.mockResolvedValue([]);
  visitFindUnique.mockResolvedValue(null);
  visitUpsert.mockResolvedValue({});
});

const weekly = {
  title: 'Office contract',
  kind: 'REPEATING',
  startDate: '2026-11-20',
  repeatEvery: 1,
  repeatUnit: 'WEEK',
  serviceDays: [6, 7, 6],
};

describe('POST /admin/projects with a schedule', () => {
  it('stores a repeating schedule and seeds the repeating questions', async () => {
    const res = await call('POST', '/', weekly);
    expect(res.statusCode).toBe(201);
    const data = projectCreate.mock.calls[0]![0].data;
    expect(data).toMatchObject({ kind: 'REPEATING', repeatEvery: 1, repeatUnit: 'WEEK', serviceDays: [6, 7], weekOfMonth: null });
    const questions = data.checklist.create.map((q: { question: string }) => q.question);
    expect(questions).toHaveLength(13);
    expect(questions).toContain('Has the client signed the contract, with its length and notice period?');
    expect(questions).not.toContain('Has payment been received in full?');
  });

  it('keeps the 14 one-off questions for a one-off project, and stores no schedule', async () => {
    const res = await call('POST', '/', { title: 'Move-out clean', startDate: '2026-12-03', repeatEvery: 2, serviceDays: [1] });
    expect(res.statusCode).toBe(201);
    const data = projectCreate.mock.calls[0]![0].data;
    expect(data).toMatchObject({ kind: 'ONCE', repeatEvery: null, serviceDays: [], deepCleanPriceCents: null });
    expect(data.checklist.create).toHaveLength(14);
  });

  it('refuses an unfinished schedule with words for the form', async () => {
    const res = await call('POST', '/', { ...weekly, serviceDays: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Pick at least one service day.' });
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it('needs a price for a deep clean', async () => {
    const res = await call('POST', '/', { ...weekly, deepCleanEveryMonths: 3 });
    expect(res.json()).toEqual({ error: 'Give the deep clean its price.' });
    const ok = await call('POST', '/', { ...weekly, deepCleanEveryMonths: 3, deepCleanPriceCents: 800_000 });
    expect(ok.statusCode).toBe(201);
    expect(projectCreate.mock.calls[0]![0].data).toMatchObject({ deepCleanEveryMonths: 3, deepCleanPriceCents: 800_000 });
  });
});

describe('PATCH /admin/projects/:id', () => {
  it('changes one schedule field and keeps the rest', async () => {
    projectFindUnique.mockResolvedValue(row());
    const res = await call('PATCH', '/p1', { serviceDays: [1, 2, 3, 4, 5] });
    expect(res.statusCode).toBe(200);
    expect(projectUpdate.mock.calls[0]![0].data).toMatchObject({ kind: 'REPEATING', repeatEvery: 1, serviceDays: [1, 2, 3, 4, 5] });
  });

  it('clears the schedule when the project becomes one-off', async () => {
    projectFindUnique.mockResolvedValue(row({ deepCleanEveryMonths: 3, deepCleanPriceCents: 800_000 }));
    await call('PATCH', '/p1', { kind: 'ONCE' });
    expect(projectUpdate.mock.calls[0]![0].data).toMatchObject({
      kind: 'ONCE', repeatEvery: null, repeatUnit: null, serviceDays: [], deepCleanEveryMonths: null, deepCleanPriceCents: null,
    });
  });

  it('refuses a monthly schedule without the week of the month', async () => {
    projectFindUnique.mockResolvedValue(row());
    const res = await call('PATCH', '/p1', { repeatUnit: 'MONTH' });
    expect(res.json()).toEqual({ error: 'For a monthly service, choose which week of the month.' });
    expect(projectUpdate).not.toHaveBeenCalled();
  });
});

describe('POST /admin/projects/schedule-preview', () => {
  it('describes the schedule and lists the first visits', async () => {
    const res = await call('POST', '/schedule-preview', { ...weekly, startDate: '2030-01-01', serviceDays: [6] });
    expect(res.json()).toEqual({
      problem: null,
      summary: 'Every week on Sat',
      nextVisits: ['2030-01-05', '2030-01-12', '2030-01-19', '2030-01-26', '2030-02-02'].map((date) => ({ date, isDeepClean: false })),
    });
  });

  it('says what is missing', async () => {
    const res = await call('POST', '/schedule-preview', { kind: 'REPEATING', repeatUnit: 'WEEK', repeatEvery: 1, serviceDays: [6] });
    expect(res.json()).toMatchObject({ problem: 'A repeating project needs a start date.', nextVisits: [] });
  });
});

describe('GET /admin/projects/visits', () => {
  it('lists planned visits with their marks', async () => {
    projectFindMany.mockResolvedValue([row()]);
    visitFindMany.mockResolvedValue([
      { projectId: 'p1', date: new Date('2026-11-28'), status: 'DONE', note: null, isDeepClean: false, markedBy: { fullName: 'Sam' }, project: row() },
    ]);
    const res = await call('GET', '/visits?from=2026-11-21&to=2026-12-05');
    expect(res.statusCode).toBe(200);
    expect(res.json().visits.map((v: { date: string; status: string }) => `${v.date} ${v.status}`)).toEqual([
      '2026-11-21 PLANNED', '2026-11-28 DONE', '2026-12-05 PLANNED',
    ]);
  });

  it('refuses a span longer than three months', async () => {
    const res = await call('GET', '/visits?from=2026-01-01&to=2026-12-31');
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /admin/projects/:id/visits/:date', () => {
  it('marks a planned visit done and logs it', async () => {
    projectFindUnique.mockResolvedValue(row());
    projectFindMany.mockResolvedValue([row()]);
    const res = await call('PUT', '/p1/visits/2026-11-28', { status: 'DONE' });
    expect(res.statusCode).toBe(200);
    expect(visitUpsert.mock.calls[0]![0].create).toMatchObject({ projectId: 'p1', status: 'DONE', isDeepClean: false, markedById: 'sup' });
    expect(eventCreate.mock.calls[0]![0].data).toMatchObject({ kind: 'VISIT_MARKED', summary: 'Visit on 2026-11-28 marked done' });
  });

  it('refuses a day with no planned visit', async () => {
    projectFindUnique.mockResolvedValue(row());
    const res = await call('PUT', '/p1/visits/2026-11-25', { status: 'DONE' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'There is no visit planned on that day.' });
    expect(visitUpsert).not.toHaveBeenCalled();
  });

  it('takes a mark off', async () => {
    projectFindUnique.mockResolvedValue(row());
    projectFindMany.mockResolvedValue([row()]);
    visitFindUnique.mockResolvedValue({ id: 'v1' });
    const res = await call('PUT', '/p1/visits/2026-11-28', { status: null });
    expect(res.statusCode).toBe(200);
    expect(visitDelete).toHaveBeenCalledWith({ where: { id: 'v1' } });
  });
});
