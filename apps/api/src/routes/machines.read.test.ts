import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineDetailDto, MachineRegisterDto } from '@onyxhawk/types';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// The machine register is read by the owner, the admin, the financial manager,
// the COO and back-office accounts linked to a current shareholder record.
// These tests cover who gets in, what the register and one machine hold, and
// what a hire's line leaves out for everyone but the owner.

/** A date as the database gives a start day, a job's date or a repair's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
/** Whole shillings to cents. */
const ksh = (shillings: number) => shillings * 100;

const REGISTER = '/admin/machines';
const ACCESS = '/admin/machines/access';
const machineUrl = (id: string) => `/admin/machines/${id}`;

const REFUSED = { error: 'machine register access required (owner, admin, financial manager, COO or a current shareholder)' };

// What the jobs and the assets hold that the register never serves, and the
// hire customer's name, which only the owner is sent.
const PRIVATE = {
  hirePhone: '+254711000999',
  hireLocation: 'Kilimani, Ring Road',
  hireNotes: 'pays on collection',
  jobClient: 'Acme Developers Ltd',
  jobPhone: '+254700111222',
  jobLocation: 'Westlands, Mpaka Road',
  jobNotes: 'gate code 4411',
  assetSupplier: 'Nairobi Machines Ltd',
  assetSerial: 'SN-88213',
  assetNotes: 'bought on credit',
};
const HIRE_CUSTOMER = 'Jane Wanjiru';
// An older row: a hire's job used to be titled after its customer too. A new one is "Hire: <machine>".
const HIRE_TITLE = 'Hire: Floor polisher to Jane Wanjiru';

const holder = (id: string, name: string, over: object = {}) => ({
  id, name, title: null, kind: 'INDIVIDUAL', basisPoints: 2500, notes: null, userId: null, sortOrder: 0, removedAt: null,
  createdAt: day('2026-07-15'), updatedAt: day('2026-07-15'), ...over,
});

const asset = (id: string, name: string, priceShillings: number, over: object = {}) => ({
  id, name, category: 'MACHINE', purchaseDate: day('2026-05-20'), costCents: ksh(priceShillings),
  supplier: PRIVATE.assetSupplier, serialNumber: PRIVATE.assetSerial, location: null, usefulLifeMonths: null,
  salvageValueCents: 0, condition: 'GOOD', retiredAt: null, notes: PRIVATE.assetNotes, receiptRef: null,
  receiptUrl: null, dailyRateCents: null, countsFrom: null, createdById: 'owner',
  createdAt: day('2026-05-20'), updatedAt: day('2026-05-20'), ...over,
});

const job = (id: string, title: string, ymd: string, incomeShillings: number, over: object = {}) => ({
  id, title, date: day(ymd), incomeCents: ksh(incomeShillings), discountCents: 0, status: 'OWNER_ENTRY',
  placement: 'STANDALONE', projectId: null, clientName: PRIVATE.jobClient, clientPhone: PRIVATE.jobPhone,
  clientLocation: PRIVATE.jobLocation, notes: PRIVATE.jobNotes, serviceLineCode: null, region: null,
  clientSegment: null, createdById: 'owner', reportedById: null, createdAt: day(ymd), ...over,
});

/** Days of a machine on a job, logged on 10 November whatever the job's date. */
const line = (id: string, assetId: string, jobId: string, halfDays: number, rateShillings: number, over: object = {}) => ({
  id, assetId, jobId, halfDays, rateCents: ksh(rateShillings), amountCents: (halfDays * ksh(rateShillings)) / 2,
  isHire: false, createdById: 'owner', createdAt: new Date('2026-11-10T08:00:00.000Z'),
  updatedAt: new Date('2026-11-10T08:00:00.000Z'), ...over,
});

const repair = (id: string, assetId: string, ymd: string, shillings: number, over: object = {}) => ({
  id, assetId, date: day(ymd), description: `Repair ${id}`, costCents: ksh(shillings), performedBy: null,
  receiptRef: null, createdById: 'owner', createdAt: day(ymd), ...over,
});

const payment = (id: string, investorId: string, ymd: string, shillings: number, reference: string | null = null) => ({
  id, investorId, date: day(ymd), amountCents: ksh(shillings), reference, createdById: 'owner', createdAt: day(ymd),
});

