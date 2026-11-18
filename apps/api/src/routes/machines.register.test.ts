import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineDetailDto } from '@onyxhawk/types';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// The owner's changes to the machine register: putting a machine on it,
// changing its name, price, rate, condition and start day, replacing its
// investors, adding and deleting repairs, and deleting it. Nobody else changes
// anything. Logging days, hires and payments is tested with those routes.

/** A date as the database gives a start day, a job's date or a repair's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
/** Whole shillings to cents. */
const ksh = (shillings: number) => shillings * 100;

// Half past one in the morning of 18 November in Nairobi, and still 17 November in UTC.
const NOW = '2026-11-17T22:30:00.000Z';
const TODAY = '2026-11-18';
const TOMORROW = '2026-11-19';

const MACHINES = '/admin/machines';
const machineUrl = (id: string) => `${MACHINES}/${id}`;
const fromAssetUrl = (id: string) => `${MACHINES}/from-asset/${id}`;
const investorsUrl = (id: string) => `${MACHINES}/${id}/investors`;
const repairsUrl = (id: string) => `${MACHINES}/${id}/repairs`;
const repairUrl = (id: string, repairId: string) => `${MACHINES}/${id}/repairs/${repairId}`;

const NOT_THE_OWNER = { error: 'only the owner can change the machine register' };
const NO_MACHINE = { error: 'machine not found' };

const asset = (id: string, name: string, priceShillings: number, over: object = {}) => ({
  id, name, category: 'MACHINE', purchaseDate: day('2026-05-20'), costCents: ksh(priceShillings),
  supplier: null, serialNumber: null, location: null, usefulLifeMonths: null, salvageValueCents: 0,
  condition: 'GOOD', retiredAt: null, notes: null, receiptRef: null, receiptUrl: null,
  dailyRateCents: null, countsFrom: null, createdById: 'owner',
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
  isHire: false, createdById: 'owner', createdAt: day('2026-11-10'), updatedAt: day('2026-11-10'),
});

const repair = (id: string, assetId: string, ymd: string, shillings: number) => ({
  id, assetId, date: day(ymd), description: `Repair ${id}`, costCents: ksh(shillings), performedBy: null,
  receiptRef: null, createdById: 'owner', createdAt: day(ymd),
});

const payment = (id: string, investorId: string, ymd: string, shillings: number) => ({
  id, investorId, date: day(ymd), amountCents: ksh(shillings), reference: null, createdById: 'owner', createdAt: day(ymd),
});

const stored = (id: string) => t.assets.find((a) => a.id === id);

/** The machine a write answered with, after checking the status. */
function answered(res: { statusCode: number; json: () => { machine: MachineDetailDto } }, status = 200): MachineDetailDto {
  expect(res.statusCode).toBe(status);
  return res.json().machine;
}

async function machine(id: string): Promise<MachineDetailDto> {
  return answered(await as('owner', 'GET', machineUrl(id)));
}

/** 5 days at KSh 2,000 on the mall job of 14 October: KSh 10,000 earned. */
const logPolisherDays = () => {
  t.machineLines = [line('ml1', 'polisher', 'mallJob', 10, 2_000)];
};

