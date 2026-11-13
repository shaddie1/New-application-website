/**
 * What the Dashboard may show this account. The page asks here first and
 * builds only the sections it is given; each section's own route checks the
 * same list again, so the answer here opens nothing by itself.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { DashboardAccess } from '@onyxhawk/types';

import { requireAuth } from '../auth/middleware.js';
import { dashboardAccess, isBackOfficeAccount } from '../dashboard/access.js';
import { attachDashboardActor } from '../dashboard/guards.js';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', attachDashboardActor);

  // Any staff account gets an answer, with an empty list when it has no
  // section. A customer or crew account is refused: the admin app signs it out.
  app.get('/access', async (req, reply) => {
    const actor = req.dashboardActor!;
    if (!isBackOfficeAccount(actor)) return reply.code(403).send({ error: 'admin access required' });

    const access: DashboardAccess = dashboardAccess(actor);
    // The answer changes when a role or a shareholder link does, so it is never kept.
    reply.header('Cache-Control', 'no-store');
    return reply.send({ access });
  });
};
