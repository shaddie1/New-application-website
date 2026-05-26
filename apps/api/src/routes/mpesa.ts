import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { MpesaStkCallback } from '@onyxhawk/types';

import { handleStkCallback } from '../payments/service.js';

// Daraja STK Push callback shape.
// Docs: https://developer.safaricom.co.ke/docs#m-pesa-express
const StkCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            }),
          ),
        })
        .optional(),
    }),
  }),
});

export const mpesaRoutes: FastifyPluginAsync = async (app) => {
  // Daraja calls this URL after the user enters (or fails to enter) their PIN.
  // We ACK fast (Safaricom retries on non-2xx) and process asynchronously.
  app.post<{ Body: MpesaStkCallback }>('/stk', async (req, reply) => {
    const parsed = StkCallbackSchema.safeParse(req.body);
    if (!parsed.success) {
      app.log.warn({ issues: parsed.error.issues, body: req.body }, 'malformed STK callback');
      // Still ACK so Daraja stops retrying. Stash the raw body for later inspection.
      return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const cb = parsed.data.Body.stkCallback;
    app.log.info(
      { merchantRequestId: cb.MerchantRequestID, checkoutRequestId: cb.CheckoutRequestID, resultCode: cb.ResultCode },
      'STK callback received',
    );

    // ACK first, then process — Daraja retries on non-2xx and we don't want
    // double-processing to be visible to them. Errors in the handler are
    // logged but not re-raised; the transaction row remains for inspection.
    try {
      await handleStkCallback(parsed.data, app.log);
    } catch (err) {
      app.log.error({ err, checkoutRequestId: cb.CheckoutRequestID }, 'failed to process STK callback');
    }

    return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
  });
};
