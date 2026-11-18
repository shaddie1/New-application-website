import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinancialSummary, JobDto, MachineDetailDto, MachineJobPickerDto, MachineRegisterDto } from '@onyxhawk/types';

import { as, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// What a machine earns and what its investors are paid: the owner's job
// picker, days logged on a job, hires to an outside customer, and payments to
// an investor, each with its correction and its removal. Nobody else does any
// of it. Every expected figure is written out here, not worked out.

/** A date as the database gives a start day, a job's date or a repair's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
/** Whole shillings to cents. */
const ksh = (shillings: number) => shillings * 100;

// Half past one in the morning of 18 November in Nairobi.
const NOW = '2026-11-17T22:30:00.000Z';

const MACHINES = '/admin/machines';
const machineUrl = (id: string) => `${MACHINES}/${id}`;
const pickerUrl = (id: string, search?: string) =>
  `${MACHINES}/${id}/jobs${search === undefined ? '' : `?search=${encodeURIComponent(search)}`}`;
const linesUrl = (id: string) => `${MACHINES}/${id}/lines`;
const lineUrl = (lineId: string) => `${MACHINES}/lines/${lineId}`;
const hiresUrl = (id: string) => `${MACHINES}/${id}/hires`;
const hireUrl = (lineId: string) => `${MACHINES}/hires/${lineId}`;
const payoutsUrl = (id: string) => `${MACHINES}/${id}/payouts`;
const payoutUrl = (payoutId: string) => `${MACHINES}/payouts/${payoutId}`;

const OCTOBER = 'from=2026-10-01&to=2026-10-31';
const NOVEMBER = 'from=2026-11-01&to=2026-11-30';

const NOT_THE_OWNER = { error: 'only the owner can change the machine register' };
const NO_MACHINE = { error: 'machine not found' };

// What the jobs hold that the picker never serves.
const PRIVATE = {
  client: 'Acme Developers Ltd',
  phone: '+254700111222',
  location: 'Westlands, Mpaka Road',
  notes: 'gate code 4411',
};

const holder = (id: string, name: string, over: object = {}) => ({
  id, name, title: null, kind: 'INDIVIDUAL', basisPoints: 2500, notes: null, userId: null, sortOrder: 0, removedAt: null,
  createdAt: day('2026-07-15'), updatedAt: day('2026-07-15'), ...over,
});

const asset = (id: string, name: string, priceShillings: number, over: object = {}) => ({
  id, name, category: 'MACHINE', purchaseDate: day('2026-05-20'), costCents: ksh(priceShillings),
  supplier: null, serialNumber: null, location: null, usefulLifeMonths: null, salvageValueCents: 0,
  condition: 'GOOD', retiredAt: null, notes: null, receiptRef: null, receiptUrl: null,
  projectRateCents: null, hireRateCents: null, hireRateReviewedAt: null, countsFrom: null, createdById: 'owner',
  createdAt: day('2026-05-20'), updatedAt: day('2026-05-20'), ...over,
});

const job = (id: string, title: string, ymd: string, incomeShillings: number, over: object = {}) => ({
  id, title, date: day(ymd), incomeCents: ksh(incomeShillings), discountCents: 0, status: 'OWNER_ENTRY',
  placement: 'STANDALONE', projectId: null, clientName: PRIVATE.client, clientPhone: PRIVATE.phone,
  clientLocation: PRIVATE.location, notes: PRIVATE.notes, serviceLineCode: null, region: null,
  clientSegment: null, createdById: 'owner', reportedById: null, createdAt: day(ymd), ...over,
});

const cost = (id: string, jobId: string, category: string, shillings: number, ymd: string) => ({
  id, jobId, bookingId: null, category, amountCents: ksh(shillings), description: null, date: day(ymd),
  createdAt: day(ymd), createdById: 'owner',
});

/** Days of a machine on a job, logged on 10 November whatever the job's date. */
const line = (id: string, assetId: string, jobId: string, halfDays: number, rateShillings: number, over: object = {}) => ({
  id, assetId, jobId, halfDays, rateCents: ksh(rateShillings), amountCents: (halfDays * ksh(rateShillings)) / 2,
  isHire: false, standardRateCents: null, hirePaidOn: null, hirePaymentRef: null,
  createdById: 'owner', createdAt: new Date('2026-11-10T08:00:00.000Z'),
  updatedAt: new Date('2026-11-10T08:00:00.000Z'), ...over,
});

const repair = (id: string, assetId: string, ymd: string, shillings: number) => ({
  id, assetId, date: day(ymd), description: `Repair ${id}`, costCents: ksh(shillings), performedBy: null,
  receiptRef: null, createdById: 'owner', createdAt: day(ymd),
});

const payment = (id: string, investorId: string, ymd: string, shillings: number) => ({
  id, investorId, date: day(ymd), amountCents: ksh(shillings), reference: null, createdById: 'owner', createdAt: day(ymd),
});

/** One shareholder's line of a declared payout. */
const payoutLine = (id: string, label: string, start: string, end: string, shareholderId: string, status: string) => ({
  id, label, periodStart: day(start), periodEnd: day(end), shareholderId, netProfitCents: ksh(400_000),
  basisPoints: 5000, amountCents: ksh(200_000), status, paidAt: null, reference: null, notes: null,
  createdById: 'owner', createdAt: day('2026-11-12'), updatedAt: day('2026-11-12'),
});

type Answer = { statusCode: number; json: () => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The machine a write answered with, after checking the status. */
function answered(res: Answer, status = 200): MachineDetailDto {
  expect(res.statusCode).toBe(status);
  return res.json().machine;
}

/** A refusal's message, after checking the status. */
function refused(res: Answer, status: number): string {
  expect(res.statusCode).toBe(status);
  expect(typeof res.json().error).toBe('string');
  return res.json().error;
}

async function machine(id: string): Promise<MachineDetailDto> {
  return answered(await as('owner', 'GET', machineUrl(id)));
}

async function picker(id: string, search?: string): Promise<MachineJobPickerDto> {
  const res = await as('owner', 'GET', pickerUrl(id, search));
  expect(res.statusCode).toBe(200);
  return res.json().picker;
}

/** Jobs & costs for a date range, as the owner's page loads it. */
async function jobsIn(range: string): Promise<JobDto[]> {
  const res = await as('owner', 'GET', `/admin/financials/jobs?${range}`);
  expect(res.statusCode).toBe(200);
  return res.json().jobs;
}

async function summaryOf(range: string): Promise<FinancialSummary> {
  const res = await as('owner', 'GET', `/admin/financials/summary?${range}`);
  expect(res.statusCode).toBe(200);
  return res.json().summary;
}

// AE2: three days of the scrubber, hired out from 3 November for KSh 10,500.
const JANE_HIRE = { customerName: 'Jane Wanjiru', startDate: '2026-11-03', halfDays: 6, chargedCents: ksh(10_500) };

const logHire = async (machineId = 'scrubber', body: object = JANE_HIRE) =>
  answered(await as('owner', 'POST', hiresUrl(machineId), body), 201);

/** The one-off jobs that hires made. */
const hireJobs = () => t.jobs.filter((j) => j.title.startsWith('Hire:'));
const hireLineId = (m: MachineDetailDto) => m.lines.find((l) => l.isHire)!.id;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
  resetDb();
  t.users = [
    { id: 'owner', fullName: 'Olive Owner', role: 'ADMIN', isOwner: true },
    { id: 'admin', fullName: 'Adam Admin', role: 'ADMIN', isOwner: false },
    { id: 'coo', fullName: 'Carol Coo', role: 'COO', isOwner: false },
    { id: 'sup', fullName: 'Achieng Otieno', role: 'CLEANING_SUPERVISOR', isOwner: false },
    // A supervisor whose sign-in is linked to a current shareholder record: sees the register, changes nothing.
    { id: 'linkedSupervisor', fullName: 'Lina Supervisor', role: 'CLEANING_SUPERVISOR', isOwner: false },
  ];
  t.shareholders = [holder('h1', 'Lina Supervisor', { userId: 'linkedSupervisor' }), holder('h2', 'Brian Otieno')];
  t.projects = [{ id: 'pA', title: 'Bank branch' }];
  t.assets = [
    // AE1 to AE3: KSh 2,000 a day since 1 June, priced KSh 260,000, of which one investor put in KSh 156,000.
    asset('scrubber', 'Floor scrubber', 260_000, {
      projectRateCents: ksh(2_000), hireRateCents: ksh(2_000), countsFrom: day('2026-06-01'),
    }),
    // Retired on 1 November, with one day already logged.
    asset('polisher', 'Old polisher', 120_000, {
      category: 'EQUIPMENT', projectRateCents: ksh(1_500), hireRateCents: ksh(1_500), countsFrom: day('2026-08-01'),
      condition: 'RETIRED', retiredAt: new Date('2026-11-01T09:30:00.000Z'),
    }),
    // AE15: on the register from 1 November.
    asset('steamer', 'Steam cleaner', 80_000, {
      projectRateCents: ksh(1_000), hireRateCents: ksh(1_000), countsFrom: day('2026-11-01'),
    }),
    // Not on the register.
    asset('laptop', 'Office laptop', 90_000, { category: 'IT' }),
  ];
  t.jobs = [
    // AE1: charged KSh 100,000, with KSh 60,000 of costs, under a project.
    job('mallJob', 'Mall deep clean', '2026-10-14', 100_000, { placement: 'PROJECT', projectId: 'pA' }),
    job('clinicJob', 'Clinic floor strip', '2026-10-20', 20_000),
    job('officeJob', 'Office clean', '2026-09-02', 15_000, { status: 'APPROVED', createdById: 'sup', reportedById: 'sup' }),
    job('novJob', 'Sofa cleaning, Kilimani', '2026-11-05', 30_000),
    // Before every machine's start day.
    job('earlyJob', 'School hall clean', '2026-05-20', 10_000),
    // AE8: a crew report still waiting for the owner's approval.
    job('waiting', 'Window clean, Lavington', '2026-10-21', 9_000, {
      status: 'PENDING', placement: 'UNSORTED', createdById: 'sup', reportedById: 'sup',
    }),
  ];
  t.expenses = [
    cost('e1', 'mallJob', 'MATERIALS', 40_000, '2026-10-14'),
    cost('e2', 'mallJob', 'EMPLOYEE_PAY', 20_000, '2026-10-15'),
  ];
  // One day of the polisher on the office job: KSh 1,500.
  t.machineLines = [line('pl1', 'polisher', 'officeJob', 2, 1_500)];
  t.machineInvestors = [
    {
      id: 'inv1', assetId: 'scrubber', name: 'Amina Yusuf', contributionCents: ksh(156_000), createdById: 'owner',
      createdAt: day('2026-06-01'), updatedAt: day('2026-06-01'),
    },
    {
      id: 'inv2', assetId: 'steamer', name: 'Brian Otieno', contributionCents: ksh(40_000), createdById: 'owner',
      createdAt: day('2026-11-01'), updatedAt: day('2026-11-01'),
    },
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /admin/machines/:id/jobs: the owner\'s job picker', () => {
  const NOV = { jobId: 'novJob', date: '2026-11-05', title: 'Sofa cleaning, Kilimani', projectTitle: null };
  const CLINIC = { jobId: 'clinicJob', date: '2026-10-20', title: 'Clinic floor strip', projectTitle: null };
  const MALL = { jobId: 'mallJob', date: '2026-10-14', title: 'Mall deep clean', projectTitle: 'Bank branch' };
  const OFFICE = { jobId: 'officeJob', date: '2026-09-02', title: 'Office clean', projectTitle: null };

  it('lists the counted jobs dated on or after the start day, newest first, with each job\'s project and nothing private', async () => {
    const res = await as('owner', 'GET', pickerUrl('scrubber'));

    expect(res.statusCode).toBe(200);
    // Not the report waiting for approval, and not the job of 20 May, before the start day of 1 June.
    expect(res.json()).toEqual({ picker: { jobs: [NOV, CLINIC, MALL, OFFICE], declaredPeriods: [] } });
    for (const secret of Object.values(PRIVATE)) expect(res.body).not.toContain(secret);
  });

  it('searches the titles, whatever the case', async () => {
    expect((await picker('scrubber', 'CLEAN')).jobs).toEqual([NOV, MALL, OFFICE]);
    expect((await picker('scrubber', 'floor strip')).jobs).toEqual([CLINIC]);
    expect((await picker('scrubber', 'carpet')).jobs).toEqual([]);
  });

  it('leaves out a job that already has this machine\'s days, and still answers for a retired machine', async () => {
    // The polisher is retired, its start day is 1 August, and its day on the office job is logged.
    expect((await picker('polisher')).jobs).toEqual([NOV, CLINIC, MALL]);
    // The same job is still offered to another machine.
    expect((await picker('scrubber')).jobs).toContainEqual(OFFICE);
  });

  it('AE15: a machine whose start day is 1 November is not offered the job of 20 October, until the start day moves back', async () => {
    expect((await picker('steamer')).jobs).toEqual([NOV]);

    answered(await as('owner', 'PATCH', machineUrl('steamer'), { startDay: '2026-10-01' }));

    expect((await picker('steamer')).jobs).toEqual([NOV, CLINIC, MALL]);
  });

  it('offers a job dated on the start day itself', async () => {
    t.assets.find((a) => a.id === 'steamer')!.countsFrom = day('2026-10-20');

    expect((await picker('steamer')).jobs).toEqual([NOV, CLINIC]);
  });

  it('sends the 50 newest jobs when more match', async () => {
    for (let i = 1; i <= 60; i++) t.jobs.push(job(`extra${i}`, `Extra job ${i}`, '2026-07-01', 1_000));

    const { jobs } = await picker('scrubber');

    expect(jobs).toHaveLength(50);
    expect(jobs.slice(0, 4)).toEqual([NOV, CLINIC, MALL, OFFICE]);
  });

  it('AE16: lists each period whose payout is declared once, newest first, and not a cancelled one', async () => {
    t.profitDistributions = [
      payoutLine('d1', 'Q3 2026', '2026-07-01', '2026-09-30', 'h1', 'PAID'),
      payoutLine('d2', 'October 2026', '2026-10-01', '2026-10-31', 'h1', 'PENDING'),
      payoutLine('d3', 'October 2026', '2026-10-01', '2026-10-31', 'h2', 'PAID'),
      payoutLine('d4', 'August 2026', '2026-08-01', '2026-08-31', 'h1', 'CANCELLED'),
    ];

    expect((await picker('scrubber')).declaredPeriods).toEqual([
      { label: 'October 2026', periodStart: '2026-10-01', periodEnd: '2026-10-31' },
      { label: 'Q3 2026', periodStart: '2026-07-01', periodEnd: '2026-09-30' },
    ]);
  });

  it('AE16: days on a job inside a declared period are still saved', async () => {
    t.profitDistributions = [payoutLine('d2', 'October 2026', '2026-10-01', '2026-10-31', 'h1', 'PENDING')];

    const logged = answered(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'mallJob', halfDays: 2 }), 201);

    expect(logged.earnedCents).toBe(ksh(2_000));
  });

  it.each(['laptop', 'nope'])('answers 404 for %s, which is not on the register', async (id) => {
    const res = await as('owner', 'GET', pickerUrl(id));

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_MACHINE);
  });

  it.each(['coo', 'admin', 'linkedSupervisor'])('answers 403 for %s, who sees the register and is not the owner', async (userId) => {
    const res = await as(userId, 'GET', pickerUrl('scrubber'));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(NOT_THE_OWNER);
  });
});

