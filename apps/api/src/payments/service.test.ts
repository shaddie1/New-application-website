import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MpesaStkCallback } from '@onyxhawk/types';

const txFindUnique = vi.fn();
const txUpdate = vi.fn();
const paymentUpdate = vi.fn();
const paymentFindUnique = vi.fn();
const paymentFindMany = vi.fn();
const paymentCreate = vi.fn();
const bookingUpdateMany = vi.fn();
const bookingFindUnique = vi.fn();
const db = {
  mpesaTransaction: { findUnique: txFindUnique, update: txUpdate },
  payment: {
    updateMany: paymentUpdate,
    findUnique: paymentFindUnique,
    findUniqueOrThrow: paymentFindUnique,
    findMany: paymentFindMany,
    create: paymentCreate,
  },
  booking: { updateMany: bookingUpdateMany, findUnique: bookingFindUnique, findUniqueOrThrow: bookingFindUnique },
};
vi.mock('../db.js', () => ({
  prisma: { ...db, $transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db) },
}));

const stkQuery = vi.fn();
const stkPush = vi.fn();
vi.mock('./daraja.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./daraja.js')>()),
  stkQuery,
  stkPush,
}));

const notifyBookingConfirmed = vi.fn();
vi.mock('../notifications/service.js', () => ({ notifyBookingConfirmed }));

const { DarajaError } = await import('./daraja.js');
const { getPaymentForUser, handleStkCallback, initiateStkPush, PaymentError } = await import('./service.js');

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function callback(resultCode: number, resultDesc = 'The service request is processed successfully.'): MpesaStkCallback {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: 'm-1',
        CheckoutRequestID: 'c-1',
        ResultCode: resultCode,
        ResultDesc: resultDesc,
        CallbackMetadata:
          resultCode === 0 ? { Item: [{ Name: 'Amount', Value: 3500 }, { Name: 'MpesaReceiptNumber', Value: 'RKT1ABC2DE' }] } : undefined,
      },
    },
  };
}

const answer = (resultCode: string, resultDesc: string) => ({
  ResponseCode: '0',
  ResponseDescription: 'The service request has been accepted successfully',
  MerchantRequestID: 'm-1',
  CheckoutRequestID: 'c-1',
  ResultCode: resultCode,
  ResultDesc: resultDesc,
});

const stillProcessing = () =>
  new DarajaError('stk query failed', 500, { requestId: 'r-1', errorCode: '500.001.1001', errorMessage: 'The transaction is being processed' });

const handle = (body: MpesaStkCallback) => handleStkCallback(body, log as never);

