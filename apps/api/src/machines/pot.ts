/**
 * A machine's pot: what it has earned, what came out of that, and whose the
 * rest is. Nothing here is stored. Earned is the sum of the machine's lines,
 * the same rows every profit figure subtracts, so the pot and profit cannot
 * drift apart.
 *
 * Pure functions over rows the caller has already loaded. No database calls.
 * Money is whole cents throughout.
 *
 * Dates are calendar days. The database gives a start day and a repair's date
 * as midnight UTC, and they are compared here by their YYYY-MM-DD text.
 */

export type PotInput = {
  /** The machine's price. 0 when it has none: the machine is then the company's. */
  priceCents: number;
  /** The day the pot starts counting. Repairs dated before it are left out of every figure. */
  startDay: Date;
  /** Every line logged for the machine, days on jobs and hires alike. */
  lines: { amountCents: number }[];
  /** Every repair on the machine, whatever its date. */
  repairs: { date: Date; costCents: number }[];
  investors: { id: string; name: string; contributionCents: number }[];
  /** Every payment made to the machine's investors. */
  payments: { investorId: string; amountCents: number }[];
};

export type InvestorFigures = {
  investorId: string;
  name: string;
  contributionCents: number;
  /**
   * What they put in over the price, in hundredths of a percent (6000 is 60%),
   * rounded down. For showing only: no money is worked out from it.
   */
  shareBps: number;
  /**
   * Their share of earned less counted repairs, rounded down to the cent.
   * Below zero when repairs have outrun earnings.
   */
  entitledCents: number;
  paidCents: number;
  /** What can still be paid to them. Never below zero. */
  owedCents: number;
  /** How much they were paid beyond what they are entitled to. Never more than they were paid. */
  overpaidCents: number;
};

export type PotFigures = {
  /** The sum of the machine's lines. */
  earnedCents: number;
  /** Repairs dated on or after the start day. */
  repairsCents: number;
  /** Every payment to an investor. */
  paidOutCents: number;
  /** Earned less counted repairs less payments. Below zero when repairs have outrun earnings. */
  potCents: number;
  /**
   * Price plus counted repairs, less earned. Above zero is what the machine has
   * still to earn back; below zero is how far ahead it is.
   */
  earnBackGapCents: number;
  paidForItself: boolean;
  /** The part of the price no investor covered, over the price, in hundredths of a percent. 10000 with no price. */
  companyShareBps: number;
  /** Earned less counted repairs, less every investor's entitlement. It stays in the pot. */
  companyPartCents: number;
  /** In the order given. */
  investors: InvestorFigures[];
};

const WHOLE_BPS = 10_000;

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Newest first by calendar day, and by when it was entered within a day. */
export function newestFirst<T>(rows: T[], dayOf: (row: T) => Date, enteredAt: (row: T) => Date): T[] {
  return [...rows].sort(
    (a, b) => dayOf(b).getTime() - dayOf(a).getTime() || enteredAt(b).getTime() - enteredAt(a).getTime(),
  );
}

/** Whether a repair dated `date` counts for a machine whose start day is `startDay`: on that day or after it. */
export function countsFromStartDay(date: Date, startDay: Date): boolean {
  return isoDay(date) >= isoDay(startDay);
}

/**
 * `amount` x `part` / `whole`, rounded down to a whole number. `whole` is above
 * zero. The multiplication is done in BigInt: cents times cents can pass the
 * largest whole number a JavaScript number holds exactly, and the answer would
 * then be a cent out.
 */
function shareOf(amount: number, part: number, whole: number): number {
  const product = BigInt(amount) * BigInt(part);
  const divisor = BigInt(whole);
  // BigInt division drops the fraction, which rounds a negative answer up.
  const quotient = product / divisor - (product < 0n && product % divisor !== 0n ? 1n : 0n);
  return Number(quotient);
}

export const sum = (amounts: number[]) => amounts.reduce((total, a) => total + a, 0);

export function potFigures(input: PotInput): PotFigures {
  const { priceCents } = input;
  const earnedCents = sum(input.lines.map((l) => l.amountCents));
  const repairsCents = sum(
    input.repairs.filter((r) => countsFromStartDay(r.date, input.startDay)).map((r) => r.costCents),
  );
  const paidOutCents = sum(input.payments.map((p) => p.amountCents));
  // What there is to share: the investors' entitlements and the company's part add up to exactly this.
  const toShareCents = earnedCents - repairsCents;
  const earnBackGapCents = priceCents + repairsCents - earnedCents;

  // A machine with no price is the company's: nobody's share can be worked out of nothing.
  const hasPrice = priceCents > 0;

  const investors = input.investors.map((investor): InvestorFigures => {
    const entitledCents = hasPrice ? shareOf(toShareCents, investor.contributionCents, priceCents) : 0;
    const paidCents = sum(input.payments.filter((p) => p.investorId === investor.id).map((p) => p.amountCents));
    // Against the entitlement or zero, whichever is higher: an investor is never
    // owed a negative amount, and never overpaid by more than they were paid.
    // The negative pot shows the shortfall instead.
    const payableCents = Math.max(entitledCents, 0);
    return {
      investorId: investor.id,
      name: investor.name,
      contributionCents: investor.contributionCents,
      shareBps: hasPrice ? shareOf(WHOLE_BPS, investor.contributionCents, priceCents) : 0,
      entitledCents,
      paidCents,
      owedCents: Math.max(payableCents - paidCents, 0),
      overpaidCents: Math.max(paidCents - payableCents, 0),
    };
  });

  const coveredCents = sum(input.investors.map((i) => i.contributionCents));

  return {
    earnedCents,
    repairsCents,
    paidOutCents,
    potCents: toShareCents - paidOutCents,
    earnBackGapCents,
    // "Until it has earned something" matters only with no price, where the gap starts at zero.
    paidForItself: earnedCents > 0 && earnBackGapCents <= 0,
    companyShareBps: hasPrice ? shareOf(WHOLE_BPS, priceCents - coveredCents, priceCents) : WHOLE_BPS,
    // The remainder, so each rounding cent stays with the company and the parts add up.
    companyPartCents: toShareCents - sum(investors.map((i) => i.entitledCents)),
    investors,
  };
}