describe('POST /admin/machines/:id/lines: log days on a job', () => {
  it('AE1: 2.5 days at KSh 2,000 are stored as 5 half days at the rate of the moment, and the pot is KSh 5,000 higher', async () => {
    expect(await machine('scrubber')).toMatchObject({ earnedCents: 0, potCents: 0 });

    const logged = answered(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'mallJob', halfDays: 5 }), 201);

    expect(t.machineLines.at(-1)).toMatchObject({
      assetId: 'scrubber', jobId: 'mallJob', halfDays: 5, rateCents: 200_000, amountCents: 500_000, isHire: false,
      createdById: 'owner',
    });
    expect(logged).toMatchObject({ earnedCents: ksh(5_000), potCents: ksh(5_000) });
    expect(logged.lines).toEqual([{
      id: expect.any(String), jobId: 'mallJob', date: '2026-10-14', jobTitle: 'Mall deep clean', halfDays: 5,
      rateCents: 200_000, amountCents: 500_000, isHire: false, chargedCents: null,
      standardRateCents: null, paidOn: null, endDate: null,
    }]);
    expect(await machine('scrubber')).toEqual(logged);
  });

  it('AE1: the logged days take KSh 5,000 off the job\'s profit in Jobs & costs', async () => {
    const before = (await jobsIn(OCTOBER)).find((j) => j.id === 'mallJob');
    expect(before).toMatchObject({ totalExpensesCents: ksh(60_000), netCents: ksh(40_000) });

    answered(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'mallJob', halfDays: 5 }), 201);

    const after = (await jobsIn(OCTOBER)).find((j) => j.id === 'mallJob');
    expect(after).toMatchObject({ machineCents: ksh(5_000), totalExpensesCents: ksh(65_000), netCents: ksh(35_000) });
  });

  it('accepts a job the owner approved from a crew report', async () => {
    const logged = answered(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'officeJob', halfDays: 1 }), 201);

    expect(logged.earnedCents).toBe(ksh(1_000));
  });

  it('AE8: refuses a job report still waiting for approval', async () => {
    const error = refused(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'waiting', halfDays: 2 }), 409);

    expect(error).toMatch(/waiting for approval/);
    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);
  });

  it('refuses a second line for the same machine and job, and says to edit the one there', async () => {
    answered(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'mallJob', halfDays: 5 }), 201);

    const error = refused(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'mallJob', halfDays: 2 }), 409);

    expect(error).toMatch(/already logged/);
    expect(error).toMatch(/[Ee]dit/);
    expect(t.machineLines.filter((l) => l.assetId === 'scrubber')).toEqual([expect.objectContaining({ halfDays: 5 })]);
  });

  it('refuses days on a retired machine', async () => {
    const error = refused(await as('owner', 'POST', linesUrl('polisher'), { jobId: 'mallJob', halfDays: 2 }), 409);

    expect(error).toMatch(/retired/);
    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);
  });

  it('AE15: refuses a job dated before the start day and names that day, until the start day moves back', async () => {
    const error = refused(await as('owner', 'POST', linesUrl('steamer'), { jobId: 'clinicJob', halfDays: 2 }), 409);

    expect(error).toContain('1 Nov 2026');
    expect(error).toContain('20 Oct 2026');
    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);

    answered(await as('owner', 'PATCH', machineUrl('steamer'), { startDay: '2026-10-01' }));
    const logged = answered(await as('owner', 'POST', linesUrl('steamer'), { jobId: 'clinicJob', halfDays: 2 }), 201);

    expect(logged.earnedCents).toBe(ksh(1_000));
  });

  it('accepts a job dated on the start day itself', async () => {
    t.assets.find((a) => a.id === 'steamer')!.countsFrom = day('2026-10-20');

    const logged = answered(await as('owner', 'POST', linesUrl('steamer'), { jobId: 'clinicJob', halfDays: 2 }), 201);

    expect(logged.earnedCents).toBe(ksh(1_000));
  });

  it.each([
    ['0', 0],
    ['below zero', -2],
    ['a quarter day', 0.5],
    ['missing', undefined],
  ])('refuses days that are %s', async (_what, halfDays) => {
    refused(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'mallJob', halfDays }), 400);

    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);
  });

  it('answers 404 for a job that does not exist', async () => {
    const res = await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'nope', halfDays: 2 });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'job not found' });
  });

  it.each(['laptop', 'nope'])('answers 404 for %s, which is not on the register', async (id) => {
    const res = await as('owner', 'POST', linesUrl(id), { jobId: 'mallJob', halfDays: 2 });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_MACHINE);
    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);
  });
});