async function register(userId = 'owner'): Promise<MachineRegisterDto> {
  const res = await as(userId, 'GET', REGISTER);
  expect(res.statusCode).toBe(200);
  return res.json().register;
}

async function machine(id: string, userId = 'owner'): Promise<MachineDetailDto> {
  const res = await as(userId, 'GET', machineUrl(id));
  expect(res.statusCode).toBe(200);
  return res.json().machine;
}

// AE3's machine as the register sends it: priced KSh 260,000, one investor put
// in KSh 156,000, it has earned KSh 50,000 and had KSh 10,000 of repairs since
// its start day. Every figure is written out here, not worked out.
const POLISHER_ROW = {
  id: 'polisher', name: 'Floor polisher', category: 'MACHINE', priceCents: ksh(260_000), dailyRateCents: ksh(2_000),
  startDay: '2026-06-01', condition: 'GOOD', retiredAt: null,
  earnedCents: ksh(50_000), repairsCents: ksh(10_000), paidOutCents: 0, potCents: ksh(40_000),
  earnBackGapCents: ksh(220_000), paidForItself: false, companyShareBps: 4000, companyPartCents: ksh(16_000),
  investors: [{
    id: 'inv1', name: 'Amina Yusuf', contributionCents: ksh(156_000), shareBps: 6000,
    entitledCents: ksh(24_000), paidCents: 0, owedCents: ksh(24_000), overpaidCents: 0,
  }],
};

// The company's own scrubber, retired: priced KSh 120,000, earned KSh 3,000, one KSh 1,000 repair.
const SCRUBBER_ROW = {
  id: 'scrubber', name: 'Auto scrubber', category: 'EQUIPMENT', priceCents: ksh(120_000), dailyRateCents: ksh(1_500),
  startDay: '2026-08-01', condition: 'RETIRED', retiredAt: '2026-11-01T09:30:00.000Z',
  earnedCents: ksh(3_000), repairsCents: ksh(1_000), paidOutCents: 0, potCents: ksh(2_000),
  earnBackGapCents: ksh(118_000), paidForItself: false, companyShareBps: 10_000, companyPartCents: ksh(2_000),
  investors: [],
};

