import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { as, db, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// Stakes change through one request that replaces the whole set and saves only
// at exactly 100%. A removed holder stays in the table with a removal date, so
// the payouts declared for them keep their name.

const STAKES = '/admin/financials/shareholders/stakes';
const CHANGED = { error: 'The stakes changed since you opened this form. Reload and try again.' };
const STAKE_RANGE = { error: 'Each stake must be between 0.01% and 100%, with at most two decimal places.' };

/** A date as the database gives it: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const holder = (id: string, name: string, basisPoints: number, sortOrder: number, over: object = {}) => ({
  id, name, title: null, kind: 'INDIVIDUAL', basisPoints, notes: null, userId: null, sortOrder, removedAt: null,
  createdAt: day('2026-07-15'), updatedAt: day('2026-07-15'), ...over,
});

/** One holder's line of the payout declared for the third quarter, on a profit of KSh 10,000. */
const payout = (id: string, shareholderId: string, basisPoints: number, amountCents: number) => ({
  id, label: 'Q3 2026', periodStart: day('2026-07-01'), periodEnd: day('2026-09-30'), shareholderId,
  netProfitCents: 1_000_000, basisPoints, amountCents, status: 'PENDING', paidAt: null, reference: null, notes: null,
  createdById: 'owner', createdAt: day('2026-10-02'), updatedAt: day('2026-10-02'),
});

/** The stakes the form opened with: 40%, 30% and 30%. */
const OPENED = [
  { id: 'h1', basisPoints: 4000 },
  { id: 'h2', basisPoints: 3000 },
  { id: 'h3', basisPoints: 3000 },
];

const save = (holders: object[], expected: object[] = OPENED, userId = 'owner') =>
  as(userId, 'PUT', STAKES, { expected, holders });
const stored = (id: string) => t.shareholders.find((s) => s.id === id)!;
const snapshot = () => structuredClone({ shareholders: t.shareholders, profitDistributions: t.profitDistributions });
/** Marks a holder removed in the stored rows, as an earlier save would have left them. */
const removeInStore = (id: string) => Object.assign(stored(id), { removedAt: day('2026-11-01'), userId: null });

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [
    { id: 'owner', fullName: 'Owner', role: 'ADMIN', isOwner: true },
    { id: 'admin', fullName: 'Admin', role: 'ADMIN', isOwner: false },
    { id: 'amina', fullName: 'Amina Yusuf', role: 'SHAREHOLDER', isOwner: false },
    { id: 'brian', fullName: 'Brian Otieno', role: 'SHAREHOLDER', isOwner: false },
    { id: 'faith', fullName: 'Faith Wambui', role: 'SHAREHOLDER', isOwner: false },
  ];
  t.shareholders = [
    holder('h1', 'OnyxHawk Holdings', 4000, 0, { kind: 'COMPANY', notes: 'Founding company' }),
    holder('h2', 'Amina Yusuf', 3000, 1, { title: 'Director', notes: 'Joined in 2025', userId: 'amina' }),
    // The last in order, with a gap before it.
    holder('h3', 'Brian Otieno', 3000, 5, { title: 'COO', userId: 'brian' }),
  ];
  t.profitDistributions = [
    payout('d1', 'h1', 4000, 400_000),
    payout('d2', 'h2', 3000, 300_000),
    payout('d3', 'h3', 3000, 300_000),
  ];
});