describe('PATCH and DELETE /admin/machines/lines/:lineId: correct or remove logged days', () => {
  it('AE4: days logged at KSh 2,000, edited from 2 to 3 after the rate rose to KSh 2,500, count KSh 6,000', async () => {
    const logged = answered(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'mallJob', halfDays: 4 }), 201);
    expect(logged.earnedCents).toBe(ksh(4_000));
    answered(await as('owner', 'PATCH', machineUrl('scrubber'), { dailyRateCents: ksh(2_500) }));

    const edited = answered(await as('owner', 'PATCH', lineUrl(logged.lines[0]!.id), { halfDays: 6 }));

    expect(edited.lines).toEqual([expect.objectContaining({ halfDays: 6, rateCents: 200_000, amountCents: 600_000 })]);
    expect(edited.earnedCents).toBe(ksh(6_000));
    expect(t.machineLines.at(-1)).toMatchObject({ halfDays: 6, rateCents: 200_000, amountCents: 600_000 });

    // AE4: days logged after the rate rose count KSh 2,500 each.
    const again = answered(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'novJob', halfDays: 2 }), 201);

    expect(again.lines[0]).toMatchObject({ jobId: 'novJob', halfDays: 2, rateCents: 250_000, amountCents: 250_000 });
    expect(again.earnedCents).toBe(ksh(8_500));
  });

  it('edits a line on a retired machine', async () => {
    const edited = answered(await as('owner', 'PATCH', lineUrl('pl1'), { halfDays: 3 }));

    // One and a half days at KSh 1,500.
    expect(edited).toMatchObject({ id: 'polisher', condition: 'RETIRED', earnedCents: ksh(2_250) });
    expect(t.machineLines[0]).toMatchObject({ id: 'pl1', halfDays: 3, rateCents: 150_000, amountCents: 225_000 });
  });

  it.each([
    ['0', 0],
    ['below zero', -2],
    ['a quarter day', 0.5],
    ['missing', undefined],
  ])('refuses to change the days to %s', async (_what, halfDays) => {
    refused(await as('owner', 'PATCH', lineUrl('pl1'), { halfDays }), 400);

    expect(t.machineLines[0]).toMatchObject({ id: 'pl1', halfDays: 2, amountCents: 150_000 });
  });

  it('removes the days, and the machine\'s earned falls by their amount', async () => {
    const removed = answered(await as('owner', 'DELETE', lineUrl('pl1')));

    expect(removed).toMatchObject({ id: 'polisher', earnedCents: 0, lines: [] });
    expect(t.machineLines).toEqual([]);
    expect(t.jobs.map((j) => j.id)).toContain('officeJob');
  });

  it('a hire\'s line is neither edited nor removed through the days route: each refusal points to the hire', async () => {
    const lineId = hireLineId(await logHire());

    const edit = refused(await as('owner', 'PATCH', lineUrl(lineId), { halfDays: 2 }), 409);
    const remove = refused(await as('owner', 'DELETE', lineUrl(lineId)), 409);

    expect(edit).toMatch(/hire/);
    expect(remove).toMatch(/[Rr]emove the hire/);
    expect(t.machineLines.find((l) => l.id === lineId)).toMatchObject({ halfDays: 6, amountCents: 600_000, isHire: true });
    expect(hireJobs()).toHaveLength(1);
  });

  it.each<['PATCH' | 'DELETE', object?]>([['PATCH', { halfDays: 2 }], ['DELETE']])('%s answers 404 for a line that does not exist', async (method, body) => {
    const res = await as('owner', method, lineUrl('nope'), body);

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'machine days not found' });
    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);
  });
});

