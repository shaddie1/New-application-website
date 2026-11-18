import { beforeEach, describe, expect, it, vi } from 'vitest';

import { as, copy, costingBody as body, resetDb, staff, t, tick, weeklySurvey } from '../test-support/quoteBuilderDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/quoteBuilderDb.js')).db }));

const { DEFAULT_RATES } = await import('../quotes/rates.js');

const scrubber = {
  id: 'a-scrubber', name: 'Scrubber', category: 'MACHINE', costCents: 26_000_000, salvageValueCents: 2_000_000,
  usefulLifeMonths: 48, retiredAt: null, supplier: 'Kleen Ltd', notes: 'Bought for the bank contract', receiptUrl: 'https://x/r.pdf',
};
const current = (quoteId: string) =>
  t.estimates.filter((e) => e.quoteRequestId === quoteId && e.status !== 'SUPERSEDED').sort((a, b) => b.computedAt - a.computedAt);
const newest = (quoteId: string) => current(quoteId)[0]!;

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [
    staff('owner', 'ADMIN', true), staff('admin', 'ADMIN'), staff('coo', 'COO'),
    staff('support', 'SUPPORT'), staff('supervisor', 'CLEANING_SUPERVISOR'),
    { id: 'cust', fullName: 'Grace Wanjiru', phone: '+254712000999', role: 'CUSTOMER', isOwner: false },
    { id: 'crew', fullName: 'Brian Otieno', phone: '+254712000888', role: 'CREW', isOwner: false },
  ];
  t.serviceLines = [{ id: 'sl1', code: 'office', name: 'Office cleaning', isActive: true }];
  t.quotes = [
    { id: 'q1', userId: 'cust', serviceLineId: 'sl1', siteType: 'Bank branch', approxSqm: null, floors: null, frequency: 'WEEKLY',
      notes: null, status: 'SITE_VISIT_SCHEDULED', quotedAmountCents: null, quotedAt: null, createdAt: tick() },
    { id: 'q2', userId: 'cust', serviceLineId: 'sl1', siteType: 'Clinic', approxSqm: null, floors: null, frequency: 'WEEKLY',
      notes: null, status: 'PENDING', quotedAmountCents: null, quotedAt: null, createdAt: tick() },
  ];
  t.surveys = [{ id: 's1', quoteRequestId: 'q1', ...copy(weeklySurvey), updatedById: 'supervisor', createdAt: tick(), updatedAt: tick() }];
  t.estimates = [{
    id: 'e0', quoteRequestId: 'q1', status: 'DRAFT', surveySnapshot: copy(weeklySurvey), ratesSnapshot: {}, costingSnapshot: null,
    ratesUpdatedAt: null, output: {}, computedById: 'admin', computedAt: tick(), submittedById: null, submittedAt: null,
    decidedById: null, decidedAt: null, decisionNote: null,
  }];
  t.assets = [copy(scrubber)];
});

