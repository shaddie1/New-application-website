import type { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@prisma/client';

import { prisma } from '../db.js';

const WEBSITE_ROLES = new Set<UserRole>([UserRole.ADMIN, UserRole.MARKETING]);

/**
 * Website content: the owner, admins and marketing. The role is read from the
 * database, not the token — the token's role is fixed at sign-in, so a demoted
 * user would otherwise keep access until it expires. Run after requireAuth.
 */
export async function requireWebsiteAccess(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const user = await prisma.user.findUnique({
    where: { id: req.auth.sub },
    select: { isOwner: true, role: true },
  });
  if (!user) return reply.code(401).send({ error: 'unauthorized' });

  if (!user.isOwner && !WEBSITE_ROLES.has(user.role)) {
    return reply.code(403).send({ error: 'website access required' });
  }
}
