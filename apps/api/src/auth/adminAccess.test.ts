import Fastify, { type RouteOptions } from 'fastify';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Quiet the server's request logging for this file.
process.env.LOG_LEVEL = 'fatal';

// Customer contact details planted in the data behind every readable route, so
// the tests can prove none of it reaches a shareholder.
const CUSTOMER_PHONE = '+254711000111';
const CUSTOMER_ADDRESS = 'Plot 14, Riverside Drive';
const CONTACT_KEYS = ['"phone"', '"customerPhone"', '"clientPhone"', '"clientLocation"', '"siteLocation"', '"address"', '"line1"', '"accessNotes"'];

const users: Record<string, { id: string; role: string; isOwner: boolean; shareholder: { id: string } | null }> = {
  owner: { id: 'owner', role: 'ADMIN', isOwner: true, shareholder: null },
  admin: { id: 'admin', role: 'ADMIN', isOwner: false, shareholder: null },
  shareholder: { id: 'shareholder', role: 'SHAREHOLDER', isOwner: false, shareholder: { id: 'sh-zachary' } },
  customer: { id: 'customer', role: 'CUSTOMER', isOwner: false, shareholder: null },
  crew: { id: 'crew', role: 'CREW', isOwner: false, shareholder: null },
};

const at = new Date('2026-10-05T09:00:00.000Z');
const job = {
  id: 'job1',
  date: at,
  incomeCents: 900_000,
  discountCents: 0,
  serviceLineCode: 'residential',
  region: 'Kilimani',
  clientSegment: 'RESIDENTIAL',
  clientName: 'Mary Wanjiru',
  clientPhone: CUSTOMER_PHONE,
  clientLocation: CUSTOMER_ADDRESS,
  status: 'APPROVED',
  expenses: [],
  reportedBy: null,
};
const holder = (id: string, name: string, basisPoints: number, userId: string | null) => ({
  id,
  name,
  title: null,
  kind: 'INDIVIDUAL',
  basisPoints,
  notes: null,
  userId,
  user: userId ? { fullName: name, phone: CUSTOMER_PHONE } : null,
  sortOrder: 0,
  createdAt: at,
  updatedAt: at,
});
const target = { year: 2026, month: 10, revenueTargetCents: 2_000_000, netProfitTargetCents: 500_000, jobsTarget: 10, notes: null };

vi.mock('../db.js', () => ({
  prisma: {
    user: { findUnique: async ({ where }: { where: { id: string } }) => users[where.id] ?? null },
    booking: { count: async () => 3 },
    quoteRequest: { count: async () => 1 },
    job: {
      findMany: async () => [job],
      aggregate: async () => ({ _sum: { incomeCents: 900_000, discountCents: 0 }, _min: { date: at }, _max: { date: at }, _count: { _all: 1 } }),
    },
    expense: {
      findMany: async () => [{ category: 'MATERIALS', amountCents: 50_000 }],
      aggregate: async () => ({ _sum: { amountCents: 50_000 } }),
    },
    monthlyTarget: { findMany: async () => [target], findUnique: async () => target },
    shareholder: {
      findMany: async () => [holder('sh-shadrack', 'Shadrack Amihanda', 8000, 'primary'), holder('sh-zachary', 'Zachary Mwangi', 2000, 'shareholder')],
    },
    profitDistribution: {
      findMany: async () => [
        {
          id: 'd1',
          label: 'Q3 2026',
          periodStart: at,
          periodEnd: at,
          shareholderId: 'sh-zachary',
          shareholder: { name: 'Zachary Mwangi' },
          netProfitCents: 850_000,
          basisPoints: 2000,
          amountCents: 170_000,
          status: 'PENDING',
          paidAt: null,
          reference: null,
          notes: null,
          createdBy: { fullName: 'Shadrack Amihanda' },
          createdAt: at,
          updatedAt: at,
        },
      ],
    },
    companyDocument: {
      findMany: async () => [
        {
          id: 'doc1',
          title: 'Articles of association',
          category: 'INCORPORATION',
          description: null,
          fileUrl: 'https://media.example/doc1.pdf',
          fileName: 'articles.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
          isExternal: false,
          expiresAt: null,
          uploadedBy: { fullName: 'Shadrack Amihanda' },
          createdAt: at,
          updatedAt: at,
        },
      ],
    },
  },
}));

