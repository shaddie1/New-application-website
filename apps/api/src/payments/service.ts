/**
 * Payment service — Daraja STK push lifecycle.
 *
 * `initiateStkPush` creates the Payment + MpesaTransaction rows, fires the
 * STK request, then stores the Daraja request IDs so the callback handler
 * can find the row later.
 *
 * `handleStkCallback` is invoked by /webhooks/mpesa/stk. It transitions the
 * Payment + Booking states atomically so a duplicate callback is safe.
 */
import type { FastifyBaseLogger } from 'fastify';
import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import type { MpesaStkCallback, PaymentDto } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { stkPush, DarajaError } from './daraja.js';

export class PaymentError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'PaymentError';
  }
}

export async function initiateStkPush(opts: {
  userId: string;
  bookingId: string;
  msisdnOverride?: string;
  log: FastifyBaseLogger;
}): Promise<PaymentDto> {
  const booking = await prisma.booking.findUnique({ where: { id: opts.bookingId } });
  if (!booking || booking.userId !== opts.userId) {
    throw new PaymentError('booking not found', 404);
  }
  if (booking.status !== BookingStatus.PENDING_PAYMENT) {
    throw new PaymentError(`booking cannot be paid in state ${booking.status}`, 409);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: opts.userId } });
  const msisdn = normalizeMsisdn(opts.msisdnOverride ?? user.phone);
  if (!msisdn) throw new PaymentError('user has no usable M-Pesa MSISDN', 400);

  const amountKes = Math.round(booking.totalCents / 100);

  // Create Payment + MpesaTransaction inside a transaction so we always have
  // a stub row to receive the callback even if Daraja times out.
  const created = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        bookingId: booking.id,
        userId: opts.userId,
        provider: PaymentProvider.MPESA_STK,
        amountCents: booking.totalCents,
        status: PaymentStatus.REQUESTED,
        mpesaTransaction: {
          create: {
            msisdn,
            amountKes,
            accountReference: booking.reference,
            transactionDesc: `Booking ${booking.reference}`,
          },
        },
      },
      include: { mpesaTransaction: true },
    });
    return payment;
  });

  // Fire Daraja. Failures here transition the payment to FAILED but the row
  // remains so the user can retry.
  try {
    const stk = await stkPush({
      msisdn,
      amountKes,
      accountReference: booking.reference,
      transactionDesc: `Booking ${booking.reference}`,
    });

    const updated = await prisma.payment.update({
      where: { id: created.id },
      data: {
        status: PaymentStatus.AWAITING_USER,
        mpesaTransaction: {
          update: {
            merchantRequestId: stk.MerchantRequestID,
            checkoutRequestId: stk.CheckoutRequestID,
            pushSentAt: new Date(),
          },
        },
      },
      include: { mpesaTransaction: true },
    });

    opts.log.info(
      { paymentId: updated.id, checkoutRequestId: stk.CheckoutRequestID, merchantRequestId: stk.MerchantRequestID },
      'stk push fired',
    );
    return toPaymentDto(updated);
  } catch (err) {
    const failureReason =
      err instanceof DarajaError
        ? `Daraja ${err.status}: ${typeof err.payload === 'string' ? err.payload : JSON.stringify(err.payload)}`.slice(0, 500)
        : err instanceof Error
        ? err.message.slice(0, 500)
        : 'stk push failed';
    opts.log.error({ err, paymentId: created.id }, 'stk push failed');
    const failed = await prisma.payment.update({
      where: { id: created.id },
      data: { status: PaymentStatus.FAILED, failureReason },
      include: { mpesaTransaction: true },
    });
    return toPaymentDto(failed);
  }
}

export async function getPaymentForUser(userId: string, paymentId: string): Promise<PaymentDto | null> {
  const row = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { mpesaTransaction: true },
  });
  if (!row || row.userId !== userId) return null;
  return toPaymentDto(row);
}

/**
 * Process a Daraja STK callback. Idempotent — duplicate callbacks for the
 * same CheckoutRequestID are no-ops once the payment is terminal.
 */
export async function handleStkCallback(
  body: MpesaStkCallback,
  log: FastifyBaseLogger,
): Promise<void> {
  const cb = body.Body.stkCallback;
  const checkoutRequestId = cb.CheckoutRequestID;

  const tx = await prisma.mpesaTransaction.findUnique({
    where: { checkoutRequestId },
    include: { payment: true },
  });
  if (!tx) {
    log.warn({ checkoutRequestId }, 'callback for unknown CheckoutRequestID — ignoring');
    return;
  }

  // Idempotency: if we've already processed this transaction, ignore.
  if (tx.callbackReceivedAt) {
    log.info({ checkoutRequestId }, 'duplicate STK callback — ignoring');
    return;
  }

  const succeeded = cb.ResultCode === 0;

  // Extract receipt + amount from CallbackMetadata on success.
  let receipt: string | null = null;
  if (succeeded && cb.CallbackMetadata) {
    for (const item of cb.CallbackMetadata.Item) {
      if (item.Name === 'MpesaReceiptNumber' && typeof item.Value === 'string') {
        receipt = item.Value;
      }
    }
  }

  await prisma.$transaction(async (db) => {
    await db.mpesaTransaction.update({
      where: { id: tx.id },
      data: {
        resultCode: String(cb.ResultCode),
        resultDesc: cb.ResultDesc,
        mpesaReceiptNumber: receipt,
        callbackPayload: body as unknown as Prisma.InputJsonValue,
        callbackReceivedAt: new Date(),
      },
    });

    const nextStatus = succeeded
      ? PaymentStatus.SUCCEEDED
      : cb.ResultCode === 1032 // User cancelled the request
      ? PaymentStatus.CANCELLED
      : cb.ResultCode === 1037 // Timeout - no PIN entered
      ? PaymentStatus.TIMED_OUT
      : PaymentStatus.FAILED;

    await db.payment.update({
      where: { id: tx.paymentId },
      data: {
        status: nextStatus,
        failureReason: succeeded ? null : cb.ResultDesc.slice(0, 500),
        completedAt: succeeded ? new Date() : null,
      },
    });

    if (succeeded && tx.payment.bookingId) {
      // Only transition PENDING_PAYMENT bookings — a previous race could have
      // left it in another state (e.g. CANCELLED if the user backed out).
      await db.booking.updateMany({
        where: { id: tx.payment.bookingId, status: BookingStatus.PENDING_PAYMENT },
        data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
      });
    }
  });

  log.info(
    { checkoutRequestId, resultCode: cb.ResultCode, paymentId: tx.paymentId },
    'STK callback processed',
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

type PaymentWithMpesa = Prisma.PaymentGetPayload<{ include: { mpesaTransaction: true } }>;

function toPaymentDto(p: PaymentWithMpesa): PaymentDto {
  return {
    id: p.id,
    bookingId: p.bookingId,
    provider: p.provider,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    failureReason: p.failureReason,
    msisdn: p.mpesaTransaction?.msisdn ?? null,
    checkoutRequestId: p.mpesaTransaction?.checkoutRequestId ?? null,
    mpesaReceiptNumber: p.mpesaTransaction?.mpesaReceiptNumber ?? null,
    createdAt: p.createdAt.toISOString(),
    completedAt: p.completedAt?.toISOString() ?? null,
  };
}

/** Coerce a Kenyan phone into E.164 with leading +. Returns null if unusable. */
function normalizeMsisdn(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  return `+${digits}`;
}
