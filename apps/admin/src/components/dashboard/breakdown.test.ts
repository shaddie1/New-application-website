import { describe, expect, it } from 'vitest';

import {
  holderSlices,
  profitShareView,
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

describe('holderSlices', () => {
  const holder = (id: string, name: string, periodShareCents: number) => ({
    shareholder: { id, name },
    periodShareCents,
  });

  it('gives each holder the colour of their place in the table, whatever their share', () => {
    // The third holder has the largest share and still takes the third colour.
    const slices = holderSlices([
      holder('h1', 'OnyxHawk Holdings', 1_000_000),
      holder('h2', 'Amina Yusuf', 2_000_000),
      holder('h3', 'Zed Otieno', 9_000_000),
    ]);

    expect(slices.map((s) => [s.key, s.color])).toEqual([
      ['h1', 'var(--chart-1)'],
      ['h2', 'var(--chart-2)'],
      ['h3', 'var(--chart-3)'],
    ]);
    expect(slices.map((s) => s.value)).toEqual([1_000_000, 2_000_000, 9_000_000]);
  });

  it('labels a slice with the holder’s name and no percentage', () => {
    const [slice] = holderSlices([holder('h1', 'OnyxHawk Holdings', 1_000_000)]);
    expect(slice!.label).toBe('OnyxHawk Holdings');
  });

  it('gives holders past the fifth the neutral grey, as the Ownership page does', () => {
    const slices = holderSlices(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => holder(id, id.toUpperCase(), 100)),
    );
    expect(slices[4]!.color).toBe('var(--chart-5)');
    expect(slices[5]!.color).toBe('var(--chart-other)');
    expect(slices[6]!.color).toBe('var(--chart-other)');
  });
});

describe('profitShareView', () => {
  const allocations = [{ shareholder: { id: 'h1', name: 'OnyxHawk Holdings' }, periodShareCents: 1_552_000 }];

  it('is a chart in a month with a profit', () => {
    expect(profitShareView({ periodNetCents: 3_880_000, allocations })).toBe('chart');
  });

  it('says there is no profit to share in a loss month', () => {
    expect(profitShareView({ periodNetCents: -1_200_000, allocations })).toBe('no-profit');
  });

  it('says there is no profit to share when the month broke even', () => {
    expect(profitShareView({ periodNetCents: 0, allocations })).toBe('no-profit');
  });

  it('says so when a profit has nobody to go to', () => {
    expect(profitShareView({ periodNetCents: 3_880_000, allocations: [] })).toBe('no-holders');
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
