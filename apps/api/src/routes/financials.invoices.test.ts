import { beforeEach, describe, expect, it, vi } from 'vitest';

import { as, db, resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// A job made by a paid invoice keeps the invoice's amount and project. It is
// changed from the invoice (mark it not paid), never from Jobs & costs.

const LOCKED = {
  error: 'This income is the payment of invoice OH-2027-0001. To change it, open the invoice on its project and mark it not paid.',
};
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  t.users = [{ id: 'owner', fullName: 'Owner', role: 'ADMIN', isOwner: true }];
  t.projects = [{ id: 'pA', title: 'Office contract' }, { id: 'pB', title: 'Clinic' }];
  t.jobs = [{
    id: 'paid', title: 'Invoice OH-2027-0001: Office contract', date: day('2027-02-09'), incomeCents: 2_050_000,
    discountCents: 0, status: 'OWNER_ENTRY', placement: 'PROJECT', projectId: 'pA', clientName: null, clientPhone: null,
    clientLocation: null, notes: null, serviceLineCode: null, region: null, clientSegment: null, createdById: 'owner',
    reportedById: null, createdAt: day('2027-02-09'),
  }];
  db.invoice.findUnique.mockImplementation(async ({ where }) => (where.jobId === 'paid' ? { number: 'OH-2027-0001' } : null) as never);
});

describe('the income job of a paid invoice', () => {
  it('can’t be deleted', async () => {
    const res = await as('owner', 'DELETE', '/admin/financials/jobs/paid');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual(LOCKED);
    expect(t.jobs).toHaveLength(1);
  });

  it('can’t have its income changed or be moved to another project', async () => {
    const income = await as('owner', 'PATCH', '/admin/financials/jobs/paid', { incomeCents: 100 });
    expect(income.json()).toEqual(LOCKED);
    const moved = await as('owner', 'PATCH', '/admin/financials/jobs/paid', { place: { placement: 'PROJECT', projectId: 'pB' } });
    expect(moved.json()).toEqual(LOCKED);
    expect(t.jobs[0]).toMatchObject({ incomeCents: 2_050_000, projectId: 'pA' });
  });

  it('keeps its notes editable, and its own project can be resent', async () => {
    const res = await as('owner', 'PATCH', '/admin/financials/jobs/paid', {
      notes: 'Paid by M-Pesa', place: { placement: 'PROJECT', projectId: 'pA' }, incomeCents: 2_050_000,
    });
    expect(res.statusCode).toBe(200);
    expect(t.jobs[0]!.notes).toBe('Paid by M-Pesa');
  });
});
