import type { CostsByGroup, ExpenseCategory } from '@onyxhawk/types';

/**
 * The names of the groups costs are added up by: the five kinds of expense a
 * person can type in, and the machines' days, which the Machines page logs.
 *
 * The back-office has two sets of names for the five. A project's Money tab
 * says "Crew pay" and "Other"; the Dashboard and Insights say "Employee pay"
 * and "Miscellaneous". Each screen keeps the names it has always shown, so
 * every caller says which set it wants.
 */
export type CostGroupWording = 'money-tab' | 'charts';

const EXPENSE_GROUPS: ExpenseCategory[] = ['MATERIALS', 'TRANSPORT', 'EMPLOYEE_PAY', 'LUNCH', 'MISCELLANEOUS'];

const LABELS: Record<CostGroupWording, Record<ExpenseCategory | 'MACHINES', string>> = {
  'money-tab': {
    MATERIALS: 'Materials',
    TRANSPORT: 'Transport',
    EMPLOYEE_PAY: 'Crew pay',
    LUNCH: 'Lunch',
    MISCELLANEOUS: 'Other',
    MACHINES: 'Machines',
  },
  charts: {
    MATERIALS: 'Materials',
    TRANSPORT: 'Transport',
    EMPLOYEE_PAY: 'Employee pay',
    LUNCH: 'Lunch',
    MISCELLANEOUS: 'Miscellaneous',
    MACHINES: 'Machines',
  },
};

/**
 * A group's name. A group this build has no name for, which a newer server
 * could send, is named from its key ("FUEL_AND_OIL" reads "Fuel and oil"), so
 * no amount is ever drawn without a name beside it.
 */
export function costGroupLabel(group: string, wording: CostGroupWording): string {
  const known: Record<string, string> = LABELS[wording];
  // `Object.hasOwn`, so a key such as "constructor" is never answered from the object's own machinery.
  if (Object.hasOwn(known, group)) return known[group]!;
  const words = group.replace(/_/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Other costs';
}

export type CostGroupRow = { key: string; label: string; cents: number };

/**
 * The rows of a "costs by group" list or chart. The five expense groups are
 * always there, in their usual order, as they were before machines. Machines
 * follows only when its amount is above zero: with no machine days logged,
 * or a server older than the machine register, the list is the five and
 * nothing else. Any other group the server sends an amount for is shown too,
 * so the rows still add up to the total beside them.
 */
export function costGroupRows(byGroup: CostsByGroup, wording: CostGroupWording): CostGroupRow[] {
  const amounts: Record<string, number | undefined> = byGroup;
  const five = EXPENSE_GROUPS.map((key) => ({ key, label: costGroupLabel(key, wording), cents: amounts[key] ?? 0 }));
  const others = Object.keys(amounts)
    .filter((key) => !(EXPENSE_GROUPS as string[]).includes(key) && (amounts[key] ?? 0) > 0)
    .map((key) => ({ key, label: costGroupLabel(key, wording), cents: amounts[key] ?? 0 }));
  return [...five, ...others];
}
