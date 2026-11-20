import { beforeEach, describe, expect, it, vi } from 'vitest';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// Profit sharing under the owner's rule of 20 November 2026: 5% of a period's
// profit is set aside for marketing before the stakes split it, and the
// marketing fund is what was set aside less what marketing has spent since.

const DECLARE = '/admin/finance/distributions/declare';
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const holder = (id: string, name: string, basisPoints: number, sortOrder: number) => ({
  id, name, title: null, kind: 'INDIVIDUAL', basisPoints, notes: null, userId: null, sortOrder, removedAt: null,
  createdAt: day('2026-07-15'), updatedAt: day('2026-07-15'),
});

const declare = (label: string, periodStart: string, periodEnd: string, netProfitCentsOverride: number) =>
  as('owner', 'POST', DECLARE, { label, periodStart, periodEnd, netProfitCentsOverride });

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [{ id: 'owner', fullName: 'Owner', role: 'ADMIN', isOwner: true }];
  t.shareholders = [holder('a', 'Amina', 5_000, 0), holder('b', 'Brian', 3_000, 1), holder('c', 'Chege', 2_000, 2)];
});

describe('declaring a period', () => {
  it("sets 5% aside and splits the rest: the owner's KSh 4,000 gives 200, then 1,900, 1,140 and 760", async () => {
    const res = await declare('November 2026', '2026-11-01', '2026-11-30', 400_000);

    expect(res.statusCode).toBe(201);
    expect(res.json().distributions.map((d: { shareholderId: string; netProfitCents: number; marketingCents: number; amountCents: number }) =>
      [d.shareholderId, d.netProfitCents, d.marketingCents, d.amountCents])).toEqual([
      ['a', 400_000, 20_000, 190_000],
      ['b', 400_000, 20_000, 114_000],
      ['c', 400_000, 20_000, 76_000],
    ]);
  });

  it('sets nothing aside from a loss', async () => {
    const res = await declare('October 2026', '2026-10-01', '2026-10-31', -100_000);

    // Listed largest amount first, so the smallest loss comes first.
    expect(res.json().distributions.map((d: { shareholderId: string; marketingCents: number; amountCents: number }) =>
      [d.shareholderId, d.marketingCents, d.amountCents]))
      .toEqual([['c', 0, -20_000], ['b', 0, -30_000], ['a', 0, -50_000]]);
  });
});

describe('GET /admin/finance/marketing-fund', () => {
  it('counts each period once, less marketing spend from the first set-aside on', async () => {
    await declare('November 2026', '2026-11-01', '2026-11-30', 400_000);
    t.marketingSpends = [
      { id: 'ms1', date: day('2026-10-20'), amountCents: 9_000 }, // before the fund
      { id: 'ms2', date: day('2026-11-15'), amountCents: 5_000 },
    ];

    const res = await as('owner', 'GET', '/admin/finance/marketing-fund');

    expect(res.statusCode).toBe(200);
    expect(res.json().fund).toEqual({
      setAsideCents: 20_000,
      spentCents: 5_000,
      balanceCents: 15_000,
      sinceDate: '2026-11-01',
      periods: [{ label: 'November 2026', periodStart: '2026-11-01', periodEnd: '2026-11-30', marketingCents: 20_000 }],
    });
  });
});