describe('PUT /admin/quote-builder/:id/costing', () => {
  it('saves the costing, supersedes the estimate and freezes a copy on the new draft', async () => {
    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 3, clientPriceCents: 500_000, clientPriceBasis: 'VISIT' }));

    expect(res.statusCode).toBe(200);
    expect(t.estimates.find((e) => e.id === 'e0')!.status).toBe('SUPERSEDED');
    const draft = newest('q1');
    expect(draft.status).toBe('DRAFT');
    expect(draft.costingSnapshot).toMatchObject({ crewSize: 3, clientPriceCents: 500_000, clientPriceBasis: 'VISIT', clientPriceVisitsPerMonth: 4 });
    expect(draft.output.hours.crewSize).toBe(3);
    expect(draft.output.pricing.pricePerVisitCents).toBe(500_000);
    expect(res.json().quoteRequest.costing).toMatchObject({ crewSize: 3, updatedByName: 'admin' });
  });

  it('refuses SUPPORT, and hides the costing and estimate from SUPPORT', async () => {
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 3 }));

    const save = await as('support', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 9 }));
    expect(save.statusCode).toBe(403);
    expect(t.costings[0]!.data.crewSize).toBe(3);

    const survey = await as('support', 'PUT', '/admin/quote-builder/q1/survey', weeklySurvey);
    expect(survey.statusCode).toBe(200);
    expect(survey.json().quoteRequest.costing).toBeNull();
    expect(survey.json().quoteRequest.estimate).toBeNull();
  });

  it.each(['cust', 'crew'])('refuses %s on the routes open to every staff role, and writes nothing', async (user) => {
    const options = await as(user, 'GET', '/admin/quote-builder/options');
    const survey = await as(user, 'PUT', '/admin/quote-builder/q1/survey', { ...weeklySurvey, soilLevel: 'HEAVY' });
    const quotation = await as(user, 'GET', '/admin/quote-builder/q1/client-quotation');

    expect([options.statusCode, survey.statusCode, quotation.statusCode]).toEqual([403, 403, 403]);
    expect(t.surveys[0]!.soilLevel).toBe(weeklySurvey.soilLevel);
    expect(t.estimates.map((e) => e.status)).toEqual(['DRAFT']);
  });

  it.each(['AWAITING_APPROVAL', 'APPROVED', 'QUOTED'])('refuses a save while the quote is %s, and writes nothing', async (status) => {
    t.quotes[0]!.status = status;

    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 3 }));

    expect(res.statusCode).toBe(409);
    expect(t.costings).toHaveLength(0);
    expect(t.estimates.map((e) => e.status)).toEqual(['DRAFT']);
  });

  it('starts a blank survey from the request frequency when the quote has none', async () => {
    const res = await as('admin', 'PUT', '/admin/quote-builder/q2/costing', body({ crewSize: 2, jobDays: 1 }));

    expect(res.statusCode).toBe(200);
    expect(t.surveys.find((s) => s.quoteRequestId === 'q2')).toMatchObject({ frequencyLabel: 'Weekly (4 visits)', areas: [], items: [] });
    expect(newest('q2').output.hours.crewSize).toBe(2);
  });

  it('AE4: refuses an owned machine with no useful life until its wear is typed', async () => {
    t.assets.push({ ...copy(scrubber), id: 'a-vacuum', name: 'Old vacuum', usefulLifeMonths: null });

    const refused = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ ownedMachines: [{ assetId: 'a-vacuum' }] }));
    expect(refused.statusCode).toBe(400);
    expect(JSON.stringify(refused.json())).toContain('Old vacuum');
    expect(t.costings).toHaveLength(0);

    const typed = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ ownedMachines: [{ assetId: 'a-vacuum', wearPerDayCents: 15_000 }] }));
    expect(typed.statusCode).toBe(200);
    expect(newest('q1').output.machines[0]).toMatchObject({ name: 'Old vacuum', perJobDayCents: 15_000 });
  });

  it('keeps the last copy of a machine deleted from the register since, with a warning', async () => {
    const machines = { ownedMachines: [{ assetId: 'a-scrubber' }] };
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body(machines));
    t.assets = [];

    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body(machines));

    expect(res.statusCode).toBe(200);
    expect(t.costings[0]!.data.ownedMachines[0].asset).toMatchObject({ name: 'Scrubber', costCents: 26_000_000, deleted: true });
    expect(newest('q1').output.warnings).toEqual(expect.arrayContaining([expect.stringContaining('deleted')]));
  });

  it('keeps a retired machine, with a warning', async () => {
    t.assets = [{ ...copy(scrubber), retiredAt: new Date('2026-10-01') }];

    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ ownedMachines: [{ assetId: 'a-scrubber' }] }));

    expect(res.statusCode).toBe(200);
    expect(t.costings[0]!.data.ownedMachines[0].asset.retired).toBe(true);
    expect(newest('q1').output.warnings).toEqual(expect.arrayContaining([expect.stringContaining('retired')]));
  });

  it('refuses a monthly price on a quote with no contract length', async () => {
    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ clientPriceCents: 8_800_000, clientPriceBasis: 'MONTH' }));

    expect(res.statusCode).toBe(400);
    expect(t.costings).toHaveLength(0);
  });

  it('refuses a client price above what a quote can carry', async () => {
    const res = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ clientPriceCents: 2_147_483_648, clientPriceBasis: 'VISIT' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('21,474,836.47');
    expect(t.costings).toHaveLength(0);
  });
});