/** One payment of KSh 15,000 to the polisher's investor on 5 November. */
const payAmina = () => {
  t.machinePayouts = [payment('p1', 'inv1', '2026-11-05', 15_000)];
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
  resetDb();
  t.users = [
    { id: 'owner', fullName: 'Olive Owner', role: 'ADMIN', isOwner: true },
    { id: 'admin', fullName: 'Adam Admin', role: 'ADMIN', isOwner: false },
    { id: 'coo', fullName: 'Carol Coo', role: 'COO', isOwner: false },
  ];
  t.assets = [
    // On the register since 1 June: KSh 260,000, of which one investor put in KSh 156,000.
    asset('polisher', 'Floor polisher', 260_000, { dailyRateCents: ksh(2_000), countsFrom: day('2026-06-01') }),
    // On the register, the company's own, and retired.
    asset('scrubber', 'Auto scrubber', 120_000, {
      category: 'EQUIPMENT', dailyRateCents: ksh(1_500), countsFrom: day('2026-08-01'), condition: 'RETIRED',
      retiredAt: new Date('2026-11-01T09:30:00.000Z'),
    }),
    // On the register with no price.
    asset('sprayer', 'Hand sprayer', 0, { category: 'TOOL', dailyRateCents: ksh(500), countsFrom: day('2026-09-01') }),
    // Not on the register.
    asset('vacuum', 'Wet vacuum', 45_000, { category: 'EQUIPMENT', purchaseDate: day('2025-02-10') }),
    asset('laptop', 'Office laptop', 90_000, { category: 'IT', purchaseDate: day('2026-03-10') }),
  ];
  t.jobs = [job('mallJob', 'Mall deep clean', '2026-10-14'), job('officeJob', 'Office clean', '2026-09-02')];
  t.assetMaintenance = [
    // Before the polisher's start day: in no figure.
    repair('r0', 'polisher', '2025-11-20', 15_000),
    repair('r1', 'polisher', '2026-07-15', 4_000),
    // AE13: a repair on the vacuum from last year, before it has a rate.
    repair('r5', 'vacuum', '2025-12-03', 15_000),
  ];
  t.machineInvestors = [
    {
      id: 'inv1', assetId: 'polisher', name: 'Amina Yusuf', contributionCents: ksh(156_000), createdById: 'owner',
      createdAt: day('2026-06-01'), updatedAt: day('2026-06-01'),
    },
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /admin/machines: add a machine', () => {
  const EXTRACTOR = { name: 'Carpet extractor', purchaseDate: '2026-11-02', priceCents: ksh(140_000), dailyRateCents: ksh(2_500) };

  it('puts a new machine on the register, the company\'s own, with an empty pot and today in Nairobi as its start day', async () => {
    const added = answered(await as('owner', 'POST', MACHINES, EXTRACTOR), 201);

    expect(added).toEqual({
      id: expect.any(String), name: 'Carpet extractor', category: 'MACHINE', priceCents: ksh(140_000),
      dailyRateCents: ksh(2_500), startDay: TODAY, condition: 'GOOD', retiredAt: null,
      earnedCents: 0, repairsCents: 0, paidOutCents: 0, potCents: 0, earnBackGapCents: ksh(140_000),
      paidForItself: false, companyShareBps: 10_000, companyPartCents: 0,
      investors: [], lines: [], repairs: [], payments: [],
    });
    expect(await machine(added.id)).toEqual(added);
  });

  it('the new machine appears in the asset list with category Machine', async () => {
    const added = answered(await as('owner', 'POST', MACHINES, EXTRACTOR), 201);

    const { assets } = (await as('admin', 'GET', '/admin/finance/assets')).json();

    expect(assets.find((a: { id: string }) => a.id === added.id)).toMatchObject({
      name: 'Carpet extractor', category: 'MACHINE', purchaseDate: '2026-11-02', costCents: ksh(140_000),
      condition: 'GOOD', retiredAt: null, createdByName: 'Olive Owner',
    });
  });

  it('takes today as the purchase date when none is sent', async () => {
    const added = answered(await as('owner', 'POST', MACHINES, { ...EXTRACTOR, purchaseDate: undefined }), 201);

    expect(stored(added.id)).toMatchObject({ purchaseDate: day(TODAY) });
  });

  it('stores an earlier start day when the owner sends one', async () => {
    const added = answered(await as('owner', 'POST', MACHINES, { ...EXTRACTOR, startDay: '2026-11-02' }), 201);

    expect(added.startDay).toBe('2026-11-02');
    expect(stored(added.id)).toMatchObject({ countsFrom: day('2026-11-02') });
  });

  it('refuses a start day in the future', async () => {
    const res = await as('owner', 'POST', MACHINES, { ...EXTRACTOR, startDay: TOMORROW });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'The start day cannot be in the future.' });
    expect(t.assets).toHaveLength(5);
  });

  it.each([
    ['0', 0],
    ['below zero', ksh(-2_000)],
    ['not whole shillings', ksh(2_500) + 50],
    ['missing', undefined],
  ])('refuses a daily rate that is %s', async (_what, dailyRateCents) => {
    const res = await as('owner', 'POST', MACHINES, { ...EXTRACTOR, dailyRateCents });

    expect(res.statusCode).toBe(400);
    expect(typeof res.json().error).toBe('string');
    expect(t.assets).toHaveLength(5);
  });
});