const MALL_LINE = {
  id: 'ml1', jobId: 'mallJob', date: '2026-10-14', jobTitle: 'Mall deep clean', halfDays: 30, rateCents: ksh(2_000),
  amountCents: ksh(30_000), isHire: false, chargedCents: null,
};
// A 10-day hire: KSh 25,000 typed with KSh 1,000 off, so KSh 24,000 charged.
const HIRE_LINE = {
  id: 'ml2', jobId: 'hireJob', date: '2026-11-03', halfDays: 20, rateCents: ksh(2_000), amountCents: ksh(20_000),
  isHire: true, chargedCents: ksh(24_000),
};

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [
    { id: 'owner', fullName: 'Olive Owner', role: 'ADMIN', isOwner: true },
    { id: 'admin', fullName: 'Adam Admin', role: 'ADMIN', isOwner: false },
    { id: 'finance', fullName: 'Faith Finance', role: 'FINANCIAL_MANAGER', isOwner: false },
    { id: 'coo', fullName: 'Carol Coo', role: 'COO', isOwner: false },
    { id: 'support', fullName: 'Sue Support', role: 'SUPPORT', isOwner: false },
    { id: 'marketing', fullName: 'Mark Marketing', role: 'MARKETING', isOwner: false },
    { id: 'supervisor', fullName: 'Sam Supervisor', role: 'CLEANING_SUPERVISOR', isOwner: false },
    // The Shareholder role with no shareholder record behind it.
    { id: 'shareholderRole', fullName: 'Shah Shareholder', role: 'SHAREHOLDER', isOwner: false },
    { id: 'linkedSupervisor', fullName: 'Lina Supervisor', role: 'CLEANING_SUPERVISOR', isOwner: false },
    { id: 'linkedShareholder', fullName: 'Brian Otieno', role: 'SHAREHOLDER', isOwner: false },
    // Still linked to a shareholder record, and that record is removed.
    { id: 'removedHolder', fullName: 'Rita Removed', role: 'SHAREHOLDER', isOwner: false },
    // Removed from the staff: the role is back to customer and the shareholder link is still there.
    { id: 'formerStaff', fullName: 'Fred Former', role: 'CUSTOMER', isOwner: false },
    // Signed in as ADMIN, since made support in the database.
    { id: 'demoted', fullName: 'Dan Demoted', role: 'SUPPORT', isOwner: false, tokenRole: 'ADMIN' },
    { id: 'crew', fullName: 'Chris Crew', role: 'CREW', isOwner: false },
    { id: 'customer', fullName: 'Cate Customer', role: 'CUSTOMER', isOwner: false },
  ];
  t.shareholders = [
    holder('h1', 'Lina Supervisor', { userId: 'linkedSupervisor' }),
    holder('h2', 'Brian Otieno', { userId: 'linkedShareholder' }),
    holder('h3', 'Rita Removed', { userId: 'removedHolder', removedAt: day('2026-11-01') }),
    holder('h4', 'Fred Former', { userId: 'formerStaff' }),
  ];
  // Seeded out of name order.
  t.assets = [
    asset('polisher', 'Floor polisher', 260_000, { dailyRateCents: ksh(2_000), countsFrom: day('2026-06-01') }),
    asset('laptop', 'Office laptop', 90_000, { category: 'IT' }),
    asset('scrubber', 'Auto scrubber', 120_000, {
      category: 'EQUIPMENT', dailyRateCents: ksh(1_500), countsFrom: day('2026-08-01'), condition: 'RETIRED',
      retiredAt: new Date('2026-11-01T09:30:00.000Z'),
    }),
  ];
  t.jobs = [
    job('mallJob', 'Mall deep clean', '2026-10-14', 100_000),
    job('hireJob', HIRE_TITLE, '2026-11-03', 25_000, {
      discountCents: ksh(1_000), clientName: HIRE_CUSTOMER, clientPhone: PRIVATE.hirePhone,
      clientLocation: PRIVATE.hireLocation, notes: PRIVATE.hireNotes,
    }),
    job('officeJob', 'Office clean', '2026-09-02', 40_000),
  ];
  // The older line first, so "newest first" is the route's doing.
  t.machineLines = [
    line('ml1', 'polisher', 'mallJob', 30, 2_000),
    line('ml2', 'polisher', 'hireJob', 20, 2_000, { isHire: true }),
    line('ml3', 'scrubber', 'officeJob', 4, 1_500),
  ];
  t.assetMaintenance = [
    // Before the polisher's start day: in no figure and not listed.
    repair('r0', 'polisher', '2025-11-20', 15_000),
    repair('r1', 'polisher', '2026-07-15', 4_000, { performedBy: 'Kamau Motors', receiptRef: 'RCPT-0042' }),
    repair('r2', 'polisher', '2026-09-20', 6_000),
    repair('r3', 'scrubber', '2026-08-01', 1_000),
    repair('r4', 'laptop', '2026-09-01', 2_500),
  ];
  t.machineInvestors = [
    {
      id: 'inv1', assetId: 'polisher', name: 'Amina Yusuf', contributionCents: ksh(156_000), createdById: 'owner',
      createdAt: day('2026-06-01'), updatedAt: day('2026-06-01'),
    },
  ];
});

describe.each([REGISTER, machineUrl('polisher')])('who may open %s', (url) => {
  it.each(['owner', 'admin', 'finance', 'coo', 'linkedSupervisor', 'linkedShareholder'])('lets %s in', async (userId) => {
    expect((await as(userId, 'GET', url)).statusCode).toBe(200);
  });

  it.each([
    'support', 'marketing', 'supervisor', 'shareholderRole', 'removedHolder', 'formerStaff', 'crew', 'customer',
  ])('refuses %s', async (userId) => {
    const res = await as(userId, 'GET', url);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(REFUSED);
  });

  it('refuses a user whose token says admin but whose record now says support', async () => {
    const res = await as('demoted', 'GET', url);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(REFUSED);
  });

  it('lets a shareholder in until their record is removed', async () => {
    expect((await as('linkedShareholder', 'GET', url)).statusCode).toBe(200);

    Object.assign(t.shareholders.find((s) => s.id === 'h2')!, { removedAt: day('2026-11-16') });

    expect((await as('linkedShareholder', 'GET', url)).statusCode).toBe(403);
  });
});