describe('PUT /admin/financials/shareholders/stakes', () => {
  it('saves 40/30/30 changed to 50/25/25 and leaves the rest of each row as it was', async () => {
    const before = snapshot().shareholders;

    const res = await save([
      { id: 'h1', basisPoints: 5000 },
      { id: 'h2', basisPoints: 2500 },
      { id: 'h3', basisPoints: 2500 },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.json().totalBasisPoints).toBe(10_000);
    expect(res.json().shareholders.map((s: { id: string; basisPoints: number }) => [s.id, s.basisPoints])).toEqual([
      ['h1', 5000],
      ['h2', 2500],
      ['h3', 2500],
    ]);
    expect(res.json().shareholders[1]).toEqual({
      id: 'h2', name: 'Amina Yusuf', title: 'Director', kind: 'INDIVIDUAL', basisPoints: 2500,
      notes: 'Joined in 2025', userId: 'amina', userName: 'Amina Yusuf', sortOrder: 1,
    });
    // Same ids, names, titles, kinds, notes, links and order: only the stakes moved.
    expect(t.shareholders).toEqual([
      { ...before[0], basisPoints: 5000 },
      { ...before[1], basisPoints: 2500 },
      { ...before[2], basisPoints: 2500 },
    ]);
  });

  it('saves 33.33/33.33/33.34', async () => {
    const res = await save([
      { id: 'h1', basisPoints: 3333 },
      { id: 'h2', basisPoints: 3333 },
      { id: 'h3', basisPoints: 3334 },
    ]);

    expect(res.statusCode).toBe(200);
    expect(t.shareholders.map((s) => s.basisPoints)).toEqual([3333, 3333, 3334]);
  });

  it.each([
    ['99.99%', [5000, 2500, 2499]],
    ['100.01%', [5000, 2500, 2501]],
  ])('refuses a total of %s, says the total and changes no row', async (total, [first, second, third]) => {
    const before = snapshot();

    const res = await save([
      { id: 'h1', basisPoints: first },
      { id: 'h2', basisPoints: second },
      { id: 'h3', basisPoints: third },
    ]);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: `Stakes must add up to exactly 100%. These add up to ${total}.` });
    expect(snapshot()).toEqual(before);
  });

  // Each set adds up to 100%, so only the one stake is at fault.
  it.each([
    ['0%', [5000, 5000, 0]],
    ['a stake below zero', [5001, 5000, -1]],
    ['a third decimal place', [3333.5, 3333.5, 3333]],
  ])('refuses %s and changes no row', async (_what, [first, second, third]) => {
    const before = snapshot();

    const res = await save([
      { id: 'h1', basisPoints: first },
      { id: 'h2', basisPoints: second },
      { id: 'h3', basisPoints: third },
    ]);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(STAKE_RANGE);
    expect(snapshot()).toEqual(before);
  });

  it('refuses a set that removes every holder', async () => {
    const before = snapshot();

    const res = await save([]);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'At least one shareholder must remain.' });
    expect(snapshot()).toEqual(before);
  });

  it('creates new holders after the last existing order, in the order given, with no user link', async () => {
    const res = await save([
      { id: 'h1', basisPoints: 3600 },
      { id: 'h2', basisPoints: 2700 },
      { id: 'h3', basisPoints: 2700 },
      { name: 'Chege Mwangi', title: 'Investor', kind: 'INDIVIDUAL', basisPoints: 600 },
      { name: 'Savanna Ventures', kind: 'COMPANY', basisPoints: 400 },
    ]);

    expect(res.statusCode).toBe(200);
    expect(t.shareholders).toHaveLength(5);
    expect(t.shareholders.find((s) => s.name === 'Chege Mwangi')).toMatchObject({
      title: 'Investor', kind: 'INDIVIDUAL', basisPoints: 600, sortOrder: 6, userId: null, removedAt: null,
    });
    expect(t.shareholders.find((s) => s.name === 'Savanna Ventures')).toMatchObject({
      title: null, kind: 'COMPANY', basisPoints: 400, sortOrder: 7, userId: null, removedAt: null,
    });
    expect(res.json().totalBasisPoints).toBe(10_000);
    expect(res.json().shareholders.map((s: { name: string; userId: string | null }) => [s.name, s.userId])).toEqual([
      ['OnyxHawk Holdings', null],
      ['Amina Yusuf', 'amina'],
      ['Brian Otieno', 'brian'],
      ['Chege Mwangi', null],
      ['Savanna Ventures', null],
    ]);
  });

  it('refuses a new holder sent with a user link and writes nothing', async () => {
    const before = snapshot();

    const res = await save([
      { id: 'h1', basisPoints: 3000 },
      { id: 'h2', basisPoints: 3000 },
      { id: 'h3', basisPoints: 3000 },
      { name: 'Faith Wambui', kind: 'INDIVIDUAL', basisPoints: 1000, userId: 'faith' },
    ]);

    expect(res.statusCode).toBe(400);
    expect(snapshot()).toEqual(before);
  });

  it('refuses a new holder with a blank name and writes nothing', async () => {
    const before = snapshot();

    const res = await save([
      { id: 'h1', basisPoints: 3000 },
      { id: 'h2', basisPoints: 3000 },
      { id: 'h3', basisPoints: 3000 },
      { name: '   ', kind: 'INDIVIDUAL', basisPoints: 1000 },
    ]);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Every new shareholder needs a name.' });
    expect(snapshot()).toEqual(before);
  });

  it('AE7: removes a holder who has a declared payout, and the payout still names them', async () => {
    const before = snapshot();

    const res = await save([
      { id: 'h1', basisPoints: 5000 },
      { id: 'h2', basisPoints: 5000 },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.json().shareholders.map((s: { id: string }) => s.id)).toEqual(['h1', 'h2']);
    expect(res.json().totalBasisPoints).toBe(10_000);

    // The row stays, with a removal date and no user link. Nothing else on it moves.
    const { removedAt, ...rest } = stored('h3');
    expect(removedAt).toBeInstanceOf(Date);
    expect(rest).toEqual({ ...before.shareholders[2], removedAt: undefined, userId: null });
    expect(stored('h2')).toEqual({ ...before.shareholders[1], basisPoints: 5000 });

    expect(t.profitDistributions).toEqual(before.profitDistributions);
    const list = await as('owner', 'GET', '/admin/finance/distributions');
    expect(list.statusCode).toBe(200);
    expect(
      list.json().distributions.map((d: { shareholderName: string; amountCents: number }) => [d.shareholderName, d.amountCents]),
    ).toEqual([
      ['OnyxHawk Holdings', 400_000],
      ['Amina Yusuf', 300_000],
      ['Brian Otieno', 300_000],
    ]);
  });

  it('ends the access a removed holder had through their linked account', async () => {
    expect((await as('brian', 'GET', '/admin/finance/distributions')).statusCode).toBe(200);

    await save([
      { id: 'h1', basisPoints: 5000 },
      { id: 'h2', basisPoints: 5000 },
    ]);

    expect((await as('brian', 'GET', '/admin/finance/distributions')).statusCode).toBe(403);
    expect((await as('amina', 'GET', '/admin/finance/distributions')).statusCode).toBe(200);
  });

  it('AE8: refuses a form opened at 40/30/30 once another save has made it 50/25/25, and writes nothing', async () => {
    stored('h1').basisPoints = 5000;
    stored('h2').basisPoints = 2500;
    stored('h3').basisPoints = 2500;
    const before = snapshot();

    const res = await save([
      { id: 'h1', basisPoints: 4500 },
      { id: 'h2', basisPoints: 3000 },
      { id: 'h3', basisPoints: 2500 },
    ]);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual(CHANGED);
    expect(snapshot()).toEqual(before);
  });

  it('refuses a form that opened without one of the current holders', async () => {
    const before = snapshot();

    const res = await save(
      [{ id: 'h1', basisPoints: 5000 }, { id: 'h2', basisPoints: 5000 }],
      [{ id: 'h1', basisPoints: 4000 }, { id: 'h2', basisPoints: 3000 }],
    );

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual(CHANGED);
    expect(snapshot()).toEqual(before);
  });

  it('refuses a form that opened with a holder who has since been removed', async () => {
    removeInStore('h3');
    const before = snapshot();

    const res = await save([
      { id: 'h1', basisPoints: 5000 },
      { id: 'h2', basisPoints: 2500 },
      { id: 'h3', basisPoints: 2500 },
    ]);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual(CHANGED);
    expect(snapshot()).toEqual(before);
  });

  it('refuses a form that opened with one holder listed twice in place of another', async () => {
    const before = snapshot();

    const res = await save(
      [{ id: 'h1', basisPoints: 5000 }, { id: 'h2', basisPoints: 5000 }],
      [{ id: 'h1', basisPoints: 4000 }, { id: 'h1', basisPoints: 4000 }, { id: 'h2', basisPoints: 3000 }],
    );

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual(CHANGED);
    expect(snapshot()).toEqual(before);
  });

  it('refuses a set that lists one holder twice, which would save less than 100%', async () => {
    const before = snapshot();

    const res = await save([
      { id: 'h1', basisPoints: 5000 },
      { id: 'h1', basisPoints: 5000 },
    ]);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'A shareholder appears twice in this form. Reload and try again.' });
    expect(snapshot()).toEqual(before);
  });

  it('refuses a stake for a holder who was removed earlier, and leaves them removed', async () => {
    removeInStore('h3');
    const before = snapshot();

    const res = await save(
      [{ id: 'h1', basisPoints: 4000 }, { id: 'h2', basisPoints: 3000 }, { id: 'h3', basisPoints: 3000 }],
      [{ id: 'h1', basisPoints: 4000 }, { id: 'h2', basisPoints: 3000 }],
    );

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'This form names a shareholder who is not on the cap table. Reload and try again.' });
    expect(snapshot()).toEqual(before);
  });

  it('answers a save that collided with another one the same way as a stale form', async () => {
    const before = snapshot();
    db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('could not serialize access', { code: 'P2034', clientVersion: 'test' }),
    );

    const res = await save([
      { id: 'h1', basisPoints: 5000 },
      { id: 'h2', basisPoints: 2500 },
      { id: 'h3', basisPoints: 2500 },
    ]);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual(CHANGED);
    expect(snapshot()).toEqual(before);
  });

  // The fake cannot make two saves collide, so this is the one place a test
  // reads what the route asked of the database.
  it('runs the check and the writes as one serializable transaction', async () => {
    await save([
      { id: 'h1', basisPoints: 5000 },
      { id: 'h2', basisPoints: 2500 },
      { id: 'h3', basisPoints: 2500 },
    ]);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls[0]![1]).toMatchObject({ isolationLevel: 'Serializable' });
  });

  it('refuses anyone but the owner and writes nothing', async () => {
    const before = snapshot();

    const res = await save(
      [{ id: 'h1', basisPoints: 5000 }, { id: 'h2', basisPoints: 2500 }, { id: 'h3', basisPoints: 2500 }],
      OPENED,
      'admin',
    );

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'owner access required' });
    expect(snapshot()).toEqual(before);
  });
});

