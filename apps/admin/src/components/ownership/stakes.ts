import type { ReplaceStakesInput, ShareholderDto, ShareholderKind } from '@onyxhawk/types';

/**
 * The arithmetic and rules of the Edit stakes form. Stakes are whole basis
 * points (10000 = 100.00%), so they add up exactly, and a typed percentage is
 * read digit by digit, never multiplied as a fraction.
 */

export const BASIS_POINTS_TOTAL = 10_000;

// ── A typed stake ───────────────────────────────────────────────────────────

export type StakeReading = { ok: true; basisPoints: number } | { ok: false; reason: string };

const refuse = (reason: string): StakeReading => ({ ok: false, reason });

/**
 * Reads a typed percentage: "40" is 4000 basis points, "33.33" is 3333 and
 * "0.5" is 50. A third decimal place is refused as typed, never rounded. So
 * are a blank, anything that is not a plain number, a negative, 0 and
 * anything above 100. A refusal says why, in a sentence the form can show.
 */
export function parseStake(text: string): StakeReading {
  const typed = text.trim();
  if (typed === '') return refuse('Enter a stake.');
  if (/^-\d+(\.\d*)?$/.test(typed)) return refuse('A stake cannot be negative.');

  const match = /^(\d+)(?:\.(\d*))?$/.exec(typed);
  if (!match) return refuse('Enter a number, such as 40 or 33.33.');
  const whole = match[1]!;
  const decimals = match[2] ?? '';
  if (decimals.length > 2) return refuse('A stake can have at most two decimal places.');

  const basisPoints = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (basisPoints > BASIS_POINTS_TOTAL) return refuse('A stake cannot be more than 100%.');
  if (basisPoints === 0) return refuse('A stake must be more than 0%.');
  return { ok: true, basisPoints };
}

// ── Totals ──────────────────────────────────────────────────────────────────

export function sumBasisPoints(stakes: number[]): number {
  return stakes.reduce((acc, basisPoints) => acc + basisPoints, 0);
}

/** How far a total is from 100.00%: exactly there, or some basis points left to assign or over. */
export type StakeBalance = { kind: 'exact' | 'left' | 'over'; basisPoints: number };

export function stakeBalance(totalBasisPoints: number): StakeBalance {
  if (totalBasisPoints === BASIS_POINTS_TOTAL) return { kind: 'exact', basisPoints: 0 };
  return totalBasisPoints < BASIS_POINTS_TOTAL
    ? { kind: 'left', basisPoints: BASIS_POINTS_TOTAL - totalBasisPoints }
    : { kind: 'over', basisPoints: totalBasisPoints - BASIS_POINTS_TOTAL };
}

// ── Writing a stake ─────────────────────────────────────────────────────────

function digits(basisPoints: number) {
  const size = Math.abs(basisPoints);
  return {
    sign: basisPoints < 0 ? '-' : '',
    whole: Math.trunc(size / 100),
    hundredths: String(size % 100).padStart(2, '0'),
  };
}

/** 4000 → "40.00%", 3333 → "33.33%": the form's totals and the confirmation. */
export function formatPercent(basisPoints: number): string {
  const { sign, whole, hundredths } = digits(basisPoints);
  return `${sign}${whole}.${hundredths}%`;
}

/** "10.00% left" or "10.00% over", beside the running total. Null at exactly 100.00%. */
export function balanceText(balance: StakeBalance): string | null {
  if (balance.kind === 'exact') return null;
  return `${formatPercent(balance.basisPoints)} ${balance.kind}`;
}

/** 4000 → "40", 3333 → "33.33", 50 → "0.5": what a stake's field starts with. */
export function stakeText(basisPoints: number): string {
  const { sign, whole, hundredths } = digits(basisPoints);
  if (hundredths === '00') return `${sign}${whole}`;
  return `${sign}${whole}.${hundredths.replace(/0$/, '')}`;
}

