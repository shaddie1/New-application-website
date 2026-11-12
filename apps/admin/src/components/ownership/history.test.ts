import { describe, expect, it } from 'vitest';
import type { EquityHistoryMonth } from '@onyxhawk/types';

import { OTHERS_KEY } from '../stacked-bars';
import {
  OVER_KEY, RETAINED_KEY, amountWithoutUnit, isPhone, monthAxisLabels, monthTableColumns, shapeHistory, tableMonthIndexes, wholeColumns,
} from './history';

type Stake = { id: string; name: string; basisPoints: number };

/** One month as the server sends it: each holder's share is their stake of the net profit. */
function month(year: number, monthNumber: number, label: string, netCents: number, stakes: Stake[], partial = false): EquityHistoryMonth {
  const shares = stakes.map((s) => ({
    shareholderId: s.id,
    shareholderName: s.name,
    basisPoints: s.basisPoints,
    shareCents: (netCents * s.basisPoints) / 10_000,
  }));
  return {
    year,
    month: monthNumber,
    label,
    netCents,
    shares,
    unallocatedCents: netCents - shares.reduce((acc, s) => acc + s.shareCents, 0),
    partial,
  };
}

const THREE: Stake[] = [
  { id: 'h1', name: 'OnyxHawk (Company)', basisPoints: 4000 },
  { id: 'h2', name: 'Shadrack Amihanda', basisPoints: 3000 },
  { id: 'h3', name: 'Zecharia Mwangi', basisPoints: 3000 },
];

const threeMonths = (stakes: Stake[]) => [
  month(2025, 12, 'Dec', 1_000_000, stakes),
  month(2026, 1, 'Jan', -200_000, stakes),
  month(2026, 2, 'Feb', 500_000, stakes, true),
];

describe('shapeHistory', () => {
  const history = shapeHistory(threeMonths(THREE));

  it('gives the chart one series per holder, in table order, coloured by position', () => {
    expect(history.series).toEqual([
      { key: 'h1', label: 'OnyxHawk (Company)', kind: 'holder', colourIndex: 0 },
      { key: 'h2', label: 'Shadrack Amihanda', kind: 'holder', colourIndex: 1 },
      { key: 'h3', label: 'Zecharia Mwangi', kind: 'holder', colourIndex: 2 },
    ]);
  });

  it('gives the chart each holder’s share of each month, a loss month included', () => {
    expect(history.columns.map((c) => c.values)).toEqual([
      [400_000, 300_000, 300_000],
      [-80_000, -60_000, -60_000],
      [200_000, 150_000, 150_000],
    ]);
    expect(history.columns.map((c) => c.label)).toEqual(['Dec', 'Jan', 'Feb']);
  });

  it('gives the table the same amounts, one row per holder', () => {
    expect(history.rows).toEqual([
      { key: 'h1', label: 'OnyxHawk (Company)', kind: 'holder', colourIndex: 0, cents: [400_000, -80_000, 200_000] },
      { key: 'h2', label: 'Shadrack Amihanda', kind: 'holder', colourIndex: 1, cents: [300_000, -60_000, 150_000] },
      { key: 'h3', label: 'Zecharia Mwangi', kind: 'holder', colourIndex: 2, cents: [300_000, -60_000, 150_000] },
    ]);
    expect(history.months.map((m) => m.netCents)).toEqual([1_000_000, -200_000, 500_000]);
  });

  it('names each month with its year, and the running month as "so far"', () => {
    expect(history.months.map((m) => m.heading)).toEqual(['Dec 2025', 'Jan 2026', 'Feb 2026 so far']);
    expect(history.months.map((m) => m.partial)).toEqual([false, false, true]);
    expect(history.months.map((m) => m.label)).toEqual(['Dec', 'Jan', 'Feb']);
  });

  it('heads each month’s column in two short lines: the month, then its year or "so far"', () => {
    expect(history.months.map((m) => m.columnHead)).toEqual([['Dec', '2025'], ['Jan', '2026'], ['Feb', 'so far']]);
  });

  it('knows what the stakes add up to', () => {
    expect(history.stakesBasisPoints).toBe(10_000);
  });

  it('has no "Retained" series or row when the stakes total 100%', () => {
    expect(history.series.some((s) => s.key === RETAINED_KEY)).toBe(false);
    expect(history.rows.some((r) => r.kind === 'retained')).toBe(false);
  });

  it('finds a holder by id, whatever order a month lists them in', () => {
    const months = threeMonths(THREE);
    months[1] = { ...months[1]!, shares: [...months[1]!.shares].reverse() };
    expect(shapeHistory(months).rows).toEqual(history.rows);
  });

  it('describes the chart in words', () => {
    expect(history.summary).toContain('Dec 2025');
    expect(history.summary).toContain('Feb 2026');
    expect(history.summary).toContain("today's stakes");
  });
});

