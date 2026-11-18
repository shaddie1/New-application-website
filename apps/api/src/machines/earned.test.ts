import { describe, expect, it } from 'vitest';

import { earnedSplit } from './earned.js';
import { potFigures } from './pot.js';

/** Whole shillings to cents. */
const ksh = (shillings: number) => shillings * 100;

/** Days on a job or a hire, at a rate in shillings, with the amount written out as the database stores it. */
const days = (halfDays: number, rateShillings: number, isHire: boolean) => ({
  halfDays, amountCents: (halfDays * ksh(rateShillings)) / 2, isHire,
});

describe('earnedSplit', () => {
  it('AE1: 3 project days at KSh 2,000 and a 2-day hire at KSh 3,500 split into KSh 6,000 and KSh 7,000', () => {
    const lines = [days(6, 2_000, false), days(4, 3_500, true)];

    const split = earnedSplit(lines);

    expect(split).toEqual({ projectHalfDays: 6, projectCents: ksh(6_000), hireHalfDays: 4, hireCents: ksh(7_000) });
    // The two parts add up to what the pot counts as earned: KSh 13,000.
    const earned = potFigures({ priceCents: 0, startDay: new Date(), lines, repairs: [], investors: [], payments: [] }).earnedCents;
    expect(earned).toBe(ksh(13_000));
    expect(split.projectCents + split.hireCents).toBe(earned);
  });

  it('adds up every line of each kind, half days included', () => {
    const lines = [days(5, 2_000, false), days(1, 1_500, false), days(3, 3_500, true), days(2, 3_000, true)];

    expect(earnedSplit(lines)).toEqual({
      projectHalfDays: 6, projectCents: ksh(5_750), hireHalfDays: 5, hireCents: ksh(8_250),
    });
  });

  it('is zero in both parts for a machine with no lines', () => {
    expect(earnedSplit([])).toEqual({ projectHalfDays: 0, projectCents: 0, hireHalfDays: 0, hireCents: 0 });
  });
});
