import { describe, expect, it } from 'vitest';
import type { CostsByGroup } from '@onyxhawk/types';

import { costGroupLabel, costGroupRows } from './costGroups';

describe('costGroupLabel', () => {
  it('calls the machines group "Machines" in both wordings', () => {
    expect(costGroupLabel('MACHINES', 'money-tab')).toBe('Machines');
    expect(costGroupLabel('MACHINES', 'charts')).toBe('Machines');
  });

  it("keeps the Money tab's names for the five groups", () => {
    expect(costGroupLabel('MATERIALS', 'money-tab')).toBe('Materials');
    expect(costGroupLabel('TRANSPORT', 'money-tab')).toBe('Transport');
    expect(costGroupLabel('EMPLOYEE_PAY', 'money-tab')).toBe('Crew pay');
    expect(costGroupLabel('LUNCH', 'money-tab')).toBe('Lunch');
    expect(costGroupLabel('MISCELLANEOUS', 'money-tab')).toBe('Other');
  });

  it("keeps Insights' names for the five groups", () => {
    expect(costGroupLabel('MATERIALS', 'charts')).toBe('Materials');
    expect(costGroupLabel('TRANSPORT', 'charts')).toBe('Transport');
    expect(costGroupLabel('EMPLOYEE_PAY', 'charts')).toBe('Employee pay');
    expect(costGroupLabel('LUNCH', 'charts')).toBe('Lunch');
    expect(costGroupLabel('MISCELLANEOUS', 'charts')).toBe('Miscellaneous');
  });

  it('gives a group it does not know a name a person can read', () => {
    expect(costGroupLabel('FUEL_AND_OIL', 'money-tab')).toBe('Fuel and oil');
    expect(costGroupLabel('INSURANCE', 'charts')).toBe('Insurance');
  });
});

describe('costGroupRows', () => {
  // What an API older than the machine register sends, and what today's sends
  // when no machine days are logged: the five groups and nothing else.
  const fiveGroups: CostsByGroup = {
    MATERIALS: 1_200_000,
    TRANSPORT: 300_000,
    EMPLOYEE_PAY: 4_500_000,
    LUNCH: 0,
    MISCELLANEOUS: 75_000,
  };

  it('gives the five groups, in their usual order, and no Machines row when there is no machines amount', () => {
    expect(costGroupRows(fiveGroups, 'money-tab')).toEqual([
      { key: 'MATERIALS', label: 'Materials', cents: 1_200_000 },
      { key: 'TRANSPORT', label: 'Transport', cents: 300_000 },
      { key: 'EMPLOYEE_PAY', label: 'Crew pay', cents: 4_500_000 },
      { key: 'LUNCH', label: 'Lunch', cents: 0 },
      { key: 'MISCELLANEOUS', label: 'Other', cents: 75_000 },
    ]);
  });

  it('names the rows in the wording asked for', () => {
    expect(costGroupRows(fiveGroups, 'charts').map((row) => row.label)).toEqual([
      'Materials', 'Transport', 'Employee pay', 'Lunch', 'Miscellaneous',
    ]);
  });

  it('adds Machines after the five when its amount is above zero', () => {
    const rows = costGroupRows({ ...fiveGroups, MACHINES: 500_000 }, 'charts');

    expect(rows).toHaveLength(6);
    expect(rows[5]).toEqual({ key: 'MACHINES', label: 'Machines', cents: 500_000 });
    // The five before it are as they were.
    expect(rows.slice(0, 5)).toEqual(costGroupRows(fiveGroups, 'charts'));
  });

  it('has no Machines row for a machines amount of zero', () => {
    expect(costGroupRows({ ...fiveGroups, MACHINES: 0 }, 'money-tab').map((row) => row.key)).toEqual([
      'MATERIALS', 'TRANSPORT', 'EMPLOYEE_PAY', 'LUNCH', 'MISCELLANEOUS',
    ]);
  });

  it('shows a group it does not know, with a name, when the server sends an amount for it', () => {
    const newer = { ...fiveGroups, FUEL_AND_OIL: 90_000 } as CostsByGroup;

    expect(costGroupRows(newer, 'money-tab')[5]).toEqual({ key: 'FUEL_AND_OIL', label: 'Fuel and oil', cents: 90_000 });
  });

  it('shows zero for one of the five the server left out', () => {
    const { LUNCH: _lunch, ...withoutLunch } = fiveGroups;

    const rows = costGroupRows(withoutLunch as CostsByGroup, 'money-tab');
    expect(rows[3]).toEqual({ key: 'LUNCH', label: 'Lunch', cents: 0 });
  });
});