describe('stakes under 100%', () => {
  const history = shapeHistory(threeMonths(THREE.slice(0, 2))); // 40% and 30%

  it('adds the unallocated remainder as a neutral "Retained" series, last', () => {
    expect(history.series.map((s) => s.key)).toEqual(['h1', 'h2', RETAINED_KEY]);
    expect(history.series[2]).toEqual({ key: RETAINED_KEY, label: 'Retained', kind: 'retained', colourIndex: null });
    expect(history.columns.map((c) => c.values[2])).toEqual([300_000, -60_000, 150_000]);
  });

  it('adds a "Retained by the business" row to the table', () => {
    expect(history.rows[2]).toEqual({
      key: RETAINED_KEY, label: 'Retained by the business', kind: 'retained', colourIndex: null, cents: [300_000, -60_000, 150_000],
    });
  });
});

describe('stakes over 100%', () => {
  const over: Stake[] = [{ ...THREE[0]!, basisPoints: 6000 }, THREE[1]!, THREE[2]!]; // 60%, 30% and 30%
  const history = shapeHistory(threeMonths(over));

  it('draws the holders’ shares only: no "Retained" series', () => {
    expect(history.series.map((s) => s.key)).toEqual(['h1', 'h2', 'h3']);
    expect(history.columns[0]!.values).toEqual([600_000, 300_000, 300_000]);
    expect(history.stakesBasisPoints).toBe(12_000);
  });

  it('adds an "Over-allocated" row, never "Retained by the business", so each month still adds up', () => {
    expect(history.rows.some((r) => r.kind === 'retained')).toBe(false);
    expect(history.rows[3]).toEqual({
      key: OVER_KEY, label: 'Over-allocated', kind: 'over', colourIndex: null, cents: [-200_000, 40_000, -100_000],
    });
  });
});

