import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EquityOverview, OwnershipSummary } from '@onyxhawk/types';

import { type CastId, holderIdOf, requestAs, seedCast } from '../test-support/cast.js';
import { resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// The ownership summary is what the Dashboard shows an account that holds
// shares: every holder's stake and share of net profit, for one month and for
// all time. Its figures are the Ownership page's, and it carries nothing the
// net profit is made of.

/** A date as the database gives it: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const job = (id: string, ymd: string, status: string, incomeCents: number, discountCents = 0) => ({
  id, title: `Job ${id}`, date: day(ymd), incomeCents, discountCents, status, placement: 'STANDALONE', projectId: null,
  createdById: 'owner',
});

const cost = (id: string, jobId: string, ymd: string, amountCents: number) => ({
  id, jobId, category: 'MATERIALS', amountCents, description: null, date: day(ymd),
});

const SUMMARY = '/admin/financials/ownership-summary';
const NOVEMBER = `${SUMMARY}?year=2026&month=11`;

async function summaryFor(who: CastId, url = NOVEMBER): Promise<OwnershipSummary> {
  const res = await requestAs(who, 'GET', url);
  expect(res.statusCode).toBe(200);
  return res.json().summary;
}

/** Leaves only the named cast accounts on the cap table, each at the stake given. */
function stakes(kept: Partial<Record<CastId, number>>) {
  const ids = Object.keys(kept) as CastId[];
  t.shareholders = t.shareholders.filter((s) => ids.some((id) => s.id === holderIdOf(id)));
  for (const id of ids) t.shareholders.find((s) => s.id === holderIdOf(id))!.basisPoints = kept[id];
}

beforeEach(() => {
  resetDb();
  // Five holders: 40%, 30% and three of 10%.
  seedCast();
  t.jobs = [
    // The last day of October and the first of December: outside November, inside all time.
    job('oct31', '2026-10-31', 'OWNER_ENTRY', 400_000),
    job('dec1', '2026-12-01', 'OWNER_ENTRY', 300_000),
    // The first and last day of November. The odd cent leaves one over when the profit is split.
    job('nov1', '2026-11-01', 'OWNER_ENTRY', 1_000_001, 100_000),
    job('nov30', '2026-11-30', 'APPROVED', 500_000),
    // Waiting for approval: counted nowhere.
    job('novPending', '2026-11-10', 'PENDING', 700_000),
  ];
  t.expenses = [
    cost('c1', 'nov1', '2026-11-01', 200_000),
    cost('c2', 'nov30', '2026-11-30', 50_000),
    cost('c3', 'novPending', '2026-11-10', 300_000),
    cost('c4', 'oct31', '2026-10-31', 100_000),
  ];
});

describe('GET /admin/financials/ownership-summary', () => {
  it.each([
    ['November, 30 days', 'year=2026&month=11', 'from=2026-11-01&to=2026-11-30'],
    ['October, 31 days', 'year=2026&month=10', 'from=2026-10-01&to=2026-10-31'],
  ])("gives a holder the shares the Ownership page shows the owner for %s", async (_name, month, range) => {
    const summary = await summaryFor('shareholderLinked', `${SUMMARY}?${month}`);
    const equity = await requestAs('owner', 'GET', `/admin/financials/equity?${range}`);
    const overview: EquityOverview = equity.json().overview;

    expect(overview.allocations).toHaveLength(5);
    // The same holders in the same order, each with the same two shares.
    expect(summary.holders).toEqual(
      overview.allocations.map((a) => ({
        id: a.shareholder.id,
        name: a.shareholder.name,
        kind: a.shareholder.kind,
        basisPoints: a.shareholder.basisPoints,
        periodShareCents: a.periodShareCents,
        allTimeShareCents: a.allTimeShareCents,
      })),
    );
    expect(summary.totalBasisPoints).toBe(overview.totalBasisPoints);
    expect(summary.unallocatedPeriodCents).toBe(overview.unallocatedPeriodCents);
    expect(summary.unallocatedAllTimeCents).toBe(overview.unallocatedAllTimeCents);
    expect(summary.periodNetCents).toBe(overview.periodNetCents);
    expect(summary.allTimeNetCents).toBe(overview.allTime.totalNetCents);
  });

  it('answers with the month, the holders, the stakes total, the unallocated amounts and the net profit, and nothing else', async () => {
    // What a holder's row carries on the Ownership page and must not carry here.
    Object.assign(t.shareholders.find((s) => s.id === holderIdOf('cooLinked'))!, {
      title: 'Director', notes: 'Founder loan outstanding',
    });

    const res = await requestAs('shareholderLinked', 'GET', NOVEMBER);

    expect(res.statusCode).toBe(200);
    // November: 9,000.01 and 5,000 charged, 2,500 spent. All time adds October's 3,000 and December's 3,000.
    expect(res.json()).toEqual({
      summary: {
        year: 2026,
        month: 11,
        holders: [
          // The cent left over after rounding down goes to the largest remainder, the 40% holder.
          { id: 'holder-cooLinked', name: 'Chege Coo', kind: 'INDIVIDUAL', basisPoints: 4000, periodShareCents: 460_001, allTimeShareCents: 700_001 },
          { id: 'holder-shareholderLinked', name: 'Shah Shareholder', kind: 'INDIVIDUAL', basisPoints: 3000, periodShareCents: 345_000, allTimeShareCents: 525_000 },
          { id: 'holder-supportLinked', name: 'Simon Support', kind: 'INDIVIDUAL', basisPoints: 1000, periodShareCents: 115_000, allTimeShareCents: 175_000 },
          { id: 'holder-customerLinked', name: 'Carl Customer', kind: 'INDIVIDUAL', basisPoints: 1000, periodShareCents: 115_000, allTimeShareCents: 175_000 },
          { id: 'holder-crewLinked', name: 'Cleo Crew', kind: 'INDIVIDUAL', basisPoints: 1000, periodShareCents: 115_000, allTimeShareCents: 175_000 },
        ],
        totalBasisPoints: 10_000,
        unallocatedPeriodCents: 0,
        unallocatedAllTimeCents: 0,
        periodNetCents: 1_150_001,
        allTimeNetCents: 1_750_001,
      },
    });

    // Every key at every depth, so a field nested under another name is caught too.
    const keys = new Set<string>();
    const collect = (value: unknown): void => {
      if (value === null || typeof value !== 'object') return;
      // An array's keys are its positions: only what it holds is looked into.
      for (const [key, inner] of Object.entries(value)) {
        if (!Array.isArray(value)) keys.add(key);
        collect(inner);
      }
    };
    collect(res.json());
    expect([...keys].sort()).toEqual([
      'allTimeNetCents', 'allTimeShareCents', 'basisPoints', 'holders', 'id', 'kind', 'month', 'name',
      'periodNetCents', 'periodShareCents', 'summary', 'totalBasisPoints', 'unallocatedAllTimeCents',
      'unallocatedPeriodCents', 'year',
    ]);
    for (const hidden of [
      'periodIncomeCents', 'periodExpensesCents', 'periodProjects', 'allTime', 'notes', 'userId', 'userName',
      'title', 'sortOrder',
    ]) {
      expect(keys).not.toContain(hidden);
    }
  });

  it('AE10: splits a month that lost KSh 20,000 at 40, 30 and 30 into negative shares', async () => {
    stakes({ cooLinked: 4000, shareholderLinked: 3000, supportLinked: 3000 });
    // September: KSh 10,000 charged and KSh 30,000 spent.
    t.jobs.push(job('sep10', '2026-09-10', 'OWNER_ENTRY', 1_000_000));
    t.expenses.push(cost('c5', 'sep10', '2026-09-12', 3_000_000));

    const summary = await summaryFor('shareholderLinked', `${SUMMARY}?year=2026&month=9`);

    expect(summary.periodNetCents).toBe(-2_000_000);
    expect(summary.holders.map((h) => [h.id, h.periodShareCents])).toEqual([
      ['holder-cooLinked', -800_000],
      ['holder-shareholderLinked', -600_000],
      ['holder-supportLinked', -600_000],
    ]);
    expect(summary.unallocatedPeriodCents).toBe(0);
  });

  it('gives what stakes totalling 90% leave over, for the month and for all time', async () => {
    stakes({ cooLinked: 4000, shareholderLinked: 3000, supportLinked: 1000, customerLinked: 1000 });

    const summary = await summaryFor('shareholderLinked');

    expect(summary.totalBasisPoints).toBe(9000);
    // A tenth of 1,150,001 and of 1,750,001, after the nine tenths are rounded to a whole cent.
    expect(summary.unallocatedPeriodCents).toBe(115_000);
    expect(summary.unallocatedAllTimeCents).toBe(175_000);
    const shared = (pick: (h: OwnershipSummary['holders'][number]) => number) =>
      summary.holders.reduce((acc, h) => acc + pick(h), 0);
    expect(shared((h) => h.periodShareCents) + summary.unallocatedPeriodCents).toBe(summary.periodNetCents);
    expect(shared((h) => h.allTimeShareCents) + summary.unallocatedAllTimeCents).toBe(summary.allTimeNetCents);
  });

  it('gives an empty list and both net figures when there are no shareholders', async () => {
    t.shareholders = [];

    expect(await summaryFor('owner')).toEqual({
      year: 2026,
      month: 11,
      holders: [],
      totalBasisPoints: 0,
      // Nobody to split it between: all of it is unallocated.
      unallocatedPeriodCents: 1_150_001,
      unallocatedAllTimeCents: 1_750_001,
      periodNetCents: 1_150_001,
      allTimeNetCents: 1_750_001,
    });
  });

  it.each([
    ['no year or month', ''],
    ['no year', '?month=11'],
    ['no month', '?year=2026'],
    ['a year that is not a number', '?year=twenty&month=11'],
    ['a month that is not a number', '?year=2026&month=Nov'],
    ['month 0', '?year=2026&month=0'],
    ['month 13', '?year=2026&month=13'],
    ['a month with a fraction', '?year=2026&month=1.5'],
    ['a date range in place of a month', '?from=2026-11-01&to=2026-11-30'],
  ])('answers 400 to %s', async (_name, query) => {
    expect((await requestAs('owner', 'GET', `${SUMMARY}${query}`)).statusCode).toBe(400);
  });

  it('AE3: answers a linked holder, and refuses the same account once the owner removes the holder', async () => {
    expect((await requestAs('shareholderLinked', 'GET', NOVEMBER)).statusCode).toBe(200);

    // The owner saves the stakes without Shah, whose 30% goes to the 40% holder.
    const current = t.shareholders.map((s) => ({ id: s.id as string, basisPoints: s.basisPoints as number }));
    const removal = await requestAs('owner', 'PUT', '/admin/financials/shareholders/stakes', {
      expected: current,
      holders: current
        .filter((h) => h.id !== holderIdOf('shareholderLinked'))
        .map((h) => (h.id === holderIdOf('cooLinked') ? { ...h, basisPoints: 7000 } : h)),
    });
    expect(removal.statusCode).toBe(200);

    const res = await requestAs('shareholderLinked', 'GET', NOVEMBER);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'dashboard section access required' });
  });
});