describe('GET /admin/machines/access', () => {
  it.each([
    ['owner', { canView: true, canEdit: true }],
    ['admin', { canView: true, canEdit: false }],
    ['finance', { canView: true, canEdit: false }],
    ['coo', { canView: true, canEdit: false }],
    ['linkedSupervisor', { canView: true, canEdit: false }],
    ['support', { canView: false, canEdit: false }],
    ['supervisor', { canView: false, canEdit: false }],
    ['shareholderRole', { canView: false, canEdit: false }],
    ['removedHolder', { canView: false, canEdit: false }],
    // The token says admin; the answer follows the database, which says support.
    ['demoted', { canView: false, canEdit: false }],
  ])('tells %s what the page may show, and never refuses a back-office account', async (userId, access) => {
    const res = await as(userId, 'GET', ACCESS);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ access });
  });

  it.each(['crew', 'customer', 'formerStaff'])('refuses %s, who has no back-office sign-in', async (userId) => {
    const res = await as(userId, 'GET', ACCESS);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'admin access required' });
  });
});

describe('GET /admin/machines', () => {
  it('AE3: lists each machine on the register by name, with its pot and what each investor is owed', async () => {
    expect((await register()).machines).toEqual([SCRUBBER_ROW, POLISHER_ROW]);
  });

  it('adds the rows up in the totals', async () => {
    expect((await register()).totals).toEqual({
      priceCents: ksh(380_000), earnedCents: ksh(53_000), repairsCents: ksh(11_000), paidOutCents: 0, potCents: ksh(42_000),
    });
  });

  it('AE3: after KSh 20,000 of payments the investor is owed KSh 4,000 and the pot holds KSh 20,000', async () => {
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-05', 15_000), payment('p2', 'inv1', '2026-11-12', 5_000)];

    const { machines, totals } = await register();

    expect(machines[1]).toEqual({
      ...POLISHER_ROW,
      paidOutCents: ksh(20_000),
      potCents: ksh(20_000),
      investors: [{ ...POLISHER_ROW.investors[0], paidCents: ksh(20_000), owedCents: ksh(4_000) }],
    });
    expect(totals).toMatchObject({ paidOutCents: ksh(20_000), potCents: ksh(22_000) });
  });

  it('sends a viewer the same figures as the owner', async () => {
    expect(await register('coo')).toEqual(await register('owner'));
  });

  it('leaves out an asset with no daily rate', async () => {
    expect((await register()).machines.map((m) => m.id)).toEqual(['scrubber', 'polisher']);
  });

  it('is an empty register with zero totals when no asset has a daily rate', async () => {
    t.assets = [asset('laptop', 'Office laptop', 90_000, { category: 'IT' })];

    expect(await register()).toEqual({
      machines: [],
      totals: { priceCents: 0, earnedCents: 0, repairsCents: 0, paidOutCents: 0, potCents: 0 },
    });
  });
});