describe('seven holders', () => {
  const seven: Stake[] = [
    ...THREE.map((s, i) => ({ ...s, basisPoints: [3000, 2000, 1500][i]! })),
    { id: 'h4', name: 'Amina Yusuf', basisPoints: 1200 },
    { id: 'h5', name: 'Brian Otieno', basisPoints: 1000 },
    { id: 'h6', name: 'Carol Njeri', basisPoints: 800 },
    { id: 'h7', name: 'David Kiptoo', basisPoints: 500 },
  ];
  const history = shapeHistory(threeMonths(seven));

  it('gives the chart five coloured series and one neutral "Others"', () => {
    expect(history.series.map((s) => s.key)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', OTHERS_KEY]);
    expect(history.series.map((s) => s.colourIndex)).toEqual([0, 1, 2, 3, 4, null]);
    expect(history.series.map((s) => s.kind)).toEqual(['holder', 'holder', 'holder', 'holder', 'holder', 'others']);
    // Dec: 8% and 5% of KSh 10,000.
    expect(history.columns[0]!.values[5]).toBe(130_000);
  });

  it('keeps every holder in the table, the sixth and seventh without a colour of their own', () => {
    expect(history.rows.map((r) => r.label)).toEqual(seven.map((s) => s.name));
    expect(history.rows.map((r) => r.colourIndex)).toEqual([0, 1, 2, 3, 4, null, null]);
    expect(history.rows[6]!.cents).toEqual([50_000, -10_000, 25_000]);
  });
});

describe('"Others" and "Retained" together', () => {
  // Seven holders at 90%: both neutral series are in the chart.
  const stakes = [2500, 2000, 1500, 1200, 800, 600, 400].map((basisPoints, i) => ({ id: `h${i + 1}`, name: `Holder ${i + 1}`, basisPoints }));
  const history = shapeHistory(threeMonths(stakes));

  it('tells them apart by kind, since neither has a colour of its own', () => {
    const [others, retained] = history.series.slice(5);
    expect([others!.key, others!.kind, others!.colourIndex]).toEqual([OTHERS_KEY, 'others', null]);
    expect([retained!.key, retained!.kind, retained!.colourIndex]).toEqual([RETAINED_KEY, 'retained', null]);
  });

  it('keeps a holder past the fifth a holder in the table, and the retained row retained', () => {
    expect(history.rows.map((r) => r.kind)).toEqual([...Array.from({ length: 7 }, () => 'holder'), 'retained']);
  });
});

describe('monthAxisLabels', () => {
  const months = shapeHistory(threeMonths(THREE)).months;
  const year = shapeHistory(
    Array.from({ length: 12 }, (_, i) => {
      const monthNumber = ((11 + i) % 12) + 1; // Dec 2025, then Jan to Nov 2026
      const label = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthNumber - 1]!;
      return month(i === 0 ? 2025 : 2026, monthNumber, label, 100_000, THREE, i === 11);
    }),
  ).months;

  it('labels every month, with the year under the first month and each January, and "so far" under the running month', () => {
    expect(monthAxisLabels(months, 1)).toEqual([
      { label: 'Dec', second: '2025' },
      { label: 'Jan', second: '2026' },
      { label: 'Feb', second: 'so far' },
    ]);
  });

  it('labels every other month counting back from the running month, when the slots are narrow', () => {
    const labels = monthAxisLabels(year, 2);
    expect(labels.map((l) => l.label)).toEqual([null, 'Jan', null, 'Mar', null, 'May', null, 'Jul', null, 'Sep', null, 'Nov']);
    expect(labels.map((l) => l.second)).toEqual([null, '2026', null, null, null, null, null, null, null, null, null, 'so far']);
  });

  it('puts the year under the first month that has a label', () => {
    // Dec, Jan, Feb with every other month labelled: Dec and Feb.
    expect(monthAxisLabels(months, 2)).toEqual([
      { label: 'Dec', second: '2025' },
      { label: null, second: null },
      { label: 'Feb', second: 'so far' },
    ]);
  });
});

describe('wholeColumns', () => {
  it('fits as many whole month columns as the width allows, and shares the width between them', () => {
    expect(wholeColumns(706, 124, 12)).toEqual({ visible: 5, width: 706 / 5 });
    expect(wholeColumns(165, 124, 12)).toEqual({ visible: 1, width: 165 });
  });

  it('shows every column when they all fit', () => {
    expect(wholeColumns(2400, 124, 12)).toEqual({ visible: 12, width: 200 });
  });

  it('shows one column, as wide as the space, when not even one fits', () => {
    expect(wholeColumns(100, 124, 12)).toEqual({ visible: 1, width: 100 });
  });

  it('has no answer before the width is known, or with no columns', () => {
    expect(wholeColumns(0, 124, 12)).toBeNull();
    expect(wholeColumns(500, 124, 0)).toBeNull();
  });
});

describe('amountWithoutUnit', () => {
  it('writes the figure alone, since the table states "KSh" once', () => {
    expect(amountWithoutUnit(1_552_000)).toBe('15,520');
    expect(amountWithoutUnit(1_552_050)).toBe('15,520.50');
    expect(amountWithoutUnit(0)).toBe('0');
  });

  it('keeps the true minus sign on a loss', () => {
    expect(amountWithoutUnit(-2_400_000)).toBe('−24,000');
  });
});

describe('isPhone', () => {
  it('is a screen narrower than 640px', () => {
    expect(isPhone(375)).toBe(true);
    expect(isPhone(639)).toBe(true);
    expect(isPhone(640)).toBe(false);
    expect(isPhone(1280)).toBe(false);
  });
});