describe('GET /admin/machines/assets and POST /admin/machines/from-asset/:assetId: give an existing asset a rate', () => {
  it('offers the assets that are not on the register, by name', async () => {
    const res = await as('owner', 'GET', `${MACHINES}/assets`);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      assets: [
        { id: 'laptop', name: 'Office laptop', category: 'IT', costCents: ksh(90_000), purchaseDate: '2026-03-10' },
        { id: 'vacuum', name: 'Wet vacuum', category: 'EQUIPMENT', costCents: ksh(45_000), purchaseDate: '2025-02-10' },
      ],
    });
  });

  it('AE13: puts the asset on the register from today, with a pot at zero and last year\'s repair in no figure', async () => {
    const given = answered(await as('owner', 'POST', fromAssetUrl('vacuum'), { dailyRateCents: ksh(1_000) }), 201);

    expect(given).toEqual({
      id: 'vacuum', name: 'Wet vacuum', category: 'EQUIPMENT', priceCents: ksh(45_000),
      dailyRateCents: ksh(1_000), startDay: TODAY, condition: 'GOOD', retiredAt: null,
      earnedCents: 0, repairsCents: 0, paidOutCents: 0, potCents: 0, earnBackGapCents: ksh(45_000),
      paidForItself: false, companyShareBps: 10_000, companyPartCents: 0,
      investors: [], lines: [], repairs: [], payments: [],
    });
    expect(stored('vacuum')).toMatchObject({ category: 'EQUIPMENT', dailyRateCents: ksh(1_000), countsFrom: day(TODAY) });
    expect((await as('owner', 'GET', `${MACHINES}/assets`)).json().assets.map((a: { id: string }) => a.id)).toEqual(['laptop']);
  });

  it('stores an earlier start day when the owner sends one, and a repair from that day on then counts', async () => {
    const given = answered(await as('owner', 'POST', fromAssetUrl('vacuum'), { dailyRateCents: ksh(1_000), startDay: '2025-12-01' }), 201);

    expect(given).toMatchObject({ startDay: '2025-12-01', repairsCents: ksh(15_000), potCents: ksh(-15_000) });
    expect(given.repairs.map((r) => r.id)).toEqual(['r5']);
  });

  it('refuses a start day in the future', async () => {
    const res = await as('owner', 'POST', fromAssetUrl('vacuum'), { dailyRateCents: ksh(1_000), startDay: TOMORROW });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'The start day cannot be in the future.' });
    expect(stored('vacuum')).toMatchObject({ dailyRateCents: null, countsFrom: null });
  });

  it.each([
    ['0', 0],
    ['below zero', ksh(-1_000)],
    ['not whole shillings', ksh(1_000) + 1],
  ])('refuses a daily rate that is %s', async (_what, dailyRateCents) => {
    const res = await as('owner', 'POST', fromAssetUrl('vacuum'), { dailyRateCents });

    expect(res.statusCode).toBe(400);
    expect(stored('vacuum')).toMatchObject({ dailyRateCents: null, countsFrom: null });
  });

  it('refuses an asset that is already on the register, and leaves its rate and start day alone', async () => {
    const res = await as('owner', 'POST', fromAssetUrl('polisher'), { dailyRateCents: ksh(9_000) });

    expect(res.statusCode).toBe(409);
    expect(stored('polisher')).toMatchObject({ dailyRateCents: ksh(2_000), countsFrom: day('2026-06-01') });
  });

  it('answers 404 for an asset that does not exist', async () => {
    const res = await as('owner', 'POST', fromAssetUrl('nope'), { dailyRateCents: ksh(1_000) });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'asset not found' });
  });
});

