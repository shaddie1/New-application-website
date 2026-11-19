import { describe, expect, it } from 'vitest';

import { activeBookings, noActiveJobs } from './status';

const stats = (pendingPayment: number, confirmed: number, inProgress: number, pendingQuotes: number) => ({
  pendingPayment, confirmed, inProgress, pendingQuotes,
});

describe('noActiveJobs', () => {
  it('is true only when all four counters are zero', () => {
    expect(noActiveJobs(stats(0, 0, 0, 0))).toBe(true);
  });

  it('is false when any one counter has something in it', () => {
    expect(noActiveJobs(stats(1, 0, 0, 0))).toBe(false);
    expect(noActiveJobs(stats(0, 1, 0, 0))).toBe(false);
    expect(noActiveJobs(stats(0, 0, 1, 0))).toBe(false);
    expect(noActiveJobs(stats(0, 0, 0, 1))).toBe(false);
  });
});

describe('activeBookings', () => {
  it('adds bookings awaiting payment, confirmed and in progress, and leaves quotes out', () => {
    expect(activeBookings(stats(2, 3, 4, 50))).toBe(9);
  });
});
