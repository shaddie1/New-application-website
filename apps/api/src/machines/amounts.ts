/**
 * Machine amounts for a period: what the machines' days took off profit
 * between two instants. The one place the period figures ask, so the
 * Financials summary and trends, Ownership, the Dashboard and a payout
 * declaration cannot disagree about which days count.
 *
 * Totals by project and for all time do not come here: they add a job's
 * machine lines inside projectMoney/figures.ts.
 */
import { prisma } from '../db.js';
import { COUNTED_STATUSES } from '../projectMoney/figures.js';

/**
 * The sum of the machine lines on counted jobs dated from `from` to `to`, both
 * inclusive. A machine line has no date of its own: it counts on its job's
 * date, whatever day it was logged. Each caller passes the bounds it uses for
 * jobs, so a line lands in the same period as its job there.
 */
export async function machineAmountCents(from: Date, to: Date): Promise<number> {
  const lines = await prisma.machineLine.aggregate({
    where: { job: { date: { gte: from, lte: to }, status: { in: COUNTED_STATUSES } } },
    _sum: { amountCents: true },
  });
  return lines._sum.amountCents ?? 0;
}