beforeEach(() => {
  txFindUnique.mockResolvedValue({ id: 'tx1', paymentId: 'pay1', callbackReceivedAt: null, payment: { bookingId: 'b1' } });
  paymentUpdate.mockResolvedValue({ count: 1 });
  bookingUpdateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe('handleStkCallback', () => {
  it('confirms the booking when Daraja agrees the customer paid', async () => {
    stkQuery.mockResolvedValue(answer('0', 'The service request is processed successfully.'));

    await handle(callback(0));

    expect(stkQuery).toHaveBeenCalledWith('c-1');
    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }));
    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mpesaReceiptNumber: 'RKT1ABC2DE' }) }));
    expect(bookingUpdateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: 'PENDING_PAYMENT' },
      data: { status: 'CONFIRMED', confirmedAt: expect.any(Date) },
    });
    expect(notifyBookingConfirmed).toHaveBeenCalledWith('b1', log);
  });

  it('ignores a forged success that Daraja does not confirm', async () => {
    stkQuery.mockResolvedValue(answer('1032', 'Request cancelled by user'));

    await handle(callback(0));

    expect(txUpdate).not.toHaveBeenCalled();
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(bookingUpdateMany).not.toHaveBeenCalled();
    expect(notifyBookingConfirmed).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it('waits while Daraja has no final result, then confirms', async () => {
    vi.useFakeTimers();
    stkQuery.mockRejectedValueOnce(stillProcessing()).mockResolvedValueOnce(answer('0', 'The service request is processed successfully.'));

    const done = handle(callback(0));
    await vi.runAllTimersAsync();
    await done;

    expect(stkQuery).toHaveBeenCalledTimes(2);
    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }));
  });

  it('leaves the payment pending when Daraja never gives a final result', async () => {
    vi.useFakeTimers();
    stkQuery.mockRejectedValue(stillProcessing());

    const done = handle(callback(0));
    await vi.runAllTimersAsync();
    await done;

    expect(stkQuery).toHaveBeenCalledTimes(3);
    expect(txUpdate).not.toHaveBeenCalled();
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });

  it('leaves the payment pending, without retrying, when Daraja cannot be reached', async () => {
    stkQuery.mockRejectedValue(new TypeError('fetch failed'));

    await handle(callback(0));

    expect(stkQuery).toHaveBeenCalledTimes(1);
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });

  it('records a cancelled payment without asking Daraja', async () => {
    await handle(callback(1032, 'Request cancelled by user'));

    expect(stkQuery).not.toHaveBeenCalled();
    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
    expect(bookingUpdateMany).not.toHaveBeenCalled();
  });

  it('changes nothing when the payment was settled already', async () => {
    stkQuery.mockResolvedValue(answer('0', 'The service request is processed successfully.'));
    paymentUpdate.mockResolvedValue({ count: 0 });

    await handle(callback(0));

    expect(txUpdate).not.toHaveBeenCalled();
    expect(bookingUpdateMany).not.toHaveBeenCalled();
    expect(notifyBookingConfirmed).not.toHaveBeenCalled();
  });

  it('does not tell the customer a cancelled booking is confirmed', async () => {
    stkQuery.mockResolvedValue(answer('0', 'The service request is processed successfully.'));
    bookingUpdateMany.mockResolvedValue({ count: 0 });

    await handle(callback(0));

    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }));
    expect(notifyBookingConfirmed).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });
});

const NOW = new Date('2026-11-10T09:00:00Z');
const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1000);

let nextPayment = 0;
/** A payment whose push went out `sentSecondsAgo` seconds ago. Each has its own id: the query rate limit is per payment. */
function awaitingPayment(sentSecondsAgo: number) {
  const id = `pay-${++nextPayment}`;
  return {
    id,
    userId: 'u1',
    bookingId: 'b1',
    provider: 'MPESA_STK',
    amountCents: 350_000,
    currency: 'KES',
    status: 'AWAITING_USER',
    failureReason: null,
    createdAt: secondsAgo(sentSecondsAgo),
    completedAt: null,
    mpesaTransaction: {
      id: `tx-${id}`,
      msisdn: '+254712000001',
      checkoutRequestId: `c-${id}`,
      mpesaReceiptNumber: null,
      pushSentAt: secondsAgo(sentSecondsAgo),
    },
  };
}

