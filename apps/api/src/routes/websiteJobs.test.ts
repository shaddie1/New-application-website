import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const userFindUnique = vi.fn();
const jobFindMany = vi.fn();
const jobFindUnique = vi.fn();
const jobCreate = vi.fn();
const jobUpdate = vi.fn();
const serviceLineFindMany = vi.fn();
vi.mock('../db.js', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    websiteJob: { findMany: jobFindMany, findUnique: jobFindUnique, create: jobCreate, update: jobUpdate },
    serviceLine: { findMany: serviceLineFindMany },
  },
}));

// Presigning is local signing, so only the network delete is replaced.
const deleteObject = vi.fn();
vi.mock('../storage/r2.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/r2.js')>()),
  deleteObject,
}));

const PUBLIC_URL = 'https://photos.onyxhawk.test';
const HOOK_URL = 'https://api.render.com/deploy/srv-web?key=secret';
// Trailing slash on purpose: photo URLs must not come out with a double slash.
process.env.R2_PUBLIC_URL = `${PUBLIC_URL}/`;
process.env.R2_ACCOUNT_ID = 'test-account';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET = 'onyxhawk-test';
process.env.WEB_DEPLOY_HOOK_URL = HOOK_URL;

const { env } = await import('../env.js');
const { signAccessToken } = await import('../auth/jwt.js');
const { websiteJobRoutes, publicWebsiteJobRoutes } = await import('./websiteJobs.js');

const users: Record<string, { role: string; isOwner: boolean }> = {
  admin: { role: 'ADMIN', isOwner: false },
  marketing: { role: 'MARKETING', isOwner: false },
  support: { role: 'SUPPORT', isOwner: false },
  owner: { role: 'FINANCIAL_MANAGER', isOwner: true },
  // Signed in as ADMIN, since demoted in the database.
  demoted: { role: 'SUPPORT', isOwner: false },
};

let logs: { level: number; msg: string }[] = [];
const errorLogs = () => logs.filter((l) => l.level >= 50);

async function app() {
  const server = Fastify({
    logger: { level: 'warn', stream: { write: (line: string) => logs.push(JSON.parse(line)) } },
  });
  await server.register(websiteJobRoutes, { prefix: '/admin/website-jobs' });
  await server.register(publicWebsiteJobRoutes, { prefix: '/website-jobs' });
  return server;
}

async function as(
  userId: string,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: object,
  tokenRole = userId === 'demoted' ? 'ADMIN' : users[userId]!.role,
) {
  const { token } = await signAccessToken(userId, tokenRole, 'EMAIL');
  return (await app()).inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}

const key = (name: string) => `website-jobs/${name}.jpg`;

function photoRow(objectKey: string, sortOrder: number) {
  return { id: `p-${sortOrder}`, jobId: 'job1', objectKey, url: `${PUBLIC_URL}/${objectKey}`, sortOrder, createdAt: new Date() };
}

function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: 'job1',
    serviceLineCode: 'residential',
    clientSegment: 'RESIDENTIAL',
    area: 'Westlands',
    completedOn: new Date('2026-09-12T00:00:00.000Z'),
    description: 'Deep clean of a three-bedroom flat after renovation.',
    publishedAt: null as Date | null,
    createdById: 'admin',
    createdBy: { fullName: 'Jane Admin' },
    createdAt: new Date('2026-10-01T08:00:00.000Z'),
    updatedAt: new Date('2026-10-01T08:00:00.000Z'),
    photos: [photoRow(key('a'), 0)],
    ...over,
  };
}

const valid = {
  serviceLineCode: 'residential',
  clientSegment: 'RESIDENTIAL',
  area: 'Westlands',
  completedOn: '2026-09-12',
  description: 'Deep clean of a three-bedroom flat after renovation.',
  photoKeys: [key('1729000000000-a1b2c3d4')],
};

type PhotoCreate = { objectKey: string; url: string; sortOrder: number };
const echoPhotos = (photos: { create: PhotoCreate[] }) =>
  photos.create.map((p, i) => ({ id: `new-${i}`, jobId: 'job1', createdAt: new Date(), ...p }));

/** The job a route finds by id; updates echo what they were asked to write onto it. */
function storeJob(current: ReturnType<typeof jobRow> | null) {
  jobFindUnique.mockResolvedValue(current);
  jobUpdate.mockImplementation(async ({ data }) => {
    const { photos, ...fields } = data;
    return { ...current, ...fields, ...(photos && { photos: echoPhotos(photos) }) };
  });
}

