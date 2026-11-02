import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
vi.mock('../db.js', () => ({ prisma: { user: { findFirst } } }));

const issueAdminSignInOtp = vi.fn();
const verifyAdminSignInOtp = vi.fn();
vi.mock('../auth/otp.js', () => ({
  issueSignInOtp: vi.fn(),
  verifySignInOtp: vi.fn(),
  issueAdminSignInOtp,
  verifyAdminSignInOtp,
  OtpError: class OtpError extends Error {},
}));

vi.mock('../auth/tokens.js', () => ({
  issueSession: vi.fn(async () => ({
    accessToken: 'access',
    accessExpiresAt: new Date('2026-01-01T00:00:00Z'),
    refreshToken: 'refresh',
    refreshExpiresAt: new Date('2026-02-01T00:00:00Z'),
  })),
  toPublicUser: (u: { id: string; role: string }) => ({ id: u.id, role: u.role }),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  RefreshError: class RefreshError extends Error {},
}));

const { authRoutes } = await import('./auth.js');

const staff = { id: 'u1', phone: '+254712480392', email: 'jane@onyxhawk.co.ke', role: 'ADMIN', isOwner: false, deletedAt: null };

async function app() {
  const server = Fastify();
  await server.register(authRoutes, { prefix: '/auth' });
  return server;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /auth/admin/request-otp', () => {
  it('looks staff up by email, case-insensitively, and emails the code', async () => {
    findFirst.mockResolvedValue(staff);
    issueAdminSignInOtp.mockResolvedValue({ maskedEmail: 'j**e@onyxhawk.co.ke' });

    const res = await (await app()).inject({
      method: 'POST',
      url: '/auth/admin/request-otp',
      payload: { email: '  Jane@OnyxHawk.co.ke ' },
    });

    expect(res.statusCode).toBe(200);
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'jane@onyxhawk.co.ke', mode: 'insensitive' } },
    });
    expect(issueAdminSignInOtp).toHaveBeenCalledWith({ phone: staff.phone, email: staff.email }, expect.anything());
    expect(res.json()).toEqual({ ok: true, maskedEmail: 'j**e@onyxhawk.co.ke' });
  });

  it('rejects a phone number or malformed email with a readable message', async () => {
    const server = await app();
    for (const payload of [{ phone: '+254712480392' }, { email: 'not-an-email' }]) {
      const res = await server.inject({ method: 'POST', url: '/auth/admin/request-otp', payload });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'Enter a valid email address.' });
    }
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('refuses unknown emails and customer accounts alike', async () => {
    const server = await app();
    for (const user of [null, { ...staff, role: 'CUSTOMER' }]) {
      findFirst.mockResolvedValueOnce(user);
      const res = await server.inject({
        method: 'POST',
        url: '/auth/admin/request-otp',
        payload: { email: 'someone@example.com' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('NOT_STAFF');
    }
    expect(issueAdminSignInOtp).not.toHaveBeenCalled();
  });
});

describe('POST /auth/admin/verify-otp', () => {
  it('checks the code against the account found by email and signs in', async () => {
    findFirst.mockResolvedValue(staff);
    verifyAdminSignInOtp.mockResolvedValue(true);

    const res = await (await app()).inject({
      method: 'POST',
      url: '/auth/admin/verify-otp',
      payload: { email: 'jane@onyxhawk.co.ke', code: '123456' },
    });

    expect(res.statusCode).toBe(200);
    expect(verifyAdminSignInOtp).toHaveBeenCalledWith(staff.phone, '123456');
    expect(res.json()).toMatchObject({ kind: 'AUTHENTICATED', session: { user: { id: 'u1' }, accessToken: 'access' } });
  });

  it('returns 401 for a wrong code', async () => {
    findFirst.mockResolvedValue(staff);
    verifyAdminSignInOtp.mockResolvedValue(false);

    const res = await (await app()).inject({
      method: 'POST',
      url: '/auth/admin/verify-otp',
      payload: { email: 'jane@onyxhawk.co.ke', code: '000000' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('does not check a code for an email with no staff account', async () => {
    findFirst.mockResolvedValue(null);

    const res = await (await app()).inject({
      method: 'POST',
      url: '/auth/admin/verify-otp',
      payload: { email: 'nobody@example.com', code: '123456' },
    });

    expect(res.statusCode).toBe(404);
    expect(verifyAdminSignInOtp).not.toHaveBeenCalled();
  });
});
