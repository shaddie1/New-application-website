import { beforeEach, describe, expect, it, vi } from 'vitest';

import { as, costingBody, resetDb, staff, t } from '../test-support/quoteBuilderDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/quoteBuilderDb.js')).db }));

const newQuote = (over: object = {}) => ({
  customerName: 'Peter Kamau',
  customerPhone: '0712 345 678',
  serviceLineCode: 'office',
  siteType: 'Equity Bank, Ngong Road branch',
  frequency: 'WEEKLY',
  frequencyLabel: 'Weekly (4 visits)',
  scopeNotes: 'Banking hall, two washrooms and the staff kitchen, after hours',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [staff('admin', 'ADMIN'), staff('support', 'SUPPORT')];
  t.serviceLines = [
    { id: 'sl-office', code: 'office', name: 'Office cleaning', isActive: true },
    { id: 'sl-fum', code: 'fumigation', name: 'Fumigation', isActive: false },
  ];
});

describe('POST /admin/quote-builder/quotes', () => {
  it('creates the customer, a quote with a visit scheduled, a seeded survey and the client scope', async () => {
    const res = await as('admin', 'POST', '/admin/quote-builder/quotes', newQuote());

    expect(res.statusCode).toBe(201);
    const customer = t.users.find((u) => u.phone === '+254712345678')!;
    expect(customer).toMatchObject({ fullName: 'Peter Kamau', role: 'CUSTOMER' });
    expect(customer.referralCode).toMatch(/^[A-Z2-9]{6,8}$/);
    const quote = t.quotes[0]!;
    expect(quote).toMatchObject({
      userId: customer.id, serviceLineId: 'sl-office', siteType: 'Equity Bank, Ngong Road branch', frequency: 'WEEKLY',
      status: 'SITE_VISIT_SCHEDULED', notes: 'Banking hall, two washrooms and the staff kitchen, after hours',
    });
    expect(t.surveys[0]).toMatchObject({ quoteRequestId: quote.id, frequencyLabel: 'Weekly (4 visits)', areas: [], items: [] });
    expect(t.costings[0]!.data.clientScope).toBe('Banking hall, two washrooms and the staff kitchen, after hours');
    expect(res.json().quoteRequest).toMatchObject({ id: quote.id, customerName: 'Peter Kamau', status: 'SITE_VISIT_SCHEDULED' });
  });

  it('seeds the survey with the visits picked, not the closest "how often"', async () => {
    await as('admin', 'POST', '/admin/quote-builder/quotes', newQuote({ frequencyLabel: 'Daily (22 visits)' }));

    expect(t.surveys[0]!.frequencyLabel).toBe('Daily (22 visits)');
  });

  it('refuses visits that are not on the rates card', async () => {
    const res = await as('admin', 'POST', '/admin/quote-builder/quotes', newQuote({ frequencyLabel: 'Hourly (999 visits)' }));

    expect(res.statusCode).toBe(400);
    expect(t.quotes).toHaveLength(0);
  });

  it('files the quote under an existing account with that phone, keeping its name', async () => {
    t.users.push({ id: 'cust', fullName: 'Peter K. (app)', phone: '+254712345678', role: 'CUSTOMER', isOwner: false });

    const res = await as('admin', 'POST', '/admin/quote-builder/quotes', newQuote({ customerPhone: '712345678' }));

    expect(res.statusCode).toBe(201);
    expect(t.users).toHaveLength(3);
    expect(t.quotes[0]!.userId).toBe('cust');
    expect(t.users.find((u) => u.id === 'cust')!.fullName).toBe('Peter K. (app)');
  });

  it('refuses an invalid phone, and an unknown or inactive service line', async () => {
    expect((await as('admin', 'POST', '/admin/quote-builder/quotes', newQuote({ customerPhone: '12' }))).statusCode).toBe(400);
    expect((await as('admin', 'POST', '/admin/quote-builder/quotes', newQuote({ serviceLineCode: 'fumigation' }))).statusCode).toBe(400);
    expect((await as('admin', 'POST', '/admin/quote-builder/quotes', newQuote({ serviceLineCode: 'laundry' }))).statusCode).toBe(400);
    expect(t.quotes).toHaveLength(0);
  });

  it('refuses SUPPORT', async () => {
    expect((await as('support', 'POST', '/admin/quote-builder/quotes', newQuote())).statusCode).toBe(403);
  });

  it('AE5: a quote started in admin can be costed by hand straight away, and is listed', async () => {
    const id = (await as('admin', 'POST', '/admin/quote-builder/quotes', newQuote())).json().quoteRequest.id;

    const costed = await as('admin', 'PUT', `/admin/quote-builder/${id}/costing`, costingBody({
      crewSize: 4, jobDays: 1, supervisorDays: 1, clientPriceCents: 1_000_000, clientPriceBasis: 'VISIT', clientScope: 'Banking hall',
    }));

    expect(costed.statusCode).toBe(200);
    const { estimate } = costed.json().quoteRequest;
    expect(estimate.output.costs).toMatchObject({ labourCents: 320_000, supervisorCents: 80_000, lunchCents: 50_000, transportCents: 100_000 });
    expect(estimate.output.profit.perVisitCents).toBe(373_000); // 1,000,000 − 627,000

    const listed = (await as('admin', 'GET', '/admin/quote-requests')).json().quoteRequests;
    expect(listed.map((q: { id: string }) => q.id)).toEqual([id]);
  });
});