describe('getPaymentForUser', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  const get = (id: string, userId = 'u1') => getPaymentForUser(userId, id, log as never);

  it('settles a paid payment whose callback never arrived', async () => {
    const payment = awaitingPayment(45);
    paymentFindUnique
      .mockResolvedValueOnce(payment)
      .mockResolvedValueOnce({ ...payment, status: 'SUCCEEDED', completedAt: NOW });
    stkQuery.mockResolvedValue(answer('0', 'The service request is processed successfully.'));

    const dto = await get(payment.id);

    expect(stkQuery).toHaveBeenCalledWith(payment.mpesaTransaction.checkoutRequestId);
    expect(paymentUpdate).toHaveBeenCalledWith({
      where: { id: payment.id, status: { in: ['REQUESTED', 'AWAITING_USER'] } },
      data: { status: 'SUCCEEDED', failureReason: null, completedAt: NOW },
    });
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: payment.mpesaTransaction.id },
      data: { resultCode: '0', resultDesc: 'The service request is processed successfully.' },
    });
    expect(bookingUpdateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: 'PENDING_PAYMENT' },
      data: { status: 'CONFIRMED', confirmedAt: NOW },
    });
    expect(notifyBookingConfirmed).toHaveBeenCalledWith('b1', log);
    expect(dto?.status).toBe('SUCCEEDED');
  });

  it('closes a payment the customer cancelled', async () => {
    const payment = awaitingPayment(45);
    paymentFindUnique.mockResolvedValueOnce(payment).mockResolvedValueOnce({ ...payment, status: 'CANCELLED' });
    stkQuery.mockResolvedValue(answer('1032', 'Request cancelled by user'));

    const dto = await get(payment.id);

    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED', failureReason: 'Request cancelled by user', completedAt: null } }),
    );
    expect(bookingUpdateMany).not.toHaveBeenCalled();
    expect(dto?.status).toBe('CANCELLED');
  });

  it('does not ask Daraja while the customer may still be entering their PIN', async () => {
    const payment = awaitingPayment(10);
    paymentFindUnique.mockResolvedValue(payment);

    const dto = await get(payment.id);

    expect(stkQuery).not.toHaveBeenCalled();
    expect(dto?.status).toBe('AWAITING_USER');
  });

  it('asks Daraja about one payment at most once every 15 seconds', async () => {
    const payment = awaitingPayment(45);
    paymentFindUnique.mockResolvedValue(payment);
    stkQuery.mockRejectedValue(stillProcessing());

    await get(payment.id);
    vi.advanceTimersByTime(3_000);
    await get(payment.id);
    expect(stkQuery).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15_000);
    await get(payment.id);
    expect(stkQuery).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['has no final result yet', () => stkQuery.mockRejectedValue(stillProcessing())],
    ['cannot be reached', () => stkQuery.mockRejectedValue(new TypeError('fetch failed'))],
    ['answers with a code we do not take as final', () => stkQuery.mockResolvedValue(answer('4999', 'The transaction is still under processing'))],
  ])('leaves the payment open when Daraja %s', async (_name, arrange) => {
    const payment = awaitingPayment(45);
    paymentFindUnique.mockResolvedValue(payment);
    arrange();

    const dto = await get(payment.id);

    expect(stkQuery).toHaveBeenCalledTimes(1);
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(dto?.status).toBe('AWAITING_USER');
  });

  it('confirms once when the callback settles the payment first', async () => {
    const payment = awaitingPayment(45);
    paymentFindUnique.mockResolvedValue(payment);
    stkQuery.mockResolvedValue(answer('0', 'The service request is processed successfully.'));
    paymentUpdate.mockResolvedValue({ count: 0 });

    await get(payment.id);

    expect(txUpdate).not.toHaveBeenCalled();
    expect(bookingUpdateMany).not.toHaveBeenCalled();
    expect(notifyBookingConfirmed).not.toHaveBeenCalled();
  });

  it("does not look up another customer's payment with Daraja", async () => {
    const payment = awaitingPayment(45);
    paymentFindUnique.mockResolvedValue(payment);

    expect(await get(payment.id, 'someone-else')).toBeNull();
    expect(stkQuery).not.toHaveBeenCalled();
  });
});

describe('initiateStkPush', () => {
  const pendingBooking = { id: 'b1', userId: 'u1', status: 'PENDING_PAYMENT', totalCents: 350_000, reference: 'OH-1234' };

  it('does not charge again when an earlier push turns out to be paid', async () => {
    const earlier = awaitingPayment(5);
    bookingFindUnique.mockResolvedValueOnce(pendingBooking).mockResolvedValueOnce({ ...pendingBooking, status: 'CONFIRMED' });
    paymentFindMany.mockResolvedValue([earlier]);
    stkQuery.mockResolvedValue(answer('0', 'The service request is processed successfully.'));

    const attempt = initiateStkPush({ userId: 'u1', bookingId: 'b1', log: log as never });

    await expect(attempt).rejects.toBeInstanceOf(PaymentError);
    await expect(attempt).rejects.toMatchObject({ status: 409 });
    expect(stkQuery).toHaveBeenCalledWith(earlier.mpesaTransaction.checkoutRequestId);
    expect(bookingUpdateMany).toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(stkPush).not.toHaveBeenCalled();
  });
});
