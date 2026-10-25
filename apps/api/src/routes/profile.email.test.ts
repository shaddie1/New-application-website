import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UserRow = {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  role: string;
  isOwner: boolean;
  isPrimaryOwner: boolean;
};
type OtpRow = {
  id: string;
  phone: string;
  email: string | null;
  codeHash: string;
  codePlain: string | null;
  purpose: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
};

let users: UserRow[] = [];
let otps: OtpRow[] = [];
let insideTransaction = false;
const writes: { op: string; inTransaction: boolean }[] = [];

// Just enough of Prisma's where-clauses for the OTP and email-change code.
type Where = Record<string, unknown>;
function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond === null) return value === null;
    if (typeof cond !== 'object' || cond instanceof Date) return value === cond;
    const c = cond as { gt?: Date; in?: unknown[]; not?: unknown; equals?: string; mode?: string };
    if (c.gt) return value instanceof Date && value > c.gt;
    if (c.in) return c.in.includes(value);
    if ('not' in c) return value !== c.not;
    if (c.equals !== undefined) return typeof value === 'string' && value.toLowerCase() === c.equals.toLowerCase();
    return true;
  });
}
function applyData(row: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [key, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in v) row[key] = (row[key] as number) + (v as { increment: number }).increment;
    else row[key] = v;
  }
}
const newest = <T extends { createdAt: Date }>(rows: T[]) => [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

const db = {
  user: {
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({ ...users.find((u) => u.id === where.id)! }),
    findFirst: async ({ where }: { where: Where }) => users.find((u) => matches(u, where)) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      writes.push({ op: 'user.update', inTransaction: insideTransaction });
      const u = users.find((x) => x.id === where.id)!;
      applyData(u, data);
      return { ...u };
    },
  },
  otpCode: {
    findFirst: async ({ where }: { where: Where }) => newest(otps).find((r) => matches(r, where)) ?? null,
    updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      if ('consumedAt' in data && insideTransaction) writes.push({ op: 'otpCode.consume', inTransaction: true });
      const hit = otps.filter((r) => matches(r, where));
      hit.forEach((r) => applyData(r, data));
      return { count: hit.length };
    },
    create: async ({ data }: { data: Omit<OtpRow, 'id' | 'consumedAt' | 'attempts' | 'createdAt'> }) => {
      // Older codes first, so ordering by createdAt is unambiguous within one test.
      const row = { id: `otp${otps.length + 1}`, consumedAt: null, attempts: 0, createdAt: new Date(Date.now() + otps.length), ...data };
      otps.push(row);
      return row;
    },
  },
  refreshToken: {
    updateMany: async () => {
      writes.push({ op: 'refreshToken.revokeAll', inTransaction: insideTransaction });
      return { count: 2 };
    },
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    insideTransaction = true;
    try {
      return await fn(db);
    } finally {
      insideTransaction = false;
    }
  },
};
vi.mock('../db.js', () => ({ prisma: db }));
vi.mock('../auth/tokens.js', () => ({ toPublicUser: (u: UserRow) => ({ id: u.id }) }));

type Sent = { to: string; template: string; text: string };
const sent: Sent[] = [];
const sendEmail = vi.fn(async (to: string, message: { template: string; text: string }) => {
  sent.push({ to, template: message.template, text: message.text });
});
const trySendEmail = vi.fn(async (to: string, message: { template: string; text: string }) => {
  writes.push({ op: 'email.after', inTransaction: insideTransaction });
  sent.push({ to, template: message.template, text: message.text });
  return true;
});
vi.mock('../email/service.js', () => ({ sendEmail, trySendEmail }));

const { signAccessToken } = await import('../auth/jwt.js');
const { profileRoutes } = await import('./profile.js');
const { PRIMARY_OWNER_LOCKED } = await import('../auth/staff.js');