describe('POST /admin/machines/:id/hires: log a hire', () => {
  it('AE2: a 3-day hire at KSh 10,500 becomes a one-off, owner-entered job with no project and a hire line of KSh 6,000', async () => {
    const hired = await logHire('scrubber', { ...JANE_HIRE, customerName: '  Jane Wanjiru ' });

    expect(hireJobs()).toEqual([expect.objectContaining({
      title: 'Hire: Floor scrubber', date: day('2026-11-03'), incomeCents: ksh(10_500), discountCents: 0,
      status: 'OWNER_ENTRY', placement: 'STANDALONE', projectId: null, clientName: 'Jane Wanjiru', createdById: 'owner',
    })]);
    const [hireJob] = hireJobs();
    expect(t.machineLines.at(-1)).toMatchObject({
      assetId: 'scrubber', jobId: hireJob!.id, halfDays: 6, rateCents: 200_000, amountCents: 600_000, isHire: true,
      createdById: 'owner',
    });
    expect(hired).toMatchObject({ earnedCents: ksh(6_000), potCents: ksh(6_000) });
    expect(hired.lines).toEqual([{
      id: expect.any(String), jobId: hireJob!.id, date: '2026-11-03', jobTitle: 'Hire: Floor scrubber',
      halfDays: 6, rateCents: 200_000, amountCents: 600_000, isHire: true, chargedCents: ksh(10_500),
      customerName: 'Jane Wanjiru',
      standardRateCents: null, paidOn: null, endDate: '2026-11-05', customerPhone: null, notes: null, paymentRef: null,
    }]);
  });

  it('AE2: the hire shows in Jobs & costs with income KSh 10,500, machine cost KSh 6,000 and profit KSh 4,500', async () => {
    await logHire();

    expect((await jobsIn(NOVEMBER)).find((j) => j.id === hireJobs()[0]!.id)).toMatchObject({
      title: 'Hire: Floor scrubber', date: '2026-11-03', status: 'OWNER_ENTRY', placement: 'STANDALONE',
      projectId: null, projectTitle: null, clientName: 'Jane Wanjiru', actualIncomeCents: ksh(10_500),
      machineCents: ksh(6_000), totalExpensesCents: ksh(6_000), netCents: ksh(4_500),
    });
  });

  it('AE14: a 3-day hire charged KSh 5,000 is accepted: the pot is KSh 6,000 higher and the job shows a loss of KSh 1,000', async () => {
    const hired = await logHire('scrubber', { ...JANE_HIRE, chargedCents: ksh(5_000) });

    expect(hired).toMatchObject({ earnedCents: ksh(6_000), potCents: ksh(6_000) });
    expect(hired.lines[0]).toMatchObject({ amountCents: ksh(6_000), chargedCents: ksh(5_000) });
    expect((await jobsIn(NOVEMBER)).find((j) => j.id === hireJobs()[0]!.id)).toMatchObject({
      actualIncomeCents: ksh(5_000), machineCents: ksh(6_000), netCents: ksh(-1_000),
    });
  });

  it('accepts a hire charged nothing', async () => {
    const hired = await logHire('scrubber', { ...JANE_HIRE, chargedCents: 0 });

    expect(hired.lines[0]).toMatchObject({ amountCents: ksh(6_000), chargedCents: 0 });
  });

  it('refuses the same machine, customer and start date logged again, and accepts the same customer on another date', async () => {
    await logHire();

    const error = refused(await as('owner', 'POST', hiresUrl('scrubber'), { ...JANE_HIRE, halfDays: 2, chargedCents: ksh(4_000) }), 409);

    expect(error).toMatch(/already logged/);
    expect(error).toContain('Jane Wanjiru');
    expect(error).toContain('3 Nov 2026');
    expect(hireJobs()).toHaveLength(1);
    expect(t.machineLines.filter((l) => l.isHire)).toHaveLength(1);

    await logHire('scrubber', { ...JANE_HIRE, startDate: '2026-11-10' });

    expect(hireJobs()).toHaveLength(2);
  });

  it('refuses a hire on a retired machine', async () => {
    const error = refused(await as('owner', 'POST', hiresUrl('polisher'), JANE_HIRE), 409);

    expect(error).toMatch(/retired/);
    expect(hireJobs()).toEqual([]);
    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);
  });

  it('refuses a start date before the machine\'s start day, and names that day', async () => {
    const error = refused(await as('owner', 'POST', hiresUrl('scrubber'), { ...JANE_HIRE, startDate: '2026-05-31' }), 409);

    expect(error).toContain('1 Jun 2026');
    expect(hireJobs()).toEqual([]);
  });

  it('accepts a start date on the machine\'s start day', async () => {
    const hired = await logHire('scrubber', { ...JANE_HIRE, startDate: '2026-06-01' });

    expect(hired.lines[0]).toMatchObject({ date: '2026-06-01', isHire: true });
  });

  it.each([
    ['no customer', { customerName: '   ' }],
    ['a start date that is not a date', { startDate: '03/11/2026' }],
    ['0 days', { halfDays: 0 }],
    ['a quarter day', { halfDays: 0.5 }],
    ['a charge below zero', { chargedCents: ksh(-1) }],
    ['a charge that is not whole cents', { chargedCents: 10.5 }],
  ])('refuses a hire with %s', async (_what, wrong) => {
    refused(await as('owner', 'POST', hiresUrl('scrubber'), { ...JANE_HIRE, ...wrong }), 400);

    expect(hireJobs()).toEqual([]);
    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);
  });

  it.each(['laptop', 'nope'])('answers 404 for %s, which is not on the register', async (id) => {
    const res = await as('owner', 'POST', hiresUrl(id), JANE_HIRE);

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_MACHINE);
    expect(hireJobs()).toEqual([]);
  });

  it('a second machine can log days on a hire\'s job', async () => {
    await logHire();
    const [hireJob] = hireJobs();

    const logged = answered(await as('owner', 'POST', linesUrl('steamer'), { jobId: hireJob!.id, halfDays: 2 }), 201);

    expect(logged.earnedCents).toBe(ksh(1_000));
    expect(logged.lines[0]).toMatchObject({ jobId: hireJob!.id, isHire: false, chargedCents: null });
    // KSh 10,500 charged, less the scrubber's KSh 6,000 and the steamer's KSh 1,000.
    expect((await jobsIn(NOVEMBER)).find((j) => j.id === hireJob!.id)).toMatchObject({
      machineCents: ksh(7_000), netCents: ksh(3_500),
    });
  });

  it('R31: a second machine\'s days on a hire\'s job name the customer to nobody, and the owner still sees the customer on the hire', async () => {
    await logHire();
    const [hireJob] = hireJobs();
    answered(await as('owner', 'POST', linesUrl('steamer'), { jobId: hireJob!.id, halfDays: 2 }), 201);

    // The COO opens the second machine: the job reads "Hire" and the customer is nowhere in the answer.
    const res = await as('coo', 'GET', machineUrl('steamer'));
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('Jane Wanjiru');
    expect(res.json().machine.lines).toEqual([{
      id: expect.any(String), jobId: hireJob!.id, date: '2026-11-03', jobTitle: 'Hire', halfDays: 2,
      rateCents: 100_000, amountCents: 100_000, isHire: false, chargedCents: null,
      standardRateCents: null, paidOn: null, endDate: null,
    }]);

    // The owner reads the job by its title, which names the machine only, and the customer on the hire itself.
    expect((await machine('steamer')).lines[0]).toMatchObject({ jobTitle: 'Hire: Floor scrubber', isHire: false });
    expect((await machine('scrubber')).lines[0]).toMatchObject({
      jobTitle: 'Hire: Floor scrubber', isHire: true, customerName: 'Jane Wanjiru',
    });
  });
});