const { buildServer } = await import('../server.js');
const { signAccessToken } = await import('./jwt.js');
const { EMAIL_SIGN_IN_REQUIRED, SHAREHOLDER_READABLE_ROUTES, SHAREHOLDER_READ_ONLY, adminAccess, shareholderRedaction, stripCustomerContact } =
  await import('./adminAccess.js');
const { SignJWT } = await import('jose');

type Route = { method: string; url: string };
const routes: Route[] = [];
let app: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  app = await buildServer({
    onRoute: (r: RouteOptions) => {
      for (const method of [r.method].flat()) routes.push({ method, url: r.url! });
    },
  });
  await app.ready();
});

const QUERY = '?from=2026-01-01&to=2026-12-31&year=2026&month=10&months=6';
const fill = (url: string) => url.replace(/:[^/]+/g, 'x');
const normalise = (url: string) => (url.length > 1 ? url.replace(/\/$/, '') : url);
const adminRoutes = () => routes.filter((r) => r.url.startsWith('/admin'));
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

async function call(userId: string, method: string, url: string, signInMethod: 'EMAIL' | 'SMS' = 'EMAIL') {
  const { token } = await signAccessToken(userId, users[userId]!.role, signInMethod);
  return app.inject({
    method: method as 'GET',
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(method === 'GET' ? {} : { payload: {} }),
  });
}

describe('shareholder access to /admin', () => {
  it('answers 403 to every write under /admin', async () => {
    const writes = adminRoutes().filter((r) => WRITE_METHODS.includes(r.method));
    expect(writes.length).toBeGreaterThan(40);

    for (const { method, url } of writes) {
      const res = await call('shareholder', method, fill(url));
      expect({ route: `${method} ${url}`, status: res.statusCode }).toEqual({ route: `${method} ${url}`, status: 403 });
    }
  });

  it('answers 403 to every /admin read that is not on the shareholder list', async () => {
    const closed = adminRoutes().filter((r) => r.method === 'GET' && !SHAREHOLDER_READABLE_ROUTES.has(normalise(r.url)));
    // Bookings, quotes, crew, projects, job reports, finance ledgers, job lists, the team...
    expect(closed.map((r) => r.url)).toEqual(
      expect.arrayContaining(['/admin/bookings', '/admin/quote-requests', '/admin/crew', '/admin/financials/jobs', '/admin/finance/marketing']),
    );

    for (const { url } of closed) {
      const res = await call('shareholder', 'GET', fill(url));
      expect({ route: url, status: res.statusCode }).toEqual({ route: url, status: 403 });
      expect(res.json()).toEqual({ error: SHAREHOLDER_READ_ONLY });
    }
  });

  it('serves each readable route with no customer phone number or address in it', async () => {
    for (const route of SHAREHOLDER_READABLE_ROUTES) {
      const res = await call('shareholder', 'GET', `${route}${QUERY}`);
      expect({ route, status: res.statusCode }).toEqual({ route, status: 200 });
      expect(res.body).not.toContain(CUSTOMER_PHONE);
      expect(res.body).not.toContain(CUSTOMER_ADDRESS);
      for (const key of CONTACT_KEYS) expect({ route, key, found: res.body.includes(key) }).toEqual({ route, key, found: false });
    }
  });

  it('shows the shareholder their own stake', async () => {
    const res = await call('shareholder', 'GET', `/admin/financials/my-stake${QUERY}`);

    expect(res.json().stake).toMatchObject({ shareholder: { id: 'sh-zachary', basisPoints: 2000 } });
    // 20% of net profit (9,000.00 income less 500.00 expenses).
    expect(res.json().stake.allTimeShareCents).toBe(170_000);
  });

  it('lists only routes that exist', () => {
    const gets = new Set(adminRoutes().filter((r) => r.method === 'GET').map((r) => normalise(r.url)));
    for (const route of SHAREHOLDER_READABLE_ROUTES) expect({ route, exists: gets.has(route) }).toEqual({ route, exists: true });
  });
});