describe('PATCH /admin/machines/:id: change a machine', () => {
  it('changes the name and the price, and the figures follow the new price', async () => {
    const changed = answered(await as('owner', 'PATCH', machineUrl('polisher'), { name: 'Big floor polisher', priceCents: ksh(312_000) }));

    expect(changed).toMatchObject({
      name: 'Big floor polisher', priceCents: ksh(312_000), dailyRateCents: ksh(2_000), startDay: '2026-06-01',
      // KSh 312,000 plus the KSh 4,000 repair, with nothing earned yet.
      earnBackGapCents: ksh(316_000),
      // The investor's KSh 156,000 is now half the price.
      companyShareBps: 5_000,
    });
    expect(changed.investors[0]).toMatchObject({ name: 'Amina Yusuf', shareBps: 5_000 });
    expect(stored('polisher')).toMatchObject({ name: 'Big floor polisher', costCents: ksh(312_000) });
  });

  it('AE4: a new rate leaves the days already logged at the rate and the amount they were logged at', async () => {
    t.machineLines = [line('ml1', 'polisher', 'mallJob', 4, 2_000)];

    const changed = answered(await as('owner', 'PATCH', machineUrl('polisher'), { dailyRateCents: ksh(2_500) }));

    expect(changed.dailyRateCents).toBe(ksh(2_500));
    expect(changed.earnedCents).toBe(ksh(4_000));
    expect(changed.lines).toEqual([{
      id: 'ml1', jobId: 'mallJob', date: '2026-10-14', jobTitle: 'Mall deep clean', halfDays: 4,
      rateCents: ksh(2_000), amountCents: ksh(4_000), isHire: false, chargedCents: null,
    }]);
    expect(t.machineLines[0]).toMatchObject({ halfDays: 4, rateCents: ksh(2_000), amountCents: ksh(4_000) });
  });

  it.each([
    ['0', 0],
    ['below zero', ksh(-2_000)],
    ['not whole shillings', ksh(2_000) + 50],
    ['cleared', null],
  ])('refuses a daily rate that is %s', async (_what, dailyRateCents) => {
    const res = await as('owner', 'PATCH', machineUrl('polisher'), { dailyRateCents });

    expect(res.statusCode).toBe(400);
    expect(typeof res.json().error).toBe('string');
    expect(stored('polisher')).toMatchObject({ dailyRateCents: ksh(2_000), countsFrom: day('2026-06-01') });
  });

  it('retires a machine and stamps when', async () => {
    const retired = answered(await as('owner', 'PATCH', machineUrl('polisher'), { condition: 'RETIRED' }));

    expect(retired).toMatchObject({ condition: 'RETIRED', retiredAt: NOW });
  });

  it('brings a retired machine back, and a repair can still be added to a retired one', async () => {
    const repaired = answered(
      await as('owner', 'POST', repairsUrl('scrubber'), { date: '2026-11-10', description: 'New squeegee', costCents: ksh(2_000) }),
      201,
    );

    expect(repaired).toMatchObject({ condition: 'RETIRED', repairsCents: ksh(2_000), potCents: ksh(-2_000) });

    const back = answered(await as('owner', 'PATCH', machineUrl('scrubber'), { condition: 'GOOD' }));

    expect(back).toMatchObject({ condition: 'GOOD', retiredAt: null, repairsCents: ksh(2_000) });
    expect(stored('scrubber')).toMatchObject({ condition: 'GOOD', retiredAt: null });
  });

  it('refuses a price below what the investors put in', async () => {
    const res = await as('owner', 'PATCH', machineUrl('polisher'), { priceCents: ksh(150_000) });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('KSh 156,000');
    expect(stored('polisher')).toMatchObject({ costCents: ksh(260_000) });
  });

  it('accepts a price equal to what the investors put in', async () => {
    const changed = answered(await as('owner', 'PATCH', machineUrl('polisher'), { priceCents: ksh(156_000) }));

    expect(changed).toMatchObject({ priceCents: ksh(156_000), companyShareBps: 0 });
  });

  it.each(['laptop', 'nope'])('answers 404 for %s, which is not on the register', async (id) => {
    const res = await as('owner', 'PATCH', machineUrl(id), { name: 'Ghost' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_MACHINE);
    expect(stored('laptop')).toMatchObject({ name: 'Office laptop' });
  });
});

describe('PATCH /admin/machines/:id: the start day', () => {
  it('AE15: moving it earlier is accepted, and an older repair then comes out of the pot', async () => {
    t.assets.push(asset('steamer', 'Steam cleaner', 80_000, { dailyRateCents: ksh(1_000), countsFrom: day('2026-11-01') }));
    t.assetMaintenance.push(repair('r9', 'steamer', '2026-10-10', 3_000));

    expect(await machine('steamer')).toMatchObject({ startDay: '2026-11-01', repairsCents: 0, potCents: 0, repairs: [] });

    const moved = answered(await as('owner', 'PATCH', machineUrl('steamer'), { startDay: '2026-10-01' }));

    expect(moved).toMatchObject({ startDay: '2026-10-01', repairsCents: ksh(3_000), potCents: ksh(-3_000) });
    expect(moved.repairs.map((r) => r.id)).toEqual(['r9']);
  });

  it('refuses a start day later than a job that already has the machine\'s days, and names that job\'s date', async () => {
    t.machineLines = [line('ml1', 'polisher', 'mallJob', 10, 2_000), line('ml2', 'polisher', 'officeJob', 2, 2_000)];

    const res = await as('owner', 'PATCH', machineUrl('polisher'), { startDay: '2026-09-03' });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('2 Sep 2026');
    expect(stored('polisher')).toMatchObject({ countsFrom: day('2026-06-01') });
  });

  it('accepts a later start day up to the date of the earliest job with its days', async () => {
    t.machineLines = [line('ml1', 'polisher', 'mallJob', 10, 2_000), line('ml2', 'polisher', 'officeJob', 2, 2_000)];

    const moved = answered(await as('owner', 'PATCH', machineUrl('polisher'), { startDay: '2026-09-02' }));

    // The KSh 4,000 repair of 15 July is now before the start day.
    expect(moved).toMatchObject({ startDay: '2026-09-02', repairsCents: 0 });
    expect(stored('polisher')).toMatchObject({ countsFrom: day('2026-09-02') });
  });

  it('refuses a start day in the future', async () => {
    const res = await as('owner', 'PATCH', machineUrl('polisher'), { startDay: TOMORROW });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'The start day cannot be in the future.' });
    expect(stored('polisher')).toMatchObject({ countsFrom: day('2026-06-01') });
  });
});

