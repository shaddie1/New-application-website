import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EquityHistory, EquityHistoryMonth } from '@onyxhawk/types';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// Ownership's history chart: each month's net profit split across the current
// holders at today's stakes, by the same split and the same month figures the
// equity overview uses.

const HISTORY = '/admin/financials/equity/history';

/** A date as the database gives it: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const holder = (id: string, name: string, basisPoints: number, sortOrder: number, over: object = {}) => ({
  id, name, title: null, kind: 'INDIVIDUAL', basisPoints, notes: null, userId: null, sortOrder, removedAt: null,
  createdAt: day('2025-07-15'), updatedAt: day('2025-07-15'), ...over,
});

const job = (id: string, ymd: string, incomeCents: number, over: object = {}) => ({
  id, title: `Job ${id}`, date: day(ymd), incomeCents, discountCents: 0, status: 'OWNER_ENTRY', placement: 'STANDALONE',
  projectId: null, createdById: 'owner', ...over,
});

const cost = (id: string, jobId: string, ymd: string, amountCents: number) => ({
  id, jobId, category: 'MATERIALS', amountCents, description: null, date: day(ymd),
});

/** Sets the server clock. The instant is given in UTC; Nairobi is three hours ahead. */
function clockAt(utc: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(utc));
}

async function historyFor(query = ''): Promise<EquityHistoryMonth[]> {
  const res = await as('owner', 'GET', `${HISTORY}${query}`);
  expect(res.statusCode).toBe(200);
  return (res.json().history as EquityHistory).months;
}

const monthOf = (months: EquityHistoryMonth[], year: number, month: number) =>
  months.find((m) => m.year === year && m.month === month)!;
const shareCents = (m: EquityHistoryMonth) => m.shares.map((s) => s.shareCents);
const setStakes = (...basisPoints: number[]) =>
  basisPoints.forEach((bp, i) => Object.assign(t.shareholders[i]!, { basisPoints: bp }));

