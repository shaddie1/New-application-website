/**
 * Crew-driven booking state transitions.
 *
 *   CONFIRMED ─▶ EN_ROUTE ─▶ IN_PROGRESS ─▶ COMPLETED
 *
 * Other movements (CANCELLED, NO_SHOW, refunds) are not crew actions and
 * live elsewhere. Only the assigned crew LEAD can transition.
 *
 * On COMPLETED we credit Hawk Points inside the same transaction so the
 * booking-state flip and the ledger write succeed or fail together.
 */
import { BookingStatus, CrewRole, Prisma } from '@prisma/client';
import type { CrewTransitionTo } from '@onyxhawk/types';
import type { FastifyBaseLogger } from 'fastify';

import { prisma } from '../db.js';
import { creditPointsForCompletion } from '../loyalty/points.js';
import { notifyBookingStatus } from '../notifications/service.js';

export class TransitionError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'TransitionError';
  }
}

const FROM_FOR: Record<CrewTransitionTo, BookingStatus> = {
  EN_ROUTE: BookingStatus.CONFIRMED,
  IN_PROGRESS: BookingStatus.EN_ROUTE,
  COMPLETED: BookingStatus.IN_PROGRESS,
};

interface TransitionOpts {
  bookingId: string;
  callerUserId: string;
  to: CrewTransitionTo;
  log: FastifyBaseLogger;
}

interface TransitionResult {
  bookingId: string;
  status: BookingStatus;
  pointsCredited?: number;
}

export async function transitionBooking(opts: TransitionOpts): Promise<TransitionResult> {
  // Authorization: caller must be LEAD on this booking.
  const assignment = await prisma.bookingCrew.findUnique({
    where: { bookingId_userId: { bookingId: opts.bookingId, userId: opts.callerUserId } },
  });
  if (!assignment || assignment.role !== CrewRole.LEAD) {
    throw new TransitionError('not authorized for this booking', 403);
  }

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: opts.bookingId },
    select: { id: true, status: true },
  });

  const expectedFrom = FROM_FOR[opts.to];
  if (booking.status !== expectedFrom) {
    throw new TransitionError(
      `cannot transition from ${booking.status} to ${opts.to} (expected ${expectedFrom})`,
      409,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const data: Prisma.BookingUpdateInput = { status: opts.to };
    const now = new Date();
    if (opts.to === BookingStatus.IN_PROGRESS) data.startedAt = now;
    if (opts.to === BookingStatus.COMPLETED) data.completedAt = now;

    await tx.booking.update({ where: { id: opts.bookingId }, data });

    let pointsCredited: number | undefined;
    if (opts.to === BookingStatus.COMPLETED) {
      const credit = await creditPointsForCompletion(tx, opts.bookingId);
      pointsCredited = credit.credited;
    }

    return { status: opts.to, pointsCredited };
  });

  // Fire-and-forget: notify the customer of the new state.
  void notifyBookingStatus(opts.bookingId, opts.to, opts.log);

  return { bookingId: opts.bookingId, status: result.status, pointsCredited: result.pointsCredited };
}
