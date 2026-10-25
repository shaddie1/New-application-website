import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UserRow = {
  id: string;
  phone: string;
  fullName: string;
  email: string | null;
  role: string;
  isOwner: boolean;
  deletedAt: Date | null;
  createdAt: Date;
};

// A tiny in-memory user table: just enough of findUnique/update/create for the staff routes.
let users: UserRow[] = [];
const matches = (u: UserRow, where: Partial<UserRow>) => Object.entries(where).every(([k, v]) => u[k as keyof UserRow] === v);
const findUnique = vi.fn(async ({ where }: { where: Partial<UserRow> }) => {
  const user = users.find((u) => matches(u, where));
  return user ? { ...user } : null;
});
const update = vi.fn(async ({ where, data }: { where: Partial<UserRow>; data: Partial<UserRow> }) => {
  const user = users.find((u) => matches(u, where))!;
  Object.assign(user, data);
  return { ...user };
});
const create = vi.fn(async ({ data }: { data: Partial<UserRow> }) => {
  const user = { id: 'new-member', email: null, isOwner: false, deletedAt: null, createdAt: new Date(), ...data } as UserRow;
  users.push(user);
  return { ...user };
});
// Records whether each revocation ran inside the transaction that saved the email.
let insideTransaction = false;
const revocations: { where: unknown; data: unknown; inTransaction: boolean }[] = [];
const revokeRefreshTokens = vi.fn(async (args: { where: unknown; data: unknown }) => {
  revocations.push({ ...args, inTransaction: insideTransaction });
  return { count: 2 };
});
const db = {
  user: { findUnique, update, create },
  refreshToken: { updateMany: revokeRefreshTokens },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    insideTransaction = true;
    try {
      return await fn(db);
    } finally {
      insideTransaction = false;
    }
  }),
};
vi.mock('../db.js', () => ({ prisma: db }));
vi.mock('../auth/referral.js', () => ({ generateUniqueReferralCode: async () => 'OHTEST1' }));
vi.mock('../notifications/service.js', () => ({ notifyCrewAssigned: vi.fn(), notifyQuoteResponded: vi.fn() }));

const trySendEmail = vi.fn();
vi.mock('../email/service.js', () => ({ trySendEmail }));

const { signAccessToken } = await import('../auth/jwt.js');
const { adminRoutes } = await import('./admin.js');

function row(over: Partial<UserRow> & Pick<UserRow, 'id' | 'phone' | 'fullName'>): UserRow {
  return { email: null, role: 'CUSTOMER', isOwner: false, deletedAt: null, createdAt: new Date('2026-09-01T00:00:00Z'), ...over };
}

const owner = () =>
  row({ id: 'owner', phone: '+254115247988', fullName: 'Shadrack Amihanda', email: 'amihanda@onyxhawkcleaningservice.com', role: 'ADMIN', isOwner: true });

async function asOwner(method: 'POST' | 'PATCH', url: string, payload: object) {
  const { token } = await signAccessToken('owner', 'ADMIN');
  const server = Fastify();
  await server.register(adminRoutes, { prefix: '/admin' });
  return server.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}

/** Each email a route asked the service to send. */
const sent = () =>
  trySendEmail.mock.calls.map(([to, message, , context]) => ({ to, context, ...(message as { template: string; html: string; text: string }) }));

/** Whether every call to `first` happened before every call to `then`. */
const calledBefore = (first: { mock: { invocationCallOrder: number[] } }, then: { mock: { invocationCallOrder: number[] } }) =>
  Math.max(...first.mock.invocationCallOrder) < Math.min(...then.mock.invocationCallOrder);

beforeEach(() => {
  vi.clearAllMocks();
  users = [owner()];
  revocations.length = 0;
  trySendEmail.mockResolvedValue(true);
});

