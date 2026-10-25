import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null; signInMethod: 'SMS' | 'EMAIL' };

let rows: Row[] = [];
const create = vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'revokedAt'> }) => {
  const row = { id: `rt${rows.length + 1}`, revokedAt: null, ...data };
  rows.push(row);
  return row;
});
const db = {
  refreshToken: {
    create,
    findUnique: async ({ where }: { where: { tokenHash: string } }) => rows.find((r) => r.tokenHash === where.tokenHash) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.find((r) => r.id === where.id)!, data),
    updateMany: async () => ({ count: 0 }),
  },
  user: { findUniqueOrThrow: async () => ({ id: 'u1', role: 'ADMIN', deletedAt: null }) },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
};
vi.mock('../db.js', () => ({ prisma: db }));

const { issueSession, rotateRefreshToken } = await import('./tokens.js');
const { verifyAccessToken } = await import('./jwt.js');

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
});

describe('the sign-in method on a session', () => {
  it.each(['SMS', 'EMAIL'] as const)('is stored on the refresh row and put in the access token (%s)', async (method) => {
    const session = await issueSession({ id: 'u1', role: 'ADMIN' }, method);

    expect(rows[0]!.signInMethod).toBe(method);
    expect((await verifyAccessToken(session.accessToken)).signInMethod).toBe(method);
  });

  it.each(['SMS', 'EMAIL'] as const)('survives every refresh unchanged (%s)', async (method) => {
    const first = await issueSession({ id: 'u1', role: 'ADMIN' }, method);
    const second = await rotateRefreshToken(first.refreshToken);
    const third = await rotateRefreshToken(second.refreshToken);

    expect(rows.map((r) => r.signInMethod)).toEqual([method, method, method]);
    expect((await verifyAccessToken(third.accessToken)).signInMethod).toBe(method);
  });
});