const person = (over: Partial<UserRow> & Pick<UserRow, 'id' | 'role'>): UserRow => ({
  phone: `+2547000000${over.id.length}${over.id.charCodeAt(0)}`,
  email: null,
  fullName: over.id,
  isOwner: false,
  isPrimaryOwner: false,
  ...over,
});

async function post(userId: string, path: string, payload: object, signInMethod: 'EMAIL' | 'SMS' = 'EMAIL') {
  const user = users.find((u) => u.id === userId)!;
  const { token } = await signAccessToken(userId, user.role, signInMethod);
  const server = Fastify();
  await server.register(profileRoutes, { prefix: '/profile' });
  return server.inject({ method: 'POST', url: `/profile${path}`, payload, headers: { authorization: `Bearer ${token}` } });
}

/** The code in the newest email of a template to an address, as the person would read it. */
const codeFrom = (to: string, template: string) => {
  const email = [...sent].reverse().find((s) => s.to === to && s.template === template);
  return /\n(\d{6})\n/.exec(email?.text ?? '')?.[1] ?? '';
};
const user = (id: string) => users.find((u) => u.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  writes.length = 0;
  otps = [];
  users = [
    person({ id: 'primary', role: 'ADMIN', isOwner: true, isPrimaryOwner: true, email: 'amihanda@onyxhawkcleaningservice.com' }),
    person({ id: 'zachary', role: 'ADMIN', isOwner: true, fullName: 'Zachary Mwangi', email: 'zachary@onyxhawkcleaningservice.com' }),
    person({ id: 'wanjiku', role: 'MARKETING', fullName: 'Wanjiku Kamau', email: 'wanjiku@example.com' }),
    person({ id: 'achieng', role: 'CUSTOMER', email: 'achieng@example.com' }),
  ];
});

