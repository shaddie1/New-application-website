/**
 * The preHandlers that put the machine register's access list in front of a
 * route. The account's role, owner flag and shareholder link are read from the
 * database on every request, never from the token, so a role change or a
 * removed shareholder takes effect at once.
 *
 * Hook order on a route: requireAuth, attachMachinesActor, then
 * requireMachinesView, and requireMachinesEdit on every route that changes
 * anything. GET /access alone runs requireBackOfficeAccount in place of the
 * view guard.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../db.js';
import { isBackOfficeAccount, machinesAccess, type MachinesAccount } from './access.js';

export interface MachinesActor extends MachinesAccount {
  id: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    machinesActor?: MachinesActor;
  }
}

/** preHandler: any signed-in user; sets req.machinesActor. Run after requireAuth. */
export async function attachMachinesActor(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const user = await prisma.user.findUnique({
    where: { id: req.auth.sub },
    select: { id: true, role: true, isOwner: true, shareholder: { select: { id: true, removedAt: true } } },
  });
  if (!user) return reply.code(401).send({ error: 'unauthorized' });
  req.machinesActor = {
    id: user.id,
    role: user.role,
    isOwner: user.isOwner,
    // A removed holder's row stays for the payouts declared to them; it is no longer a link.
    isHolder: user.shareholder !== null && user.shareholder.removedAt === null,
  };
}

/**
 * preHandler for GET /access: the owner and the staff roles, so a customer's
 * or crew token is refused. Run after attachMachinesActor.
 */
export async function requireBackOfficeAccount(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.machinesActor || !isBackOfficeAccount(req.machinesActor)) {
    return reply.code(403).send({ error: 'admin access required' });
  }
}

/** preHandler for every route that serves the register. Run after attachMachinesActor. */
export async function requireMachinesView(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.machinesActor || !machinesAccess(req.machinesActor).canView) {
    return reply
      .code(403)
      .send({ error: 'machine register access required (owner, admin, financial manager, COO or a current shareholder)' });
  }
}

/** preHandler for every route that changes the register, and for the owner's job picker. Run after attachMachinesActor. */
export async function requireMachinesEdit(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.machinesActor || !machinesAccess(req.machinesActor).canEdit) {
    return reply.code(403).send({ error: 'only the owner can change the machine register' });
  }
}
