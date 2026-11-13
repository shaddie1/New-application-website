import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminStats } from '@onyxhawk/types';

import { type CastId, requestAs, seedCast } from '../test-support/cast.js';
import { resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// GET /admin/stats feeds "Needs attention": the four status counters and the
// counts on the action cards. It always describes the present.

const STATS = '/admin/stats';
const NOW = new Date('2026-11-12T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** A booking scheduled so many days from now; a negative number is in the past. */
const booking = (id: string, status: string, daysFromNow = 3) => ({
  id, status, scheduledAt: new Date(NOW.getTime() + daysFromNow * DAY_MS),
});

async function statsFor(who: CastId): Promise<AdminStats> {
  const res = await requestAs(who, 'GET', STATS);
  expect(res.statusCode).toBe(200);
  return res.json().stats;
}

beforeEach(() => {
  resetDb();
  seedCast();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /admin/stats', () => {
  it('counts bookings by status and the quote requests still to answer', async () => {
    t.bookings = [
      booking('b1', 'PENDING_PAYMENT'),
      booking('b2', 'PENDING_PAYMENT'),
      booking('b3', 'CONFIRMED'),
      booking('b4', 'EN_ROUTE'),
      booking('b5', 'IN_PROGRESS'),
      booking('b6', 'IN_PROGRESS'),
      booking('b7', 'COMPLETED'),
      booking('b8', 'CANCELLED'),
    ];
    t.quoteRequests = [
      { id: 'q1', status: 'PENDING' },
      { id: 'q2', status: 'PENDING' },
      { id: 'q3', status: 'PENDING' },
      { id: 'q4', status: 'QUOTED' },
    ];

    expect(await statsFor('owner')).toMatchObject({ pendingPayment: 2, confirmed: 1, inProgress: 3, pendingQuotes: 3 });
  });

  it('counts a confirmed booking with no crew as unassigned, and one with a crew member as assigned', async () => {
    t.bookings = [booking('bare', 'CONFIRMED'), booking('crewed', 'CONFIRMED')];
    t.bookingCrew = [{ id: 'bc1', bookingId: 'crewed', userId: 'crew', role: 'LEAD' }];

    const stats = await statsFor('owner');

    expect(stats.confirmed).toBe(2);
    expect(stats.unassignedBookings).toBe(1);
  });

  it('counts only confirmed bookings as waiting for a crew', async () => {
    t.bookings = [booking('unpaid', 'PENDING_PAYMENT'), booking('done', 'COMPLETED'), booking('off', 'CANCELLED')];

    expect((await statsFor('owner')).unassignedBookings).toBe(0);
  });

  it('counts an unpaid booking scheduled yesterday as past its date, and not one scheduled tomorrow or 31 days ago', async () => {
    t.bookings = [
      booking('yesterday', 'PENDING_PAYMENT', -1),
      booking('tomorrow', 'PENDING_PAYMENT', 1),
      booking('longAgo', 'PENDING_PAYMENT', -31),
    ];

    const stats = await statsFor('owner');

    expect(stats.pendingPayment).toBe(3);
    expect(stats.unpaidPastDate).toBe(1);
  });

  it('does not count a booking that was paid for, whenever its date was', async () => {
    t.bookings = [booking('paid', 'CONFIRMED', -1), booking('done', 'COMPLETED', -2), booking('off', 'CANCELLED', -3)];

    expect((await statsFor('owner')).unpaidPastDate).toBe(0);
  });

  // `demoted` signed in as ADMIN and is SUPPORT on the record, which still sees the section.
  it.each<CastId>(['owner', 'admin', 'coo', 'support', 'supervisor', 'marketing', 'supportLinked', 'demoted'])(
    'answers %s, who sees "Needs attention"',
    async (who) => {
      expect((await requestAs(who, 'GET', STATS)).statusCode).toBe(200);
    },
  );

  it.each<CastId>(['finance', 'shareholderLinked', 'shareholder'])('refuses %s, who does not', async (who) => {
    const res = await requestAs(who, 'GET', STATS);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'dashboard section access required' });
  });

  it.each<CastId>(['customer', 'crew', 'crewLinked'])('refuses %s, who has no back-office', async (who) => {
    expect((await requestAs(who, 'GET', STATS)).statusCode).toBe(403);
  });

  it('answers 401 with no sign-in', async () => {
    expect((await requestAs(null, 'GET', STATS)).statusCode).toBe(401);
  });
});