describe('recomputing with a costing', () => {
  it('keeps the visits a monthly price was entered at until the price changes, and warns when the survey moves', async () => {
    const monthly = { contractMonths: 12, clientPriceCents: 8_800_000, clientPriceBasis: 'MONTH' };
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body(monthly));
    await as('supervisor', 'PUT', '/admin/quote-builder/q1/survey', { ...weeklySurvey, frequencyLabel: 'Twice weekly (8 visits)' });

    const same = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body(monthly));
    expect(same.statusCode).toBe(200);
    expect(t.costings[0]!.data.clientPriceVisitsPerMonth).toBe(4);
    expect(newest('q1').output.warnings).toEqual(expect.arrayContaining([expect.stringContaining('entered at 4 visits')]));

    const repriced = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ ...monthly, clientPriceCents: 16_000_000 }));
    expect(repriced.statusCode).toBe(200);
    expect(t.costings[0]!.data.clientPriceVisitsPerMonth).toBe(8);
    expect(newest('q1').output.warnings.join(' ')).not.toContain('entered at');
  });

  it('keeps the hand-set figures and the client price when a supervisor saves the survey', async () => {
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 3, clientPriceCents: 500_000, clientPriceBasis: 'VISIT' }));

    const res = await as('supervisor', 'PUT', '/admin/quote-builder/q1/survey', { ...weeklySurvey, soilLevel: 'HEAVY' });

    expect(res.statusCode).toBe(200);
    const draft = newest('q1');
    expect(draft.surveySnapshot.soilLevel).toBe('HEAVY');
    expect(draft.output.hours.crewSize).toBe(3);
    expect(draft.output.pricing.pricePerVisitCents).toBe(500_000);
  });

  it('charges lunch at the rates card figure on a surveyed quote nobody has costed', async () => {
    t.rates = { id: 'default', data: { ...DEFAULT_RATES, lunchPerPersonPerDayCents: 15_000 }, updatedById: 'owner', updatedAt: tick() };

    const res = await as('admin', 'POST', '/admin/quote-builder/q1/estimate');

    expect(res.statusCode).toBe(200);
    expect(newest('q1').output.costs.lunchCents).toBe(15_000); // 1 cleaner × 1 day
  });

  it('AE6: an approved estimate keeps its figures when the cleaner day rate is raised', async () => {
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 2, clientPriceCents: 600_000, clientPriceBasis: 'VISIT' }));
    expect((await as('admin', 'POST', '/admin/quote-builder/q1/submit')).statusCode).toBe(200);
    expect((await as('coo', 'POST', '/admin/quote-builder/q1/approve', {})).statusCode).toBe(200);
    const approved = copy(newest('q1'));

    const rates = await as('admin', 'PUT', '/admin/quote-builder/rates', { ...DEFAULT_RATES, cleanerPayPerDayCents: 120_000 });
    expect(rates.statusCode).toBe(200);
    expect((await as('admin', 'POST', '/admin/quote-builder/q1/estimate')).statusCode).toBe(409);

    const after = newest('q1');
    expect(after.status).toBe('APPROVED');
    expect(after.output).toEqual(approved.output);
    expect(after.costingSnapshot).toEqual(approved.costingSnapshot);
  });
});

describe('GET /admin/quote-builder/assets', () => {
  it('lists non-retired assets with only the figures a costing copies', async () => {
    t.assets.push({ ...copy(scrubber), id: 'a-old', name: 'Old dryer', retiredAt: new Date('2026-01-01') });

    const res = await as('coo', 'GET', '/admin/quote-builder/assets');

    expect(res.statusCode).toBe(200);
    expect(res.json().assets).toEqual([
      { id: 'a-scrubber', name: 'Scrubber', category: 'MACHINE', costCents: 26_000_000, salvageValueCents: 2_000_000, usefulLifeMonths: 48 },
    ]);
  });

  it('refuses SUPPORT', async () => {
    expect((await as('support', 'GET', '/admin/quote-builder/assets')).statusCode).toBe(403);
  });
});
