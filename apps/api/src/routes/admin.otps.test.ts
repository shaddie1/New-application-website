import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Dashboard's sign-in-code panel is a dev tool: the route that feeds it
// exists only where codes are stored in readable form.

const userFindUnique = vi.fn();
const otpFindMany = vi.fn();
vi.mock('../db.js', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    otpCode: { findMany: otpFindMany },
  },
}));

const { env } = await import('../env.js');
const { signAccessToken } = await import('../auth/jwt.js');
const { adminRoutes } = await import('./admin.js');

const users: Record<string, { role: string; isOwner: boolean }> = {
  owner: { role: 'ADMIN', isOwner: true },
  admin: { role: 'ADMIN', isOwner: false },
};
userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => users[where.id] ?? null);

type OtpRow = {
  phone: string;
  email: string | null;
  purpose: string;
  codePlain: string | null;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

const minutes = (n: number) => new Date(Date.now() + n * 60_000);

function otpRow(over: Partial<OtpRow> = {}): OtpRow {
  return {
    phone: '+254712480392',
    email: 'jane@onyxhawk.co.ke',
    purpose: 'ADMIN_SIGN_IN',
    codePlain: '123456',
    createdAt: minutes(-1),
    expiresAt: minutes(9),
    consumedAt: null,
    ...over,
  };
}

/** Just enough of findMany for this route: its three filters and its column list. */
function storeCodes(rows: OtpRow[]) {
  otpFindMany.mockImplementation(
    async ({ where }: { where: { codePlain: { not: null }; consumedAt: null; expiresAt: { gt: Date } } }) =>
      rows
        .filter((r) => r.codePlain !== null && r.consumedAt === null && r.expiresAt > where.expiresAt.gt)
        .map(({ consumedAt: _consumedAt, ...shown }) => shown),
  );
}

async function getCodes(userId: string) {
  const server = Fastify();
  await server.register(adminRoutes, { prefix: '/admin' });
  const { token } = await signAccessToken(userId, users[userId]!.role);
  return server.inject({ method: 'GET', url: '/admin/otps/recent', headers: { authorization: `Bearer ${token}` } });
}

const originalNodeEnv = env.NODE_ENV;

beforeEach(() => {
  otpFindMany.mockReset();
  storeCodes([]);
});

afterEach(() => {
  env.NODE_ENV = originalNodeEnv;
});

describe('GET /admin/otps/recent', () => {
  it('answers 404 to the owner in production and reads no codes', async () => {
    env.NODE_ENV = 'production';
    storeCodes([otpRow()]);

    const res = await getCodes('owner');

    expect(res.statusCode).toBe(404);
    expect(otpFindMany).not.toHaveBeenCalled();
  });

  it('gives the owner the active codes in development', async () => {
    env.NODE_ENV = 'development';
    const active = otpRow({ codePlain: '654321' });
    storeCodes([
      active,
      otpRow({ codePlain: '111111', consumedAt: minutes(-2) }),
      otpRow({ codePlain: '222222', expiresAt: minutes(-1) }),
      otpRow({ codePlain: null }),
    ]);

    const res = await getCodes('owner');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      codes: [
        {
          phone: active.phone,
          email: active.email,
          purpose: 'ADMIN_SIGN_IN',
          codePlain: '654321',
          createdAt: active.createdAt.toISOString(),
          expiresAt: active.expiresAt.toISOString(),
        },
      ],
    });
  });

  it('refuses a staff member who is not the owner in development', async () => {
    env.NODE_ENV = 'development';
    storeCodes([otpRow()]);

    const res = await getCodes('admin');

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'owner access required' });
    expect(otpFindMany).not.toHaveBeenCalled();
  });

  it('gives the owner an empty list in development when no code is active', async () => {
    env.NODE_ENV = 'development';
    storeCodes([otpRow({ consumedAt: minutes(-2) }), otpRow({ expiresAt: minutes(-1) })]);

    const res = await getCodes('owner');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ codes: [] });
  });
});
