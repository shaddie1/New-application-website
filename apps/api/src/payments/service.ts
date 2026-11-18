/**
 * Payment service — Daraja STK push lifecycle.
 *
 * `initiateStkPush` creates the Payment + MpesaTransaction rows, fires the
 * STK request, then stores the Daraja request IDs so the callback handler
 * can find the row later.
 *
 * `handleStkCallback` is invoked by /webhooks/mpesa/stk. It transitions the
 * Payment + Booking states atomically so a duplicate callback is safe. A
 * callback that claims success counts only once Daraja's STK query agrees.
 *
 * `reconcileStkPayment` is the net under the callback. A payment still
 * awaiting its result is checked against Daraja's STK query when the customer
 * polls it or asks to pay again, so a callback that never arrived, or a
 * success that could not be confirmed at the time, still gets settled.
 */
import type { FastifyBaseLogger } from 'fastify';
import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import type { MpesaStkCallback, MpesaStkQueryResponse, PaymentDto } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { stkPush, stkQuery, DarajaError } from './daraja.js';
import { notifyBookingConfirmed } from '../notifications/service.js';

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
  let booking = await prisma.booking.findUnique({ where: { id: opts.bookingId } });
  if (!booking || booking.userId !== opts.userId) {
    throw new PaymentError('booking not found', 404);
  }

  // An earlier push may have been paid without the result reaching us. Ask
  // Daraja about each one before charging the customer a second time.
  if (booking.status === BookingStatus.PENDING_PAYMENT) {
    const open = await prisma.payment.findMany({
      where: { bookingId: booking.id, status: PaymentStatus.AWAITING_USER },
      include: { mpesaTransaction: true },
    });
    let settled = false;
    for (const payment of open) {
      if (await reconcileStkPayment(payment, opts.log, { now: true })) settled = true;
    }
    if (settled) booking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
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

/**
 * The customer's view of a payment. Clients poll this while the customer
 * enters their PIN, so it is also where a payment whose result never reached
 * us gets checked against Daraja.
 */
export async function getPaymentForUser(
  userId: string,
  paymentId: string,
  log: FastifyBaseLogger,
): Promise<PaymentDto | null> {
  const row = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { mpesaTransaction: true },
  });
  if (!row || row.userId !== userId) return null;
  if (!(await reconcileStkPayment(row, log))) return toPaymentDto(row);

  const settled = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { mpesaTransaction: true },
  });
  return toPaymentDto(settled);
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

  // Anyone can POST to the callback URL, and a customer is shown their own
  // CheckoutRequestID, so a claimed success proves nothing until Safaricom
  // confirms it. Unconfirmed, the payment is left as it is: nothing is
  // recorded, so the genuine callback can still settle it.
  if (succeeded && !(await confirmStkSuccess(checkoutRequestId, log))) return;

  // Extract receipt + amount from CallbackMetadata on success.
  let receipt: string | null = null;
  if (succeeded && cb.CallbackMetadata) {
    for (const item of cb.CallbackMetadata.Item) {
      if (item.Name === 'MpesaReceiptNumber' && typeof item.Value === 'string') {
        receipt = item.Value;
      }
    }
  }

  const status = succeeded
    ? PaymentStatus.SUCCEEDED
    : cb.ResultCode === 1032 // User cancelled the request
    ? PaymentStatus.CANCELLED
    : cb.ResultCode === 1037 // Timeout - no PIN entered
    ? PaymentStatus.TIMED_OUT
    : PaymentStatus.FAILED;

  const settled = await settleStk(
    { transactionId: tx.id, paymentId: tx.paymentId, bookingId: tx.payment.bookingId },
    { status, resultCode: String(cb.ResultCode), resultDesc: cb.ResultDesc, receipt, callback: body },
    log,
  );
  if (!settled) {
    log.info({ checkoutRequestId, paymentId: tx.paymentId }, 'STK callback for a payment already settled — ignoring');
    return;
  }

  log.info(
    { checkoutRequestId, resultCode: cb.ResultCode, paymentId: tx.paymentId },
    'STK callback processed',
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Daraja's errorCode for a query made before the STK push has a final result. */
const STILL_PROCESSING = '500.001.1001';
const CONFIRM_ATTEMPTS = 3;
const CONFIRM_RETRY_MS = 2000;

function isStillProcessing(err: unknown): boolean {
  return err instanceof DarajaError && (err.payload as { errorCode?: unknown } | null)?.errorCode === STILL_PROCESSING;
}

/**
 * Record the final result of an STK push: the payment, its M-Pesa row and, on
 * success, the booking. Only a payment still awaiting its result is settled,
 * so the callback and a reconciliation racing each other record one result
 * and send one confirmation. Returns false when it was settled already.
 */
async function settleStk(
  target: { transactionId: string; paymentId: string; bookingId: string | null },
  result: {
    status: PaymentStatus;
    resultCode: string;
    resultDesc: string;
    /** The callback carries these; Daraja's STK query does not. */
    receipt?: string | null;
    callback?: MpesaStkCallback;
  },
  log: FastifyBaseLogger,
): Promise<boolean> {
  const succeeded = result.status === PaymentStatus.SUCCEEDED;

  const outcome = await prisma.$transaction(async (db) => {
    const { count } = await db.payment.updateMany({
      where: { id: target.paymentId, status: { in: [PaymentStatus.REQUESTED, PaymentStatus.AWAITING_USER] } },
      data: {
        status: result.status,
        failureReason: succeeded ? null : result.resultDesc.slice(0, 500),
        completedAt: succeeded ? new Date() : null,
      },
    });
    if (count === 0) return null;

    await db.mpesaTransaction.update({
      where: { id: target.transactionId },
      data: {
        resultCode: result.resultCode,
        resultDesc: result.resultDesc,
        ...(result.callback && {
          mpesaReceiptNumber: result.receipt ?? null,
          callbackPayload: result.callback as unknown as Prisma.InputJsonValue,
          callbackReceivedAt: new Date(),
        }),
      },
    });

    if (!succeeded || !target.bookingId) return { bookingConfirmed: false };

    // Only transition PENDING_PAYMENT bookings — a previous race could have
    // left it in another state (e.g. CANCELLED if the user backed out).
    const confirmed = await db.booking.updateMany({
      where: { id: target.bookingId, status: BookingStatus.PENDING_PAYMENT },
      data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
    });
    return { bookingConfirmed: confirmed.count > 0 };
  });
  if (!outcome) return false;

  if (outcome.bookingConfirmed && target.bookingId) {
    // Fire-and-forget: tell the customer their booking is confirmed.
    void notifyBookingConfirmed(target.bookingId, log);
  } else if (succeeded && target.bookingId) {
    // The customer has paid for a booking that can no longer be confirmed.
    log.error(
      { paymentId: target.paymentId, bookingId: target.bookingId },
      'payment succeeded for a booking that is no longer awaiting payment — needs a refund or a manual fix',
    );
  }
  return true;
}

/** How long after the push a missing result is worth asking Daraja about. */
const RECONCILE_AFTER_MS = 30_000;
/** Clients poll every 2–3 seconds; Daraja is asked about one payment no more often than this. */
const RECONCILE_EVERY_MS = 15_000;
/** Payment id → when Daraja was last asked about it. In memory: a restart only costs one extra query. */
const lastReconciledAt = new Map<string, number>();

/**
 * STK query results taken as final. Any other code leaves the payment open:
 * closing a payment that Daraja later reports as paid would strand the
 * customer's money, while an open one only keeps them waiting.
 */
const FINAL_QUERY_RESULTS: Record<string, PaymentStatus> = {
  '0': PaymentStatus.SUCCEEDED,
  '1032': PaymentStatus.CANCELLED, // User cancelled the request
  '1037': PaymentStatus.TIMED_OUT, // Timeout - no PIN entered
};

/**
 * Ask Daraja about an STK payment that is still awaiting its result and
 * settle it if Daraja has a final answer. Returns true when this call settled
 * the payment. `now` skips the wait and the rate limit, for the moment before
 * the customer is charged again.
 *
 * A payment settled here has no M-Pesa receipt number, because the STK query
 * does not return one.
 */
async function reconcileStkPayment(
  payment: PaymentWithMpesa,
  log: FastifyBaseLogger,
  opts: { now?: boolean } = {},
): Promise<boolean> {
  const tx = payment.mpesaTransaction;
  if (payment.status !== PaymentStatus.AWAITING_USER || !tx?.checkoutRequestId || !tx.pushSentAt) return false;

  const at = Date.now();
  if (!opts.now) {
    if (at - tx.pushSentAt.getTime() < RECONCILE_AFTER_MS) return false;
    if (at - (lastReconciledAt.get(payment.id) ?? 0) < RECONCILE_EVERY_MS) return false;
  }
  lastReconciledAt.set(payment.id, at);

  let res: MpesaStkQueryResponse;
  try {
    res = await stkQuery(tx.checkoutRequestId);
  } catch (err) {
    // Not final yet, or Daraja cannot be reached: a later poll asks again.
    if (!isStillProcessing(err)) log.warn({ err, paymentId: payment.id }, 'could not reconcile STK payment with Daraja');
    return false;
  }

  const status = FINAL_QUERY_RESULTS[String(res.ResultCode)];
  if (!status) {
    log.info(
      { paymentId: payment.id, resultCode: res.ResultCode, resultDesc: res.ResultDesc },
      'Daraja has no result for this STK payment that we take as final — left open',
    );
    return false;
  }

  lastReconciledAt.delete(payment.id);
  const settled = await settleStk(
    { transactionId: tx.id, paymentId: payment.id, bookingId: payment.bookingId },
    { status, resultCode: String(res.ResultCode), resultDesc: res.ResultDesc },
    log,
  );
  if (settled) {
    log.info({ paymentId: payment.id, resultCode: res.ResultCode }, 'STK payment settled from Daraja query — no callback was recorded');
  }
  return settled;
}

/**
 * True only when Daraja's STK query reports ResultCode 0 for this request.
 * Retries briefly while Daraja says the result is not final yet; any other
 * answer or error is logged and counts as unconfirmed.
 */
async function confirmStkSuccess(checkoutRequestId: string, log: FastifyBaseLogger): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await stkQuery(checkoutRequestId);
      if (String(res.ResultCode) === '0') return true;
      log.warn(
        { checkoutRequestId, resultCode: res.ResultCode, resultDesc: res.ResultDesc },
        'STK callback claimed success, but Daraja reports otherwise — ignoring',
      );
      return false;
    } catch (err) {
      if (!isStillProcessing(err) || attempt >= CONFIRM_ATTEMPTS) {
        // A genuine payment can land here if Daraja is down or slow:
        // reconcileStkPayment settles it once Daraja answers.
        log.error({ err, checkoutRequestId, attempt }, 'could not confirm STK success with Daraja — payment left pending');
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, CONFIRM_RETRY_MS));
    }
  }
}

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