describe('a removed holder', () => {
  beforeEach(() => {
    removeInStore('h3');
  });

  it('is left out of the shareholder list', async () => {
    const res = await as('owner', 'GET', '/admin/financials/shareholders');

    expect(res.statusCode).toBe(200);
    expect(res.json().shareholders.map((s: { id: string }) => s.id)).toEqual(['h1', 'h2']);
    expect(res.json().totalBasisPoints).toBe(7000);
  });

  it('is left out of the equity overview', async () => {
    // KSh 10,000 charged in November, nothing spent.
    t.jobs = [{
      id: 'j1', title: 'Office deep clean', date: day('2026-11-05'), incomeCents: 1_000_000, discountCents: 0,
      status: 'OWNER_ENTRY', placement: 'STANDALONE', projectId: null, createdById: 'owner',
    }];

    const res = await as('owner', 'GET', '/admin/financials/equity?from=2026-11-01&to=2026-11-30');

    expect(res.statusCode).toBe(200);
    const { overview } = res.json();
    expect(
      overview.allocations.map((a: { shareholder: { id: string }; periodShareCents: number; allTimeShareCents: number }) =>
        [a.shareholder.id, a.periodShareCents, a.allTimeShareCents]),
    ).toEqual([
      ['h1', 400_000, 400_000],
      ['h2', 300_000, 300_000],
    ]);
    expect(overview.totalBasisPoints).toBe(7000);
    expect(overview.unallocatedPeriodCents).toBe(300_000);
    expect(overview.unallocatedAllTimeCents).toBe(300_000);
  });

  it('is left out of a payout declaration', async () => {
    const res = await as('owner', 'POST', '/admin/finance/distributions/declare', {
      label: 'October 2026', periodStart: '2026-10-01', periodEnd: '2026-10-31', netProfitCentsOverride: 1_000_000,
    });

    expect(res.statusCode).toBe(201);
    expect(
      res.json().distributions.map((d: { shareholderId: string; basisPoints: number; amountCents: number }) =>
        [d.shareholderId, d.basisPoints, d.amountCents]),
    ).toEqual([
      ['h1', 4000, 400_000],
      ['h2', 3000, 300_000],
    ]);
    expect(t.profitDistributions.filter((d) => d.label === 'October 2026').map((d) => d.shareholderId)).toEqual(['h1', 'h2']);
  });
});

