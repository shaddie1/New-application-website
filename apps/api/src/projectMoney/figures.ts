/**
 * Project money: the one place that decides which jobs count and what
 * charged, spent and profit are. The contracts table, a contract's breakdown
 * and the Financials all-time totals all add up here, so they agree.
 *
 * Pure functions over job rows that carry their costs. No database calls.
 * Every exported function drops jobs that do not count before adding.
 */
import type { ExpenseCategory, JobPlacement, JobStatus } from '@prisma/client';
import type { AllTimeTotals } from '@onyxhawk/types';

/** Jobs the owner entered or approved. A report waiting for approval counts nowhere. */
export const COUNTED_STATUSES: JobStatus[] = ['OWNER_ENTRY', 'APPROVED'];

/** A job row with its costs, as loaded from the database. */
export type MoneyJob = {
  id: string;
  title: string;
  date: Date;
  incomeCents: number;
  discountCents: number;
  status: JobStatus;
  placement: JobPlacement;
  projectId: string | null;
  expenses: { category: ExpenseCategory; amountCents: number }[];
};

// The columns the calculation reads.
export const moneyJobFields = {
  id: true,
  title: true,
  date: true,
  incomeCents: true,
  discountCents: true,
  status: true,
  placement: true,
  projectId: true,
} as const;
export const moneyJobSelect = { ...moneyJobFields, expenses: { select: { category: true, amountCents: true } } } as const;

export type MoneyFigures = {
  jobCount: number;
  /** The amount charged as typed on the job, before its discount. */
  typedCents: number;
  discountCents: number;
  /** Typed less discount: what Financials calls income. */
  chargedCents: number;
  /** Every cost of the jobs, whatever each cost's own date. */
  spentCents: number;
  /** Charged less spent. The discount is already inside charged. */
  profitCents: number;
};

export type ContractLines = {
  /** One line per project id asked for, in the order asked. */
  projects: (MoneyFigures & { projectId: string })[];
  standalone: MoneyFigures;
  unsorted: MoneyFigures;
  /** Every counted job: the company's all-time figures. */
  totals: MoneyFigures;
};

export type JobFigures = Omit<MoneyFigures, 'jobCount'> & {
  jobId: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
};

export type MonthFigures = MoneyFigures & {
  /** YYYY-MM */
  month: string;
};

export type ContractBreakdown = {
  totals: MoneyFigures;
  spentByGroupCents: Record<ExpenseCategory, number>;
  jobs: JobFigures[];
  months: MonthFigures[];
};

const counted = (jobs: MoneyJob[]) => jobs.filter((j) => COUNTED_STATUSES.includes(j.status));
const spent = (job: MoneyJob) => job.expenses.reduce((acc, e) => acc + e.amountCents, 0);
/** A job's date is a calendar date held at midnight UTC, so its text is read in UTC, never local time. */
const isoDate = (job: MoneyJob) => job.date.toISOString().slice(0, 10);

function add(jobs: MoneyJob[]): MoneyFigures {
  const typedCents = jobs.reduce((acc, j) => acc + j.incomeCents, 0);
  const discountCents = jobs.reduce((acc, j) => acc + j.discountCents, 0);
  const spentCents = jobs.reduce((acc, j) => acc + spent(j), 0);
  const chargedCents = typedCents - discountCents;
  return { jobCount: jobs.length, typedCents, discountCents, chargedCents, spentCents, profitCents: chargedCents - spentCents };
}

export function contractLines(jobs: MoneyJob[], projectIds: string[]): ContractLines {
  const all = counted(jobs);
  return {
    projects: projectIds.map((projectId) => ({
      projectId,
      ...add(all.filter((j) => j.placement === 'PROJECT' && j.projectId === projectId)),
    })),
    standalone: add(all.filter((j) => j.placement === 'STANDALONE')),
    unsorted: add(all.filter((j) => j.placement === 'UNSORTED')),
    totals: add(all),
  };
}

/**
 * One project's money. With `byMonth`, also a row for each calendar month from
 * its first job to its last. A month is the month of the job's date, for the
 * job's income and for all of its costs, so the rows add up to the totals.
 */
export function contractBreakdown(jobs: MoneyJob[], projectId: string, opts: { byMonth: boolean }): ContractBreakdown {
  const own = counted(jobs).filter((j) => j.placement === 'PROJECT' && j.projectId === projectId);

  const groupTotal = (group: ExpenseCategory) =>
    own.reduce((acc, j) => acc + j.expenses.filter((e) => e.category === group).reduce((a, e) => a + e.amountCents, 0), 0);

  return {
    totals: add(own),
    spentByGroupCents: {
      MATERIALS: groupTotal('MATERIALS'),
      TRANSPORT: groupTotal('TRANSPORT'),
      EMPLOYEE_PAY: groupTotal('EMPLOYEE_PAY'),
      LUNCH: groupTotal('LUNCH'),
      MISCELLANEOUS: groupTotal('MISCELLANEOUS'),
    },
    jobs: own.map((j) => {
      const { jobCount: _one, ...figures } = add([j]);
      return { jobId: j.id, date: isoDate(j), title: j.title, ...figures };
    }),
    months: opts.byMonth ? monthRows(own) : [],
  };
}

function monthRows(jobs: MoneyJob[]): MonthFigures[] {
  const monthOf = (j: MoneyJob) => isoDate(j).slice(0, 7);
  const present = jobs.map(monthOf).sort();
  const last = present.at(-1);
  if (present[0] === undefined || last === undefined) return [];

  const rows: MonthFigures[] = [];
  let year = Number(present[0].slice(0, 4));
  let month = Number(present[0].slice(5, 7));
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > last) break;
    rows.push({ month: key, ...add(jobs.filter((j) => monthOf(j) === key)) });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return rows;
}

export function allTimeTotalsOf(jobs: MoneyJob[]): AllTimeTotals {
  const all = counted(jobs);
  const figures = add(all);
  const dates = all.map(isoDate).sort();
  return {
    totalProjects: figures.jobCount,
    totalIncomeCents: figures.chargedCents,
    totalExpensesCents: figures.spentCents,
    totalNetCents: figures.profitCents,
    firstJobDate: dates[0] ?? null,
    lastJobDate: dates.at(-1) ?? null,
  };
}
