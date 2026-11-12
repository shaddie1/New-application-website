import { describe, expect, it } from 'vitest';

import { noActiveJobs } from './status';

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
