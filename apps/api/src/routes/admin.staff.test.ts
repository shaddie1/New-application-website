import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UserRow = {
  id: string;
  phone: string;
  fullName: string;
  email: string | null;
  role: string;
  isOwner: boolean;
  isPrimaryOwner: boolean;
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
const findUniqueOrThrow = vi.fn(async (args: { where: Partial<UserRow> }) => {
  const user = await findUnique(args);
  if (!user) throw new Error('not found');
  return user;
});
const create = vi.fn(async ({ data }: { data: Partial<UserRow> }) => {
  const user = { id: 'new-member', email: null, isOwner: false, isPrimaryOwner: false, deletedAt: null, createdAt: new Date(), ...data } as UserRow;
  users.push(user);
  return { ...user };
});

// Every write is logged with whether it ran inside a transaction, so tests can
// prove a change, its sign-out and its audit row commit together.
let insideTransaction = false;
const writes: { op: string; args: { where?: unknown; data: Record<string, unknown> }; inTransaction: boolean }[] = [];
const logWrite = (op: string, args: { where?: unknown; data: Record<string, unknown> }) => writes.push({ op, args, inTransaction: insideTransaction });
const update = vi.fn(async (args: { where: Partial<UserRow>; data: Partial<UserRow> }) => {
  logWrite('user.update', args);
  const user = users.find((u) => matches(u, args.where))!;
  Object.assign(user, args.data);
  return { ...user };
});
const revokeRefreshTokens = vi.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
  logWrite('refreshToken.updateMany', args);
  return { count: 2 };
});
const recordRoleChange = vi.fn(async (args: { data: Record<string, unknown> }) => {
  logWrite('staffRoleChange.create', args);
  return { id: 'rc1', createdAt: new Date(), ...args.data };
});
const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  insideTransaction = true;
  try {
    return await fn(db);
  } finally {
    insideTransaction = false;
  }
});
const db = {
  user: { findUnique, findUniqueOrThrow, update, create },
  refreshToken: { updateMany: revokeRefreshTokens },
  staffRoleChange: { create: recordRoleChange },
  $transaction,
};
vi.mock('../db.js', () => ({ prisma: db }));
vi.mock('../auth/referral.js', () => ({ generateUniqueReferralCode: async () => 'OHTEST1' }));
vi.mock('../notifications/service.js', () => ({ notifyCrewAssigned: vi.fn(), notifyQuoteResponded: vi.fn() }));

const trySendEmail = vi.fn();
vi.mock('../email/service.js', () => ({ trySendEmail }));

const { signAccessToken } = await import('../auth/jwt.js');
const { adminRoutes } = await import('./admin.js');
const { PRIMARY_OWNER_LOCKED } = await import('../auth/staff.js');

function row(over: Partial<UserRow> & Pick<UserRow, 'id' | 'phone' | 'fullName'>): UserRow {
  return {
    email: null,
    role: 'CUSTOMER',
    isOwner: false,
    isPrimaryOwner: false,
    deletedAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  };
}

// Shadrack is the primary owner; Zachary and Amina are ordinary owners.
const primary = () =>
  row({
    id: 'primary',
    phone: '+254115247988',
    fullName: 'Shadrack Amihanda',
    email: 'amihanda@onyxhawkcleaningservice.com',
    role: 'ADMIN',
    isOwner: true,
    isPrimaryOwner: true,
  });
const zachary = () =>
  row({ id: 'zachary', phone: '+254712000555', fullName: 'Zachary Mwangi', email: 'zachary@onyxhawkcleaningservice.com', role: 'ADMIN', isOwner: true });
const amina = () =>
  row({ id: 'amina', phone: '+254712000666', fullName: 'Amina Hassan', email: 'amina@onyxhawkcleaningservice.com', role: 'ADMIN', isOwner: true });
const member = () => row({ id: 'm1', phone: '+254712000444', fullName: 'Wanjiku Kamau', email: 'wanjiku@example.com', role: 'MARKETING' });

async function as(userId: string, method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const tokenRole = users.find((u) => u.id === userId)?.role ?? 'ADMIN';
  const { token } = await signAccessToken(userId, tokenRole, 'EMAIL');
  const server = Fastify();
  await server.register(adminRoutes, { prefix: '/admin' });
  return server.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}

/** Each email a route asked the service to send. */
const sent = () =>
  trySendEmail.mock.calls.map(([to, message, , context]) => ({
    to,
    context,
    ...(message as { template: string; subject: string; html: string; text: string }),
  }));

