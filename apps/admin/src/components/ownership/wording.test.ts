import { describe, expect, it } from 'vitest';

import {
  AMOUNTS_UNIT, formatDay, monthTableWording, noSplitLine, overAllocatedLine, remainderName, remainderStake, scopeLine,
  shareHeadingParts,
} from './wording';

describe('formatDay', () => {
  it('writes a date as day, short month and year', () => {
    expect(formatDay('2026-01-20')).toBe('20 Jan 2026');
    expect(formatDay('2025-12-05')).toBe('5 Dec 2025');
  });

  it('leaves anything that is not a date as it came', () => {
    expect(formatDay('soon')).toBe('soon');
    expect(formatDay('2026-13-01')).toBe('2026-13-01');
  });
});

describe('scopeLine', () => {
  it('says all time and the day of the first job', () => {
    expect(scopeLine('all-time', '2026-01-20', 'November 2026')).toBe('All time, since 20 Jan 2026');
  });

  it('says only "All time" before there is a first job', () => {
    expect(scopeLine('all-time', null, 'November 2026')).toBe('All time');
  });

  it('names the month for "This month"', () => {
    expect(scopeLine('this-month', '2026-01-20', 'November 2026')).toBe('This month, November 2026');
  });
});

describe('noSplitLine', () => {
  it('is null while there is a profit to share', () => {
    expect(noSplitLine(1, 'all-time')).toBeNull();
    expect(noSplitLine(3_880_000, 'this-month')).toBeNull();
  });

  it('says there is no profit to share when the net profit is zero', () => {
    expect(noSplitLine(0, 'this-month')).toBe('No profit to share this month');
    expect(noSplitLine(0, 'all-time')).toBe('No profit to share yet');
  });

  it('names the size of a loss, without a minus sign', () => {
    expect(noSplitLine(-120_000, 'this-month')).toBe('A loss of KSh 1,200 this month');
    expect(noSplitLine(-1_552_050, 'all-time')).toBe('A loss of KSh 15,520.50 all time');
  });
});

describe('shareHeadingParts', () => {
  it('gives the heading in two parts, for a column too narrow for one line', () => {
    expect(shareHeadingParts('all-time', 'November 2026')).toEqual(['Share,', 'all time']);
    expect(shareHeadingParts('this-month', 'November 2026')).toEqual(['Share,', 'November 2026']);
  });
});

describe('what the stakes leave over', () => {
  it('is "Retained by the business" when the stakes are short of 100%', () => {
    expect(remainderName(9_000)).toBe('Retained by the business');
    expect(remainderStake(9_000)).toBe('10%');
  });

  it('is "Over-allocated" when the stakes pass 100%, with a true minus sign on the stake', () => {
    expect(remainderName(12_000)).toBe('Over-allocated');
    expect(remainderStake(12_000)).toBe('\u221220%');
    expect(remainderStake(10_050)).toBe('\u22120.5%');
  });
});

describe('overAllocatedLine', () => {
  it('says the stakes pass 100%, so the bars exceed the net profit', () => {
    expect(overAllocatedLine(12_000)).toBe(
      'The stakes add up to 120%, more than 100%, so each month\u2019s bar exceeds its net profit.',
    );
  });

  it('is null while the stakes are at or under 100%', () => {
    expect(overAllocatedLine(10_000)).toBeNull();
    expect(overAllocatedLine(9_000)).toBeNull();
  });
});

describe('monthTableWording', () => {
  const year = ['Dec 2025', 'Jan 2026', 'Feb 2026 so far'];

  it('states the unit once, in words a heading and a caption share', () => {
    expect(AMOUNTS_UNIT).toBe('Amounts in KSh');
  });

  it('points to the chart and to the months out of view when both are there', () => {
    expect(monthTableWording(year, { chart: true, scrolls: true })).toEqual({
      heading: 'Each holder’s share, month by month',
      note: 'The same amounts as the chart, at today’s stakes. Scroll sideways for earlier months.',
      caption: 'Each holder’s share of net profit, month by month, at today’s stakes. Amounts in KSh.',
    });
  });

  it('does not ask for scrolling when every month is in view', () => {
    expect(monthTableWording(year, { chart: true, scrolls: false }).note).toBe('The same amounts as the chart, at today’s stakes.');
  });

  it('names the one month, and mentions neither a chart nor scrolling, when one month is all there is', () => {
    const words = monthTableWording(['Nov 2026 so far'], { chart: false, scrolls: false });
    expect(words).toEqual({
      heading: 'Each holder’s share, Nov 2026 so far',
      note: 'At today’s stakes.',
      caption: 'Each holder’s share of net profit, Nov 2026 so far, at today’s stakes. Amounts in KSh.',
    });
    expect(`${words.heading} ${words.note} ${words.caption}`).not.toMatch(/chart|scroll|month by month/i);
  });
});
