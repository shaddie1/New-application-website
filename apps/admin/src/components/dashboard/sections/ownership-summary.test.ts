import type { OwnershipSummary } from '@onyxhawk/types';
import { describe, expect, it } from 'vitest';

import { splitSegments } from '../../ownership/split';
import { ownershipSummaryView } from './ownership-summary';

const NOVEMBER = { year: 2026, month: 11 };
const OCTOBER = { year: 2026, month: 10 };

type Holder = OwnershipSummary['holders'][number];

/** A holder whose two shares are their stake of the month's net and of the all-time net. */
function holder(id: string, name: string, basisPoints: number, monthNetCents: number, allTimeNetCents: number): Holder {
  return {
    id,
    name,
    kind: 'INDIVIDUAL',
    basisPoints,
    periodShareCents: (monthNetCents * basisPoints) / 10_000,
    allTimeShareCents: (allTimeNetCents * basisPoints) / 10_000,
  };
}

/** A summary for `month`, with the unallocated amounts worked out from the stakes. */
function summary(
  month: { year: number; month: number },
  stakes: [string, string, number][],
  monthNetCents: number,
  allTimeNetCents = 51_130_000,
): OwnershipSummary {
  const holders = stakes.map(([id, name, basisPoints]) => holder(id, name, basisPoints, monthNetCents, allTimeNetCents));
  const totalBasisPoints = holders.reduce((sum, h) => sum + h.basisPoints, 0);
  return {
    ...month,
    holders,
    totalBasisPoints,
    unallocatedPeriodCents: monthNetCents - holders.reduce((sum, h) => sum + h.periodShareCents, 0),
    unallocatedAllTimeCents: allTimeNetCents - holders.reduce((sum, h) => sum + h.allTimeShareCents, 0),
    periodNetCents: monthNetCents,
    allTimeNetCents,
  };
}

const FORTY_THIRTY_THIRTY: [string, string, number][] = [
  ['h1', 'OnyxHawk (Company)', 4000],
  ['h2', 'Shadrack Amihanda', 3000],
  ['h3', 'Zecharia Mwangi', 3000],
];

const owner = { current: NOVEMBER, canManageOwnership: true };
const shareholder = { current: NOVEMBER, canManageOwnership: false };

/** The view of a summary that has holders; fails the test when it is anything else. */
function split(source: OwnershipSummary, viewer = owner) {
  const view = ownershipSummaryView(source, viewer);
  if (view.kind !== 'split') throw new Error(`expected a split, got ${view.kind}`);
  return view;
}