describe('GET /admin/machines/:id', () => {
  it('gives the owner the machine with its lines, its repairs from the start day and its payments, each newest first', async () => {
    t.machinePayouts = [
      payment('p1', 'inv1', '2026-11-05', 15_000, 'QK7XLP2M4B'),
      payment('p2', 'inv1', '2026-11-12', 5_000),
    ];

    expect(await machine('polisher')).toEqual({
      ...POLISHER_ROW,
      paidOutCents: ksh(20_000),
      potCents: ksh(20_000),
      investors: [{ ...POLISHER_ROW.investors[0], paidCents: ksh(20_000), owedCents: ksh(4_000) }],
      lines: [{ ...HIRE_LINE, jobTitle: HIRE_TITLE, customerName: HIRE_CUSTOMER }, MALL_LINE],
      repairs: [
        { id: 'r2', date: '2026-09-20', description: 'Repair r2', costCents: ksh(6_000), performedBy: null, receiptRef: null },
        { id: 'r1', date: '2026-07-15', description: 'Repair r1', costCents: ksh(4_000), performedBy: 'Kamau Motors', receiptRef: 'RCPT-0042' },
      ],
      payments: [
        { id: 'p2', investorId: 'inv1', date: '2026-11-12', amountCents: ksh(5_000), reference: null },
        { id: 'p1', investorId: 'inv1', date: '2026-11-05', amountCents: ksh(15_000), reference: 'QK7XLP2M4B' },
      ],
    });
  });

  it('gives a company machine with no investors empty investors and payments', async () => {
    expect(await machine('scrubber')).toEqual({
      ...SCRUBBER_ROW,
      lines: [{
        id: 'ml3', jobId: 'officeJob', date: '2026-09-02', jobTitle: 'Office clean', halfDays: 4, rateCents: ksh(1_500),
        amountCents: ksh(3_000), isHire: false, chargedCents: null,
      }],
      // Dated on the start day itself: it counts.
      repairs: [{ id: 'r3', date: '2026-08-01', description: 'Repair r3', costCents: ksh(1_000), performedBy: null, receiptRef: null }],
      payments: [],
    });
  });

  it('R31: a viewer who is not the owner gets a hire with its date, days and amounts, titled "Hire", and no customer', async () => {
    const { lines } = await machine('polisher', 'coo');

    expect(lines).toEqual([{ ...HIRE_LINE, jobTitle: 'Hire' }, MALL_LINE]);
    expect(lines[0]).not.toHaveProperty('customerName');
  });

  it.each(['admin', 'finance', 'coo', 'linkedSupervisor', 'linkedShareholder'])(
    'R31: the hire customer is nowhere in what %s is sent',
    async (userId) => {
      const res = await as(userId, 'GET', machineUrl('polisher'));

      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain(HIRE_CUSTOMER);
      expect(res.body).not.toMatch(/customerName/);
    },
  );

  describe('when a second machine has days on the hire\'s job', () => {
    // One day of the scrubber on the polisher's hire job, whose older title still names the customer.
    const ON_HIRE_JOB = {
      id: 'ml4', jobId: 'hireJob', date: '2026-11-03', halfDays: 2, rateCents: ksh(1_500), amountCents: ksh(1_500),
      isHire: false, chargedCents: null,
    };

    beforeEach(() => {
      t.machineLines.push(line('ml4', 'scrubber', 'hireJob', 2, 1_500));
    });

    it.each(['admin', 'finance', 'coo', 'linkedSupervisor', 'linkedShareholder'])(
      'R31: %s opens the second machine and is sent that job as "Hire", with the customer nowhere',
      async (userId) => {
        const res = await as(userId, 'GET', machineUrl('scrubber'));

        expect(res.statusCode).toBe(200);
        expect(res.body).not.toContain(HIRE_CUSTOMER);
        expect(res.body).not.toMatch(/customerName/);
        expect(res.json().machine.lines[0]).toEqual({ ...ON_HIRE_JOB, jobTitle: 'Hire' });
      },
    );

    it('the owner is sent the job\'s title on the second machine, and the customer on the hire itself', async () => {
      expect((await machine('scrubber')).lines[0]).toEqual({ ...ON_HIRE_JOB, jobTitle: HIRE_TITLE });
      expect((await machine('polisher')).lines[0]).toMatchObject({ id: 'ml2', isHire: true, customerName: HIRE_CUSTOMER });
    });

    it('R11: only the owner\'s hire lists the second machine, whose days go when the hire is removed', async () => {
      expect((await machine('polisher')).lines[0]).toEqual({
        ...HIRE_LINE, jobTitle: HIRE_TITLE, customerName: HIRE_CUSTOMER,
        otherMachines: [{ machineName: 'Auto scrubber', halfDays: 2, amountCents: ksh(1_500) }],
      });

      const res = await as('coo', 'GET', machineUrl('polisher'));

      expect(res.json().machine.lines[0]).toEqual({ ...HIRE_LINE, jobTitle: 'Hire' });
      expect(res.body).not.toMatch(/otherMachines/);
    });
  });

  it('answers 404 for an asset with no daily rate', async () => {
    const res = await as('owner', 'GET', machineUrl('laptop'));

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'machine not found' });
  });

  it('answers 404 for a machine that does not exist', async () => {
    expect((await as('owner', 'GET', machineUrl('nope'))).statusCode).toBe(404);
  });
});

describe('what the answers leave out', () => {
  it.each(['owner', 'coo'])('no answer to %s holds a phone number, a location, notes or a job client', async (userId) => {
    for (const url of [REGISTER, machineUrl('polisher'), machineUrl('scrubber')]) {
      const res = await as(userId, 'GET', url);

      expect(res.statusCode).toBe(200);
      expect(res.body).not.toMatch(/clientName|clientPhone|clientLocation|notes|supplier|serialNumber/i);
      for (const value of Object.values(PRIVATE)) expect(res.body).not.toContain(value);
    }
  });

  it('the register itself names no hire customer, even for the owner', async () => {
    const res = await as('owner', 'GET', REGISTER);

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(HIRE_CUSTOMER);
  });
});
