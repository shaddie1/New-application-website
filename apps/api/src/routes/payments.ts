import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { InitiatePaymentInput } from '@onyxhawk/types';

import { requireAuth } from '../auth/middleware.js';
import { initiateStkPush, getPaymentForUser, PaymentError } from '../payments/service.js';

const InitiateSchema = z.object({
  bookingId: z.string().min(1),
  msisdn: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{9,15}$/, 'msisdn must be digits, optionally prefixed with +')
    .optional(),
}) satisfies z.ZodType<InitiatePaymentInput>;

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.post('/initiate', async (req, reply) => {
    const parsed = InitiateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const payment = await initiateStkPush({
        userId: req.auth!.sub,
        bookingId: parsed.data.bookingId,
        msisdnOverride: parsed.data.msisdn,
        log: req.log,
      });
      return reply.code(201).send({ payment });
    } catch (err) {
      if (err instanceof PaymentError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const payment = await getPaymentForUser(req.auth!.sub, req.params.id);
    if (!payment) return reply.code(404).send({ error: 'payment not found' });
    return reply.send({ payment });
  });
};
