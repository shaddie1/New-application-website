import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * In-memory tables behind the few Prisma calls the ledger makes. Filters are
 * applied as the database would, and `select` is ignored, so a query that
 * leaves a filter out sees rows it should not.
 */
const db = { jobs: [] as Row[], expenses: [] as Row[], serviceLines: [] as Row[] };

const OPS: Record<string, (value: any, arg: any) => boolean> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  in: (v, arg) => arg.includes(v),
  not: (v, arg) => v !== arg,
  gte: (v, arg) => v >= arg,
  lt: (v, arg) => v < arg,
  lte: (v, arg) => v <= arg,
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([field, cond]) => {
    const value = row[field];
    if (cond === null || typeof cond !== 'object') return value === cond;
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    const keys = Object.keys(cond);
    if (keys.every((k) => k in OPS)) return keys.every((k) => OPS[k]!(value, cond[k]));
    return value != null && matches(value, cond); // a relation filter, e.g. job: { status: ... }
  });
}

function aggregate(rows: Row[], args: Row) {
  const pick = (spec: Row = {}, fold: (vals: any[]) => any) => // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.fromEntries(Object.keys(spec).map((k) => [k, rows.length ? fold(rows.map((r) => r[k])) : null]));
  return {
    _sum: pick(args._sum, (vals) => vals.reduce((a, v) => a + v, 0)),
    _min: pick(args._min, (vals) => vals.reduce((a, v) => (v < a ? v : a))),
    _count: { _all: rows.length },
  };
}

const expensesWithJob = () => db.expenses.map((e) => ({ ...e, job: db.jobs.find((j) => j.id === e.jobId) ?? null }));

vi.mock('../db.js', () => ({
  prisma: {
    job: {
      findMany: async ({ where }: Row) => db.jobs.filter((r) => matches(r, where)),
      aggregate: async (args: Row) => aggregate(db.jobs.filter((r) => matches(r, args.where)), args),
      groupBy: async (args: Row) => {
        const field = args.by[0];
        const groups = new Map<unknown, Row[]>();
        for (const r of db.jobs.filter((row) => matches(row, args.where))) {
          groups.set(r[field], [...(groups.get(r[field]) ?? []), r]);
        }
        return [...groups].map(([key, rows]) => ({ [field]: key, ...aggregate(rows, args) }));
      },
    },
    expense: {
      findMany: async ({ where }: Row) => expensesWithJob().filter((r) => matches(r, where)),
      aggregate: async (args: Row) => aggregate(expensesWithJob().filter((r) => matches(r, args.where)), args),
    },
    serviceLine: { findMany: async ({ where }: Row = {}) => db.serviceLines.filter((r) => matches(r, where)) },
  },
}));

const { loadLedger } = await import('./ledger.js');

let seq = 0;
function job(date: string, incomeCents: number, over: Row = {}) {
  const row = {
    id: `job${++seq}`,
    date: new Date(`${date}T00:00:00.000Z`),
    incomeCents,
    discountCents: 0,
    status: 'APPROVED',
    serviceLineCode: null,
    ...over,
  };
  db.jobs.push(row);
  return row;
}
function expense(jobId: string, date: string, amountCents: number) {
  db.expenses.push({ id: `exp${++seq}`, jobId, date: new Date(`${date}T00:00:00.000Z`), amountCents });
}

const monthOf = (ledger: Awaited<ReturnType<typeof loadLedger>>, key: string) => ledger.months.find((m) => m.key === key)!;

beforeEach(() => {
  db.jobs = [];
  db.expenses = [];
  db.serviceLines = [];
});