describe('monthTableColumns', () => {
  // "108,500" and "−24,000" are seven characters; "Retained by the business" is twenty-four.
  const content = { months: 12, amountCharacters: 7, nameCharacters: 24 };

  // The table's frame is 291px wide on a 375px phone, and 276px on a 360px one.
  it('shows three whole months beside a badge-only first column on a 375px phone', () => {
    expect(monthTableColumns(291, { ...content, phone: true })).toEqual({ named: false, pinned: 42, month: 83, visible: 3, table: 42 + 12 * 83 });
  });

  it('still shows three on a 360px phone', () => {
    expect(monthTableColumns(276, { ...content, phone: true })).toMatchObject({ named: false, pinned: 42, month: 78, visible: 3 });
  });

  it('keeps room for the badge and the name from 640px, up to two fifths of the frame', () => {
    const narrow = monthTableColumns(483, { ...content, phone: false })!;
    expect(narrow.pinned).toBeGreaterThanOrEqual(Math.floor(483 * 0.4));
    expect(narrow.visible).toBe(3);
    const wide = monthTableColumns(926, { ...content, phone: false })!;
    expect(wide.pinned).toBeGreaterThanOrEqual(248);
    expect(wide.visible).toBe(7);
    expect([narrow.named, wide.named]).toEqual([true, true]);
  });

  it('fills the frame exactly with the first column and the whole months in view', () => {
    for (const frame of [236, 276, 291, 400, 484, 524, 924, 1084]) {
      for (const phone of [true, false]) {
        const columns = monthTableColumns(frame, { ...content, phone })!;
        expect(columns.pinned + columns.visible * columns.month).toBe(frame);
        expect(columns.table).toBe(columns.pinned + 12 * columns.month);
      }
    }
  });

  it('gives a single month all the room the first column leaves', () => {
    expect(monthTableColumns(926, { ...content, months: 1, phone: false })).toEqual({ named: true, pinned: 248, month: 678, visible: 1, table: 926 });
  });

  it('keeps the names on a phone when every month fits beside them, as a single month does, and gives the names the room', () => {
    expect(monthTableColumns(291, { ...content, months: 1, phone: true })).toEqual({ named: true, pinned: 213, month: 78, visible: 1, table: 291 });
    expect(monthTableColumns(291, { ...content, months: 3, phone: true })).toMatchObject({ named: false, visible: 3 });
  });

  it('never squeezes a month narrower than its heading', () => {
    const columns = monthTableColumns(291, { months: 12, amountCharacters: 1, nameCharacters: 5, phone: true })!;
    expect(columns.month).toBeGreaterThanOrEqual(64);
  });

  it('has no answer before the width is known, or with no months', () => {
    expect(monthTableColumns(0, { ...content, phone: true })).toBeNull();
    expect(monthTableColumns(291, { ...content, months: 0, phone: true })).toBeNull();
  });
});

describe('tableMonthIndexes', () => {
  const quiet = (monthNumber: number, label: string) => month(2026, monthNumber, label, 0, THREE);

  it('is every month when there is a chart above the table, empty months included', () => {
    const history = shapeHistory([quiet(1, 'Jan'), month(2026, 2, 'Feb', 500_000, THREE), month(2026, 3, 'Mar', 300_000, THREE, true)]);
    expect(tableMonthIndexes(history)).toEqual([0, 1, 2]);
  });

  it('is only the months that have figures when there is too little to chart', () => {
    const history = shapeHistory([quiet(1, 'Jan'), quiet(2, 'Feb'), month(2026, 3, 'Mar', 300_000, THREE, true)]);
    expect(tableMonthIndexes(history)).toEqual([2]);
  });

  it('is empty when no month has figures', () => {
    expect(tableMonthIndexes(shapeHistory([quiet(1, 'Jan'), quiet(2, 'Feb')]))).toEqual([]);
  });
});

describe('nothing to show', () => {
  it('has no series when there are no holders', () => {
    const history = shapeHistory(threeMonths([]));
    expect(history.series).toEqual([]);
    expect(history.rows).toEqual([]);
    expect(history.stakesBasisPoints).toBe(0);
  });

  it('has no months when the server sent none', () => {
    const history = shapeHistory([]);
    expect(history.months).toEqual([]);
    expect(history.series).toEqual([]);
    expect(history.columns).toEqual([]);
  });
});
