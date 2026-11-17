/**
 * Project money: what each contract was charged, what it cost and the profit,
 * added up from its jobs. Served to the owner, the admin, the financial
 * manager and the COO only. Money is in cents (KSh x 100).
 */
import type { CostsByGroup, ExpenseCategory, ProjectStage } from './admin.js';

export interface MoneyFiguresDto {
  jobCount: number;
  /** The amount charged as typed on the jobs, before discounts. */
  typedCents: number;
  discountCents: number;
  /** Typed less discounts: what Financials calls income. */
  chargedCents: number;
  /** Every cost of the jobs and their machine days. */
  spentCents: number;
  /** The machine days inside `spentCents`. Sent only when above zero. */
  machineCents?: number;
  /** Charged less spent. */
  profitCents: number;
}

/** The contracts table on the Projects page. */
export interface ProjectMoneyTable {
  /** One line for every project, in the order of the Projects list. Zero figures when it has no jobs. */
  projects: (MoneyFiguresDto & { projectId: string })[];
  /** Every job marked one-off. */
  oneOff: MoneyFiguresDto;
  /** Jobs not yet sorted; null when there are none. */
  unsorted: MoneyFiguresDto | null;
  /** Every project, the one-off line and the not-yet-sorted line: the all-time figures in Financials. */
  totals: MoneyFiguresDto;
}

/**
 * One line of what a job cost. A machine's days on the job are a line too:
 * its category is `MACHINES`, its date is the job's, its description is the
 * machine's name and days, and it has no receipt fields.
 */
export interface CostLineDto {
  id: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory | 'MACHINES';
  description: string | null;
  amountCents: number;
  enteredByName: string | null;
  /** Left out of a `MACHINES` line. */
  receiptRef?: string | null;
  /** A web address starting with http or https, or null. Left out of a `MACHINES` line. */
  receiptUrl?: string | null;
}

export interface ProjectMoneyJobDto {
  jobId: string;
  date: string; // YYYY-MM-DD
  title: string;
  typedCents: number;
  discountCents: number;
  chargedCents: number;
  spentCents: number;
  /** The machine days inside `spentCents`. Sent only when above zero. */
  machineCents?: number;
  profitCents: number;
  /** The job's costs, newest first, then its machine days. */
  costs: CostLineDto[];
}

/** One contract's money. */
export interface ProjectMoneyDetail {
  projectId: string;
  totals: MoneyFiguresDto;
  spentByGroupCents: CostsByGroup;
  /** A row per calendar month for a contract billed daily, weekly or monthly; empty for a one-off contract. */
  months: (MoneyFiguresDto & { month: string /* YYYY-MM */ })[];
  /** Newest first. */
  jobs: ProjectMoneyJobDto[];
}

/** A project that may be the home of a job not yet sorted. */
export interface ProjectMatchDto {
  projectId: string;
  title: string;
  clientName: string | null;
  stage: ProjectStage;
  /** Phone wins over name when both match. */
  by: 'PHONE' | 'NAME';
}

/** A counted job the owner has not yet put under a project or marked one-off. */
export interface UnsortedJobDto {
  jobId: string;
  date: string; // YYYY-MM-DD
  title: string;
  clientName: string | null;
  /** Income less discount. */
  chargedCents: number;
  /** Phone matches first, then name matches; open projects before completed or cancelled ones. */
  matches: ProjectMatchDto[];
  /** Set only when exactly one project matches. */
  suggestedProjectId: string | null;
}
