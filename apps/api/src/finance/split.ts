/**
 * How profit and pay-ins split. The owner's rules of 20 November 2026:
 * 5% of a period's profit goes to marketing before the shareholders split the
 * rest by stake, and a loss sets nothing aside; a project's costs paid in by
 * the shareholders are entered as one total and split by stake.
 */

/** Stakes are held in basis points: 10000 is 100%. */
export const BASIS_POINTS_TOTAL = 10_000;

/** Marketing's part of profit: 500 basis points, 5%. */
export const MARKETING_BASIS_POINTS = 500;

/** What a profit of `profitCents` sets aside for marketing: 5%, to the nearest cent; nothing for a loss or zero. */
export function marketingSetAsideCents(profitCents: number): number {
  if (profitCents <= 0) return 0;
  return Math.round((profitCents * MARKETING_BASIS_POINTS) / BASIS_POINTS_TOTAL);
}

/** One row of a declared Profit sharing period, as the marketing fund reads it. Dates are YYYY-MM-DD. */
export interface DeclaredRow {
  label: string;
  periodStart: string;
  periodEnd: string;
  marketingCents: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
}

export interface MarketingFund {
  setAsideCents: number;
  spentCents: number;
  balanceCents: number;
  sinceDate: string | null;
  periods: { label: string; periodStart: string; periodEnd: string; marketingCents: number }[];
}

/**
 * The marketing fund: each declared period's set-aside counted once (a period
 * is one row per shareholder, all with the same figure; a period whose rows
 * are all cancelled counts for nothing), less the marketing spend dated from
 * the start of the first period that set money aside. Spend before then was
 * paid before the fund existed. Periods newest first.
 */
export function marketingFundOf(rows: DeclaredRow[], spends: { date: string; amountCents: number }[]): MarketingFund {
  const byPeriod = new Map<string, MarketingFund['periods'][number]>();
  for (const r of rows) {
    if (r.status === 'CANCELLED' || r.marketingCents <= 0) continue;
    const key = `${r.periodStart} ${r.periodEnd}`;
    if (!byPeriod.has(key)) {
      byPeriod.set(key, { label: r.label, periodStart: r.periodStart, periodEnd: r.periodEnd, marketingCents: r.marketingCents });
    }
  }
  const periods = [...byPeriod.values()].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const sinceDate = periods.length ? periods.reduce((min, p) => (p.periodStart < min ? p.periodStart : min), periods[0]!.periodStart) : null;
  const setAsideCents = periods.reduce((acc, p) => acc + p.marketingCents, 0);
  const spentCents = sinceDate ? spends.filter((s) => s.date >= sinceDate).reduce((acc, s) => acc + s.amountCents, 0) : 0;
  return { setAsideCents, spentCents, balanceCents: setAsideCents - spentCents, sinceDate, periods };
}

/**
 * Split `amountCents` across `stakes` (basis points) in whole cents. The cents
 * lost to rounding go to the largest fractional parts first, so the shares add
 * up exactly. When the stakes add up to less than 100%, the part they do not
 * cover is `unallocatedCents`: the company's own. Works for a negative amount too.
 */
export function splitByStake(amountCents: number, stakes: number[]): { shares: number[]; unallocatedCents: number } {
  const total = stakes.reduce((acc, bp) => acc + bp, 0);
  if (stakes.length === 0 || total === 0) return { shares: stakes.map(() => 0), unallocatedCents: amountCents };

  const covered = Math.round((amountCents * total) / BASIS_POINTS_TOTAL);
  const exact = stakes.map((bp) => (amountCents * bp) / BASIS_POINTS_TOTAL);
  const shares = exact.map((v) => Math.floor(v));

  const leftover = covered - shares.reduce((acc, v) => acc + v, 0);
  const byFraction = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < leftover; k += 1) {
    const target = byFraction[k % byFraction.length]!;
    shares[target.i] = shares[target.i]! + 1;
  }
  return { shares, unallocatedCents: amountCents - covered };
}
