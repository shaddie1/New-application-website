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
  avatarUrl: string | null;
};

let users: UserRow[] = [];
const byId = (id: string) => users.find((u) => u.id === id);
const update = vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
  const user = byId(where.id)!;
  for (const [k, v] of Object.entries(data)) if (v !== undefined) Object.assign(user, { [k]: v });
  return { ...user };
});
vi.mock('../db.js', () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...byId(where.id)! })),
      findFirst: vi.fn(async () => null),
      update,
    },
  },
}));
vi.mock('../auth/tokens.js', () => ({ toPublicUser: (u: UserRow) => ({ id: u.id, fullName: u.fullName, email: u.email }) }));

const { signAccessToken } = await import('../auth/jwt.js');
const { profileRoutes } = await import('./profile.js');
const { PRIMARY_OWNER_LOCKED } = await import('../auth/staff.js');

const person = (over: Partial<UserRow> & Pick<UserRow, 'id' | 'role'>): UserRow => ({
  phone: '+254700000000',
  fullName: 'Someone',
  email: null,
  isOwner: false,
  isPrimaryOwner: false,
  avatarUrl: null,
  ...over,
});

async function patchProfile(userId: string, payload: object) {
  const { token } = await signAccessToken(userId, byId(userId)!.role, 'EMAIL');
  const server = Fastify();
  await server.register(profileRoutes, { prefix: '/profile' });
  return server.inject({ method: 'PATCH', url: '/profile', payload, headers: { authorization: `Bearer ${token}` } });
}

beforeEach(() => {
  vi.clearAllMocks();
  users = [
    person({ id: 'primary', role: 'ADMIN', isOwner: true, isPrimaryOwner: true, fullName: 'Shadrack Amihanda', email: 'amihanda@onyxhawkcleaningservice.com' }),
    person({ id: 'zachary', role: 'ADMIN', isOwner: true, fullName: 'Zachary Mwangi', email: 'zachary@onyxhawkcleaningservice.com' }),
    person({ id: 'staff', role: 'SHAREHOLDER', fullName: 'Wanjiku Kamau', email: 'wanjiku@example.com' }),
    person({ id: 'customer', role: 'CUSTOMER', fullName: 'Achieng Otieno', email: 'achieng@example.com' }),
  ];
});

describe('PATCH /profile', () => {
  it('lets the primary owner edit his own name', async () => {
    const res = await patchProfile('primary', { fullName: 'Shadrack O. Amihanda' });

    expect(res.statusCode).toBe(200);
    expect(byId('primary')!.fullName).toBe('Shadrack O. Amihanda');
  });

  it.each([
    ['changing', 'shadrack@example.com'],
    ['clearing', null],
  ])('refuses the primary owner %s his email: that is done by script', async (_case, email) => {
    const res = await patchProfile('primary', { fullName: 'Shadrack Amihanda', email });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: PRIMARY_OWNER_LOCKED });
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['an owner', 'zachary'],
    ['a staff member', 'staff'],
  ])("refuses %s changing or clearing their sign-in email here (the Team page's rules apply)", async (_case, userId) => {
    for (const email of ['new.address@example.com', null]) {
      const res = await patchProfile(userId, { email });
      expect(res.statusCode).toBe(403);
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('still lets staff edit their name, or resend their email unchanged', async () => {
    expect((await patchProfile('staff', { fullName: 'Wanjiku K.' })).statusCode).toBe(200);
    expect((await patchProfile('staff', { email: 'Wanjiku@Example.com', fullName: 'Wanjiku Kamau' })).statusCode).toBe(200);
    expect(byId('staff')!.fullName).toBe('Wanjiku Kamau');
  });

  it('lets a customer change their email as before', async () => {
    const res = await patchProfile('customer', { email: 'achieng.o@example.com' });

    expect(res.statusCode).toBe(200);
    expect(byId('customer')!.email).toBe('achieng.o@example.com');
  });
});