/** Just enough of findMany for these routes: a published-only filter and ordering by date fields. */
function serveRows(rows: ReturnType<typeof jobRow>[]) {
  jobFindMany.mockImplementation(
    async (args: { where?: { publishedAt?: { not: null } }; orderBy?: Record<string, 'asc' | 'desc'>[] }) => {
      const found = args.where?.publishedAt?.not === null ? rows.filter((r) => r.publishedAt) : rows;
      return [...found].sort((a, b) => {
        for (const order of args.orderBy ?? []) {
          const [field, dir] = Object.entries(order)[0]!;
          const time = (r: Record<string, unknown>) => (r[field] as Date | null)?.getTime() ?? 0;
          const diff = time(a) - time(b);
          if (diff) return dir === 'desc' ? -diff : diff;
        }
        return 0;
      });
    },
  );
}

const original = { hook: env.WEB_DEPLOY_HOOK_URL, bucket: env.R2_BUCKET };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  logs = [];
  userFindUnique.mockImplementation(async ({ where }) => users[where.id] ?? null);
  jobCreate.mockImplementation(async ({ data }) => {
    const { photos, ...fields } = data;
    return jobRow({ ...fields, photos: echoPhotos(photos) });
  });
  deleteObject.mockResolvedValue(undefined);
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  env.WEB_DEPLOY_HOOK_URL = original.hook;
  env.R2_BUCKET = original.bucket;
});

describe('admin website jobs: access', () => {
  it('refuses a support user list, create and publish (AE7)', async () => {
    storeJob(jobRow());
    for (const [method, url, payload] of [
      ['GET', '/admin/website-jobs', undefined],
      ['POST', '/admin/website-jobs', valid],
      ['POST', '/admin/website-jobs/job1/publish', {}],
    ] as const) {
      const res = await as('support', method, url, payload);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: expect.any(String) });
    }
    expect(jobCreate).not.toHaveBeenCalled();
    expect(jobUpdate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('admits marketing, admin, and the owner whatever their role', async () => {
    for (const user of ['marketing', 'admin', 'owner']) {
      const res = await as(user, 'POST', '/admin/website-jobs', valid);
      expect(res.statusCode).toBe(201);
    }
    expect(jobCreate).toHaveBeenCalledTimes(3);
  });

  it('goes by the database role, not the one in the token', async () => {
    const res = await as('demoted', 'POST', '/admin/website-jobs', valid, 'ADMIN');
    expect(res.statusCode).toBe(403);
    expect(jobCreate).not.toHaveBeenCalled();
  });
});

describe('admin website jobs: list', () => {
  it('lists every job, newest completion first, and says whether uploads work', async () => {
    serveRows([
      jobRow({ id: 'july', completedOn: new Date('2026-07-03T00:00:00.000Z') }),
      jobRow({ id: 'sept', completedOn: new Date('2026-09-12T00:00:00.000Z'), publishedAt: new Date('2026-09-20T10:00:00.000Z') }),
    ]);

    const res = await as('marketing', 'GET', '/admin/website-jobs');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      uploadEnabled: true,
      jobs: [
        {
          id: 'sept',
          serviceLineCode: 'residential',
          clientSegment: 'RESIDENTIAL',
          area: 'Westlands',
          completedOn: '2026-09-12',
          description: 'Deep clean of a three-bedroom flat after renovation.',
          publishedAt: '2026-09-20T10:00:00.000Z',
          photos: [{ objectKey: 'website-jobs/a.jpg', url: 'https://photos.onyxhawk.test/website-jobs/a.jpg' }],
          createdByName: 'Jane Admin',
          createdAt: '2026-10-01T08:00:00.000Z',
          updatedAt: '2026-10-01T08:00:00.000Z',
        },
        expect.objectContaining({ id: 'july', completedOn: '2026-07-03', publishedAt: null }),
      ],
    });
  });
});

