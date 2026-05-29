/**
 * Hawk Points crediting on booking completion.
 *
 * The ledger is append-only — a credit is one row with reason BOOKING_BASE
 * and the booking's `pointsToEarn` (the figure quoted to the customer at
 * booking time, which already accounts for the weekend multiplier).
 *
 * Idempotency: if a BOOKING_BASE row already exists for this booking, we
 * return early. This makes the crediting safe to call from a retry of the
 * transition handler.
 *
 * Tier promotion: we re-derive tier from User.lifetimeEarnedPoints AFTER
 * the credit and update the column if it moved. Tier never demotes — it's
 * tied to lifetime earned, not current balance ([[product-decisions]]).
 */
import {
  LoyaltyTier,
  PointsDirection,
  PointsReason,
  Prisma,
} from '@prisma/client';

import { tierForLifetimePoints } from './tiers.js';

export async function creditPointsForCompletion(
  tx: Prisma.TransactionClient,
  bookingId: string,
): Promise<{ credited: number; newBalance: number; newLifetime: number; tier: LoyaltyTier }> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { id: true, userId: true, pointsToEarn: true, reference: true, scheduledAt: true },
  });

  // Idempotency check — never credit twice for the same booking.
  const existing = await tx.hawkPointsLedger.findFirst({
    where: { bookingId: booking.id, reason: PointsReason.BOOKING_BASE },
    select: { id: true, balanceAfter: true },
  });
  if (existing) {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: booking.userId },
      select: { lifetimeEarnedPoints: true, tier: true },
    });
    return {
      credited: 0,
      newBalance: existing.balanceAfter,
      newLifetime: user.lifetimeEarnedPoints,
      tier: user.tier,
    };
  }

  if (booking.pointsToEarn <= 0) {
    // Nothing to credit — still update the user's tier in case it had drifted.
    const user = await tx.user.findUniqueOrThrow({
      where: { id: booking.userId },
      select: { lifetimeEarnedPoints: true, tier: true },
    });
    return {
      credited: 0,
      newBalance: await currentBalance(tx, booking.userId),
      newLifetime: user.lifetimeEarnedPoints,
      tier: user.tier,
    };
  }

  let runningBalance = await currentBalance(tx, booking.userId);
  let totalCredited = 0;

  // 1) Base booking points (already weekend-adjusted at booking time).
  const isWeekend = isWeekendNairobi(booking.scheduledAt);
  runningBalance += booking.pointsToEarn;
  totalCredited += booking.pointsToEarn;
  await tx.hawkPointsLedger.create({
    data: {
      userId: booking.userId,
      direction: PointsDirection.CREDIT,
      points: booking.pointsToEarn,
      balanceAfter: runningBalance,
      reason: PointsReason.BOOKING_BASE,
      description: isWeekend
        ? `Earned from booking ${booking.reference} (weekend ×2)`
        : `Earned from booking ${booking.reference}`,
      bookingId: booking.id,
    },
  });

  // 2) Photo-documentation bonus: +N pts per fully-documented room
  //    (a room with at least one BEFORE and one AFTER photo).
  const documentedRooms = await countDocumentedRooms(tx, booking.id);
  if (documentedRooms > 0) {
    const rule = await tx.pointsRule.findUnique({ where: { reason: PointsReason.PHOTO_DOCUMENTATION } });
    const perRoom = rule?.isActive ? rule.numerator : 0;
    const bonus = perRoom * documentedRooms;
    if (bonus > 0) {
      runningBalance += bonus;
      totalCredited += bonus;
      await tx.hawkPointsLedger.create({
        data: {
          userId: booking.userId,
          direction: PointsDirection.CREDIT,
          points: bonus,
          balanceAfter: runningBalance,
          reason: PointsReason.PHOTO_DOCUMENTATION,
          description: `Photo documentation · ${documentedRooms} room${documentedRooms > 1 ? 's' : ''}`,
          bookingId: booking.id,
        },
      });
    }
  }

  // Roll up lifetime + tier on the user row.
  const userBefore = await tx.user.findUniqueOrThrow({
    where: { id: booking.userId },
    select: { lifetimeEarnedPoints: true, tier: true },
  });
  const newLifetime = userBefore.lifetimeEarnedPoints + totalCredited;
  const nextTier = tierForLifetimePoints(newLifetime);
  await tx.user.update({
    where: { id: booking.userId },
    data: {
      lifetimeEarnedPoints: newLifetime,
      tier: nextTier !== userBefore.tier ? nextTier : undefined,
    },
  });

  return { credited: totalCredited, newBalance: runningBalance, newLifetime, tier: nextTier };
}

/** A room counts as documented when it has ≥1 BEFORE and ≥1 AFTER photo. */
async function countDocumentedRooms(tx: Prisma.TransactionClient, bookingId: string): Promise<number> {
  const grouped = await tx.bookingPhoto.groupBy({
    by: ['room', 'kind'],
    where: { bookingId },
  });
  const kindsByRoom = new Map<string, Set<string>>();
  for (const g of grouped) {
    const set = kindsByRoom.get(g.room) ?? new Set<string>();
    set.add(g.kind);
    kindsByRoom.set(g.room, set);
  }
  let count = 0;
  for (const kinds of kindsByRoom.values()) {
    if (kinds.has('BEFORE') && kinds.has('AFTER')) count++;
  }
  return count;
}

/** Current spendable balance = SUM(credit) − SUM(debit). */
async function currentBalance(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const grouped = await tx.hawkPointsLedger.groupBy({
    by: ['direction'],
    where: { userId },
    _sum: { points: true },
  });
  let credit = 0;
  let debit = 0;
  for (const g of grouped) {
    if (g.direction === PointsDirection.CREDIT) credit = g._sum.points ?? 0;
    if (g.direction === PointsDirection.DEBIT) debit = g._sum.points ?? 0;
  }
  return credit - debit;
}

function isWeekendNairobi(d: Date): boolean {
  const weekday = d.toLocaleString('en-US', { timeZone: 'Africa/Nairobi', weekday: 'short' });
  return weekday === 'Sat' || weekday === 'Sun';
}