/** 4000 → "40%", 3333 → "33.33%": the short form the page's table and split use. */
export function formatPercentShort(basisPoints: number): string {
  return `${stakeText(basisPoints)}%`;
}

// ── The form's rows ─────────────────────────────────────────────────────────

/** One row of the form. Everything typed is kept as typed. */
export type StakeRow = {
  /** Stable for the life of the form: the holder's id, or a made-up key for a new row. */
  key: string;
  /** Null for a holder the form is adding. */
  id: string | null;
  /** Editable on a new row only; a current holder's details change under "Edit details". */
  name: string;
  title: string;
  kind: ShareholderKind;
  /** The stake as typed, in percent. */
  stake: string;
  /** A current holder marked for removal. The row stays in the form so it can be undone. */
  removed: boolean;
};

/** The rows the form opens with: one per current holder, at their stake. */
export function rowsFor(holders: ShareholderDto[]): StakeRow[] {
  return holders.map((h) => ({
    key: h.id,
    id: h.id,
    name: h.name,
    title: h.title ?? '',
    kind: h.kind,
    stake: stakeText(h.basisPoints),
    removed: false,
  }));
}

/** An empty row for a holder being added. */
export function blankRow(key: string): StakeRow {
  return { key, id: null, name: '', title: '', kind: 'INDIVIDUAL', stake: '', removed: false };
}

/** What is wrong with a row, by field. A removed row is not judged. */
export type RowProblems = { name?: string; stake?: string };

export function rowProblems(row: StakeRow): RowProblems {
  if (row.removed) return {};
  const problems: RowProblems = {};
  if (row.id === null && row.name.trim() === '') problems.name = 'Enter a name.';
  const reading = parseStake(row.stake);
  if (!reading.ok) problems.stake = reading.reason;
  return problems;
}

// ── The request ─────────────────────────────────────────────────────────────

/**
 * The save request: the stakes the form opened with, so the server can tell
 * a stale form, and the full new set. A removed row is left out of the new
 * set. Null while any remaining row cannot be read.
 */
export function buildReplaceStakesInput(opened: ShareholderDto[], rows: StakeRow[]): ReplaceStakesInput | null {
  const holders: ReplaceStakesInput['holders'] = [];
  for (const row of rows) {
    if (row.removed) continue;
    const reading = parseStake(row.stake);
    if (!reading.ok) return null;
    if (row.id !== null) {
      holders.push({ id: row.id, basisPoints: reading.basisPoints });
      continue;
    }
    const name = row.name.trim();
    if (name === '') return null;
    holders.push({ name, title: row.title.trim() || null, kind: row.kind, basisPoints: reading.basisPoints });
  }
  return {
    expected: opened.map((h) => ({ id: h.id, basisPoints: h.basisPoints })),
    holders,
  };
}

// ── What a save would change ────────────────────────────────────────────────

export type StakeDifference = {
  kind: 'added' | 'changed' | 'removed';
  name: string;
  /** Null for a holder being added. */
  beforeBasisPoints: number | null;
  /** Null for a holder being removed. */
  afterBasisPoints: number | null;
  /** True for a removed holder with a linked user account, which loses the access the link gave. */
  linkedAccount: boolean;
  /** That account's name, when the server gave one. */
  linkedAccountName: string | null;
};

/**
 * Every holder a save would add, change or remove, with the stake before and
 * after: current holders first, in table order, then the new ones. A holder
 * whose stake does not move is left out.
 */
