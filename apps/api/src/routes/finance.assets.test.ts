import { beforeEach, describe, expect, it, vi } from 'vitest';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// The asset list (/admin/finance/assets) holds every asset, and a machine on
// the register is one of them. An asset with no daily rate is changed here by
// every finance role, as it always was. An asset with a daily rate is changed
// by the owner alone, under the same rules as on the Machines page. Nothing
// here can give an asset a rate or a start day.

/** A date as the database gives a start day, a job's date or a repair's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
/** Whole shillings to cents. */
const ksh = (shillings: number) => shillings * 100;

const ASSETS = '/admin/finance/assets';
const assetUrl = (id: string) => `${ASSETS}/${id}`;
const repairsUrl = (id: string) => `${ASSETS}/${id}/maintenance`;

const OWNER_ONLY = { error: 'This machine is on the register, so only the owner can change it.' };
const NO_FINANCE = { error: 'finance access required' };

/** The roles the asset list is open to, the owner first. */
const FINANCE_USERS = ['owner', 'admin', 'finance', 'shareholderRole'];
/** The same, without the owner. */
const NOT_THE_OWNER = ['admin', 'finance', 'shareholderRole'];

const asset = (id: string, name: string, priceShillings: number, over: object = {}) => ({
  id, name, category: 'MACHINE', purchaseDate: day('2026-05-20'), costCents: ksh(priceShillings),
  supplier: null, serialNumber: null, location: null, usefulLifeMonths: null, salvageValueCents: 0,
  condition: 'GOOD', retiredAt: null, notes: null, receiptRef: null, receiptUrl: null,
  projectRateCents: null, hireRateCents: null, hireRateReviewedAt: null, countsFrom: null, createdById: 'owner',
  createdAt: day('2026-05-20'), updatedAt: day('2026-05-20'), ...over,
});

const job = (id: string, title: string, ymd: string) => ({
  id, title, date: day(ymd), incomeCents: ksh(100_000), discountCents: 0, status: 'OWNER_ENTRY',
  placement: 'STANDALONE', projectId: null, clientName: null, clientPhone: null, clientLocation: null,
  notes: null, serviceLineCode: null, region: null, clientSegment: null, createdById: 'owner',
  reportedById: null, createdAt: day(ymd),
});

const line = (id: string, assetId: string, jobId: string, halfDays: number, rateShillings: number) => ({
  id, assetId, jobId, halfDays, rateCents: ksh(rateShillings), amountCents: (halfDays * ksh(rateShillings)) / 2,
  isHire: false, standardRateCents: null, hirePaidOn: null, hirePaymentRef: null,
  createdById: 'owner', createdAt: day('2026-11-10'), updatedAt: day('2026-11-10'),
});

const payment = (id: string, investorId: string, ymd: string, shillings: number) => ({
  id, investorId, date: day(ymd), amountCents: ksh(shillings), reference: null, createdById: 'owner', createdAt: day(ymd),
});

const stored = (id: string) => t.assets.find((a) => a.id === id);

// The laptop as the asset list sends it before anything is changed.
const LAPTOP = {
  id: 'laptop', name: 'Office laptop', category: 'IT', purchaseDate: '2026-03-10', costCents: ksh(90_000),
  supplier: null, serialNumber: null, location: null, usefulLifeMonths: null, salvageValueCents: 0,
  condition: 'GOOD', retiredAt: null, notes: null, receiptRef: null, receiptUrl: null,
  accumulatedDepreciationCents: 0, bookValueCents: ksh(90_000),
  maintenance: [{
    id: 'r4', date: '2026-09-01', description: 'New battery', costCents: ksh(2_500), performedBy: null,
    receiptRef: null, createdByName: 'Adam Admin', createdAt: '2026-09-01T00:00:00.000Z',
  }],
  totalMaintenanceCents: ksh(2_500),
  createdByName: 'Olive Owner', createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [
    { id: 'owner', fullName: 'Olive Owner', role: 'ADMIN', isOwner: true },
    { id: 'admin', fullName: 'Adam Admin', role: 'ADMIN', isOwner: false },
    { id: 'finance', fullName: 'Faith Finance', role: 'FINANCIAL_MANAGER', isOwner: false },
    { id: 'shareholderRole', fullName: 'Shah Shareholder', role: 'SHAREHOLDER', isOwner: false },
    { id: 'coo', fullName: 'Carol Coo', role: 'COO', isOwner: false },
    { id: 'support', fullName: 'Sue Support', role: 'SUPPORT', isOwner: false },
  ];
  t.assets = [
    // No daily rate: not on the register.
    asset('laptop', 'Office laptop', 90_000, {
      category: 'IT', purchaseDate: day('2026-03-10'), createdAt: day('2026-03-10'), updatedAt: day('2026-03-10'),
    }),
    // On the register: KSh 260,000, and one investor put in KSh 156,000.
    asset('polisher', 'Floor polisher', 260_000, {
      projectRateCents: ksh(2_000), hireRateCents: ksh(2_000), countsFrom: day('2026-06-01'),
    }),
  ];
  t.assetMaintenance = [
    {
      id: 'r4', assetId: 'laptop', date: day('2026-09-01'), description: 'New battery', costCents: ksh(2_500),
      performedBy: null, receiptRef: null, createdById: 'admin', createdAt: day('2026-09-01'),
    },
  ];
  t.machineInvestors = [
    {
      id: 'inv1', assetId: 'polisher', name: 'Amina Yusuf', contributionCents: ksh(156_000), createdById: 'owner',
      createdAt: day('2026-06-01'), updatedAt: day('2026-06-01'),
    },
  ];
  t.jobs = [job('mallJob', 'Mall deep clean', '2026-10-14')];
});

