import { describe, expect, it } from 'vitest';
import type { ShareholderDto } from '@onyxhawk/types';

import {
  balanceText,
  blankRow,
  buildReplaceStakesInput,
  confirmationSummary,
  formatPercent,
  formatPercentShort,
  parseStake,
  readStakesForm,
  rowsFor,
  stakeBalance,
  stakeDifferences,
  stakeText,
  sumBasisPoints,
  type StakeRow,
} from './stakes';

const holder = (id: string, name: string, basisPoints: number, over: Partial<ShareholderDto> = {}): ShareholderDto => ({
  id, name, title: null, kind: 'INDIVIDUAL', basisPoints, notes: null, userId: null, userName: null, sortOrder: 0, ...over,
});

/** The cap table the form opens with: 40%, 30% and 30%. Brian has a linked account. */
const OPENED = [
  holder('h1', 'OnyxHawk Holdings', 4000, { kind: 'COMPANY' }),
  holder('h2', 'Amina Yusuf', 3000, { title: 'Director' }),
  holder('h3', 'Brian Otieno', 3000, { userId: 'u-brian', userName: 'Brian O.' }),
];

/** The opening rows with some stakes retyped, by holder id. */
const retyped = (stakes: Record<string, string>): StakeRow[] =>
  rowsFor(OPENED).map((row) => (row.id && row.id in stakes ? { ...row, stake: stakes[row.id]! } : row));

const newRow = (over: Partial<StakeRow>): StakeRow => ({ ...blankRow('new-1'), ...over });

describe('parseStake', () => {
  it.each([
    ['40', 4000],
    ['33.33', 3333],
    ['0.5', 50],
    ['0.01', 1],
    ['100', 10_000],
    ['100.00', 10_000],
    [' 25 ', 2500],
    // Each of these comes out a hair off when multiplied by 100 as a fraction.
    ['1.15', 115],
    ['0.07', 7],
    ['8.2', 820],
    ['0.29', 29],
    ['4.35', 435],
  ])('reads "%s" as %i basis points', (typed, basisPoints) => {
    expect(parseStake(typed)).toEqual({ ok: true, basisPoints });
  });

  it('refuses a third decimal place as typed, and never rounds it', () => {
    const reading = parseStake('33.335');
    expect(reading.ok).toBe(false);
    expect(reading).toMatchObject({ reason: expect.stringMatching(/two decimal places/) });
    expect(parseStake('33.330').ok).toBe(false);
  });

  it.each(['abc', '-1', '100.01', '101', '', '   ', '12abc', '1e2', '1,5', '4 0'])('refuses "%s" with a reason', (typed) => {
    const reading = parseStake(typed);
    expect(reading.ok).toBe(false);
    expect(reading).toMatchObject({ reason: expect.stringMatching(/\S/) });
  });

  it('refuses 0%', () => {
    expect(parseStake('0').ok).toBe(false);
    expect(parseStake('0.00').ok).toBe(false);
  });

  it('says what is wrong in each case', () => {
    const reasons = ['', 'abc', '-1', '100.01', '0', '33.335'].map((typed) => {
      const reading = parseStake(typed);
      return reading.ok ? null : reading.reason;
    });
    // Six different faults, six different sentences.
    expect(new Set(reasons).size).toBe(6);
    expect(reasons).not.toContain(null);
  });
});

describe('totals', () => {
  it('AE6: 33.33, 33.33 and 33.34 total exactly 100.00%', () => {
    const stakes = ['33.33', '33.33', '33.34'].map((typed) => {
      const reading = parseStake(typed);
      return reading.ok ? reading.basisPoints : Number.NaN;
    });
    expect(stakes).toEqual([3333, 3333, 3334]);
    expect(sumBasisPoints(stakes)).toBe(10_000);
    expect(stakeBalance(sumBasisPoints(stakes))).toEqual({ kind: 'exact', basisPoints: 0 });
  });

  it('AE5: 40/30/30 plus a new 10% is 10% over', () => {
    expect(stakeBalance(sumBasisPoints([4000, 3000, 3000, 1000]))).toEqual({ kind: 'over', basisPoints: 1000 });
  });

  it('reports what is left when the stakes total 90%', () => {
    expect(stakeBalance(9000)).toEqual({ kind: 'left', basisPoints: 1000 });
  });

  it('reports a single basis point either way', () => {
    expect(stakeBalance(9999)).toEqual({ kind: 'left', basisPoints: 1 });
    expect(stakeBalance(10_001)).toEqual({ kind: 'over', basisPoints: 1 });
  });
});