describe('PATCH /admin/machines/hires/:lineId: correct a hire', () => {
  // Two days from 28 October, for KSh 9,000, to a customer whose name was mistyped.
  const CORRECTED = { customerName: 'Jane W. Kamau', startDate: '2026-10-28', halfDays: 4, chargedCents: ksh(9_000) };

  it('writes the job and the line together, and the line keeps the rate it was logged at', async () => {
    const lineId = hireLineId(await logHire());
    answered(await as('owner', 'PATCH', machineUrl('scrubber'), { dailyRateCents: ksh(2_500) }));

    const edited = answered(await as('owner', 'PATCH', hireUrl(lineId), CORRECTED));

    expect(hireJobs()).toEqual([expect.objectContaining({
      title: 'Hire: Floor scrubber', clientName: 'Jane W. Kamau', date: day('2026-10-28'),
      incomeCents: ksh(9_000), status: 'OWNER_ENTRY', placement: 'STANDALONE', projectId: null,
    })]);
    expect(t.machineLines.find((l) => l.id === lineId)).toMatchObject({
      halfDays: 4, rateCents: 200_000, amountCents: 400_000, isHire: true,
    });
    expect(edited.earnedCents).toBe(ksh(4_000));
    expect(edited.lines).toEqual([{
      id: lineId, jobId: hireJobs()[0]!.id, date: '2026-10-28', jobTitle: 'Hire: Floor scrubber',
      halfDays: 4, rateCents: 200_000, amountCents: 400_000, isHire: true, chargedCents: ksh(9_000),
      customerName: 'Jane W. Kamau',
      standardRateCents: null, paidOn: null, endDate: '2026-10-29', customerPhone: null, notes: null, paymentRef: null,
    }]);
  });

  it('a new start date moves the job, and the month figures move with it', async () => {
    const lineId = hireLineId(await logHire());

    // October: the mall and clinic jobs, and the mall job's KSh 60,000 of costs.
    expect(await summaryOf(OCTOBER)).toMatchObject({ incomeCents: ksh(120_000), totalExpensesCents: ksh(60_000), netCents: ksh(60_000) });
    // November: the sofa job and the hire, less the scrubber's KSh 6,000.
    expect(await summaryOf(NOVEMBER)).toMatchObject({ incomeCents: ksh(40_500), totalExpensesCents: ksh(6_000), netCents: ksh(34_500) });

    answered(await as('owner', 'PATCH', hireUrl(lineId), CORRECTED));

    const october = await summaryOf(OCTOBER);
    expect(october).toMatchObject({ incomeCents: ksh(129_000), totalExpensesCents: ksh(64_000), netCents: ksh(65_000) });
    expect(october.expensesByCategoryCents.MACHINES).toBe(ksh(4_000));
    const november = await summaryOf(NOVEMBER);
    expect(november).toMatchObject({ incomeCents: ksh(30_000), totalExpensesCents: 0, netCents: ksh(30_000) });
    expect(november.expensesByCategoryCents).not.toHaveProperty('MACHINES');
  });

  it('the amount charged is what was typed, whatever discount the hire\'s job was given in Jobs & costs', async () => {
    const lineId = hireLineId(await logHire());
    hireJobs()[0]!.discountCents = ksh(500);

    const edited = answered(await as('owner', 'PATCH', hireUrl(lineId), { ...JANE_HIRE, chargedCents: ksh(9_000) }));

    expect(edited.lines[0]!.chargedCents).toBe(ksh(9_000));
  });

  it('edits a hire on a machine that has since been retired', async () => {
    const lineId = hireLineId(await logHire());
    answered(await as('owner', 'PATCH', machineUrl('scrubber'), { condition: 'RETIRED' }));

    const edited = answered(await as('owner', 'PATCH', hireUrl(lineId), { ...JANE_HIRE, halfDays: 8 }));

    expect(edited).toMatchObject({ condition: 'RETIRED', earnedCents: ksh(8_000) });
  });

  it('refuses a start date before the machine\'s start day, and changes nothing', async () => {
    const lineId = hireLineId(await logHire());

    const error = refused(await as('owner', 'PATCH', hireUrl(lineId), { ...CORRECTED, startDate: '2026-05-31' }), 409);

    expect(error).toContain('1 Jun 2026');
    expect(hireJobs()).toEqual([expect.objectContaining({ date: day('2026-11-03'), clientName: 'Jane Wanjiru', incomeCents: ksh(10_500) })]);
    expect(t.machineLines.find((l) => l.id === lineId)).toMatchObject({ halfDays: 6, amountCents: 600_000 });
  });

  it('refuses a start date before the start day of another machine with days on the hire\'s job', async () => {
    const lineId = hireLineId(await logHire());
    // The steamer's start day is 1 November, and it has a day on the hire's job of 3 November.
    answered(await as('owner', 'POST', linesUrl('steamer'), { jobId: hireJobs()[0]!.id, halfDays: 2 }), 201);

    const error = refused(await as('owner', 'PATCH', hireUrl(lineId), CORRECTED), 409);

    expect(error).toContain('Steam cleaner');
    expect(error).toContain('1 Nov 2026');
    expect(hireJobs()).toEqual([expect.objectContaining({ date: day('2026-11-03'), clientName: 'Jane Wanjiru' })]);
  });

  it.each([
    ['no customer', { customerName: '' }],
    ['a quarter day', { halfDays: 0.5 }],
    ['a charge below zero', { chargedCents: ksh(-1) }],
  ])('refuses a correction with %s', async (_what, wrong) => {
    const lineId = hireLineId(await logHire());

    refused(await as('owner', 'PATCH', hireUrl(lineId), { ...CORRECTED, ...wrong }), 400);

    expect(hireJobs()).toEqual([expect.objectContaining({ date: day('2026-11-03'), clientName: 'Jane Wanjiru', incomeCents: ksh(10_500) })]);
  });

  it.each(['nope', 'pl1'])('answers 404 for %s, which is not a hire', async (lineId) => {
    const res = await as('owner', 'PATCH', hireUrl(lineId), CORRECTED);

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'hire not found' });
    expect(t.machineLines[0]).toMatchObject({ id: 'pl1', halfDays: 2 });
    expect(t.jobs.find((j) => j.id === 'officeJob')).toMatchObject({ title: 'Office clean', date: day('2026-09-02') });
  });
});