describe('/admin accepts only sessions that began with an email code', () => {
  it.each(['owner', 'admin', 'shareholder'])('refuses an SMS session for %s on every kind of /admin route', async (userId) => {
    for (const [method, url] of [
      ['GET', '/admin/stats'],
      ['GET', '/admin/staff'],
      ['GET', `/admin/financials/summary${QUERY}`],
      ['POST', '/admin/projects'],
      ['PATCH', '/admin/staff/x'],
    ] as const) {
      const res = await call(userId, method, url, 'SMS');
      expect({ route: `${method} ${url}`, status: res.statusCode, body: res.json() }).toEqual({
        route: `${method} ${url}`,
        status: 403,
        body: { error: EMAIL_SIGN_IN_REQUIRED, code: 'EMAIL_SIGN_IN_REQUIRED' },
      });
    }
  });

  it('treats a token from before the method was recorded as SMS', async () => {
    // Signed the old way: a role, no signInMethod claim.
    const legacy = await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('onyxhawk-api')
      .setSubject('owner')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    const res = await app.inject({ method: 'GET', url: '/admin/stats', headers: { authorization: `Bearer ${legacy}` } });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_SIGN_IN_REQUIRED');
  });

  it('lets an email session through', async () => {
    expect((await call('admin', 'GET', '/admin/stats')).statusCode).toBe(200);
    expect((await call('owner', 'GET', `/admin/financials/summary${QUERY}`)).statusCode).toBe(200);
  });
});

describe('/admin is staff-only', () => {
  it.each(['customer', 'crew'])('refuses a %s account on admin routes, projects and job reports included', async (userId) => {
    for (const [method, url] of [
      ['GET', '/admin/projects'],
      ['POST', '/admin/projects'],
      ['POST', '/admin/job-reports'],
      ['GET', '/admin/stats'],
    ] as const) {
      const res = await call(userId, method, url);
      expect({ route: `${method} ${url}`, status: res.statusCode }).toEqual({ route: `${method} ${url}`, status: 403 });
    }
  });
});

describe('stripping customer contact details', () => {
  it('removes contact fields at any depth and keeps everything else', () => {
    expect(
      stripCustomerContact({
        jobs: [{ clientName: 'Mary', clientPhone: CUSTOMER_PHONE, clientLocation: CUSTOMER_ADDRESS, incomeCents: 5 }],
        booking: { customerPhone: CUSTOMER_PHONE, address: { line1: CUSTOMER_ADDRESS }, totalCents: 9 },
        at,
      }),
    ).toEqual({ jobs: [{ clientName: 'Mary', incomeCents: 5 }], booking: { totalCents: 9 }, at });
  });

  it('applies to shareholder responses only', async () => {
    // A readable route that, unlike today's, leaks contact details: the hook must catch it.
    const server = Fastify();
    server.addHook('preHandler', adminAccess);
    server.addHook('preSerialization', shareholderRedaction);
    server.get('/admin/financials/summary', async () => ({ clientName: 'Mary', clientPhone: CUSTOMER_PHONE }));
    users.manager = { id: 'manager', role: 'FINANCIAL_MANAGER', isOwner: false, shareholder: null };

    const as = async (userId: string) => {
      const { token } = await signAccessToken(userId, users[userId]!.role, 'EMAIL');
      return (await server.inject({ method: 'GET', url: '/admin/financials/summary', headers: { authorization: `Bearer ${token}` } })).json();
    };
    expect(await as('shareholder')).toEqual({ clientName: 'Mary' });
    expect(await as('manager')).toEqual({ clientName: 'Mary', clientPhone: CUSTOMER_PHONE });
  });
});
