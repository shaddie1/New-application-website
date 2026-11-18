import { beforeEach, describe, expect, it, vi } from 'vitest';

import { as, copy, costingBody as body, resetDb, staff, t, tick, weeklySurvey } from '../test-support/quoteBuilderDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/quoteBuilderDb.js')).db }));
const { sendSms } = vi.hoisted(() => ({ sendSms: vi.fn() }));
vi.mock('../auth/sms.js', () => ({ sendSms }));

const quote = (id: string, over: object = {}) => ({
  id, userId: 'cust', serviceLineId: 'sl1', siteType: 'Bank branch', approxSqm: null, floors: null, frequency: 'WEEKLY',
  notes: null, status: 'SITE_VISIT_SCHEDULED', quotedAmountCents: null, quotedAt: null, createdAt: tick(), ...over,
});
const monthly = { contractMonths: 12, clientPriceCents: 8_800_000, clientPriceBasis: 'MONTH' };
const listedAs = async (userId: string, id: string) =>
  (await as(userId, 'GET', '/admin/quote-requests')).json().quoteRequests.find((q: { id: string }) => q.id === id);

/** Cost a quote, send it for approval and have the COO approve it. */
async function approve(id: string, costing: object) {
  expect((await as('admin', 'PUT', `/admin/quote-builder/${id}/costing`, body(costing))).statusCode).toBe(200);
  expect((await as('admin', 'POST', `/admin/quote-builder/${id}/submit`)).statusCode).toBe(200);
  expect((await as('coo', 'POST', `/admin/quote-builder/${id}/approve`, {})).statusCode).toBe(200);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [
    staff('admin', 'ADMIN'), staff('coo', 'COO'), staff('support', 'SUPPORT'),
    { id: 'cust', fullName: 'Grace Wanjiru', phone: '+254712000999', role: 'CUSTOMER', isOwner: false },
  ];
  t.serviceLines = [{ id: 'sl1', code: 'office', name: 'Office cleaning', isActive: true }];
  t.quotes = [quote('q1')];
  t.surveys = [{ id: 's1', quoteRequestId: 'q1', ...copy(weeklySurvey), updatedById: 'admin', createdAt: tick(), updatedAt: tick() }];
});

describe('submit and approve', () => {
  it('AE1: a client price below the minimum margin still goes through submit and approval', async () => {
    // Cost base 222,200 (survey, lunch and contingency); at KSh 2,500 the margin is 11%.
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ clientPriceCents: 250_000, clientPriceBasis: 'VISIT' }));
    const draft = (await listedAs('admin', 'q1')).estimate;
    expect(draft.output.pricing.marginCheck).toBe('BELOW MINIMUM');

    const submit = await as('admin', 'POST', '/admin/quote-builder/q1/submit');
    expect(submit.statusCode).toBe(200);
    expect(submit.json().quoteRequest.status).toBe('AWAITING_APPROVAL');

    const approve = await as('coo', 'POST', '/admin/quote-builder/q1/approve', {});
    expect(approve.statusCode).toBe(200);
    expect(approve.json().quoteRequest.status).toBe('APPROVED');
  });

  it('refuses to send a quoted price of 0 for approval', async () => {
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ clientPriceCents: 0, clientPriceBasis: 'VISIT' }));

    const res = await as('admin', 'POST', '/admin/quote-builder/q1/submit');

    expect(res.statusCode).toBe(409);
    expect(t.quotes[0]!.status).toBe('SITE_VISIT_SCHEDULED');
  });

  it('refuses to send a price per visit above what a quote can carry', async () => {
    // 100 cleaners at KSh 10,000 a day for 31 days is KSh 31M of pay per visit.
    const costed = await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ crewSize: 100, jobDays: 31, cleanerPayPerDayCents: 1_000_000 }));
    expect(costed.statusCode).toBe(200);

    const res = await as('admin', 'POST', '/admin/quote-builder/q1/submit');

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('21,474,836.47');
    expect(t.quotes[0]!.status).toBe('SITE_VISIT_SCHEDULED');
  });
});

describe('what the client is quoted', () => {
  it('quotes and texts a per-visit client price as before', async () => {
    await approve('q1', { clientPriceCents: 1_200_000, clientPriceBasis: 'VISIT' });

    const res = await as('admin', 'POST', '/admin/quote-requests/q1/respond', { status: 'QUOTED' });

    expect(res.statusCode).toBe(200);
    expect(t.quotes[0]!.quotedAmountCents).toBe(1_200_000);
    await vi.waitFor(() => expect(sendSms).toHaveBeenCalled());
    const [phone, text] = sendSms.mock.calls[0]!;
    expect(phone).toBe('+254712000999');
    expect(text).toContain('KSh 12,000 for "Bank branch"');
    expect(text).not.toContain('per month');
  });

  it('quotes a monthly price per visit, and texts it per month', async () => {
    await approve('q1', monthly);

    await as('admin', 'POST', '/admin/quote-requests/q1/respond', { status: 'QUOTED' });

    expect(t.quotes[0]!.quotedAmountCents).toBe(2_200_000); // 8,800,000 ÷ 4 visits
    await vi.waitFor(() => expect(sendSms).toHaveBeenCalled());
    expect(sendSms.mock.calls[0]![1]).toContain('KSh 88,000 per month');
  });

  it('puts the exact monthly price and its basis on the client quotation', async () => {
    await approve('q1', monthly);

    const { quotation } = (await as('admin', 'GET', '/admin/quote-builder/q1/client-quotation')).json();

    expect(quotation).toMatchObject({ priceBasis: 'MONTH', monthlyValueCents: 8_800_000, pricePerVisitCents: 2_200_000 });
  });

  it('prints the costing scope text, never the request notes, when nothing was surveyed', async () => {
    t.quotes.push(quote('q2', { siteType: 'Clinic', notes: 'Lead notes: competitor quoted 70k, decision maker is cagey' }));
    await approve('q2', {
      crewSize: 2, jobDays: 1, clientScope: 'Daily cleaning of the reception and two washrooms',
      clientPriceCents: 500_000, clientPriceBasis: 'VISIT',
    });

    const { quotation } = (await as('admin', 'GET', '/admin/quote-builder/q2/client-quotation')).json();

    expect(quotation.scope).toEqual([
      { label: 'Office cleaning', detail: 'Clinic', description: 'Daily cleaning of the reception and two washrooms' },
    ]);
    expect(JSON.stringify(quotation)).not.toContain('competitor');
  });

  it('shows every staff role the approved monthly price, and no costs', async () => {
    await approve('q1', monthly);

    const seen = await listedAs('support', 'q1');

    expect(seen).toMatchObject({ approvedPricePerVisitCents: 2_200_000, approvedPriceBasis: 'MONTH', approvedMonthlyValueCents: 8_800_000 });
    expect(seen.estimate).toBeNull();
    expect(seen.costing).toBeNull();
  });
});

describe('decision notes', () => {
  it('shows the rejection note to estimate roles only', async () => {
    await as('admin', 'PUT', '/admin/quote-builder/q1/costing', body({ clientPriceCents: 250_000, clientPriceBasis: 'VISIT' }));
    await as('admin', 'POST', '/admin/quote-builder/q1/submit');
    expect((await as('coo', 'POST', '/admin/quote-builder/q1/reject', { note: 'Too thin, ask for 15% more' })).statusCode).toBe(200);

    expect((await listedAs('support', 'q1')).approvalNote).toBeNull();
    expect((await listedAs('coo', 'q1')).approvalNote).toBe('Too thin, ask for 15% more');
  });
});