describe('PATCH /admin/financials/shareholders/:id', () => {
  it('refuses a stake and changes nothing, whatever is sent beside it', async () => {
    const before = snapshot();

    const res = await as('owner', 'PATCH', '/admin/financials/shareholders/h2', { basisPoints: 3500, title: 'Chair' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Stakes change only through Edit stakes.' });
    expect(snapshot()).toEqual(before);
  });

  it('saves a new title on its own', async () => {
    const before = snapshot().shareholders;

    const res = await as('owner', 'PATCH', '/admin/financials/shareholders/h2', { title: 'Chair' });

    expect(res.statusCode).toBe(200);
    expect(res.json().shareholder).toMatchObject({ id: 'h2', title: 'Chair', basisPoints: 3000, userId: 'amina' });
    expect(t.shareholders).toEqual([before[0], { ...before[1], title: 'Chair' }, before[2]]);
  });

  it('answers not found for a removed holder and changes nothing', async () => {
    removeInStore('h3');
    const before = snapshot();

    const res = await as('owner', 'PATCH', '/admin/financials/shareholders/h3', { title: 'Advisor' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'shareholder not found' });
    expect(snapshot()).toEqual(before);
  });

  it('links an account to an active holder', async () => {
    const res = await as('owner', 'PATCH', '/admin/financials/shareholders/h1', { userId: 'faith' });

    expect(res.statusCode).toBe(200);
    expect(res.json().shareholder).toMatchObject({ id: 'h1', userId: 'faith', userName: 'Faith Wambui' });
    expect(stored('h1').userId).toBe('faith');
  });

  it('refuses an account already linked to another active holder', async () => {
    const before = snapshot();

    const res = await as('owner', 'PATCH', '/admin/financials/shareholders/h1', { userId: 'amina' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'that user is already on the cap table' });
    expect(snapshot()).toEqual(before);
  });

  it('links an account that a holder removed through the form used to have', async () => {
    await save([
      { id: 'h1', basisPoints: 5000 },
      { id: 'h2', basisPoints: 5000 },
    ]);

    const res = await as('owner', 'PATCH', '/admin/financials/shareholders/h1', { userId: 'brian' });

    expect(res.statusCode).toBe(200);
    expect(stored('h1').userId).toBe('brian');
  });
});

describe('the requests that used to add and delete one holder', () => {
  it('answers not found for the add request and adds nobody', async () => {
    const before = snapshot();

    const res = await as('owner', 'POST', '/admin/financials/shareholders', {
      name: 'Chege Mwangi', kind: 'INDIVIDUAL', basisPoints: 1000,
    });

    expect(res.statusCode).toBe(404);
    expect(snapshot()).toEqual(before);
  });

  it('answers not found for the delete request and removes nobody', async () => {
    const before = snapshot();

    const res = await as('owner', 'DELETE', '/admin/financials/shareholders/h1');

    expect(res.statusCode).toBe(404);
    expect(snapshot()).toEqual(before);
  });
});

describe('the order of the holders', () => {
  it('follows their place in the table, not the order the rows were stored in, in the list and in the split', async () => {
    // Stored last place first: Brian (place 5), then OnyxHawk Holdings (0), then Amina (1).
    t.shareholders = [stored('h3'), stored('h1'), stored('h2')];
    // KSh 10,000 charged in November, nothing spent.
    t.jobs = [{
      id: 'j1', title: 'Office deep clean', date: day('2026-11-05'), incomeCents: 1_000_000, discountCents: 0,
      status: 'OWNER_ENTRY', placement: 'STANDALONE', projectId: null, createdById: 'owner',
    }];

    const list = await as('owner', 'GET', '/admin/financials/shareholders');
    const equity = await as('owner', 'GET', '/admin/financials/equity?from=2026-11-01&to=2026-11-30');

    expect(list.statusCode).toBe(200);
    expect(list.json().shareholders.map((s: { id: string; sortOrder: number }) => [s.id, s.sortOrder])).toEqual([
      ['h1', 0],
      ['h2', 1],
      ['h3', 5],
    ]);
    expect(equity.statusCode).toBe(200);
    expect(
      equity.json().overview.allocations.map((a: { shareholder: { id: string }; periodShareCents: number }) =>
        [a.shareholder.id, a.periodShareCents]),
    ).toEqual([
      ['h1', 400_000],
      ['h2', 300_000],
      ['h3', 300_000],
    ]);
  });
});
