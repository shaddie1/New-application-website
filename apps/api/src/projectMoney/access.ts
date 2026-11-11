/**
 * Who may see project money: the people who already see a contract's expected
 * profit in the Quote Builder. The role check itself lives in
 * quotes/access.ts; this file only gives it its own refusal.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { canViewEstimate } from '../quotes/access.js';

/** preHandler: run after attachActor, which reads the role from the database. */
export async function requireProjectMoneyAccess(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.actor || !canViewEstimate(req.actor)) {
    return reply.code(403).send({ error: 'project money access required (owner, admin, financial manager or COO)' });
  }
}