export function stakeDifferences(opened: ShareholderDto[], holders: ReplaceStakesInput['holders']): StakeDifference[] {
  const kept = new Map<string, number>();
  for (const h of holders) if ('id' in h) kept.set(h.id, h.basisPoints);

  const differences: StakeDifference[] = [];
  for (const h of opened) {
    const after = kept.get(h.id);
    if (after === undefined) {
      differences.push({
        kind: 'removed',
        name: h.name,
        beforeBasisPoints: h.basisPoints,
        afterBasisPoints: null,
        linkedAccount: h.userId !== null,
        linkedAccountName: h.userId !== null ? h.userName : null,
      });
    } else if (after !== h.basisPoints) {
      differences.push({
        kind: 'changed',
        name: h.name,
        beforeBasisPoints: h.basisPoints,
        afterBasisPoints: after,
        linkedAccount: false,
        linkedAccountName: null,
      });
    }
  }
  for (const h of holders) {
    if ('id' in h) continue;
    differences.push({
      kind: 'added',
      name: h.name,
      beforeBasisPoints: null,
      afterBasisPoints: h.basisPoints,
      linkedAccount: false,
      linkedAccountName: null,
    });
  }
  return differences;
}

/**
 * The confirmation's text: one line per holder added, changed or removed,
 * then what the save does and does not touch, and what happens to the user
 * account of each removed holder who has one.
 */
export function confirmationSummary(differences: StakeDifference[]): { changes: string[]; notes: string[] } {
  const changes = differences.map((d) => {
    if (d.kind === 'added') return `${d.name}: added at ${formatPercent(d.afterBasisPoints ?? 0)}`;
    if (d.kind === 'removed') return `${d.name}: removed (was ${formatPercent(d.beforeBasisPoints ?? 0)})`;
    return `${d.name}: ${formatPercent(d.beforeBasisPoints ?? 0)} to ${formatPercent(d.afterBasisPoints ?? 0)}`;
  });

  const notes = ['All-time shares are worked out again at the new stakes.', 'Declared payouts do not change.'];
  for (const d of differences) {
    if (!d.linkedAccount) continue;
    const account = d.linkedAccountName ? ` (${d.linkedAccountName})` : '';
    notes.push(
      `${d.name} is linked to a user account${account}. That account loses Profit sharing and Documents, ` +
        'and keeps its staff sign-in and role until they are changed on the Team page.',
    );
  }
  return { changes, notes };
}

// ── The whole form ──────────────────────────────────────────────────────────

export type StakesForm = {
  /** By row key; a row with nothing wrong has no entry. */
  problems: Record<string, RowProblems>;
  /** The sum of the readable stakes of the rows not removed. */
  totalBasisPoints: number;
  balance: StakeBalance;
  /** What a save would change. Empty while a row cannot be read. */
  differences: StakeDifference[];
  /** Why the form cannot be saved, or null when it can. */
  blockedReason: string | null;
  /** The request to send. Null exactly when `blockedReason` is set. */
  input: ReplaceStakesInput | null;
};

/**
 * Judges the form as it stands. It can be saved only when every remaining row
 * is valid, at least one remains, the total is exactly 100.00% and something
 * has changed.
 */
export function readStakesForm(opened: ShareholderDto[], rows: StakeRow[]): StakesForm {
  const remaining = rows.filter((row) => !row.removed);

  const problems: Record<string, RowProblems> = {};
  const readable: number[] = [];
  for (const row of remaining) {
    const found = rowProblems(row);
    if (found.name || found.stake) problems[row.key] = found;
    const reading = parseStake(row.stake);
    if (reading.ok) readable.push(reading.basisPoints);
  }

  const totalBasisPoints = sumBasisPoints(readable);
  const balance = stakeBalance(totalBasisPoints);
  const candidate = buildReplaceStakesInput(opened, rows);
  const differences = candidate ? stakeDifferences(opened, candidate.holders) : [];

  let blockedReason: string | null = null;
  if (remaining.length === 0) blockedReason = 'At least one shareholder must remain.';
  else if (!candidate) blockedReason = 'Correct the rows marked above.';
  else if (balance.kind !== 'exact') blockedReason = 'Stakes must total exactly 100.00%.';
  else if (differences.length === 0) blockedReason = 'No changes to save.';

  return {
    problems,
    totalBasisPoints,
    balance,
    differences,
    blockedReason,
    input: blockedReason === null ? candidate : null,
  };
}