describe('admin website jobs: create', () => {
  it('rejects missing or out-of-range fields', async () => {
    const cases = [
      { ...valid, area: '' },
      { ...valid, area: 'a'.repeat(61) },
      { ...valid, description: 'a'.repeat(281) },
      { ...valid, photoKeys: [] },
      { ...valid, photoKeys: Array.from({ length: 9 }, (_, i) => key(`p${i}`)) },
    ];
    for (const payload of cases) {
      const res = await as('marketing', 'POST', '/admin/website-jobs', payload);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty('error.fieldErrors');
    }
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it('refuses a completion date after today on the Nairobi calendar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T22:00:00.000Z')); // 01:00 on 25 October in Nairobi

    const tomorrow = await as('marketing', 'POST', '/admin/website-jobs', { ...valid, completedOn: '2026-10-26' });
    expect(tomorrow.statusCode).toBe(400);
    expect(jobCreate).not.toHaveBeenCalled();

    const today = await as('marketing', 'POST', '/admin/website-jobs', { ...valid, completedOn: '2026-10-25' });
    expect(today.statusCode).toBe(201);
  });

  it('accepts only object keys under website-jobs/', async () => {
    for (const photoKey of [
      'documents/x.jpg',
      'https://photos.onyxhawk.test/website-jobs/x.jpg',
      'website-jobs/../documents/x.jpg',
    ]) {
      const res = await as('marketing', 'POST', '/admin/website-jobs', { ...valid, photoKeys: [photoKey] });
      expect(res.statusCode).toBe(400);
    }
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it('stores the job unpublished, with photo URLs built from the public address, and leaves the site alone', async () => {
    const res = await as('marketing', 'POST', '/admin/website-jobs', {
      ...valid,
      photoKeys: [key('first'), key('second')],
    });

    expect(res.statusCode).toBe(201);
    const { data } = jobCreate.mock.calls[0]![0];
    expect(data).toMatchObject({
      serviceLineCode: 'residential',
      clientSegment: 'RESIDENTIAL',
      area: 'Westlands',
      completedOn: new Date('2026-09-12T00:00:00.000Z'),
      description: 'Deep clean of a three-bedroom flat after renovation.',
      createdById: 'marketing',
    });
    expect(data.publishedAt ?? null).toBeNull();
    expect(data.photos.create).toEqual([
      { objectKey: 'website-jobs/first.jpg', url: 'https://photos.onyxhawk.test/website-jobs/first.jpg', sortOrder: 0 },
      { objectKey: 'website-jobs/second.jpg', url: 'https://photos.onyxhawk.test/website-jobs/second.jpg', sortOrder: 1 },
    ]);
    expect(res.json()).toMatchObject({ job: { publishedAt: null }, siteUpdate: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('admin website jobs: publish and unpublish', () => {
  it('publishes and asks the host to rebuild the site once', async () => {
    storeJob(jobRow());

    const res = await as('marketing', 'POST', '/admin/website-jobs/job1/publish', {});

    expect(res.statusCode).toBe(200);
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job1' }, data: { publishedAt: expect.any(Date) } }),
    );
    expect(res.json().job.publishedAt).toEqual(expect.any(String));
    expect(res.json().siteUpdate).toBe('queued');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(HOOK_URL, expect.objectContaining({ method: 'POST' }));
  });

  it('still publishes when no deploy hook is configured', async () => {
    env.WEB_DEPLOY_HOOK_URL = undefined;
    storeJob(jobRow());

    const res = await as('marketing', 'POST', '/admin/website-jobs/job1/publish', {});

    expect(res.statusCode).toBe(200);
    expect(res.json().job.publishedAt).toEqual(expect.any(String));
    expect(res.json().siteUpdate).toBe('disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still publishes when the deploy hook answers 500, and logs it', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    storeJob(jobRow());

    const res = await as('marketing', 'POST', '/admin/website-jobs/job1/publish', {});

    expect(res.statusCode).toBe(200);
    expect(res.json().job.publishedAt).toEqual(expect.any(String));
    expect(res.json().siteUpdate).toBe('failed');
    expect(errorLogs()).toHaveLength(1);
  });

  it('gives up on a deploy hook that takes longer than five seconds, still publishing', async () => {
    // Hangs until the request is aborted; without a timeout the test itself times out.
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    storeJob(jobRow());

    const started = Date.now();
    const res = await as('marketing', 'POST', '/admin/website-jobs/job1/publish', {});

    expect(Date.now() - started).toBeGreaterThanOrEqual(4_900);
    expect(res.statusCode).toBe(200);
    expect(res.json().job.publishedAt).toEqual(expect.any(String));
    expect(res.json().siteUpdate).toBe('failed');
    expect(errorLogs()).toHaveLength(1);
  }, 10_000);

  it('unpublishes and asks the host to rebuild the site (AE5)', async () => {
    storeJob(jobRow({ publishedAt: new Date('2026-09-20T10:00:00.000Z') }));

    const res = await as('marketing', 'POST', '/admin/website-jobs/job1/unpublish', {});

    expect(res.statusCode).toBe(200);
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job1' }, data: { publishedAt: null } }),
    );
    expect(res.json()).toMatchObject({ job: { publishedAt: null }, siteUpdate: 'queued' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('admin website jobs: update', () => {
  it('rebuilds the site only when the job is published', async () => {
    storeJob(jobRow());
    const unpublished = await as('marketing', 'PUT', '/admin/website-jobs/job1', valid);
    expect(unpublished.statusCode).toBe(200);
    expect(unpublished.json().siteUpdate).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    storeJob(jobRow({ publishedAt: new Date('2026-09-20T10:00:00.000Z') }));
    const published = await as('marketing', 'PUT', '/admin/website-jobs/job1', valid);
    expect(published.statusCode).toBe(200);
    expect(published.json().siteUpdate).toBe('queued');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replaces the photo list in its new order and deletes the dropped photo from storage', async () => {
    storeJob(jobRow({ photos: [photoRow(key('one'), 0), photoRow(key('two'), 1), photoRow(key('three'), 2)] }));

    const res = await as('marketing', 'PUT', '/admin/website-jobs/job1', {
      ...valid,
      area: 'Kilimani',
      photoKeys: [key('three'), key('one')],
    });

    expect(res.statusCode).toBe(200);
    const { where, data } = jobUpdate.mock.calls[0]![0];
    expect(where).toEqual({ id: 'job1' });
    expect(data).toMatchObject({ area: 'Kilimani' });
    expect(data.photos).toEqual({
      deleteMany: {},
      create: [
        { objectKey: 'website-jobs/three.jpg', url: 'https://photos.onyxhawk.test/website-jobs/three.jpg', sortOrder: 0 },
        { objectKey: 'website-jobs/one.jpg', url: 'https://photos.onyxhawk.test/website-jobs/one.jpg', sortOrder: 1 },
      ],
    });
    expect(res.json().job.photos.map((p: { objectKey: string }) => p.objectKey)).toEqual([
      'website-jobs/three.jpg',
      'website-jobs/one.jpg',
    ]);
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteObject).toHaveBeenCalledWith('website-jobs/two.jpg');
  });

  it('saves the update even when deleting a dropped photo fails, and logs it', async () => {
    deleteObject.mockRejectedValue(new Error('R2 unavailable'));
    storeJob(jobRow({ photos: [photoRow(key('one'), 0), photoRow(key('two'), 1)] }));

    const res = await as('marketing', 'PUT', '/admin/website-jobs/job1', { ...valid, photoKeys: [key('one')] });

    expect(res.statusCode).toBe(200);
    expect(jobUpdate).toHaveBeenCalledTimes(1);
    expect(errorLogs()).toHaveLength(1);
  });

  it('refuses an update that removes every photo, leaving the job unchanged', async () => {
    storeJob(jobRow());

    const res = await as('marketing', 'PUT', '/admin/website-jobs/job1', { ...valid, photoKeys: [] });

    expect(res.statusCode).toBe(400);
    expect(jobUpdate).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('saves an edit that keeps the saved photos while storage is not configured', async () => {
    env.R2_BUCKET = undefined;
    const stored = { ...photoRow(key('one'), 0), url: 'https://old-host.test/website-jobs/one.jpg' };
    storeJob(jobRow({ photos: [stored] }));

    const res = await as('marketing', 'PUT', '/admin/website-jobs/job1', { ...valid, area: 'Kilimani', photoKeys: [key('one')] });

    expect(res.statusCode).toBe(200);
    expect(jobUpdate.mock.calls[0]![0].data.photos.create).toEqual([
      { objectKey: 'website-jobs/one.jpg', url: 'https://old-host.test/website-jobs/one.jpg', sortOrder: 0 },
    ]);
  });

  it('answers 404 for an unknown id on update, publish and unpublish', async () => {
    storeJob(null);
    for (const [method, url, payload] of [
      ['PUT', '/admin/website-jobs/nope', valid],
      ['POST', '/admin/website-jobs/nope/publish', {}],
      ['POST', '/admin/website-jobs/nope/unpublish', {}],
    ] as const) {
      const res = await as('marketing', method, url, payload);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'website job not found' });
    }
    expect(jobUpdate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('admin website jobs: photo upload URL', () => {
  it('presigns JPEG only', async () => {
    const png = await as('marketing', 'POST', '/admin/website-jobs/upload-url', { contentType: 'image/png' });
    expect(png.statusCode).toBe(400);

    const jpeg = await as('marketing', 'POST', '/admin/website-jobs/upload-url', { contentType: 'image/jpeg' });
    expect(jpeg.statusCode).toBe(200);
    const body = jpeg.json();
    expect(body.objectKey).toMatch(/^website-jobs\/[^/]+\.jpg$/);
    expect(body.publicUrl).toBe(`${PUBLIC_URL}/${body.objectKey}`);
    expect(body.uploadUrl).toContain('test-account.r2.cloudflarestorage.com');
    expect(body.expiresAt).toEqual(expect.any(String));

    // The key it hands out is one a save accepts.
    const save = await as('marketing', 'POST', '/admin/website-jobs', { ...valid, photoKeys: [body.objectKey] });
    expect(save.statusCode).toBe(201);
  });

  it('answers 503 when object storage is not configured', async () => {
    env.R2_BUCKET = undefined;

    const res = await as('marketing', 'POST', '/admin/website-jobs/upload-url', { contentType: 'image/jpeg' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: expect.any(String) });
  });
});

describe('GET /website-jobs (public)', () => {
  const lines = [{ code: 'residential', name: 'Residential cleaning' }];
  const published = (id: string, completedOn: string, publishedAt: string, over: Record<string, unknown> = {}) =>
    jobRow({ id, completedOn: new Date(`${completedOn}T00:00:00.000Z`), publishedAt: new Date(publishedAt), ...over });

  async function getPublic() {
    serviceLineFindMany.mockResolvedValue(lines);
    return (await app()).inject({ method: 'GET', url: '/website-jobs' });
  }

  it('needs no token and returns only published jobs', async () => {
    serveRows([
      jobRow({ id: 'draft', completedOn: new Date('2026-10-20T00:00:00.000Z') }),
      published('a', '2026-09-12', '2026-09-20T10:00:00.000Z'),
      published('b', '2026-08-05', '2026-08-10T10:00:00.000Z'),
    ]);

    const res = await getPublic();

    expect(res.statusCode).toBe(200);
    expect(res.json().jobs.map((j: { id: string }) => j.id)).toEqual(['a', 'b']);
  });

  it('sends only the allow-listed fields', async () => {
    serveRows([published('a', '2026-09-12', '2026-09-20T10:00:00.000Z')]);

    const res = await getPublic();

    expect(res.json()).toEqual({
      jobs: [
        {
          id: 'a',
          serviceLineCode: 'residential',
          serviceName: 'Residential cleaning',
          clientSegment: 'RESIDENTIAL',
          area: 'Westlands',
          completedOn: '2026-09-12',
          description: 'Deep clean of a three-bedroom flat after renovation.',
          photos: [{ url: 'https://photos.onyxhawk.test/website-jobs/a.jpg' }],
        },
      ],
    });
  });

  it('orders by completion date, not by when a job was published (AE2)', async () => {
    serveRows([
      published('july', '2026-07-14', '2026-10-20T10:00:00.000Z'),
      published('august', '2026-08-02', '2026-09-01T10:00:00.000Z'),
      published('september', '2026-09-12', '2026-09-20T10:00:00.000Z'),
    ]);

    const res = await getPublic();

    expect(res.json().jobs.map((j: { id: string }) => j.id)).toEqual(['september', 'august', 'july']);
  });

  it('orders jobs completed the same day by publish time, newest first', async () => {
    serveRows([
      published('earlier', '2026-10-01', '2026-10-02T10:00:00.000Z'),
      published('later', '2026-10-01', '2026-10-05T10:00:00.000Z'),
    ]);

    const res = await getPublic();

    expect(res.json().jobs.map((j: { id: string }) => j.id)).toEqual(['later', 'earlier']);
  });

  it('sends a null service name for a code no longer in the catalog', async () => {
    serveRows([published('retired', '2026-09-12', '2026-09-20T10:00:00.000Z', { serviceLineCode: 'carpet' })]);

    const res = await getPublic();

    expect(res.json().jobs[0]).toMatchObject({ serviceLineCode: 'carpet', serviceName: null });
  });

  it('sends the completion date as YYYY-MM-DD (AE6)', async () => {
    serveRows([published('a', '2026-09-12', '2026-09-20T10:00:00.000Z')]);

    const res = await getPublic();

    expect(res.json().jobs[0].completedOn).toBe('2026-09-12');
  });

  it('returns an empty list when nothing is published', async () => {
    serveRows([jobRow({ id: 'draft' })]);

    const res = await getPublic();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ jobs: [] });
  });
});