describe('formatting', () => {
  it('writes basis points as a percentage with two decimals', () => {
    expect(formatPercent(10_000)).toBe('100.00%');
    expect(formatPercent(11_000)).toBe('110.00%');
    expect(formatPercent(3333)).toBe('33.33%');
    expect(formatPercent(50)).toBe('0.50%');
    expect(formatPercent(7)).toBe('0.07%');
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('has a short form without trailing zeros', () => {
    expect(formatPercentShort(4000)).toBe('40%');
    expect(formatPercentShort(3333)).toBe('33.33%');
    expect(formatPercentShort(50)).toBe('0.5%');
    expect(formatPercentShort(-500)).toBe('-5%');
  });

  it('writes a stake as the text its field starts with, which reads back to the same stake', () => {
    expect(stakeText(4000)).toBe('40');
    expect(stakeText(3333)).toBe('33.33');
    expect(stakeText(50)).toBe('0.5');
    for (const basisPoints of [1, 7, 29, 115, 435, 820, 3333, 9999, 10_000]) {
      expect(parseStake(stakeText(basisPoints))).toEqual({ ok: true, basisPoints });
    }
  });
});

describe('stakeDifferences', () => {
  it('lists three changes with before and after between 40/30/30 and 50/25/25', () => {
    const differences = stakeDifferences(OPENED, [
      { id: 'h1', basisPoints: 5000 },
      { id: 'h2', basisPoints: 2500 },
      { id: 'h3', basisPoints: 2500 },
    ]);

    expect(differences.map((d) => [d.kind, d.name, d.beforeBasisPoints, d.afterBasisPoints])).toEqual([
      ['changed', 'OnyxHawk Holdings', 4000, 5000],
      ['changed', 'Amina Yusuf', 3000, 2500],
      ['changed', 'Brian Otieno', 3000, 2500],
    ]);
  });

  it('leaves out a holder whose stake did not move', () => {
    const differences = stakeDifferences(OPENED, [
      { id: 'h1', basisPoints: 4000 },
      { id: 'h2', basisPoints: 3500 },
      { id: 'h3', basisPoints: 2500 },
    ]);

    expect(differences.map((d) => d.name)).toEqual(['Amina Yusuf', 'Brian Otieno']);
  });

  it('lists an added holder with no "before" and a removed holder with no "after"', () => {
    const differences = stakeDifferences(OPENED, [
      { id: 'h1', basisPoints: 4000 },
      { id: 'h3', basisPoints: 3000 },
      { name: 'Chege Mwangi', kind: 'INDIVIDUAL', basisPoints: 3000 },
    ]);

    expect(differences.map((d) => [d.kind, d.name, d.beforeBasisPoints, d.afterBasisPoints])).toEqual([
      ['removed', 'Amina Yusuf', 3000, null],
      ['added', 'Chege Mwangi', null, 3000],
    ]);
  });

  it('flags a removed holder who has a linked account, and only them', () => {
    const differences = stakeDifferences(OPENED, [
      // Brian (linked) and Amina (not linked) are removed; the company takes everything.
      { id: 'h1', basisPoints: 10_000 },
    ]);

    expect(differences.map((d) => [d.kind, d.name, d.linkedAccount, d.linkedAccountName])).toEqual([
      ['changed', 'OnyxHawk Holdings', false, null],
      ['removed', 'Amina Yusuf', false, null],
      ['removed', 'Brian Otieno', true, 'Brian O.'],
    ]);
  });

  it('does not flag a holder with a linked account who stays', () => {
    const differences = stakeDifferences(OPENED, [
      { id: 'h1', basisPoints: 4500 },
      { id: 'h2', basisPoints: 3000 },
      { id: 'h3', basisPoints: 2500 },
    ]);

    expect(differences.find((d) => d.name === 'Brian Otieno')).toMatchObject({ kind: 'changed', linkedAccount: false });
  });
});

describe('buildReplaceStakesInput', () => {
  it('sends the stakes the form opened with, and the new set', () => {
    const input = buildReplaceStakesInput(OPENED, retyped({ h1: '50', h2: '25', h3: '25' }));

    expect(input).toEqual({
      expected: [
        { id: 'h1', basisPoints: 4000 },
        { id: 'h2', basisPoints: 3000 },
        { id: 'h3', basisPoints: 3000 },
      ],
      holders: [
        { id: 'h1', basisPoints: 5000 },
        { id: 'h2', basisPoints: 2500 },
        { id: 'h3', basisPoints: 2500 },
      ],
    });
  });

  it('leaves a removed holder out of the new set but not out of the opened-with set', () => {
    const rows = retyped({ h1: '50', h2: '50' }).map((row) => (row.id === 'h3' ? { ...row, removed: true } : row));

    const input = buildReplaceStakesInput(OPENED, rows);

    expect(input?.expected.map((e) => e.id)).toEqual(['h1', 'h2', 'h3']);
    expect(input?.holders).toEqual([
      { id: 'h1', basisPoints: 5000 },
      { id: 'h2', basisPoints: 5000 },
    ]);
  });

  it('sends a new holder by name, trimmed, with a blank title as none', () => {
    const rows = [
      ...retyped({ h1: '36', h2: '27', h3: '27' }),
      newRow({ key: 'new-1', name: '  Chege Mwangi ', title: ' Investor ', stake: '6' }),
      newRow({ key: 'new-2', name: 'Savanna Ventures', title: '   ', kind: 'COMPANY', stake: '4' }),
    ];

    const input = buildReplaceStakesInput(OPENED, rows);

    expect(input?.holders.slice(3)).toEqual([
      { name: 'Chege Mwangi', title: 'Investor', kind: 'INDIVIDUAL', basisPoints: 600 },
      { name: 'Savanna Ventures', title: null, kind: 'COMPANY', basisPoints: 400 },
    ]);
  });

  it('builds nothing while a row cannot be read', () => {
    expect(buildReplaceStakesInput(OPENED, retyped({ h1: '33.335' }))).toBeNull();
    expect(buildReplaceStakesInput(OPENED, [...rowsFor(OPENED), newRow({ name: '  ', stake: '10' })])).toBeNull();
  });
});

describe('readStakesForm', () => {
  it('opens with one row per holder, at their stakes, and nothing to save yet', () => {
    const rows = rowsFor(OPENED);

    expect(rows.map((r) => [r.id, r.name, r.stake, r.removed])).toEqual([
      ['h1', 'OnyxHawk Holdings', '40', false],
      ['h2', 'Amina Yusuf', '30', false],
      ['h3', 'Brian Otieno', '30', false],
    ]);
    const form = readStakesForm(OPENED, rows);
    expect(form.totalBasisPoints).toBe(10_000);
    expect(form.differences).toEqual([]);
    expect(form.input).toBeNull();
    expect(form.blockedReason).toMatch(/no changes/i);
  });

  it('AE5: a fourth holder at 10% makes the total 110.00%, 10.00% over, and cannot be saved', () => {
    const rows = [...rowsFor(OPENED), newRow({ name: 'Chege Mwangi', stake: '10' })];

    const form = readStakesForm(OPENED, rows);

    expect(formatPercent(form.totalBasisPoints)).toBe('110.00%');
    expect(balanceText(form.balance)).toBe('10.00% over');
    expect(form.blockedReason).toMatch(/exactly 100\.00%/);
    expect(form.input).toBeNull();
  });

  it('cannot be saved at 90%, and says how much is left', () => {
    const form = readStakesForm(OPENED, retyped({ h1: '30' }));

    expect(balanceText(form.balance)).toBe('10.00% left');
    expect(form.blockedReason).toMatch(/exactly 100\.00%/);
    expect(form.input).toBeNull();
  });

  it('cannot be saved one hundredth of a percent either side of 100%', () => {
    const under = readStakesForm(OPENED, retyped({ h1: '39.99' }));
    expect(balanceText(under.balance)).toBe('0.01% left');
    expect(under.input).toBeNull();

    const over = readStakesForm(OPENED, retyped({ h1: '40.01' }));
    expect(balanceText(over.balance)).toBe('0.01% over');
    expect(over.input).toBeNull();
  });

  it('AE6: 33.33, 33.33 and 33.34 can be saved', () => {
    const form = readStakesForm(OPENED, retyped({ h1: '33.33', h2: '33.33', h3: '33.34' }));

    expect(form.totalBasisPoints).toBe(10_000);
    expect(balanceText(form.balance)).toBeNull();
    expect(form.blockedReason).toBeNull();
    expect(form.input?.holders).toEqual([
      { id: 'h1', basisPoints: 3333 },
      { id: 'h2', basisPoints: 3333 },
      { id: 'h3', basisPoints: 3334 },
    ]);
    expect(form.differences).toHaveLength(3);
  });

  it('AE6: marks 33.335 on its own row and cannot be saved', () => {
    const form = readStakesForm(OPENED, retyped({ h1: '33.335', h2: '33.33', h3: '33.34' }));

    expect(form.problems.h1?.stake).toMatch(/two decimal places/);
    expect(form.problems.h2).toBeUndefined();
    expect(form.problems.h3).toBeUndefined();
    expect(form.blockedReason).toMatch(/\S/);
    expect(form.input).toBeNull();
  });

  it('marks a new row with no name, and a row at 0%', () => {
    const rows = [...retyped({ h1: '30', h2: '0' }), newRow({ key: 'new-1', name: ' ', stake: '40' })];

    const form = readStakesForm(OPENED, rows);

    expect(form.problems['new-1']?.name).toMatch(/\S/);
    expect(form.problems['new-1']?.stake).toBeUndefined();
    expect(form.problems.h2?.stake).toMatch(/\S/);
    expect(form.input).toBeNull();
  });

  it('does not count a removed row, or judge what is typed in it', () => {
    const rows = retyped({ h1: '50', h2: '50', h3: 'abc' }).map((row) => (row.id === 'h3' ? { ...row, removed: true } : row));

    const form = readStakesForm(OPENED, rows);

    expect(form.problems.h3).toBeUndefined();
    expect(form.totalBasisPoints).toBe(10_000);
    expect(form.blockedReason).toBeNull();
    expect(form.differences.map((d) => [d.kind, d.name])).toEqual([
      ['changed', 'OnyxHawk Holdings'],
      ['changed', 'Amina Yusuf'],
      ['removed', 'Brian Otieno'],
    ]);
  });

  it('cannot be saved once every holder is removed', () => {
    const form = readStakesForm(OPENED, rowsFor(OPENED).map((row) => ({ ...row, removed: true })));

    expect(form.blockedReason).toMatch(/at least one shareholder/i);
    expect(form.input).toBeNull();
  });

  it('can be saved from an empty cap table once the first holder has a name and 100%', () => {
    expect(readStakesForm([], [blankRow('new-1')]).input).toBeNull();

    const form = readStakesForm([], [newRow({ name: 'OnyxHawk Holdings', kind: 'COMPANY', stake: '100' })]);

    expect(form.blockedReason).toBeNull();
    expect(form.input).toEqual({
      expected: [],
      holders: [{ name: 'OnyxHawk Holdings', title: null, kind: 'COMPANY', basisPoints: 10_000 }],
    });
  });
});

describe('confirmationSummary', () => {
  const summary = confirmationSummary(
    stakeDifferences(OPENED, [
      { id: 'h1', basisPoints: 5000 },
      { id: 'h2', basisPoints: 3000 },
      { name: 'Chege Mwangi', kind: 'INDIVIDUAL', basisPoints: 2000 },
    ]),
  );

  it('names every holder added, changed or removed, with the stake before and after', () => {
    expect(summary.changes).toHaveLength(3);
    const [changed, removed, added] = summary.changes;
    expect(changed).toContain('OnyxHawk Holdings');
    expect(changed).toContain('40.00%');
    expect(changed).toContain('50.00%');
    expect(removed).toContain('Brian Otieno');
    expect(removed).toContain('30.00%');
    expect(removed).toMatch(/removed/i);
    expect(added).toContain('Chege Mwangi');
    expect(added).toContain('20.00%');
    expect(added).toMatch(/added/i);
  });

  it('says that all-time shares are worked out again and declared payouts do not change', () => {
    const notes = summary.notes.join(' ');
    expect(notes).toMatch(/all-time shares are worked out again at the new stakes/i);
    expect(notes).toMatch(/declared payouts do not change/i);
  });

  it('says what a removed holder with a linked account loses and keeps', () => {
    const note = summary.notes.find((n) => n.includes('Brian Otieno'));
    expect(note).toMatch(/Profit sharing and Documents/);
    expect(note).toMatch(/staff sign-in and role/);
    expect(note).toMatch(/Team page/);
  });

  it('says nothing about accounts when no removed holder has one', () => {
    const plain = confirmationSummary(
      stakeDifferences(OPENED, [
        { id: 'h1', basisPoints: 7000 },
        { id: 'h3', basisPoints: 3000 },
      ]),
    );

    expect(plain.changes.join(' ')).toContain('Amina Yusuf');
    expect(plain.notes.join(' ')).not.toMatch(/account/i);
    expect(plain.notes.join(' ')).toMatch(/declared payouts do not change/i);
  });
});