/** Net profit of the twelve months ending November 2026, oldest first, from the jobs and costs below. */
const NET_BY_MONTH = [250_000, 0, 0, 0, 0, 0, 0, 0, 0, -500_000, 3_880_000, 1_000_001];

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  clockAt('2026-11-12T09:00:00.000Z'); // midday on 12 November in Nairobi
  t.users = [
    { id: 'owner', fullName: 'Owner', role: 'ADMIN', isOwner: true },
    { id: 'admin', fullName: 'Admin', role: 'ADMIN', isOwner: false },
    { id: 'amina', fullName: 'Amina Yusuf', role: 'SHAREHOLDER', isOwner: false },
  ];
  t.shareholders = [
    holder('h1', 'OnyxHawk Holdings', 4000, 0, { kind: 'COMPANY' }),
    holder('h2', 'Amina Yusuf', 3000, 1, { userId: 'amina' }),
    holder('h3', 'Brian Otieno', 3000, 2),
  ];
  t.jobs = [
    // The day before the twelve months start, and the day after they end.
    job('nov25last', '2025-11-30', 9_900_000),
    job('dec1next', '2026-12-01', 9_900_000),
    // December 2025: its last day.
    job('dec31', '2025-12-31', 250_000),
    // August 2026: nothing.
    // September: a loss of KSh 5,000.
    job('sep10', '2026-09-10', 100_000),
    // October: KSh 50,000 typed, KSh 1,200 off, KSh 10,000 spent. A report still waiting counts for nothing.
    job('oct31', '2026-10-31', 5_000_000, { discountCents: 120_000, status: 'APPROVED' }),
    job('octPending', '2026-10-12', 7_700_000, { status: 'PENDING' }),
    // November, the month still running: one cent that does not divide.
    job('nov1', '2026-11-01', 600_001),
    job('nov25', '2026-11-25', 500_000),
  ];
  t.expenses = [
    cost('c1', 'sep10', '2026-09-11', 600_000),
    cost('c2', 'oct31', '2026-10-31', 1_000_000),
    cost('c3', 'octPending', '2026-10-12', 300_000),
    cost('c4', 'nov1', '2026-11-02', 100_000),
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /admin/financials/equity/history', () => {
  it('splits a month that made 3,880,000 cents 40/30/30 into 1,552,000, 1,164,000 and 1,164,000', async () => {
    const months = await historyFor();

    expect(monthOf(months, 2026, 10)).toEqual({
      year: 2026,
      month: 10,
      label: 'Oct',
      netCents: 3_880_000,
      shares: [
        { shareholderId: 'h1', shareholderName: 'OnyxHawk Holdings', basisPoints: 4000, shareCents: 1_552_000 },
        { shareholderId: 'h2', shareholderName: 'Amina Yusuf', basisPoints: 3000, shareCents: 1_164_000 },
        { shareholderId: 'h3', shareholderName: 'Brian Otieno', basisPoints: 3000, shareCents: 1_164_000 },
      ],
      unallocatedCents: 0,
      partial: false,
    });
  });

  it.each([
    ['40/30/30', [4000, 3000, 3000]],
    ['33.33% three times, which leaves 0.01% with nobody', [3333, 3333, 3333]],
  ])("makes each month's shares and its remainder add up to that month's net profit, at %s", async (_stakes, basisPoints) => {
    setStakes(...basisPoints);

    const months = await historyFor();

    expect(months.map((m) => m.netCents)).toEqual(NET_BY_MONTH);
    expect(months.map((m) => shareCents(m).reduce((acc, v) => acc + v, 0) + m.unallocatedCents)).toEqual(NET_BY_MONTH);
  });

  it('gives each holder a negative share of a loss month, adding up to the loss', async () => {
    const september = monthOf(await historyFor(), 2026, 9);

    expect(september.netCents).toBe(-500_000);
    expect(shareCents(september)).toEqual([-200_000, -150_000, -150_000]);
    expect(september.unallocatedCents).toBe(0);
  });

  it('gives zeros for a month with no jobs', async () => {
    const august = monthOf(await historyFor(), 2026, 8);

    expect(august).toEqual({
      year: 2026,
      month: 8,
      label: 'Aug',
      netCents: 0,
      shares: [
        { shareholderId: 'h1', shareholderName: 'OnyxHawk Holdings', basisPoints: 4000, shareCents: 0 },
        { shareholderId: 'h2', shareholderName: 'Amina Yusuf', basisPoints: 3000, shareCents: 0 },
        { shareholderId: 'h3', shareholderName: 'Brian Otieno', basisPoints: 3000, shareCents: 0 },
      ],
      unallocatedCents: 0,
      partial: false,
    });
  });

  it('leaves a removed holder out of every month, and their old stake out of the split', async () => {
    t.shareholders.push(holder('h4', 'Faith Wambui', 2000, 3, { removedAt: day('2026-11-01') }));

    const months = await historyFor();

    expect(months).toHaveLength(12);
    for (const m of months) expect(m.shares.map((s) => s.shareholderId)).toEqual(['h1', 'h2', 'h3']);
    expect(shareCents(monthOf(months, 2026, 10))).toEqual([1_552_000, 1_164_000, 1_164_000]);
    expect(monthOf(months, 2026, 10).unallocatedCents).toBe(0);
  });

  it('leaves 10% of each month unallocated when the stakes total 90%', async () => {
    setStakes(4000, 3000, 2000);

    const months = await historyFor();

    expect(shareCents(monthOf(months, 2026, 10))).toEqual([1_552_000, 1_164_000, 776_000]);
    // A tenth of each month's net profit; November's odd cent is shared out, not held back.
    expect(months.map((m) => m.unallocatedCents)).toEqual([25_000, 0, 0, 0, 0, 0, 0, 0, 0, -50_000, 388_000, 100_000]);
  });

  it("matches the equity overview's shares for the same month in its last entry", async () => {
    const months = await historyFor();
    const { overview } = (await as('owner', 'GET', '/admin/financials/equity?from=2026-11-01&to=2026-11-30')).json();

    const november = months[months.length - 1]!;
    // 6,000.01 and 5,000 in, 1,000 out. The 25 November job is dated after today and still counts.
    expect(november.netCents).toBe(1_000_001);
    expect(november.netCents).toBe(overview.periodNetCents);
    expect(shareCents(november)).toEqual([400_001, 300_000, 300_000]);
    expect(november.shares.map((s) => [s.shareholderId, s.shareCents])).toEqual(
      overview.allocations.map((a: { shareholder: { id: string }; periodShareCents: number }) =>
        [a.shareholder.id, a.periodShareCents]),
    );
    expect(november.unallocatedCents).toBe(overview.unallocatedPeriodCents);
  });

  it.each([
    ['an admin who is not the owner', 'admin'],
    ['a shareholder on the cap table', 'amina'],
  ])('refuses %s', async (_who, userId) => {
    const res = await as(userId, 'GET', HISTORY);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'owner access required' });
  });

  describe('the months it covers', () => {
    it('gives twelve months by default, oldest first, ending at the current month, which alone is part-month', async () => {
      const months = await historyFor();

      expect(months.map((m) => [m.year, m.month, m.label, m.partial])).toEqual([
        [2025, 12, 'Dec', false],
        [2026, 1, 'Jan', false],
        [2026, 2, 'Feb', false],
        [2026, 3, 'Mar', false],
        [2026, 4, 'Apr', false],
        [2026, 5, 'May', false],
        [2026, 6, 'Jun', false],
        [2026, 7, 'Jul', false],
        [2026, 8, 'Aug', false],
        [2026, 9, 'Sep', false],
        [2026, 10, 'Oct', false],
        [2026, 11, 'Nov', true],
      ]);
    });

    it('gives as many months as asked for', async () => {
      const months = await historyFor('?months=3');

      expect(months.map((m) => [m.year, m.month, m.partial])).toEqual([
        [2026, 9, false],
        [2026, 10, false],
        [2026, 11, true],
      ]);
      expect(months.map((m) => m.netCents)).toEqual([-500_000, 3_880_000, 1_000_001]);
    });

    it('ends at November at 22:00 UTC on 31 October, which is 01:00 on 1 November in Nairobi', async () => {
      clockAt('2026-10-31T22:00:00.000Z');

      const months = await historyFor('?months=2');

      expect(months.map((m) => [m.year, m.month, m.partial])).toEqual([
        [2026, 10, false],
        [2026, 11, true],
      ]);
    });

    it.each(['0', '25', '1.5', 'many'])('refuses months=%s', async (value) => {
      const res = await as('owner', 'GET', `${HISTORY}?months=${value}`);

      expect(res.statusCode).toBe(400);
    });
  });
});
