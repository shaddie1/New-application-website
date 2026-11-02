import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MpesaStkCallback } from '@onyxhawk/types';

const txFindUnique = vi.fn();
const txUpdate = vi.fn();
const paymentUpdate = vi.fn();
const bookingUpdateMany = vi.fn();
const db = {
  mpesaTransaction: { findUnique: txFindUnique, update: txUpdate },
  payment: { update: paymentUpdate },
  booking: { updateMany: bookingUpdateMany },
};
vi.mock('../db.js', () => ({
  prisma: { ...db, $transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db) },
}));

const stkQuery = vi.fn();
vi.mock('./daraja.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./daraja.js')>()),
  stkQuery,
}));

const notifyBookingConfirmed = vi.fn();
vi.mock('../notifications/service.js', () => ({ notifyBookingConfirmed }));

const { DarajaError } = await import('./daraja.js');
const { handleStkCallback } = await import('./service.js');

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
});

afterEach(() => {
  vi.clearAllMocks();
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
});