describe('DELETE /admin/machines/hires/:lineId: remove a hire', () => {
  it('removes the hire\'s job, the costs added to it and its line, and leaves every other job and cost alone', async () => {
    const lineId = hireLineId(await logHire());
    const hireJobId = hireJobs()[0]!.id;
    t.expenses.push(cost('e9', hireJobId, 'TRANSPORT', 800, '2026-11-03'));

    const removed = answered(await as('owner', 'DELETE', hireUrl(lineId)));

    expect(removed).toMatchObject({ id: 'scrubber', earnedCents: 0, potCents: 0, lines: [] });
    expect(hireJobs()).toEqual([]);
    expect(t.jobs).toHaveLength(6);
    expect(t.expenses.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);
  });

  it('the hire\'s job is gone from Jobs & costs', async () => {
    const lineId = hireLineId(await logHire());
    const hireJobId = hireJobs()[0]!.id;
    expect((await jobsIn(NOVEMBER)).map((j) => j.id).sort()).toEqual([hireJobId, 'novJob'].sort());

    answered(await as('owner', 'DELETE', hireUrl(lineId)));

    expect((await jobsIn(NOVEMBER)).map((j) => j.id)).toEqual(['novJob']);
  });

  it('R11: the owner\'s hire names the other machine with days on its job, and removing the hire removes those days from that machine too', async () => {
    const lineId = hireLineId(await logHire());
    // One day of the steamer on the hire's job: KSh 1,000 into the steamer's pot.
    answered(await as('owner', 'POST', linesUrl('steamer'), { jobId: hireJobs()[0]!.id, halfDays: 2 }), 201);
    expect(await machine('steamer')).toMatchObject({ earnedCents: ksh(1_000), potCents: ksh(1_000) });

    // What the Remove hire question lists before anything is removed.
    expect((await machine('scrubber')).lines.find((l) => l.id === lineId)!.otherMachines).toEqual([
      { machineName: 'Steam cleaner', halfDays: 2, amountCents: ksh(1_000) },
    ]);

    const removed = answered(await as('owner', 'DELETE', hireUrl(lineId)));

    expect(removed).toMatchObject({ id: 'scrubber', earnedCents: 0, potCents: 0, lines: [] });
    expect(hireJobs()).toEqual([]);
    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);
    expect(await machine('steamer')).toMatchObject({ earnedCents: 0, potCents: 0, lines: [] });
  });

  it.each(['nope', 'pl1'])('answers 404 for %s, which is not a hire', async (lineId) => {
    const res = await as('owner', 'DELETE', hireUrl(lineId));

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'hire not found' });
    expect(t.machineLines.map((l) => l.id)).toEqual(['pl1']);
    expect(t.jobs).toHaveLength(6);
  });
});