describe('ownershipSummaryView', () => {
  it('gives stakes of 40, 30 and 30 three rows in table order, each with both shares', () => {
    const view = split(summary(NOVEMBER, FORTY_THIRTY_THIRTY, 3_880_000));

    expect(view.rows.map((row) => [row.kind, row.name, row.stake, row.monthShareCents, row.allTimeShareCents])).toEqual([
      ['holder', 'OnyxHawk (Company)', '40%', 1_552_000, 20_452_000],
      ['holder', 'Shadrack Amihanda', '30%', 1_164_000, 15_339_000],
      ['holder', 'Zecharia Mwangi', '30%', 1_164_000, 15_339_000],
    ]);
    // Each holder keeps the colour of their place in the table, as on Ownership.
    expect(view.rows.map((row) => row.colourIndex)).toEqual([0, 1, 2]);
    expect(view.noSplitLine).toBeNull();
    expect(view.total).toEqual({ stake: '100%', balanced: true, monthNetCents: 3_880_000, allTimeNetCents: 51_130_000 });
  });

  it('marks a company holder', () => {
    const source = summary(NOVEMBER, FORTY_THIRTY_THIRTY, 3_880_000);
    source.holders[0]!.kind = 'COMPANY';
    expect(split(source).rows.map((row) => row.isCompany)).toEqual([true, false, false]);
  });

  it('adds a retained row and a retained segment when 90% is allocated', () => {
    const view = split(summary(NOVEMBER, [['h1', 'Amina Yusuf', 5000], ['h2', 'Zed Otieno', 4000]], 4_000_000, 10_000_000));

    expect(view.rows).toHaveLength(3);
    expect(view.rows[2]).toEqual({
      key: '__retained',
      kind: 'retained',
      name: 'Retained by the business',
      isCompany: false,
      colourIndex: null,
      stake: '10%',
      monthShareCents: 400_000,
      allTimeShareCents: 1_000_000,
    });
    expect(view.total).toMatchObject({ stake: '90%', balanced: false });
    // The bar is drawn from what the view hands it.
    const segments = splitSegments(view.bar.holders);
    expect(segments.map((s) => [s.kind, s.basisPoints])).toEqual([['holder', 5000], ['holder', 4000], ['retained', 1000]]);
    expect(view.bar.unallocatedCents).toBe(400_000);
  });

  it('adds an over-allocated row when the stakes pass 100%', () => {
    const view = split(summary(NOVEMBER, [['h1', 'Amina Yusuf', 7000], ['h2', 'Zed Otieno', 5000]], 4_000_000, 10_000_000));

    expect(view.rows[2]).toMatchObject({
      kind: 'over-allocated',
      name: 'Over-allocated',
      stake: '−20%',
      monthShareCents: -800_000,
      allTimeShareCents: -2_000_000,
    });
    expect(view.total).toMatchObject({ stake: '120%', balanced: false });
  });

  it('gives no extra row when the stakes total 100%', () => {
    expect(split(summary(NOVEMBER, FORTY_THIRTY_THIRTY, 3_880_000)).rows.every((row) => row.kind === 'holder')).toBe(true);
  });

  it('shows each share as negative and states the loss in a month that lost KSh 20,000', () => {
    const view = split(summary(NOVEMBER, FORTY_THIRTY_THIRTY, -2_000_000));

    expect(view.rows.map((row) => row.monthShareCents)).toEqual([-800_000, -600_000, -600_000]);
    expect(view.noSplitLine).toBe('A loss of KSh 20,000 this month');
    expect(view.loss).toBe(true);
    expect(view.total.monthNetCents).toBe(-2_000_000);
  });

  it('names the month when the loss was in a past one', () => {
    const view = split(summary(OCTOBER, FORTY_THIRTY_THIRTY, -2_000_000));
    expect(view.noSplitLine).toBe('A loss of KSh 20,000 in October 2026');
  });

  it('says there is no profit to share when the net is zero', () => {
    const thisMonth = split(summary(NOVEMBER, FORTY_THIRTY_THIRTY, 0));
    expect(thisMonth.noSplitLine).toBe('No profit to share this month');
    expect(thisMonth.loss).toBe(false);

    expect(split(summary(OCTOBER, FORTY_THIRTY_THIRTY, 0)).noSplitLine).toBe('No profit to share in October 2026');
  });

  it('marks a past month as split at today’s stakes, and the current month not', () => {
    expect(split(summary(OCTOBER, FORTY_THIRTY_THIRTY, 3_880_000)).atTodaysStakes).toBe(true);
    expect(split(summary(NOVEMBER, FORTY_THIRTY_THIRTY, 3_880_000)).atTodaysStakes).toBe(false);
  });

  it('heads the month column with the month the server answered for', () => {
    expect(split(summary(OCTOBER, FORTY_THIRTY_THIRTY, 3_880_000)).monthLabel).toBe('October 2026');
  });

  it('is the "Set up ownership" state for an empty holder list and a viewer who manages ownership', () => {
    expect(ownershipSummaryView(summary(NOVEMBER, [], 3_880_000), owner)).toEqual({ kind: 'set-up' });
  });

  it('is a plain note, with nothing to set up, for an empty holder list and any other viewer', () => {
    expect(ownershipSummaryView(summary(NOVEMBER, [], 3_880_000), shareholder)).toEqual({ kind: 'no-holders' });
  });

  it('gives a shareholder the same rows as the owner', () => {
    const source = summary(NOVEMBER, FORTY_THIRTY_THIRTY, 3_880_000);
    expect(split(source, shareholder).rows).toEqual(split(source, owner).rows);
  });
});
