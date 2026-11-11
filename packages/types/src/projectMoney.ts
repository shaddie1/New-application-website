/**
 * Project money: what each contract was charged, what it cost and the profit,
 * added up from its jobs. Served to the owner, the admin, the financial
 * manager and the COO only. Money is in cents (KSh x 100).
 */
import type { ExpenseCategory } from './admin.js';

export interface MoneyFiguresDto {
  jobCount: number;
  /** The amount charged as typed on the jobs, before discounts. */
  typedCents: number;
  discountCents: number;
  /** Typed less discounts: what Financials calls income. */
  chargedCents: number;
  spentCents: number;
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

export interface CostLineDto {
  id: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  description: string | null;
  amountCents: number;
  enteredByName: string | null;
  receiptRef: string | null;
  /** A web address starting with http or https, or null. */
  receiptUrl: string | null;
}

export interface ProjectMoneyJobDto {
  jobId: string;
  date: string; // YYYY-MM-DD
  title: string;
  typedCents: number;
  discountCents: number;
  chargedCents: number;
  spentCents: number;
  profitCents: number;
  costs: CostLineDto[];
}

/** One contract's money. */
export interface ProjectMoneyDetail {
  projectId: string;
  totals: MoneyFiguresDto;
  spentByGroupCents: Record<ExpenseCategory, number>;
  /** A row per calendar month for a contract billed daily, weekly or monthly; empty for a one-off contract. */
  months: (MoneyFiguresDto & { month: string /* YYYY-MM */ })[];
  /** Newest first. */
  jobs: ProjectMoneyJobDto[];
}