describe('POST /admin/machines/:id/payouts and DELETE /admin/machines/payouts/:payoutId: pay an investor', () => {
  beforeEach(() => {
    // AE3: the scrubber has earned KSh 50,000 and had KSh 10,000 of repairs since its start day,
    // so the investor's 60% is KSh 24,000.
    t.machineLines.push(line('ml1', 'scrubber', 'mallJob', 50, 2_000));
    t.assetMaintenance = [
      // Before the start day: in no figure.
      repair('r0', 'scrubber', '2026-05-10', 15_000),
      repair('r1', 'scrubber', '2026-07-15', 10_000),
    ];
  });

  const PAY_20K = { investorId: 'inv1', date: '2026-11-10', amountCents: ksh(20_000), reference: ' QK7XYZ12 ' };

  it('AE3: a payment of KSh 20,000 leaves KSh 4,000 owed and KSh 20,000 in the pot', async () => {
    expect(await machine('scrubber')).toMatchObject({
      potCents: ksh(40_000), companyPartCents: ksh(16_000),
      investors: [expect.objectContaining({ shareBps: 6000, entitledCents: ksh(24_000), owedCents: ksh(24_000) })],
    });

    const paid = answered(await as('owner', 'POST', payoutsUrl('scrubber'), PAY_20K), 201);

    expect(paid).toMatchObject({ paidOutCents: ksh(20_000), potCents: ksh(20_000) });
    expect(paid.investors).toEqual([{
      id: 'inv1', name: 'Amina Yusuf', contributionCents: ksh(156_000), shareBps: 6000,
      entitledCents: ksh(24_000), paidCents: ksh(20_000), owedCents: ksh(4_000), overpaidCents: 0,
    }]);
    expect(paid.payments).toEqual([
      { id: expect.any(String), investorId: 'inv1', date: '2026-11-10', amountCents: ksh(20_000), reference: 'QK7XYZ12' },
    ]);
    expect(t.machinePayouts).toEqual([expect.objectContaining({
      investorId: 'inv1', date: day('2026-11-10'), amountCents: ksh(20_000), reference: 'QK7XYZ12', createdById: 'owner',
    })]);
  });

  it('AE3: a further payment of KSh 5,000 is refused with the KSh 4,000 still owed, and KSh 4,000 is accepted', async () => {
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-10', 20_000)];

    const error = refused(
      await as('owner', 'POST', payoutsUrl('scrubber'), { investorId: 'inv1', date: '2026-11-12', amountCents: ksh(5_000) }),
      409,
    );

    expect(error).toContain('Amina Yusuf');
    expect(error).toContain('KSh 4,000');
    expect(t.machinePayouts.map((p) => p.id)).toEqual(['p1']);

    const paid = answered(
      await as('owner', 'POST', payoutsUrl('scrubber'), { investorId: 'inv1', date: '2026-11-12', amountCents: ksh(4_000) }),
      201,
    );

    expect(paid.investors[0]).toMatchObject({ paidCents: ksh(24_000), owedCents: 0, overpaidCents: 0 });
    expect(paid.potCents).toBe(ksh(16_000));
    expect(paid.payments.map((p) => p.reference)).toEqual([null, null]);
  });

  it('AE12: after one more repair of KSh 10,000 the investor is overpaid by KSh 2,000, and a new payment is refused', async () => {
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-10', 20_000)];
    t.assetMaintenance.push(repair('r2', 'scrubber', '2026-11-12', 10_000));

    expect((await machine('scrubber')).investors[0]).toMatchObject({
      entitledCents: ksh(18_000), paidCents: ksh(20_000), owedCents: 0, overpaidCents: ksh(2_000),
    });

    const error = refused(
      await as('owner', 'POST', payoutsUrl('scrubber'), { investorId: 'inv1', date: '2026-11-13', amountCents: ksh(1) }),
      409,
    );

    expect(error).toContain('Amina Yusuf');
    expect(error).toContain('KSh 2,000');
    expect(t.machinePayouts.map((p) => p.id)).toEqual(['p1']);
  });

  it('refuses a payment to an investor who is owed nothing because the machine has earned nothing', async () => {
    // The steamer has no days logged.
    const error = refused(
      await as('owner', 'POST', payoutsUrl('steamer'), { investorId: 'inv2', date: '2026-11-12', amountCents: ksh(100) }),
      409,
    );

    expect(error).toContain('Brian Otieno');
    expect(t.machinePayouts).toEqual([]);
  });

  it.each([
    ['0', 0],
    ['below zero', ksh(-100)],
    ['not whole cents', 10.5],
    ['missing', undefined],
  ])('refuses an amount that is %s', async (_what, amountCents) => {
    refused(await as('owner', 'POST', payoutsUrl('scrubber'), { ...PAY_20K, amountCents }), 400);

    expect(t.machinePayouts).toEqual([]);
  });

  it('refuses a date that is not a date', async () => {
    refused(await as('owner', 'POST', payoutsUrl('scrubber'), { ...PAY_20K, date: '10 Nov' }), 400);

    expect(t.machinePayouts).toEqual([]);
  });

  it.each(['inv2', 'nope'])('answers 404 for investor %s, who is not this machine\'s', async (investorId) => {
    const res = await as('owner', 'POST', payoutsUrl('scrubber'), { ...PAY_20K, investorId });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'investor not found' });
    expect(t.machinePayouts).toEqual([]);
  });

  it.each(['laptop', 'nope'])('answers 404 for %s, which is not on the register', async (id) => {
    const res = await as('owner', 'POST', payoutsUrl(id), PAY_20K);

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_MACHINE);
    expect(t.machinePayouts).toEqual([]);
  });

  it('deleting a payment gives the investor back what they are owed', async () => {
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-10', 20_000)];

    const after = answered(await as('owner', 'DELETE', payoutUrl('p1')));

    expect(after).toMatchObject({ id: 'scrubber', paidOutCents: 0, potCents: ksh(40_000), payments: [] });
    expect(after.investors[0]).toMatchObject({ paidCents: 0, owedCents: ksh(24_000) });
    expect(t.machinePayouts).toEqual([]);
  });

  it('AE11: deleting the only payment lifts the lock, and a price change is then accepted', async () => {
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-10', 20_000)];

    refused(await as('owner', 'PATCH', machineUrl('scrubber'), { priceCents: ksh(280_000) }), 409);

    answered(await as('owner', 'DELETE', payoutUrl('p1')));
    const changed = answered(await as('owner', 'PATCH', machineUrl('scrubber'), { priceCents: ksh(280_000) }));

    expect(changed.priceCents).toBe(ksh(280_000));
  });

  it('answers 404 for a payment that does not exist', async () => {
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-10', 20_000)];

    const res = await as('owner', 'DELETE', payoutUrl('nope'));

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'payment not found' });
    expect(t.machinePayouts.map((p) => p.id)).toEqual(['p1']);
  });
});