describe('PUT /admin/machines/:id/investors: replace the investors', () => {
  it('R28: replaces the whole list, and the new shares apply to everything the machine has earned', async () => {
    logPolisherDays();

    const changed = answered(await as('owner', 'PUT', investorsUrl('polisher'), {
      investors: [
        { name: ' Amina Yusuf ', contributionCents: ksh(130_000) },
        { name: 'Brian Otieno', contributionCents: ksh(65_000) },
      ],
    }));

    // Earned KSh 10,000 less the KSh 4,000 repair: KSh 6,000 to share. Half, a quarter, and a quarter left with the company.
    expect(changed.investors).toEqual([
      {
        id: expect.any(String), name: 'Amina Yusuf', contributionCents: ksh(130_000), shareBps: 5_000,
        entitledCents: ksh(3_000), paidCents: 0, owedCents: ksh(3_000), overpaidCents: 0,
      },
      {
        id: expect.any(String), name: 'Brian Otieno', contributionCents: ksh(65_000), shareBps: 2_500,
        entitledCents: ksh(1_500), paidCents: 0, owedCents: ksh(1_500), overpaidCents: 0,
      },
    ]);
    expect(changed).toMatchObject({ companyShareBps: 2_500, companyPartCents: ksh(1_500), potCents: ksh(6_000) });
    expect(t.machineInvestors.map((i) => ({ assetId: i.assetId, name: i.name, contributionCents: i.contributionCents, createdById: i.createdById }))).toEqual([
      { assetId: 'polisher', name: 'Amina Yusuf', contributionCents: ksh(130_000), createdById: 'owner' },
      { assetId: 'polisher', name: 'Brian Otieno', contributionCents: ksh(65_000), createdById: 'owner' },
    ]);
  });

  it('an empty list makes the machine the company\'s', async () => {
    const changed = answered(await as('owner', 'PUT', investorsUrl('polisher'), { investors: [] }));

    expect(changed).toMatchObject({ investors: [], companyShareBps: 10_000 });
    expect(t.machineInvestors).toEqual([]);
  });

  it('accepts investors whose amounts add up to exactly the price', async () => {
    const changed = answered(await as('owner', 'PUT', investorsUrl('polisher'), {
      investors: [{ name: 'Amina Yusuf', contributionCents: ksh(200_000) }, { name: 'Brian Otieno', contributionCents: ksh(60_000) }],
    }));

    expect(changed.companyShareBps).toBe(0);
  });

  it('refuses investors whose amounts add up to more than the price', async () => {
    const res = await as('owner', 'PUT', investorsUrl('polisher'), {
      investors: [{ name: 'Amina Yusuf', contributionCents: ksh(200_000) }, { name: 'Brian Otieno', contributionCents: ksh(60_001) }],
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('KSh 260,001');
    expect(res.json().error).toContain('KSh 260,000');
    expect(t.machineInvestors.map((i) => i.id)).toEqual(['inv1']);
  });

  it('refuses investors on a machine with no price', async () => {
    const res = await as('owner', 'PUT', investorsUrl('sprayer'), { investors: [{ name: 'Amina Yusuf', contributionCents: ksh(1_000) }] });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/no price/);
    expect(t.machineInvestors.map((i) => i.id)).toEqual(['inv1']);
  });

  it.each([
    ['no name', { name: '  ', contributionCents: ksh(1_000) }],
    ['an amount of 0', { name: 'Brian Otieno', contributionCents: 0 }],
    ['an amount below zero', { name: 'Brian Otieno', contributionCents: ksh(-1_000) }],
  ])('refuses an investor with %s', async (_what, investor) => {
    const res = await as('owner', 'PUT', investorsUrl('polisher'), { investors: [investor] });

    expect(res.statusCode).toBe(400);
    expect(typeof res.json().error).toBe('string');
    expect(t.machineInvestors.map((i) => i.id)).toEqual(['inv1']);
  });

  it('answers 404 for an asset that is not on the register', async () => {
    const res = await as('owner', 'PUT', investorsUrl('laptop'), { investors: [{ name: 'Amina Yusuf', contributionCents: ksh(1_000) }] });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_MACHINE);
    expect(t.machineInvestors.map((i) => i.id)).toEqual(['inv1']);
  });
});