/** Whether every call to `first` happened before every call to `then`. */
const calledBefore = (first: { mock: { invocationCallOrder: number[] } }, then: { mock: { invocationCallOrder: number[] } }) =>
  Math.max(...first.mock.invocationCallOrder) < Math.min(...then.mock.invocationCallOrder);

const user = (id: string) => users.find((u) => u.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  users = [primary(), zachary(), amina(), member()];
  writes.length = 0;
  trySendEmail.mockResolvedValue(true);
});

describe('POST /admin/staff', () => {
  const newMember = { phone: '+254712000111', fullName: 'Brian Otieno', email: 'brian@example.com', role: 'MARKETING' };

  it('saves a new member, then welcomes them with their role and who added them', async () => {
    const res = await as('primary', 'POST', '/admin/staff', newMember);

    expect(res.statusCode).toBe(201);
    expect(sent()).toEqual([expect.objectContaining({ to: 'brian@example.com', template: 'staff-welcome', context: { staffId: 'new-member' } })]);
    expect(sent()[0]!.text).toContain('Shadrack Amihanda has added you to the OnyxHawk platform as Marketing Personnel.');
    expect(calledBefore(create, trySendEmail)).toBe(true);
  });

  it('welcomes a customer promoted to staff', async () => {
    users.push(row({ id: 'cust', phone: '+254712000222', fullName: 'Achieng Otieno', email: 'achieng@example.com' }));

    const res = await as('zachary', 'POST', '/admin/staff', {
      phone: '+254712000222',
      fullName: 'Achieng Otieno',
      email: 'achieng@onyxhawkcleaningservice.com',
      role: 'SUPPORT',
    });

    expect(res.statusCode).toBe(200);
    expect(sent()).toEqual([expect.objectContaining({ to: 'achieng@onyxhawkcleaningservice.com', template: 'staff-welcome' })]);
    expect(sent()[0]!.text).toContain('Zachary Mwangi has added you to the OnyxHawk platform as Support.');
    expect(calledBefore(update, trySendEmail)).toBe(true);
  });

  it('does not welcome someone already on the team again', async () => {
    const res = await as('primary', 'POST', '/admin/staff', { ...member(), role: 'FINANCIAL_MANAGER' });

    expect(res.statusCode).toBe(200);
    expect(user('m1').role).toBe('FINANCIAL_MANAGER');
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it("will not change a current member's email (that goes through PATCH)", async () => {
    const res = await as('primary', 'POST', '/admin/staff', { ...member(), email: 'wanjiku.k@example.com', role: 'MARKETING' });

    expect(res.statusCode).toBe(409);
    expect(user('m1').email).toBe('wanjiku@example.com');
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['the primary owner re-adds an owner', 'primary', zachary],
    ['an owner re-adds the primary owner', 'zachary', primary],
    ['the primary owner re-adds themselves', 'primary', primary],
  ])('refuses to change an owner through Add member: %s', async (_case, actorId, target) => {
    const { phone, fullName, email } = target();

    const res = await as(actorId, 'POST', '/admin/staff', { phone, fullName, email, role: 'SHAREHOLDER' });

    expect(res.statusCode).toBe(403);
    expect(update).not.toHaveBeenCalled();
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it('still adds the member when the welcome email fails', async () => {
    trySendEmail.mockResolvedValue(false);

    const res = await as('primary', 'POST', '/admin/staff', newMember);

    expect(res.statusCode).toBe(201);
    expect(res.json().staff).toMatchObject({ id: 'new-member', email: 'brian@example.com', role: 'MARKETING', isPrimaryOwner: false });
  });
});

describe('PATCH /admin/staff/:id (email)', () => {
  it('saves the new email, then welcomes the new address and warns the old one', async () => {
    const res = await as('primary', 'PATCH', '/admin/staff/m1', { email: 'wanjiku.kamau@example.com' });

    expect(res.statusCode).toBe(200);
    expect(user('m1').email).toBe('wanjiku.kamau@example.com');
    const [welcome, notice] = sent();
    expect(welcome).toMatchObject({ to: 'wanjiku.kamau@example.com', template: 'staff-welcome', context: { staffId: 'm1' } });
    expect(welcome!.text).toContain('Shadrack Amihanda has added you to the OnyxHawk platform as Marketing Personnel.');
    expect(notice).toMatchObject({ to: 'wanjiku@example.com', template: 'sign-in-email-changed', context: { staffId: 'm1' } });
    expect(notice!.text).toContain('was changed to w*******u@example.com.');
    expect(notice!.html).not.toContain('wanjiku.kamau@example.com');
    expect(calledBefore(update, trySendEmail)).toBe(true);
  });

  it('signs the member out everywhere, revoking their refresh tokens with the change', async () => {
    const res = await as('primary', 'PATCH', '/admin/staff/m1', { email: 'wanjiku.kamau@example.com' });

    expect(res.statusCode).toBe(200);
    expect(writes.filter((w) => w.op === 'refreshToken.updateMany')).toEqual([
      { op: 'refreshToken.updateMany', args: { where: { userId: 'm1', revokedAt: null }, data: { revokedAt: expect.any(Date) } }, inTransaction: true },
    ]);
    expect(calledBefore(revokeRefreshTokens, trySendEmail)).toBe(true);
  });

  it("lets any owner change a non-owner's email", async () => {
    const res = await as('zachary', 'PATCH', '/admin/staff/m1', { email: 'wanjiku.kamau@example.com' });

    expect(res.statusCode).toBe(200);
    expect(user('m1').email).toBe('wanjiku.kamau@example.com');
  });

  it('only welcomes the new address when there was no email before', async () => {
    user('m1').email = null;

    const res = await as('primary', 'PATCH', '/admin/staff/m1', { email: 'wanjiku@example.com' });

    expect(res.statusCode).toBe(200);
    expect(sent()).toEqual([expect.objectContaining({ to: 'wanjiku@example.com', template: 'staff-welcome' })]);
  });

  it('treats a case- or spacing-only change as no change: no emails, no sign-out', async () => {
    user('m1').email = 'Wanjiku@Example.com';

    const res = await as('primary', 'PATCH', '/admin/staff/m1', { email: ' WANJIKU@example.com ' });

    expect(res.statusCode).toBe(200);
    // UpdateStaffSchema trims and lowercases, so the stored address is normalised.
    expect(res.json().staff.email).toBe('wanjiku@example.com');
    expect(trySendEmail).not.toHaveBeenCalled();
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("lets the primary owner change another owner's email, with the sign-out and both emails", async () => {
    const res = await as('primary', 'PATCH', '/admin/staff/zachary', { email: 'zachary.mwangi@example.com' });

    expect(res.statusCode).toBe(200);
    expect(user('zachary').email).toBe('zachary.mwangi@example.com');
    const [welcome, notice] = sent();
    expect(welcome).toMatchObject({ to: 'zachary.mwangi@example.com', template: 'staff-welcome' });
    expect(welcome!.text).toContain('Shadrack Amihanda has added you to the OnyxHawk platform as Owner.');
    expect(notice).toMatchObject({ to: 'zachary@onyxhawkcleaningservice.com', template: 'sign-in-email-changed' });
    expect(writes).toContainEqual(expect.objectContaining({ op: 'refreshToken.updateMany', args: expect.objectContaining({ where: { userId: 'zachary', revokedAt: null } }), inTransaction: true }));
  });

  it("refuses the primary owner's own email change: nobody edits the primary owner", async () => {
    const res = await as('primary', 'PATCH', '/admin/staff/primary', { email: 'shadrack@example.com' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: PRIMARY_OWNER_LOCKED });
    expect(user('primary').email).toBe('amihanda@onyxhawkcleaningservice.com');
    expect(writes).toEqual([]);
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['their own', 'zachary'],
    ["another owner's", 'amina'],
    ["the primary owner's", 'primary'],
  ])("gives a non-primary owner 403 for %s email", async (_case, targetId) => {
    const before = user(targetId).email;

    const res = await as('zachary', 'PATCH', `/admin/staff/${targetId}`, { email: 'someone.new@example.com' });

    expect(res.statusCode).toBe(403);
    expect(user(targetId).email).toBe(before);
    expect(writes).toEqual([]);
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it('still saves the new email when sending fails', async () => {
    trySendEmail.mockResolvedValue(false);

    const res = await as('primary', 'PATCH', '/admin/staff/m1', { email: 'wanjiku.kamau@example.com' });

    expect(res.statusCode).toBe(200);
    expect(user('m1').email).toBe('wanjiku.kamau@example.com');
  });

  it('refuses an email that is already on another account, sending nothing', async () => {
    const res = await as('primary', 'PATCH', '/admin/staff/m1', { email: 'zachary@onyxhawkcleaningservice.com' });

    expect(res.statusCode).toBe(409);
    expect(writes).toEqual([]);
    expect(trySendEmail).not.toHaveBeenCalled();
  });
});

describe('PATCH /admin/staff/:id/role (Change role)', () => {
  it('moves an owner to a staff role: ownership, role, sign-out and audit row in one transaction, then the email', async () => {
    const res = await as('primary', 'PATCH', '/admin/staff/zachary/role', { role: 'SHAREHOLDER' });

    expect(res.statusCode).toBe(200);
    expect(res.json().staff).toMatchObject({ id: 'zachary', isOwner: false, isPrimaryOwner: false, role: 'SHAREHOLDER' });
    expect(writes).toEqual([
      { op: 'user.update', args: expect.objectContaining({ where: { id: 'zachary' }, data: { isOwner: false, role: 'SHAREHOLDER' } }), inTransaction: true },
      { op: 'refreshToken.updateMany', args: { where: { userId: 'zachary', revokedAt: null }, data: { revokedAt: expect.any(Date) } }, inTransaction: true },
      { op: 'staffRoleChange.create', args: { data: { actorId: 'primary', targetId: 'zachary', oldRole: 'OWNER', newRole: 'SHAREHOLDER' } }, inTransaction: true },
    ]);
    expect($transaction).toHaveBeenCalledTimes(1);

    // The email goes after the commit, to the demoted person.
    expect(calledBefore($transaction, trySendEmail)).toBe(true);
    expect(sent()).toEqual([
      expect.objectContaining({
        to: 'zachary@onyxhawkcleaningservice.com',
        template: 'staff-role-changed',
        subject: 'Your role on the OnyxHawk platform changed to Shareholder',
        context: { staffId: 'zachary' },
      }),
    ]);
    expect(sent()[0]!.text).toContain('Shadrack Amihanda changed your role on the OnyxHawk platform from Owner to Shareholder.');
  });

  it('keeps the demotion when the email fails', async () => {
    trySendEmail.mockResolvedValue(false);

    const res = await as('primary', 'PATCH', '/admin/staff/zachary/role', { role: 'SHAREHOLDER' });

    expect(res.statusCode).toBe(200);
    expect(user('zachary')).toMatchObject({ isOwner: false, role: 'SHAREHOLDER' });
  });

  it('refuses to let the primary owner demote themselves', async () => {
    const res = await as('primary', 'PATCH', '/admin/staff/primary/role', { role: 'SHAREHOLDER' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: PRIMARY_OWNER_LOCKED });
    expect(user('primary')).toMatchObject({ isOwner: true, isPrimaryOwner: true, role: 'ADMIN' });
    expect(writes).toEqual([]);
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['another owner', 'amina'],
    ['the primary owner', 'primary'],
    ['themselves', 'zachary'],
    ['a non-owner', 'm1'],
  ])('gives a non-primary owner 403 for changing the role of %s', async (_case, targetId) => {
    const before = { ...user(targetId) };

    const res = await as('zachary', 'PATCH', `/admin/staff/${targetId}/role`, { role: 'SHAREHOLDER' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Only the primary owner can change an owner’s role.' });
    expect(user(targetId)).toEqual(before);
    expect(writes).toEqual([]);
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it('is closed to staff who are not owners', async () => {
    const res = await as('m1', 'PATCH', '/admin/staff/zachary/role', { role: 'SHAREHOLDER' });

    expect(res.statusCode).toBe(403);
    expect(writes).toEqual([]);
  });

  it('only demotes owners, to a staff role: no route makes anyone an owner', async () => {
    expect((await as('primary', 'PATCH', '/admin/staff/m1/role', { role: 'SHAREHOLDER' })).statusCode).toBe(400);
    expect((await as('primary', 'PATCH', '/admin/staff/nobody/role', { role: 'SHAREHOLDER' })).statusCode).toBe(404);
    for (const role of ['OWNER', 'CUSTOMER', 'CREW']) {
      expect((await as('primary', 'PATCH', '/admin/staff/m1/role', { role })).statusCode).toBe(400);
    }
    expect(writes).toEqual([]);
  });
});

describe('DELETE /admin/staff/:id', () => {
  it.each([
    ['the primary owner removes themselves', 'primary', 'primary'],
    ['an owner removes the primary owner', 'zachary', 'primary'],
    ['the primary owner removes an owner (Change role is the way)', 'primary', 'zachary'],
  ])('refuses to remove an owner: %s', async (_case, actorId, targetId) => {
    const res = await as(actorId, 'DELETE', `/admin/staff/${targetId}`);

    expect(res.statusCode).toBe(403);
    expect(user(targetId).isOwner).toBe(true);
    expect(writes).toEqual([]);
  });
});