describe('POST /profile/email/request', () => {
  it('sends a team member a code at the new address only', async () => {
    const res = await post('wanjiku', '/email/request', { email: ' Wanjiku.K@Example.com ' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, sentTo: 'w*******k@example.com', approvalSentTo: null });
    expect(sent.map((s) => [s.to, s.template])).toEqual([['wanjiku.k@example.com', 'email-change-code']]);
    expect(codeFrom('wanjiku.k@example.com', 'email-change-code')).toMatch(/^\d{6}$/);
    expect(user('wanjiku').email).toBe('wanjiku@example.com');
  });

  it('asks an owner to approve from their current address as well', async () => {
    const res = await post('zachary', '/email/request', { email: 'zachary.m@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sentTo: 'z*******m@example.com', approvalSentTo: 'z*****y@onyxhawkcleaningservice.com' });
    expect(sent.map((s) => [s.to, s.template])).toEqual([
      ['zachary.m@example.com', 'email-change-code'],
      ['zachary@onyxhawkcleaningservice.com', 'email-change-approval'],
    ]);
  });

  it.each([
    ['a session that began with an SMS code', 'wanjiku', { email: 'new@example.com' }, 'SMS', 403, 'EMAIL_SIGN_IN_REQUIRED'],
    ['the primary owner (script only)', 'primary', { email: 'new@example.com' }, 'EMAIL', 403, PRIMARY_OWNER_LOCKED],
    ['a customer', 'achieng', { email: 'new@example.com' }, 'EMAIL', 403, 'Only team members'],
    ['their current address, in other case', 'wanjiku', { email: 'WANJIKU@example.com' }, 'EMAIL', 400, 'already your sign-in email'],
    ["another account's address", 'wanjiku', { email: 'Zachary@onyxhawkcleaningservice.com' }, 'EMAIL', 409, 'another account'],
  ] as const)('refuses %s', async (_case, userId, payload, method, status, message) => {
    const res = await post(userId, '/email/request', payload, method);

    expect(res.statusCode).toBe(status);
    expect(res.body).toContain(message);
    expect(sent).toEqual([]);
    expect(otps).toEqual([]);
  });
});

describe('POST /profile/email/confirm', () => {
  it("changes a team member's email with the code, signs them out everywhere, then tells the old address", async () => {
    await post('wanjiku', '/email/request', { email: 'wanjiku.k@example.com' });

    const res = await post('wanjiku', '/email/confirm', { newCode: codeFrom('wanjiku.k@example.com', 'email-change-code') });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, email: 'wanjiku.k@example.com' });
    expect(user('wanjiku').email).toBe('wanjiku.k@example.com');
    expect(writes).toEqual([
      { op: 'otpCode.consume', inTransaction: true },
      { op: 'user.update', inTransaction: true },
      { op: 'refreshToken.revokeAll', inTransaction: true },
      { op: 'email.after', inTransaction: false },
    ]);
    expect(sent.at(-1)).toMatchObject({ to: 'wanjiku@example.com', template: 'sign-in-email-changed' });
  });

  it('needs both codes from an owner, and a wrong one changes nothing', async () => {
    await post('zachary', '/email/request', { email: 'zachary.m@example.com' });
    const newCode = codeFrom('zachary.m@example.com', 'email-change-code');
    const currentCode = codeFrom('zachary@onyxhawkcleaningservice.com', 'email-change-approval');
    const wrong = currentCode === '000000' ? '111111' : '000000';

    const missing = await post('zachary', '/email/confirm', { newCode });
    expect([missing.statusCode, missing.json().code]).toEqual([400, 'CURRENT_CODE_REQUIRED']);

    const mistyped = await post('zachary', '/email/confirm', { newCode, currentCode: wrong });
    expect([mistyped.statusCode, mistyped.json().code]).toEqual([401, 'WRONG_CODE']);
    expect(user('zachary').email).toBe('zachary@onyxhawkcleaningservice.com');

    const res = await post('zachary', '/email/confirm', { newCode, currentCode });
    expect(res.statusCode).toBe(200);
    expect(user('zachary').email).toBe('zachary.m@example.com');
    expect(writes).toContainEqual({ op: 'refreshToken.revokeAll', inTransaction: true });
  });

  it('allows five wrong tries, then the code is spent', async () => {
    await post('wanjiku', '/email/request', { email: 'wanjiku.k@example.com' });
    const right = codeFrom('wanjiku.k@example.com', 'email-change-code');
    const wrong = right === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) expect((await post('wanjiku', '/email/confirm', { newCode: wrong })).statusCode).toBe(401);
    const sixth = await post('wanjiku', '/email/confirm', { newCode: wrong });
    expect([sixth.statusCode, sixth.json().code]).toEqual([429, 'TOO_MANY_ATTEMPTS']);

    const late = await post('wanjiku', '/email/confirm', { newCode: right });
    expect([late.statusCode, late.json().code]).toEqual([400, 'NO_REQUEST']);
    expect(user('wanjiku').email).toBe('wanjiku@example.com');
  });

  it('has nothing to confirm without a live request', async () => {
    const res = await post('wanjiku', '/email/confirm', { newCode: '123456' });

    expect([res.statusCode, res.json().code]).toEqual([400, 'NO_REQUEST']);
  });

  it('refuses if the address was taken in the meantime', async () => {
    await post('wanjiku', '/email/request', { email: 'wanjiku.k@example.com' });
    users.push(person({ id: 'brian', role: 'SUPPORT', email: 'Wanjiku.K@example.com' }));

    const res = await post('wanjiku', '/email/confirm', { newCode: codeFrom('wanjiku.k@example.com', 'email-change-code') });

    expect([res.statusCode, res.json().code]).toEqual([409, 'TAKEN']);
    expect(user('wanjiku').email).toBe('wanjiku@example.com');
  });

  it('refuses a session that began with an SMS code', async () => {
    await post('wanjiku', '/email/request', { email: 'wanjiku.k@example.com' });

    const res = await post('wanjiku', '/email/confirm', { newCode: codeFrom('wanjiku.k@example.com', 'email-change-code') }, 'SMS');

    expect(res.statusCode).toBe(403);
    expect(user('wanjiku').email).toBe('wanjiku@example.com');
  });
});