describe('R7: once an investor has been paid', () => {
  beforeEach(() => {
    // Earned KSh 50,000 less the KSh 4,000 repair: the investor's 60% is KSh 27,600, of which KSh 15,000 is paid.
    t.machineLines = [line('ml1', 'polisher', 'mallJob', 50, 2_000)];
    payAmina();
  });

  const lockedChanges: [string, 'PATCH' | 'PUT', string, object][] = [
    ['the price', 'PATCH', machineUrl('polisher'), { priceCents: ksh(280_000) }],
    ['the start day', 'PATCH', machineUrl('polisher'), { startDay: '2026-05-01' }],
    ['an investor\'s amount', 'PUT', investorsUrl('polisher'), { investors: [{ name: 'Amina Yusuf', contributionCents: ksh(130_000) }] }],
  ];

  it.each(lockedChanges)('AE11: a change of %s is refused with a message naming the payment', async (_what, method, url, body) => {
    const res = await as('owner', method, url, body);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('Amina Yusuf');
    expect(res.json().error).toContain('KSh 15,000');
    expect(res.json().error).toContain('5 Nov 2026');
    expect(res.json().error).toMatch(/Delete that payment/);
    expect(stored('polisher')).toMatchObject({ costCents: ksh(260_000), countsFrom: day('2026-06-01') });
    expect(t.machineInvestors).toEqual([expect.objectContaining({ id: 'inv1', contributionCents: ksh(156_000) })]);
  });

  it.each(lockedChanges)('AE11: after the payment is deleted, a change of %s is accepted', async (_what, method, url, body) => {
    t.machinePayouts = [];

    expect((await as('owner', method, url, body)).statusCode).toBe(200);
  });

  it('with several payments the message counts them and names the latest', async () => {
    t.machinePayouts.push(payment('p2', 'inv1', '2026-11-12', 5_000));

    const res = await as('owner', 'PATCH', machineUrl('polisher'), { priceCents: ksh(280_000) });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('2 payments');
    expect(res.json().error).toContain('KSh 5,000');
    expect(res.json().error).toContain('12 Nov 2026');
  });

  it('the name, the rate and the condition can still be changed, and the price and start day sent as they are', async () => {
    const changed = answered(await as('owner', 'PATCH', machineUrl('polisher'), {
      name: 'Big floor polisher', dailyRateCents: ksh(2_500), condition: 'FAIR', priceCents: ksh(260_000), startDay: '2026-06-01',
    }));

    expect(changed).toMatchObject({
      name: 'Big floor polisher', dailyRateCents: ksh(2_500), condition: 'FAIR', priceCents: ksh(260_000), startDay: '2026-06-01',
    });
  });
});

