import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CastId, headersFor, seedCast } from './test-support/cast.js';
import { resetDb } from './test-support/financialsDb.js';

vi.mock('./db.js', async () => ({ prisma: (await import('./test-support/financialsDb.js')).db }));

// The other route tests register plugins by hand, under the prefixes they
// expect. This one builds the server as it is started, so a Dashboard plugin
// left out of server.ts, put under another prefix, or registered so that its
// guards reach a neighbour's routes fails here.

const RANGE = 'from=2026-11-01&to=2026-11-30';
const MONTH = 'year=2026&month=11';

let app: FastifyInstance;

beforeAll(async () => {
  // Read once, when env.ts is first imported: keeps the request log out of the test output.
  vi.stubEnv('LOG_LEVEL', 'fatal');
  const { buildServer } = await import('./server.js');
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  resetDb();
  seedCast();
});

const get = async (who: CastId | null, url: string) => app.inject({ method: 'GET', url, headers: await headersFor(who) });

describe('the server as it is started', () => {
  describe('serves the Dashboard behind its access list', () => {
    it.each<[url: string, allowed: CastId, refused: CastId]>([
      ['/admin/dashboard/access', 'owner', 'customer'],
      ['/admin/stats', 'support', 'finance'],
      [`/admin/finance/overview?${MONTH}`, 'finance', 'support'],
      [`/admin/finance/revenue-breakdown?${RANGE}`, 'coo', 'shareholderLinked'],
      [`/admin/financials/summary?${RANGE}`, 'admin', 'shareholderLinked'],
      [`/admin/financials/ownership-summary?${MONTH}`, 'shareholderLinked', 'admin'],
    ])('GET %s answers %s 200 and %s 403', async (url, allowed, refused) => {
      expect((await get(allowed, url)).statusCode).toBe(200);
      expect((await get(refused, url)).statusCode).toBe(403);
    });
  });

  describe('leaves the routes beside them behind the guard they had', () => {
    it.each<[url: string, allowed: CastId, refused: CastId]>([
      [`/admin/financials/equity?${RANGE}`, 'owner', 'admin'],
      [`/admin/finance/marketing?${RANGE}`, 'admin', 'coo'],
    ])('GET %s answers %s 200 and %s 403', async (url, allowed, refused) => {
      expect((await get(allowed, url)).statusCode).toBe(200);
      expect((await get(refused, url)).statusCode).toBe(403);
    });
  });

  it('answers a request with no sign-in 401', async () => {
    expect((await get(null, '/admin/dashboard/access')).statusCode).toBe(401);
  });
});
