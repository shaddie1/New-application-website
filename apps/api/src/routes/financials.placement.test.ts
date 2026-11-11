import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// A job's place: under one project, one-off (stored as STANDALONE), or not
// yet sorted. The owner chooses it when saving a job or approving a report,
// and can move one job or place several at once.

const CHOOSE = { error: 'choose a project or mark the job one-off' };
const underA = { placement: 'PROJECT', projectId: 'pA' };
const underB = { placement: 'PROJECT', projectId: 'pB' };
const oneOff = { placement: 'STANDALONE' };

/** A date as the database gives a job's or a cost's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const job = (id: string, over: object = {}) => ({
  id, title: `Job ${id}`, date: day('2026-05-04'), incomeCents: 500_000, discountCents: 0, status: 'OWNER_ENTRY',
  placement: 'UNSORTED', projectId: null, clientName: null, clientPhone: null, clientLocation: null, notes: null,
  serviceLineCode: null, region: null, clientSegment: null, createdById: 'owner', reportedById: null,
  createdAt: day('2026-05-04'), ...over,
});

const newJob = (over: object = {}) => ({ title: 'Hospital wing deep clean', date: '2026-06-01', incomeCents: 2_500_000, ...over });
const stored = (id: string) => t.jobs.find((j) => j.id === id)!;
const place = (id: string) => ({ placement: stored(id).placement, projectId: stored(id).projectId });
const snapshot = () => structuredClone({ jobs: t.jobs, expenses: t.expenses });

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [
    { id: 'owner', fullName: 'Owner', role: 'ADMIN', isOwner: true },
    { id: 'admin', fullName: 'Admin', role: 'ADMIN', isOwner: false },
    { id: 'fm', fullName: 'Finance', role: 'FINANCIAL_MANAGER', isOwner: false },
    { id: 'coo', fullName: 'Coo', role: 'COO', isOwner: false },
    { id: 'sup', fullName: 'Achieng Otieno', role: 'CLEANING_SUPERVISOR', isOwner: false },
  ];
  t.projects = [{ id: 'pA', title: 'Bank branch' }, { id: 'pB', title: 'Clinic' }];
  t.jobs = [
    // KSh 12,000 charged and KSh 7,000 spent, under project A.
    job('j1', { incomeCents: 1_200_000, placement: 'PROJECT', projectId: 'pA' }),
    job('j2', { placement: 'STANDALONE' }),
    job('u1'),
    job('u2', { status: 'APPROVED', reportedById: 'sup' }),
    job('u3'),
    // A report waiting for approval.
    job('r1', { status: 'PENDING', createdById: 'sup', reportedById: 'sup' }),
  ];
  t.expenses = [
    { id: 'e1', jobId: 'j1', bookingId: null, category: 'MATERIALS', amountCents: 700_000, description: null, date: day('2026-05-04'), createdAt: day('2026-05-04') },
  ];
});

describe('saving a new job', () => {
  it('AE1: refuses a job with no place and saves nothing', async () => {
    const res = await as('owner', 'POST', '/admin/financials/jobs', newJob());

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(CHOOSE);
    expect(t.jobs).toHaveLength(6);
  });

  it('stores the project of a job saved under a project', async () => {
    const res = await as('owner', 'POST', '/admin/financials/jobs', newJob({ place: underA }));

    expect(res.statusCode).toBe(201);
    expect(res.json().job).toMatchObject({ status: 'OWNER_ENTRY', placement: 'PROJECT', projectId: 'pA', projectTitle: 'Bank branch' });
    expect(place(res.json().job.id)).toEqual({ placement: 'PROJECT', projectId: 'pA' });
  });

  it('stores a job saved as one-off under no project', async () => {
    const res = await as('owner', 'POST', '/admin/financials/jobs', newJob({ place: oneOff }));

    expect(res.statusCode).toBe(201);
    expect(res.json().job).toMatchObject({ placement: 'STANDALONE', projectId: null, projectTitle: null });
    expect(place(res.json().job.id)).toEqual({ placement: 'STANDALONE', projectId: null });
  });

  it('refuses a project that does not exist and saves nothing', async () => {
    const res = await as('owner', 'POST', '/admin/financials/jobs', newJob({ place: { placement: 'PROJECT', projectId: 'gone' } }));

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'project not found' });
    expect(t.jobs).toHaveLength(6);
  });

  it.each([
    ['one-off together with a project', { placement: 'STANDALONE', projectId: 'pA' }],
    ['a place that is neither', { placement: 'BOTH', projectId: 'pA' }],
  ])('refuses %s and saves nothing', async (_name, bad) => {
    const res = await as('owner', 'POST', '/admin/financials/jobs', newJob({ place: bad }));

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(CHOOSE);
    expect(t.jobs).toHaveLength(6);
  });
});

describe('moving a job', () => {
  it('AE4: moves a job from project A to project B and leaves its income and costs alone', async () => {
    const res = await as('owner', 'PATCH', '/admin/financials/jobs/j1', { place: underB });

    expect(res.statusCode).toBe(200);
    expect(res.json().job).toMatchObject({
      placement: 'PROJECT', projectId: 'pB', projectTitle: 'Clinic',
      incomeCents: 1_200_000, totalExpensesCents: 700_000, netCents: 500_000,
    });
    expect(stored('j1')).toMatchObject({ placement: 'PROJECT', projectId: 'pB', incomeCents: 1_200_000, discountCents: 0 });
    expect(t.expenses).toMatchObject([{ id: 'e1', jobId: 'j1', amountCents: 700_000 }]);
  });

  it('moves a job from a project to one-off', async () => {
    const res = await as('owner', 'PATCH', '/admin/financials/jobs/j1', { place: oneOff });

    expect(res.statusCode).toBe(200);
    expect(place('j1')).toEqual({ placement: 'STANDALONE', projectId: null });
  });

  it('moves a job from one-off to a project', async () => {
    const res = await as('owner', 'PATCH', '/admin/financials/jobs/j2', { place: underB });

    expect(res.statusCode).toBe(200);
    expect(place('j2')).toEqual({ placement: 'PROJECT', projectId: 'pB' });
  });

  it('refuses to move a job back to not yet sorted', async () => {
    const res = await as('owner', 'PATCH', '/admin/financials/jobs/j1', { place: { placement: 'UNSORTED' } });

    expect(res.statusCode).toBe(400);
    expect(place('j1')).toEqual({ placement: 'PROJECT', projectId: 'pA' });
  });
});

describe('approving or declining a report', () => {
  it('refuses to approve with no place and leaves the report waiting', async () => {
    const res = await as('owner', 'PATCH', '/admin/financials/reports/r1/approve', {});

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(CHOOSE);
    expect(stored('r1')).toMatchObject({ status: 'PENDING', placement: 'UNSORTED', projectId: null });
  });

  it('approves with a place and stores it', async () => {
    const res = await as('owner', 'PATCH', '/admin/financials/reports/r1/approve', { place: underB });

    expect(res.statusCode).toBe(200);
    expect(res.json().job).toMatchObject({ status: 'APPROVED', placement: 'PROJECT', projectId: 'pB', projectTitle: 'Clinic' });
    expect(stored('r1')).toMatchObject({ status: 'APPROVED', placement: 'PROJECT', projectId: 'pB' });
  });

  it('answers not found for a report that is not waiting', async () => {
    const res = await as('owner', 'PATCH', '/admin/financials/reports/u2/approve', { place: underB });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'pending report not found' });
    expect(stored('u2')).toMatchObject({ status: 'APPROVED', placement: 'UNSORTED', projectId: null });
  });

  it('deletes a declined report', async () => {
    const res = await as('owner', 'DELETE', '/admin/financials/reports/r1');

    expect(res.statusCode).toBe(200);
    expect(t.jobs.map((j) => j.id)).toEqual(['j1', 'j2', 'u1', 'u2', 'u3']);
  });
});

describe('placing several jobs at once', () => {
  it('places three unsorted jobs under one project in one request', async () => {
    const res = await as('owner', 'POST', '/admin/financials/jobs/place', { jobIds: ['u1', 'u2', 'u3'], place: underA });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ placed: 3 });
    expect(['u1', 'u2', 'u3'].map(place)).toEqual(Array(3).fill({ placement: 'PROJECT', projectId: 'pA' }));
  });

  it('changes nothing and names the job when one job is unknown', async () => {
    const before = snapshot();

    const res = await as('owner', 'POST', '/admin/financials/jobs/place', { jobIds: ['u1', 'gone', 'u3'], place: underA });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'job not found', jobId: 'gone' });
    expect(snapshot()).toEqual(before);
  });

  it('changes nothing when one job is still waiting for approval', async () => {
    const before = snapshot();

    const res = await as('owner', 'POST', '/admin/financials/jobs/place', { jobIds: ['u1', 'r1'], place: oneOff });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'job is waiting for approval', jobId: 'r1' });
    expect(snapshot()).toEqual(before);
  });
});

describe('a project that no longer exists', () => {
  const gone = { placement: 'PROJECT', projectId: 'gone' };

  it.each([
    ['moving a job', 'PATCH', '/admin/financials/jobs/j1', { place: gone }],
    ['approving a report', 'PATCH', '/admin/financials/reports/r1/approve', { place: gone }],
    ['placing several jobs', 'POST', '/admin/financials/jobs/place', { jobIds: ['u1', 'u3'], place: gone }],
  ] as const)('is refused when %s, and nothing changes', async (_name, method, url, payload) => {
    const before = snapshot();

    const res = await as('owner', method, url, payload);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'project not found' });
    expect(snapshot()).toEqual(before);
  });
});

describe.each(['admin', 'fm', 'coo'])('%s, who is not the owner', (userId) => {
  it.each([
    ['save a job', 'POST', '/admin/financials/jobs', newJob({ place: underA })],
    ['move a job', 'PATCH', '/admin/financials/jobs/j1', { place: underB }],
    ['approve a report', 'PATCH', '/admin/financials/reports/r1/approve', { place: underB }],
    ['place several jobs', 'POST', '/admin/financials/jobs/place', { jobIds: ['u1', 'u3'], place: underA }],
  ] as const)('cannot %s', async (_name, method, url, payload) => {
    const before = snapshot();

    const res = await as(userId, method, url, payload);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'owner access required' });
    expect(snapshot()).toEqual(before);
  });
});

describe('POST /admin/job-reports', () => {
  it('takes a job report that names no place and leaves it not yet sorted', async () => {
    const { signAccessToken } = await import('../auth/jwt.js');
    const { jobReportsRoutes } = await import('./jobReports.js');
    const server = Fastify();
    await server.register(jobReportsRoutes, { prefix: '/admin/job-reports' });

    const res = await server.inject({
      method: 'POST',
      url: '/admin/job-reports',
      payload: { title: 'Sofa cleaning, Kilimani', date: '2026-06-02', incomeCents: 450_000 },
      headers: { authorization: `Bearer ${(await signAccessToken('sup', 'CLEANING_SUPERVISOR')).token}` },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().report).toMatchObject({ status: 'PENDING', placement: 'UNSORTED', projectId: null, projectTitle: null });
    expect(stored(res.json().report.id)).toMatchObject({ status: 'PENDING', placement: 'UNSORTED', projectId: null });
  });
});

describe('GET /admin/financials/unsorted', () => {
  it('lists the owner-entered and approved jobs not yet sorted, oldest first, with what was charged', async () => {
    t.projects = [{ id: 'pA', title: 'Bank branch', clientName: 'Karen Heights', clientPhone: null, stage: 'IN_PROGRESS' }];
    t.jobs = [
      job('late', { date: day('2026-06-10'), incomeCents: 900_000, discountCents: 100_000, clientName: 'karen heights' }),
      job('early', { date: day('2026-03-02'), status: 'APPROVED', incomeCents: 300_000 }),
      job('sorted', { date: day('2026-01-01'), placement: 'PROJECT', projectId: 'pA' }),
      job('oneoff', { date: day('2026-01-02'), placement: 'STANDALONE' }),
    ];

    const res = await as('owner', 'GET', '/admin/financials/unsorted');

    expect(res.statusCode).toBe(200);
    expect(res.json().jobs).toEqual([
      { jobId: 'early', date: '2026-03-02', title: 'Job early', clientName: null, chargedCents: 300_000, matches: [], suggestedProjectId: null },
      {
        jobId: 'late', date: '2026-06-10', title: 'Job late', clientName: 'karen heights', chargedCents: 800_000,
        matches: [{ projectId: 'pA', title: 'Bank branch', clientName: 'Karen Heights', stage: 'IN_PROGRESS', by: 'NAME' }],
        suggestedProjectId: 'pA',
      },
    ]);
  });

  it('leaves out a job waiting for approval', async () => {
    t.jobs = [job('waiting', { status: 'PENDING' }), job('counted')];

    const res = await as('owner', 'GET', '/admin/financials/unsorted');

    expect(res.json().jobs.map((j: { jobId: string }) => j.jobId)).toEqual(['counted']);
  });

  it('refuses an admin', async () => {
    const res = await as('admin', 'GET', '/admin/financials/unsorted');

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'owner access required' });
  });
});