describe('POST /admin/machines/:id/repairs and DELETE /admin/machines/:id/repairs/:repairId', () => {
  it('adds a repair, and it comes out of the pot', async () => {
    logPolisherDays();

    const repaired = answered(
      await as('owner', 'POST', repairsUrl('polisher'), {
        date: '2026-11-03', description: 'New brushes', costCents: ksh(3_000), performedBy: 'Kamau Motors', receiptRef: 'RCPT-0042',
      }),
      201,
    );

    // Earned KSh 10,000, less the KSh 4,000 repair and this one.
    expect(repaired).toMatchObject({ repairsCents: ksh(7_000), potCents: ksh(3_000) });
    expect(repaired.repairs[0]).toEqual({
      id: expect.any(String), date: '2026-11-03', description: 'New brushes', costCents: ksh(3_000),
      performedBy: 'Kamau Motors', receiptRef: 'RCPT-0042',
    });
    expect(t.assetMaintenance.at(-1)).toMatchObject({ assetId: 'polisher', date: day('2026-11-03'), createdById: 'owner' });
  });

  it('accepts a repair dated on the start day itself', async () => {
    const repaired = answered(
      await as('owner', 'POST', repairsUrl('polisher'), { date: '2026-06-01', description: 'Service', costCents: ksh(1_000) }),
      201,
    );

    expect(repaired.repairsCents).toBe(ksh(5_000));
  });

  it('refuses a repair dated before the start day, and names that day', async () => {
    const res = await as('owner', 'POST', repairsUrl('polisher'), { date: '2026-05-31', description: 'Service', costCents: ksh(1_000) });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('1 Jun 2026');
    expect(t.assetMaintenance).toHaveLength(3);
  });

  it('answers 404 when the asset is not on the register', async () => {
    const res = await as('owner', 'POST', repairsUrl('laptop'), { date: '2026-11-03', description: 'Screen replaced', costCents: ksh(7_000) });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_MACHINE);
    expect(t.assetMaintenance).toHaveLength(3);
  });

  it('deleting a repair raises the pot by its cost', async () => {
    logPolisherDays();

    expect(await machine('polisher')).toMatchObject({ repairsCents: ksh(4_000), potCents: ksh(6_000) });

    const after = answered(await as('owner', 'DELETE', repairUrl('polisher', 'r1')));

    expect(after).toMatchObject({ repairsCents: 0, potCents: ksh(10_000), repairs: [] });
    expect(t.assetMaintenance.map((r) => r.id)).toEqual(['r0', 'r5']);
  });

  it('answers 404 for a repair of another asset, and leaves it there', async () => {
    const res = await as('owner', 'DELETE', repairUrl('polisher', 'r5'));

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'repair not found' });
    expect(t.assetMaintenance).toHaveLength(3);
  });
});

