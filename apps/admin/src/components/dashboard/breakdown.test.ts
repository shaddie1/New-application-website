import { describe, expect, it } from 'vitest';

import type { Block } from './block-state';
import {
  breakdownCards,
  revenueChartView,
  revenueSlices,
  revenueViews,
  unclassifiedNote,
  UNKNOWN_KEY,
} from './breakdown';

const item = (key: string, incomeCents: number, label = key) => ({ key, label, incomeCents });
const unknown = (incomeCents: number, label = 'Unclassified') => item(UNKNOWN_KEY, incomeCents, label);

describe('revenueChartView', () => {
  it('is a nudge when all the revenue is unclassified', () => {
    expect(revenueChartView([unknown(5_400_000)])).toBe('nudge');
  });

  it('is a chart when 83% is classified and 17% is not', () => {
    expect(revenueChartView([item('OFFICE', 4_500_000), unknown(900_000)])).toBe('chart');
  });

  it('is empty, not a nudge, when there is no revenue at all', () => {
    expect(revenueChartView([])).toBe('empty');
    expect(revenueChartView([unknown(0)])).toBe('empty');
  });

  it('is still a nudge when a classified line is listed with no revenue', () => {
    expect(revenueChartView([unknown(5_400_000), item('OFFICE', 0)])).toBe('nudge');
  });

  it('tests the key, never the label', () => {
    // A service line somebody named "Unclassified" is still a classified line.
    expect(revenueChartView([item('OFFICE', 5_400_000, 'Unclassified')])).toBe('chart');
    expect(revenueChartView([unknown(5_400_000, 'No segment')])).toBe('nudge');
  });
});

describe('revenueViews', () => {
  it('reports one combined nudge when both lists hold only unclassified revenue', () => {
    expect(revenueViews({ byServiceLine: [unknown(5_400_000)], bySegment: [unknown(5_400_000)] })).toEqual({
      serviceLine: 'nudge',
      segment: 'nudge',
      combinedNudge: true,
    });
  });

  it('reports a nudge for the unclassified list and a chart for the mixed one', () => {
    expect(
      revenueViews({
        byServiceLine: [unknown(5_400_000)],
        bySegment: [item('CORPORATE', 4_500_000), unknown(900_000)],
      }),
    ).toEqual({ serviceLine: 'nudge', segment: 'chart', combinedNudge: false });
  });

  it('reports two empty charts, and no nudge, when there is no revenue', () => {
    expect(revenueViews({ byServiceLine: [], bySegment: [] })).toEqual({
      serviceLine: 'empty',
      segment: 'empty',
      combinedNudge: false,
    });
  });
});

describe('revenueSlices', () => {
  it('draws unclassified revenue in the neutral grey and leaves the rest to take their colours in turn', () => {
    expect(revenueSlices([item('OFFICE', 4_500_000, 'Office & commercial'), unknown(900_000)])).toEqual([
      { key: 'OFFICE', label: 'Office & commercial', value: 4_500_000 },
      { key: UNKNOWN_KEY, label: 'Unclassified', value: 900_000, color: 'var(--chart-other)' },
    ]);
  });
});

describe('breakdownCards', () => {
  const lists = {
    byServiceLine: [item('OFFICE', 4_500_000), unknown(900_000)],
    bySegment: [item('CORPORATE', 5_400_000)],
  };
  const loaded = <T>(data: T): Block<T> => ({ status: 'loaded', data, refreshing: false });
  const expenses = loaded({ expensesByCategoryCents: { MATERIALS: 840_000 } });

  it('draws the two revenue cards and puts the expenses card in its error state when only the expenses failed to load', () => {
    expect(breakdownCards(loaded(lists), { status: 'failed', httpStatus: 500 })).toEqual([
      { card: 'service-line', state: 'chart' },
      { card: 'segment', state: 'chart' },
      { card: 'expenses', state: 'failed' },
    ]);
  });

  it('gives the revenue charts one error card between them, and still draws the expenses', () => {
    expect(breakdownCards({ status: 'failed' }, expenses)).toEqual([
      { card: 'revenue', state: 'failed' },
      { card: 'expenses', state: 'chart' },
    ]);
  });

  it('holds each card’s place while its own request loads', () => {
    expect(breakdownCards({ status: 'loading' }, { status: 'loading' })).toEqual([
      { card: 'service-line', state: 'loading' },
      { card: 'segment', state: 'loading' },
      { card: 'expenses', state: 'loading' },
    ]);
    expect(breakdownCards(loaded(lists), { status: 'loading' })).toEqual([
      { card: 'service-line', state: 'chart' },
      { card: 'segment', state: 'chart' },
      { card: 'expenses', state: 'loading' },
    ]);
  });

  it('gives one nudge card when neither revenue list is classified', () => {
    const unclassified = { byServiceLine: [unknown(5_400_000)], bySegment: [unknown(5_400_000)] };
    expect(breakdownCards(loaded(unclassified), expenses)).toEqual([
      { card: 'revenue', state: 'nudge' },
      { card: 'expenses', state: 'chart' },
    ]);
  });

  it('gives the client-segment card the nudge when all of its revenue is unspecified, and a chart when it is all Corporate', () => {
    const unspecified = { byServiceLine: lists.byServiceLine, bySegment: [unknown(5_400_000, 'Unspecified')] };
    expect(breakdownCards(loaded(unspecified), expenses)[1]).toEqual({ card: 'segment', state: 'nudge' });
    expect(breakdownCards(loaded(lists), expenses)[1]).toEqual({ card: 'segment', state: 'chart' });
  });

  it('says a month with no revenue has none, and never nudges for it', () => {
    expect(breakdownCards(loaded({ byServiceLine: [], bySegment: [] }), expenses)).toEqual([
      { card: 'service-line', state: 'empty' },
      { card: 'segment', state: 'empty' },
      { card: 'expenses', state: 'chart' },
    ]);
  });

  it('keeps every card drawn while its request is asked again', () => {
    const revenueAgain: Block<typeof lists> = { status: 'loaded', data: lists, refreshing: true };
    const expensesAgain: Block<unknown> = { status: 'loaded', data: {}, refreshing: true };
    expect(breakdownCards(revenueAgain, expensesAgain).map((c) => c.state)).toEqual(['chart', 'chart', 'chart']);
  });
});

// What a viewer who cannot open Jobs & costs is told: the fact, and no
// instruction they cannot act on.
describe('unclassifiedNote', () => {
  const thisMonth = { month: 'November 2026', isCurrentMonth: true };

  it('says client segments are missing', () => {
    expect(unclassifiedNote({ missing: 'segment', ...thisMonth })).toBe(
      'Client segments have not been added to this month\'s jobs yet.',
    );
  });

  it('says service lines are missing', () => {
    expect(unclassifiedNote({ missing: 'service-line', ...thisMonth })).toBe(
      'Service lines have not been added to this month\'s jobs yet.',
    );
  });

  it('covers both in one sentence', () => {
    expect(unclassifiedNote({ missing: 'both', ...thisMonth })).toBe(
      'Service lines and client segments have not been added to this month\'s jobs yet.',
    );
  });

  it('names a past month instead of calling it this month', () => {
    expect(unclassifiedNote({ missing: 'segment', month: 'October 2026', isCurrentMonth: false })).toBe(
      'Client segments have not been added to the October 2026 jobs yet.',
    );
  });

  it('never tells the reader to do anything', () => {
    for (const missing of ['segment', 'service-line', 'both'] as const) {
      expect(unclassifiedNote({ missing, ...thisMonth })).not.toMatch(/\badd\b|\bopen\b|\bset\b/i);
    }
  });
});