describe('the register and the lines agree', () => {
  it('the total of all lines\' amounts equals the total earned across GET /admin/machines', async () => {
    // The scrubber: 2.5 days on the mall job, corrected to 3.5 days, and a 3-day hire. The steamer: 1.5 days.
    const logged = answered(await as('owner', 'POST', linesUrl('scrubber'), { jobId: 'mallJob', halfDays: 5 }), 201);
    answered(await as('owner', 'PATCH', lineUrl(logged.lines[0]!.id), { halfDays: 7 }));
    await logHire();
    answered(await as('owner', 'POST', linesUrl('steamer'), { jobId: 'novJob', halfDays: 3 }), 201);

    const res = await as('owner', 'GET', MACHINES);
    expect(res.statusCode).toBe(200);
    const register: MachineRegisterDto = res.json().register;

    // KSh 7,000 and KSh 6,000 for the scrubber, KSh 1,500 for the steamer, and the polisher's KSh 1,500.
    expect(register.totals.earnedCents).toBe(ksh(16_000));
    expect(t.machineLines.reduce((total, l) => total + l.amountCents, 0)).toBe(ksh(16_000));
    expect(Object.fromEntries(register.machines.map((m) => [m.id, m.earnedCents]))).toEqual({
      scrubber: ksh(13_000), steamer: ksh(1_500), polisher: ksh(1_500),
    });
  });
});

describe.each(['coo', 'admin'])('R22: %s, who sees the register and is not the owner', (userId) => {
  beforeEach(() => {
    // A hire and a payment already there, to be left alone.
    t.jobs.push(job('hireJob', 'Hire: Floor scrubber', '2026-11-03', 10_500, { clientName: 'Jane Wanjiru' }));
    t.machineLines.push(line('hl1', 'scrubber', 'hireJob', 6, 2_000, { isHire: true }));
    t.machinePayouts = [payment('p1', 'inv1', '2026-11-10', 1_000)];
  });

  it.each<[string, 'POST' | 'PATCH' | 'DELETE', string, object?]>([
    ['log days', 'POST', linesUrl('scrubber'), { jobId: 'mallJob', halfDays: 2 }],
    ['correct days', 'PATCH', lineUrl('pl1'), { halfDays: 4 }],
    ['remove days', 'DELETE', lineUrl('pl1')],
    ['log a hire', 'POST', hiresUrl('scrubber'), { ...JANE_HIRE, startDate: '2026-11-11' }],
    ['correct a hire', 'PATCH', hireUrl('hl1'), { ...JANE_HIRE, halfDays: 2 }],
    ['remove a hire', 'DELETE', hireUrl('hl1')],
    ['pay an investor', 'POST', payoutsUrl('scrubber'), { investorId: 'inv1', date: '2026-11-12', amountCents: ksh(100) }],
    ['delete a payment', 'DELETE', payoutUrl('p1')],
  ])('cannot %s', async (_what, method, url, body) => {
    const tables = () => JSON.stringify([t.jobs, t.expenses, t.machineLines, t.machinePayouts]);
    const before = tables();

    const res = await as(userId, method, url, body);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(NOT_THE_OWNER);
    expect(tables()).toBe(before);
  });
});