describe('DELETE /admin/machines/:id', () => {
  it('deletes a machine with investors and no lines or payments, and its investors go with it', async () => {
    const res = await as('owner', 'DELETE', machineUrl('polisher'));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(stored('polisher')).toBeUndefined();
    expect(t.machineInvestors).toEqual([]);
    expect((await as('admin', 'GET', '/admin/finance/assets')).json().assets.map((a: { id: string }) => a.id)).not.toContain('polisher');
  });

  it('AE10: refuses to delete a machine with one line, and says to retire it', async () => {
    t.machineLines = [line('ml1', 'polisher', 'mallJob', 2, 2_000)];

    const res = await as('owner', 'DELETE', machineUrl('polisher'));

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/days logged on 1 job/);
    expect(res.json().error).toMatch(/Retire it instead/);
    expect(stored('polisher')).toBeDefined();
    expect(t.machineInvestors).toHaveLength(1);
  });

  it('refuses to delete a machine whose investors have been paid, and says to retire it', async () => {
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-05', 15_000), payment('p2', 'inv1', '2026-11-12', 5_000)];

    const res = await as('owner', 'DELETE', machineUrl('polisher'));

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/2 payments to its investors/);
    expect(res.json().error).toMatch(/Retire it instead/);
    expect(stored('polisher')).toBeDefined();
  });

  it('answers 404 for an asset that is not on the register, and leaves it in the asset list', async () => {
    const res = await as('owner', 'DELETE', machineUrl('laptop'));

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_MACHINE);
    expect(stored('laptop')).toBeDefined();
  });
});

describe.each(['coo', 'admin'])('R22: %s, who sees the register and is not the owner', (userId) => {
  it.each<[string, 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', string, object?]>([
    ['list the assets to put on the register', 'GET', `${MACHINES}/assets`],
    ['add a machine', 'POST', MACHINES, { name: 'Carpet extractor', purchaseDate: '2026-11-02', priceCents: ksh(140_000), dailyRateCents: ksh(2_500) }],
    ['give an asset a rate', 'POST', fromAssetUrl('vacuum'), { dailyRateCents: ksh(1_000) }],
    ['change a machine', 'PATCH', machineUrl('polisher'), { name: 'Mine now', dailyRateCents: ksh(9_000) }],
    ['replace the investors', 'PUT', investorsUrl('polisher'), { investors: [] }],
    ['add a repair', 'POST', repairsUrl('polisher'), { date: '2026-11-03', description: 'New brushes', costCents: ksh(3_000) }],
    ['delete a repair', 'DELETE', repairUrl('polisher', 'r1')],
    ['delete a machine', 'DELETE', machineUrl('polisher')],
  ])('cannot %s', async (_what, method, url, body) => {
    const before = JSON.stringify([t.assets, t.assetMaintenance, t.machineInvestors]);

    const res = await as(userId, method, url, body);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(NOT_THE_OWNER);
    expect(JSON.stringify([t.assets, t.assetMaintenance, t.machineInvestors])).toBe(before);
  });
});
