/**
 * Who may see costs and margins, and who may approve a quote. Checked against
 * the database rather than the JWT, like the other admin gates, so a role
 * change takes effect without waiting for a token to expire.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@prisma/client';

import { prisma } from '../db.js';

export interface Actor {
  id: string;
  fullName: string;
  role: UserRole;
  isOwner: boolean;
}

/** Roles that see the internal estimate (cost build-up, margins, commission). */
const ESTIMATE_ROLES = new Set<UserRole>([UserRole.ADMIN, UserRole.FINANCIAL_MANAGER, UserRole.COO]);

export function canViewEstimate(u: Pick<Actor, 'role' | 'isOwner'>): boolean {
  return u.isOwner || ESTIMATE_ROLES.has(u.role);
}

/** Approval is the COO's call, or the owner's. */
export function canApprove(u: Pick<Actor, 'role' | 'isOwner'>): boolean {
  return u.isOwner || u.role === UserRole.COO;
}

export async function loadActor(req: FastifyRequest): Promise<Actor | null> {
  if (!req.auth) return null;
  const u = await prisma.user.findUnique({
    where: { id: req.auth.sub },
    select: { id: true, fullName: true, role: true, isOwner: true },
  });
  return u ?? null;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor;
  }
}

/** preHandler: any signed-in user; sets req.actor. */
export async function attachActor(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const actor = await loadActor(req);
  if (!actor) return reply.code(401).send({ error: 'unauthorized' });
  req.actor = actor;
}

export async function requireEstimateAccess(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.actor || !canViewEstimate(req.actor)) {
    return reply.code(403).send({ error: 'estimate access required (owner, admin, financial manager or COO)' });
  }
}

export async function requireApprover(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.actor || !canApprove(req.actor)) {
    return reply.code(403).send({ error: 'approval requires the COO or the owner' });
  }
}