describe('ledger: months on the Nairobi calendar', () => {
  it('takes the current month from Nairobi, not UTC, and marks it in progress', async () => {
    job('2026-03-31', 10_000);
    job('2026-04-01', 20_000);

    // 01:30 on 1 April in Nairobi, still 31 March in UTC.
    const ledger = await loadLedger(new Date('2026-03-31T22:30:00.000Z'));

    expect(ledger.currentMonth).toBe('2026-04');
    expect(ledger.months).toHaveLength(25);
    expect(ledger.months[0]!.key).toBe('2024-04');
    expect(ledger.months.at(-1)).toMatchObject({ key: '2026-04', label: 'Apr 2026', inProgress: true, jobs: 1, revenueCents: 20_000 });
    expect(monthOf(ledger, '2026-03')).toMatchObject({ inProgress: false, jobs: 1, revenueCents: 10_000 });
    expect(ledger.months.filter((m) => m.inProgress)).toHaveLength(1);
  });

  it('compares the month in progress with the same days of last month and of last year', async () => {
    job('2026-03-03', 30_000);
    job('2026-03-20', 70_000);
    job('2025-04-03', 5_000);
    job('2025-04-10', 9_000);

    // 12:00 on 5 April in Nairobi.
    const ledger = await loadLedger(new Date('2026-04-05T09:00:00.000Z'));

    expect(ledger.comparisons.previousMonth).toEqual({
      key: '2026-03',
      from: '2026-03-01',
      to: '2026-03-05',
      hasRecords: true,
      revenueCents: 30_000,
      netCents: 30_000,
      jobs: 1,
    });
    expect(ledger.comparisons.sameMonthLastYear).toEqual({
      key: '2025-04',
      from: '2025-04-01',
      to: '2025-04-05',
      hasRecords: true,
      revenueCents: 5_000,
      netCents: 5_000,
      jobs: 1,
    });
    // Closed months still count whole.
    expect(monthOf(ledger, '2026-03')).toMatchObject({ jobs: 2, revenueCents: 100_000 });
  });
});

describe('ledger: periods', () => {
  it('sums this quarter and this year on the Nairobi calendar', async () => {
    job('2025-12-31', 1_000);
    job('2026-09-30', 20_000);
    job('2026-10-01', 300_000);

    // 01:00 on 1 October in Nairobi, still 30 September in UTC.
    const ledger = await loadLedger(new Date('2026-09-30T22:00:00.000Z'));

    expect(ledger.periods.quarter).toMatchObject({ from: '2026-10-01', to: '2026-12-31', revenueCents: 300_000, jobs: 1 });
    expect(ledger.periods.year).toMatchObject({ from: '2026-01-01', to: '2026-12-31', revenueCents: 320_000, jobs: 2 });
  });
});

describe('ledger: net profit as Financials counts it', () => {
  it("counts an expense in its own month, and only the expenses of counted jobs", async () => {
    const feb = job('2026-02-27', 50_000, { discountCents: 2_000 });
    expense(feb.id, '2026-03-02', 10_000);
    const pending = job('2026-03-10', 99_000, { status: 'PENDING' });
    expense(pending.id, '2026-03-10', 7_000);

    const ledger = await loadLedger(new Date('2026-04-05T09:00:00.000Z'));

    expect(monthOf(ledger, '2026-02')).toMatchObject({ revenueCents: 48_000, netCents: 48_000, jobs: 1 });
    expect(monthOf(ledger, '2026-03')).toMatchObject({ revenueCents: 0, netCents: -10_000, jobs: 0 });
    expect(ledger.periods.allTime).toMatchObject({ revenueCents: 48_000, netCents: 38_000, jobs: 1 });
  });

  it('names service lines from the catalog, humanises unknown codes and files jobs with no code as Unclassified', async () => {
    db.serviceLines.push({ code: 'residential', name: 'Residential cleaning' });
    job('2026-03-02', 10_000, { serviceLineCode: 'residential' });
    job('2026-03-04', 20_000, { serviceLineCode: 'post_build' });
    job('2026-03-06', 5_000);
    job('2026-03-08', 1_000);

    const ledger = await loadLedger(new Date('2026-04-05T09:00:00.000Z'));

    const expected = [
      { code: 'post_build', name: 'Post build', revenueCents: 20_000, jobs: 1 },
      { code: 'residential', name: 'Residential cleaning', revenueCents: 10_000, jobs: 1 },
      { code: null, name: 'Unclassified', revenueCents: 6_000, jobs: 2 },
    ];
    expect(monthOf(ledger, '2026-03').byServiceLine).toEqual(expected);
    expect(ledger.periods.allTime.byServiceLine).toEqual(expected);
  });
});