describe('POST /admin/staff', () => {
  const newMember = { phone: '+254712000111', fullName: 'Wanjiku Kamau', email: 'wanjiku@example.com', role: 'MARKETING' };

  it('saves a new member, then welcomes them with their role and who added them', async () => {
    const res = await asOwner('POST', '/admin/staff', newMember);

    expect(res.statusCode).toBe(201);
    expect(sent()).toEqual([
      expect.objectContaining({ to: 'wanjiku@example.com', template: 'staff-welcome', context: { staffId: 'new-member' } }),
    ]);
    expect(sent()[0]!.text).toContain('Shadrack Amihanda has added you to the OnyxHawk platform as Marketing Personnel.');
    expect(calledBefore(create, trySendEmail)).toBe(true);
  });

  it('welcomes a customer promoted to staff', async () => {
    users.push(row({ id: 'cust', phone: '+254712000222', fullName: 'Achieng Otieno', email: 'achieng@example.com' }));

    const res = await asOwner('POST', '/admin/staff', {
      phone: '+254712000222',
      fullName: 'Achieng Otieno',
      email: 'achieng@onyxhawkcleaningservice.com',
      role: 'SUPPORT',
    });

    expect(res.statusCode).toBe(200);
    expect(sent()).toEqual([expect.objectContaining({ to: 'achieng@onyxhawkcleaningservice.com', template: 'staff-welcome' })]);
    expect(sent()[0]!.text).toContain('as Support.');
    expect(calledBefore(update, trySendEmail)).toBe(true);
  });

  it('does not welcome someone already on the team again', async () => {
    users.push(row({ id: 'kip', phone: '+254712000333', fullName: 'Kip Rotich', email: 'kip@example.com', role: 'ADMIN' }));

    const res = await asOwner('POST', '/admin/staff', {
      phone: '+254712000333',
      fullName: 'Kip Rotich',
      email: 'kip@example.com',
      role: 'FINANCIAL_MANAGER',
    });

    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalled();
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it("will not change a current member's email, so another owner's cannot be changed this way", async () => {
    users.push(
      row({ id: 'co-owner', phone: '+254712000555', fullName: 'Amina Hassan', email: 'amina@onyxhawkcleaningservice.com', role: 'ADMIN', isOwner: true }),
    );

    const res = await asOwner('POST', '/admin/staff', {
      phone: '+254712000555',
      fullName: 'Amina Hassan',
      email: 'amina.h@example.com',
      role: 'ADMIN',
    });

    expect(res.statusCode).toBe(409);
    expect(users.find((u) => u.id === 'co-owner')!.email).toBe('amina@onyxhawkcleaningservice.com');
    expect(update).not.toHaveBeenCalled();
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it('still adds the member when the welcome email fails', async () => {
    trySendEmail.mockResolvedValue(false);

    const res = await asOwner('POST', '/admin/staff', newMember);

    expect(res.statusCode).toBe(201);
    expect(res.json().staff).toMatchObject({ id: 'new-member', email: 'wanjiku@example.com', role: 'MARKETING' });
    expect(users.find((u) => u.id === 'new-member')).toBeDefined();
  });
});

describe('PATCH /admin/staff/:id', () => {
  const member = () => row({ id: 'm1', phone: '+254712000444', fullName: 'Wanjiku Kamau', email: 'wanjiku@example.com', role: 'MARKETING' });

  it('saves the new email, then welcomes the new address and warns the old one', async () => {
    users.push(member());

    const res = await asOwner('PATCH', '/admin/staff/m1', { email: 'wanjiku.kamau@example.com' });

    expect(res.statusCode).toBe(200);
    expect(users.find((u) => u.id === 'm1')!.email).toBe('wanjiku.kamau@example.com');
    const [welcome, notice] = sent();
    expect(welcome).toMatchObject({ to: 'wanjiku.kamau@example.com', template: 'staff-welcome', context: { staffId: 'm1' } });
    expect(welcome!.text).toContain('Shadrack Amihanda has added you to the OnyxHawk platform as Marketing Personnel.');
    expect(notice).toMatchObject({ to: 'wanjiku@example.com', template: 'sign-in-email-changed', context: { staffId: 'm1' } });
    expect(notice!.text).toContain('was changed to w*******u@example.com.');
    expect(notice!.html).not.toContain('wanjiku.kamau@example.com');
    expect(calledBefore(update, trySendEmail)).toBe(true);
  });

  it('signs the member out everywhere, revoking their refresh tokens with the change', async () => {
    users.push(member());

    const res = await asOwner('PATCH', '/admin/staff/m1', { email: 'wanjiku.kamau@example.com' });

    expect(res.statusCode).toBe(200);
    expect(revocations).toEqual([
      { where: { userId: 'm1', revokedAt: null }, data: { revokedAt: expect.any(Date) }, inTransaction: true },
    ]);
    expect(calledBefore(revokeRefreshTokens, trySendEmail)).toBe(true);
  });

  it('only welcomes the new address when there was no email before', async () => {
    users.push({ ...member(), email: null });

    const res = await asOwner('PATCH', '/admin/staff/m1', { email: 'wanjiku@example.com' });

    expect(res.statusCode).toBe(200);
    expect(sent()).toEqual([expect.objectContaining({ to: 'wanjiku@example.com', template: 'staff-welcome' })]);
  });

  it('treats a case- or spacing-only change as no change: no emails, no sign-out', async () => {
    users.push({ ...member(), email: 'Wanjiku@Example.com' });

    const res = await asOwner('PATCH', '/admin/staff/m1', { email: ' WANJIKU@example.com ' });

    expect(res.statusCode).toBe(200);
    // UpdateStaffSchema trims and lowercases, so the stored address is normalised.
    expect(res.json().staff.email).toBe('wanjiku@example.com');
    expect(trySendEmail).not.toHaveBeenCalled();
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("changes the owner's own email, welcoming the new address as Owner", async () => {
    const res = await asOwner('PATCH', '/admin/staff/owner', { email: 'shadrack@onyxhawkcleaningservice.com' });

    expect(res.statusCode).toBe(200);
    expect(res.json().staff).toMatchObject({ id: 'owner', isOwner: true, email: 'shadrack@onyxhawkcleaningservice.com' });
    const [welcome, notice] = sent();
    expect(welcome).toMatchObject({ to: 'shadrack@onyxhawkcleaningservice.com', template: 'staff-welcome' });
    // Nobody else added them, so there is no "added by" line.
    expect(welcome!.text).toContain('You’ve been added to the OnyxHawk platform as Owner.');
    expect(notice).toMatchObject({ to: 'amihanda@onyxhawkcleaningservice.com', template: 'sign-in-email-changed' });
    expect(revocations).toEqual([expect.objectContaining({ where: { userId: 'owner', revokedAt: null }, inTransaction: true })]);
  });

  it("refuses to change another owner's email, changing nothing", async () => {
    users.push(
      row({ id: 'co-owner', phone: '+254712000555', fullName: 'Amina Hassan', email: 'amina@onyxhawkcleaningservice.com', role: 'ADMIN', isOwner: true }),
    );

    const res = await asOwner('PATCH', '/admin/staff/co-owner', { email: 'amina.h@example.com' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'You can’t change another owner’s email.' });
    expect(users.find((u) => u.id === 'co-owner')!.email).toBe('amina@onyxhawkcleaningservice.com');
    expect(update).not.toHaveBeenCalled();
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it('still saves the new email when sending fails', async () => {
    users.push(member());
    trySendEmail.mockResolvedValue(false);

    const res = await asOwner('PATCH', '/admin/staff/m1', { email: 'wanjiku.kamau@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.json().staff.email).toBe('wanjiku.kamau@example.com');
    expect(users.find((u) => u.id === 'm1')!.email).toBe('wanjiku.kamau@example.com');
  });

  it('refuses an email that is already on another account, sending nothing', async () => {
    users.push(member());

    const res = await asOwner('PATCH', '/admin/staff/m1', { email: 'amihanda@onyxhawkcleaningservice.com' });

    expect(res.statusCode).toBe(409);
    expect(update).not.toHaveBeenCalled();
    expect(trySendEmail).not.toHaveBeenCalled();
  });
});
