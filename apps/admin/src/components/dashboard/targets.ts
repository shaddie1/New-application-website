/**
 * The rules behind the Dashboard's targets row, kept free of React so they can
 * be tested without a DOM: what a month's targets amount to, who may set them,
 * what the row shows, and how the form's text becomes the figures that are saved.
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

const SETTER_ROLES = ['ADMIN', 'FINANCIAL_MANAGER'];

/**
 * The owner, admins and the financial manager set targets from the Dashboard.
 * A shareholder-role account sees the result and is never offered the form.
 */
export function maySetTargets(user: { isOwner?: boolean; role: string }): boolean {
  return user.isOwner === true || SETTER_ROLES.includes(user.role);
}

export type TargetsView =
  /** No targets, the month is still running, and the viewer may set them. */
  | { kind: 'prompt' }
  /** No targets, and nothing to offer: a past month, or a viewer who may not set them. */
  | { kind: 'read-only' }
  /** A ring for each target that is set, a dash for each that is not. */
  | { kind: 'rings'; set: { revenue: boolean; netProfit: boolean; jobs: boolean }; canEdit: boolean };

export function targetsView({
  values, isCurrentMonth, maySet,
}: {
  values: TargetValues | null;
  isCurrentMonth: boolean;
  maySet: boolean;
}): TargetsView {
  if (!values || targetsState(values) === 'none') {
    return isCurrentMonth && maySet ? { kind: 'prompt' } : { kind: 'read-only' };
  }
  return {
    kind: 'rings',
    set: { revenue: values.revenueCents > 0, netProfit: values.netProfitCents > 0, jobs: values.jobs > 0 },
    canEdit: maySet,
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
