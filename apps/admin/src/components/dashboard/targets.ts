import type { Block } from './block-state';
import { nextMonth, type YearMonth } from './month';

/**
 * The rules behind the Dashboard's targets row, kept free of React so they can
 * be tested without a DOM: what a month's targets amount to, what the row
 * shows, when next month's form is offered, and how the form's text becomes
 * the figures that are saved.
 */

/** A month's three targets. Zero means that target is not set. */
export type TargetValues = { revenueCents: number; netProfitCents: number; jobs: number };

export type TargetsState = 'none' | 'some' | 'all';

/** "none" covers both a month with no record and a record of three zeros. */
export function targetsState(values: TargetValues | null): TargetsState {
  if (!values) return 'none';
  const set = [values.revenueCents, values.netProfitCents, values.jobs].filter((v) => v > 0).length;
  return set === 0 ? 'none' : set === 3 ? 'all' : 'some';
}

/** The targets an overview carries; null when the month has no record. */
export function overviewTargets(overview: {
  hasTargets: boolean;
  revenue: { target: number };
  netProfit: { target: number };
  jobs: { target: number };
}): TargetValues | null {
  if (!overview.hasTargets) return null;
  return {
    revenueCents: overview.revenue.target,
    netProfitCents: overview.netProfit.target,
    jobs: overview.jobs.target,
  };
}

export type TargetsView =
  /** No targets, and the viewer may set them. */
  | { kind: 'prompt' }
  /** No targets, and a viewer who may not set them. */
  | { kind: 'read-only' }
  /** A ring for each target that is set, a dash for each that is not. */
  | { kind: 'rings'; set: { revenue: boolean; netProfit: boolean; jobs: boolean }; canEdit: boolean };

/**
 * What the targets row shows. Who may set targets is the server's answer,
 * handed in as `canSetTargets`. The month does not come into it: a past
 * month's targets can be set and edited as the current month's can.
 */
export function targetsView({
  values, canSetTargets,
}: {
  values: TargetValues | null;
  canSetTargets: boolean;
}): TargetsView {
  if (!values || targetsState(values) === 'none') {
    return canSetTargets ? { kind: 'prompt' } : { kind: 'read-only' };
  }
  return {
    kind: 'rings',
    set: { revenue: values.revenueCents > 0, netProfit: values.netProfitCents > 0, jobs: values.jobs > 0 },
    canEdit: canSetTargets,
  };
}

// ── Next month ──────────────────────────────────────────────────────────────

/** A month's targets as the server lists them. */
export type SavedTargets = {
  year: number;
  month: number;
  revenueTargetCents: number;
  netProfitTargetCents: number;
  jobsTarget: number;
};

export type NextMonthTargets =
  /** Not offered: a past month is on screen, or the viewer may not set targets. */
  | { kind: 'hidden' }
  | { kind: 'loading' }
  /** The saved targets could not be read, so there is no form: opened blank, it would save over figures that may exist. */
  | { kind: 'failed' }
  /** The form for `month`, opening with `values`: what is saved for it, or null when nothing is. */
  | { kind: 'ready'; month: YearMonth; values: TargetValues | null };

/**
 * Targets can be set for next month before it starts. The month selector
 * stops at the current month, so the way there is an action offered on the
 * current month. The form it opens is filled from the list of saved targets,
 * which is the one place next month's figures can be read.
 */
export function nextMonthTargets({
  canSetTargets, isCurrentMonth, current, saved,
}: {
  canSetTargets: boolean;
  /** The month on screen is the current one. */
  isCurrentMonth: boolean;
  /** The current month in Nairobi. */
  current: YearMonth;
  /** Every month's saved targets. */
  saved: Block<SavedTargets[]>;
}): NextMonthTargets {
  if (!canSetTargets || !isCurrentMonth) return { kind: 'hidden' };
  if (saved.status === 'loading') return { kind: 'loading' };
  if (saved.status === 'failed') return { kind: 'failed' };

  const month = nextMonth(current);
  const record = saved.data.find((t) => t.year === month.year && t.month === month.month);
  return {
    kind: 'ready',
    month,
    values: record
      ? { revenueCents: record.revenueTargetCents, netProfitCents: record.netProfitTargetCents, jobs: record.jobsTarget }
      : null,
  };
}

// ── The form ────────────────────────────────────────────────────────────────

/** The form's three fields as typed: shillings, shillings and a count. */
export type TargetsFormFields = { revenue: string; netProfit: string; jobs: string };

export type TargetsFormResult =
  | { ok: true; targets: TargetValues }
  | { ok: false; errors: Partial<Record<keyof TargetsFormFields, string>> };

/** A typed number of zero or more; blank is zero. Null when it is anything else. */
function typedNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  if (cleaned === '') return 0;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * What the form saves. A blank or zero field means "no target". An amount
 * must be a number of zero or more, and the jobs target a whole number;
 * anything else comes back with the reason, under the field it belongs to.
 */
export function parseTargetsForm(fields: TargetsFormFields): TargetsFormResult {
  const errors: Partial<Record<keyof TargetsFormFields, string>> = {};
  const amount = 'Enter an amount in shillings, 0 or more.';

  const revenue = typedNumber(fields.revenue);
  if (revenue === null) errors.revenue = amount;

  const netProfit = typedNumber(fields.netProfit);
  if (netProfit === null) errors.netProfit = amount;

  const jobs = typedNumber(fields.jobs);
  if (jobs === null || !Number.isInteger(jobs)) {
    errors.jobs = 'Jobs must be a whole number, such as 12.';
  }

  if (revenue === null || netProfit === null || jobs === null || errors.jobs) return { ok: false, errors };
  return {
    ok: true,
    targets: { revenueCents: Math.round(revenue * 100), netProfitCents: Math.round(netProfit * 100), jobs },
  };
}

/**
 * The fields the form opens with: the saved values with their thousands
 * grouped ("400,000"), which `parseTargetsForm` reads back, and blank for a
 * target that is not set.
 */
export function targetsFormFields(values: TargetValues | null): TargetsFormFields {
  const typed = (n: number) => (n > 0 ? n.toLocaleString('en-KE', { maximumFractionDigits: 2 }) : '');
  return {
    revenue: typed((values?.revenueCents ?? 0) / 100),
    netProfit: typed((values?.netProfitCents ?? 0) / 100),
    jobs: typed(values?.jobs ?? 0),
  };
}