describe('an asset with no daily rate, as before the machine register', () => {
  it('lists every asset, newest purchase first, with none of the register\'s fields', async () => {
    const res = await as('admin', 'GET', ASSETS);

    expect(res.statusCode).toBe(200);
    const { assets } = res.json();
    expect(assets.map((a: { id: string }) => a.id)).toEqual(['polisher', 'laptop']);
    expect(assets[1]).toEqual(LAPTOP);
    expect(res.body).not.toMatch(/dailyRateCents|projectRateCents|hireRate|countsFrom|startDay/);
  });

  it.each(FINANCE_USERS)('%s adds an asset', async (userId) => {
    const res = await as(userId, 'POST', ASSETS, {
      name: 'Meeting table', category: 'FURNITURE', purchaseDate: '2026-11-02', costCents: ksh(18_000),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().asset).toMatchObject({
      name: 'Meeting table', category: 'FURNITURE', purchaseDate: '2026-11-02', costCents: ksh(18_000),
      condition: 'GOOD', retiredAt: null, maintenance: [],
    });
    expect(t.assets).toHaveLength(3);
    expect(t.assets[2]).toMatchObject({
      name: 'Meeting table', createdById: userId, projectRateCents: null, hireRateCents: null, countsFrom: null,
    });
  });

  it.each(FINANCE_USERS)('%s changes its name and its cost', async (userId) => {
    const res = await as(userId, 'PATCH', assetUrl('laptop'), { name: 'Front desk laptop', costCents: ksh(85_000) });

    expect(res.statusCode).toBe(200);
    expect(res.json().asset).toEqual({
      ...LAPTOP, name: 'Front desk laptop', costCents: ksh(85_000), bookValueCents: ksh(85_000), updatedAt: expect.any(String),
    });
    expect(stored('laptop')).toMatchObject({ name: 'Front desk laptop', costCents: ksh(85_000) });
  });

  it.each(FINANCE_USERS)('%s logs a repair on it', async (userId) => {
    const res = await as(userId, 'POST', repairsUrl('laptop'), { date: '2026-11-03', description: 'Screen replaced', costCents: ksh(7_000) });

    expect(res.statusCode).toBe(201);
    expect(res.json().asset.totalMaintenanceCents).toBe(ksh(9_500));
    expect(t.assetMaintenance[1]).toMatchObject({
      assetId: 'laptop', date: day('2026-11-03'), description: 'Screen replaced', costCents: ksh(7_000), createdById: userId,
    });
  });

  it.each(FINANCE_USERS)('%s deletes it, and its repairs go with it', async (userId) => {
    const res = await as(userId, 'DELETE', assetUrl('laptop'));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(stored('laptop')).toBeUndefined();
    expect(t.assetMaintenance).toEqual([]);
  });

  it('retiring it stamps the day, and any other condition clears it', async () => {
    const retired = await as('admin', 'PATCH', assetUrl('laptop'), { condition: 'RETIRED' });

    expect(retired.statusCode).toBe(200);
    expect(retired.json().asset).toMatchObject({ condition: 'RETIRED', retiredAt: expect.any(String) });

    const back = await as('admin', 'PATCH', assetUrl('laptop'), { condition: 'FAIR' });

    expect(back.statusCode).toBe(200);
    expect(back.json().asset).toMatchObject({ condition: 'FAIR', retiredAt: null });
  });

  it.each(['coo', 'support'])('refuses %s, who has no finance access', async (userId) => {
    for (const res of [
      await as(userId, 'GET', ASSETS),
      await as(userId, 'PATCH', assetUrl('laptop'), { name: 'Mine now' }),
      await as(userId, 'POST', repairsUrl('laptop'), { date: '2026-11-03', description: 'Screen replaced' }),
      await as(userId, 'DELETE', assetUrl('laptop')),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual(NO_FINANCE);
    }
    expect(stored('laptop')).toMatchObject({ name: 'Office laptop' });
  });

  it('answers 404 for an asset that does not exist', async () => {
    for (const res of [
      await as('admin', 'PATCH', assetUrl('nope'), { name: 'Ghost' }),
      await as('admin', 'POST', repairsUrl('nope'), { date: '2026-11-03', description: 'Screen replaced' }),
      await as('admin', 'DELETE', assetUrl('nope')),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'asset not found' });
    }
  });

  it('refuses a cost that is not a whole number of cents', async () => {
    const res = await as('admin', 'PATCH', assetUrl('laptop'), { costCents: 10.5 });

    expect(res.statusCode).toBe(400);
    expect(stored('laptop')).toMatchObject({ costCents: ksh(90_000) });
  });
});

describe('the asset list never gives an asset a daily rate or a start day', () => {
  it.each(FINANCE_USERS)('a rate and a start day %s sends with a new asset are left out', async (userId) => {
    const res = await as(userId, 'POST', ASSETS, {
      name: 'Carpet extractor', category: 'MACHINE', purchaseDate: '2026-11-02', costCents: ksh(140_000),
      dailyRateCents: ksh(2_500), projectRateCents: ksh(2_500), hireRateCents: ksh(3_500),
      countsFrom: '2026-11-02', startDay: '2026-11-02',
    });

    expect(res.statusCode).toBe(201);
    expect(t.assets[2]).toMatchObject({ name: 'Carpet extractor', projectRateCents: null, hireRateCents: null, countsFrom: null });
    expect(t.assets[2]).not.toHaveProperty('dailyRateCents');
    expect((await as('owner', 'GET', '/admin/machines')).json().register.machines.map((m: { id: string }) => m.id)).toEqual(['polisher']);
  });

  it.each(FINANCE_USERS)('a rate and a start day %s sends with an edit leave the asset off the register', async (userId) => {
    const res = await as(userId, 'PATCH', assetUrl('laptop'), {
      name: 'Front desk laptop', dailyRateCents: ksh(2_500), projectRateCents: ksh(2_500), hireRateCents: ksh(3_500),
      countsFrom: '2026-11-02', startDay: '2026-11-02',
    });

    expect(res.statusCode).toBe(200);
    expect(stored('laptop')).toMatchObject({ name: 'Front desk laptop', projectRateCents: null, hireRateCents: null, countsFrom: null });
    expect(stored('laptop')).not.toHaveProperty('dailyRateCents');
    expect((await as('owner', 'GET', '/admin/machines/laptop')).statusCode).toBe(404);
  });

  it('the owner cannot change a machine\'s rate or start day here either', async () => {
    const res = await as('owner', 'PATCH', assetUrl('polisher'), {
      name: 'Big floor polisher', dailyRateCents: ksh(9_000), projectRateCents: ksh(9_000), hireRateCents: ksh(9_500),
      countsFrom: '2026-01-01',
    });

    expect(res.statusCode).toBe(200);
    expect(stored('polisher')).toMatchObject({
      name: 'Big floor polisher', projectRateCents: ksh(2_000), hireRateCents: ksh(2_000), countsFrom: day('2026-06-01'),
    });
  });
});

describe('a machine on the register, through the asset list', () => {
  it.each(NOT_THE_OWNER)('refuses %s editing, repairing or deleting it', async (userId) => {
    for (const res of [
      await as(userId, 'PATCH', assetUrl('polisher'), { name: 'Mine now' }),
      await as(userId, 'POST', repairsUrl('polisher'), { date: '2026-11-03', description: 'New brushes', costCents: ksh(3_000) }),
      await as(userId, 'DELETE', assetUrl('polisher')),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual(OWNER_ONLY);
    }
    expect(stored('polisher')).toMatchObject({ name: 'Floor polisher' });
    expect(t.assetMaintenance).toHaveLength(1);
  });

  it('the same admin still edits an asset with no rate', async () => {
    expect((await as('admin', 'PATCH', assetUrl('polisher'), { name: 'Mine now' })).statusCode).toBe(403);
    expect((await as('admin', 'PATCH', assetUrl('laptop'), { name: 'Front desk laptop' })).statusCode).toBe(200);
  });

  it('still lets every finance role see it in the list', async () => {
    for (const userId of FINANCE_USERS) {
      const res = await as(userId, 'GET', ASSETS);

      expect(res.statusCode).toBe(200);
      expect(res.json().assets[0]).toMatchObject({ id: 'polisher', name: 'Floor polisher', costCents: ksh(260_000) });
    }
  });

  it('lets the owner rename it, retire it and log a repair on it', async () => {
    const renamed = await as('owner', 'PATCH', assetUrl('polisher'), { name: 'Big floor polisher', condition: 'RETIRED' });

    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().asset).toMatchObject({ name: 'Big floor polisher', condition: 'RETIRED', retiredAt: expect.any(String) });

    const repaired = await as('owner', 'POST', repairsUrl('polisher'), { date: '2026-11-03', description: 'New brushes', costCents: ksh(3_000) });

    expect(repaired.statusCode).toBe(201);
    expect(repaired.json().asset.totalMaintenanceCents).toBe(ksh(3_000));
  });

  it('lets the owner raise the price, and lower it as far as the investors\' total', async () => {
    expect((await as('owner', 'PATCH', assetUrl('polisher'), { costCents: ksh(300_000) })).statusCode).toBe(200);
    expect((await as('owner', 'PATCH', assetUrl('polisher'), { costCents: ksh(156_000) })).statusCode).toBe(200);
    expect(stored('polisher')).toMatchObject({ costCents: ksh(156_000) });
  });

  it('refuses a price below what the investors put in', async () => {
    const res = await as('owner', 'PATCH', assetUrl('polisher'), { costCents: ksh(150_000) });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('KSh 156,000');
    expect(stored('polisher')).toMatchObject({ costCents: ksh(260_000) });
  });

  it('AE11: after one payment a price change is refused with a message naming the payment, and accepted once it is deleted', async () => {
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-05', 15_000)];

    const refused = await as('owner', 'PATCH', assetUrl('polisher'), { costCents: ksh(280_000) });

    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toContain('Amina Yusuf');
    expect(refused.json().error).toContain('KSh 15,000');
    expect(refused.json().error).toContain('5 Nov 2026');
    expect(refused.json().error).toMatch(/Delete that payment/);
    expect(stored('polisher')).toMatchObject({ costCents: ksh(260_000) });

    t.machinePayouts = [];

    expect((await as('owner', 'PATCH', assetUrl('polisher'), { costCents: ksh(280_000) })).statusCode).toBe(200);
    expect(stored('polisher')).toMatchObject({ costCents: ksh(280_000) });
  });

  it('after a payment the owner can still rename it, and send the price it already has', async () => {
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-05', 15_000)];

    const res = await as('owner', 'PATCH', assetUrl('polisher'), { name: 'Big floor polisher', costCents: ksh(260_000) });

    expect(res.statusCode).toBe(200);
    expect(stored('polisher')).toMatchObject({ name: 'Big floor polisher', costCents: ksh(260_000) });
  });

  it('AE10: refuses to delete a machine with one line, and says to retire it', async () => {
    t.machineLines = [line('ml1', 'polisher', 'mallJob', 2, 2_000)];

    const res = await as('owner', 'DELETE', assetUrl('polisher'));

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/days logged on 1 job/);
    expect(res.json().error).toMatch(/Retire it instead/);
    expect(stored('polisher')).toBeDefined();
    expect(t.machineInvestors).toHaveLength(1);
  });

  it('refuses to delete a machine whose investor has been paid, and says to retire it', async () => {
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-05', 15_000)];

    const res = await as('owner', 'DELETE', assetUrl('polisher'));

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/1 payment to an investor/);
    expect(res.json().error).toMatch(/Retire it instead/);
    expect(stored('polisher')).toBeDefined();
  });

  it('lets the owner delete a machine with investors and no lines or payments, and its investors go with it', async () => {
    const res = await as('owner', 'DELETE', assetUrl('polisher'));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(stored('polisher')).toBeUndefined();
    expect(t.machineInvestors).toEqual([]);
  });
});
