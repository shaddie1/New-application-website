/**
 * The preHandlers that put the Dashboard's access list in front of a route.
 * The account's role, owner flag and shareholder link are read from the
 * database on every request, never from the token, so a role change or a
 * removed shareholder takes effect at once.
 *
 * Hook order on a route: requireAuth, attachDashboardActor, then
 * requireSection(...) or requireTargetSetter.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DashboardSection } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { dashboardAccess, type DashboardAccount } from './access.js';

export interface DashboardActor extends DashboardAccount {
  id: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    dashboardActor?: DashboardActor;
  }
}

/** preHandler: any signed-in user; sets req.dashboardActor. Run after requireAuth. */
export async function attachDashboardActor(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const user = await prisma.user.findUnique({
    where: { id: req.auth.sub },
    select: { id: true, role: true, isOwner: true, shareholder: { select: { id: true, removedAt: true } } },
  });
  if (!user) return reply.code(401).send({ error: 'unauthorized' });
  req.dashboardActor = {
    id: user.id,
    role: user.role,
    isOwner: user.isOwner,
    // A removed holder's row stays for the payouts declared to them; it is no longer a link.
    isHolder: user.shareholder !== null && user.shareholder.removedAt === null,
  };
}

/** preHandler for a route that serves one section's data. Run after attachDashboardActor. */
export function requireSection(section: DashboardSection) {
  return async function requireDashboardSection(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!req.dashboardActor || !dashboardAccess(req.dashboardActor).sections.includes(section)) {
      return reply.code(403).send({ error: 'dashboard section access required' });
    }
  };
}

/** preHandler for saving a month's targets. Run after attachDashboardActor. */
export async function requireTargetSetter(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.dashboardActor || !dashboardAccess(req.dashboardActor).canSetTargets) {
    return reply.code(403).send({ error: 'target-setting access required' });
  }
}
