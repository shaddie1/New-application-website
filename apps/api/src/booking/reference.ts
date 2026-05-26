import type { Prisma } from '@prisma/client';

/**
 * Generate a unique booking reference of the form `OH-YYMM-XXX`.
 *
 * Atomically increments the BookingSequence row for the current YYMM inside
 * the caller's transaction, so two concurrent confirmations cannot collide.
 * The unique index on Booking.reference is the final backstop.
 */
export async function generateBookingReference(tx: Prisma.TransactionClient, now: Date = new Date()): Promise<string> {
  const yyMM = formatYearMonth(now);

  // Upsert + atomic increment. Postgres "INSERT ... ON CONFLICT ... DO UPDATE"
  // returns the new value in one round-trip.
  const row = await tx.bookingSequence.upsert({
    where: { yearMonth: yyMM },
    create: { yearMonth: yyMM, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
    select: { lastSeq: true },
  });

  return `OH-${yyMM}-${row.lastSeq.toString().padStart(3, '0')}`;
}

function formatYearMonth(d: Date): string {
  // Use Africa/Nairobi calendar for the reference (matches receipts the user sees).
  const yyMM = d
    .toLocaleString('en-CA', { timeZone: 'Africa/Nairobi', year: '2-digit', month: '2-digit' })
    .replace(/\D/g, '');
  // en-CA gives "YY-MM" → strip the dash; pad to 4 just in case.
  return yyMM.padStart(4, '0');
}
