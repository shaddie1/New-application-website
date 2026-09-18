/**
 * Who sees what in the pipeline.
 *
 *   Leads and tenders   owner, COO, BD lead, admin, financial manager;
 *                       Marketing sees household-segment leads only, no tenders
 *   Targets & actuals   the above plus Marketing (read); owner and COO edit
 *   Commission payouts  owner, COO, admin, financial manager
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@prisma/client';

import type { Actor } from '../quotes/access.js';

const PIPELINE_ROLES = new Set<UserRole>([
  UserRole.COO,
  UserRole.BUSINESS_DEVELOPMENT_LEAD,
  UserRole.ADMIN,
  UserRole.FINANCIAL_MANAGER,
]);

const FINANCE_ROLES = new Set<UserRole>([UserRole.COO, UserRole.ADMIN, UserRole.FINANCIAL_MANAGER]);

type Who = Pick<Actor, 'role' | 'isOwner'>;

export function canViewPipeline(u: Who): boolean {
  return u.isOwner || PIPELINE_ROLES.has(u.role);
}

/** Marketing's slice: household leads only. */
export function householdOnly(u: Who): boolean {
  return !canViewPipeline(u) && u.role === UserRole.MARKETING;
}

export function canViewTargets(u: Who): boolean {
  return canViewPipeline(u) || u.role === UserRole.MARKETING;
}

export function canEditTargets(u: Who): boolean {
  return u.isOwner || u.role === UserRole.COO;
}

export function canMarkCommission(u: Who): boolean {
  return u.isOwner || FINANCE_ROLES.has(u.role);
}

export async function requirePipeline(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.actor || !(canViewPipeline(req.actor) || householdOnly(req.actor))) {
    return reply.code(403).send({ error: 'pipeline access required (owner, COO, BD lead, admin or finance; marketing for household leads)' });
  }
}

export async function requireFullPipeline(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.actor || !canViewPipeline(req.actor)) {
    return reply.code(403).send({ error: 'pipeline access required (owner, COO, BD lead, admin or finance)' });
  }
}

export async function requireTargetsView(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.actor || !canViewTargets(req.actor)) {
    return reply.code(403).send({ error: 'targets are visible to pipeline roles and marketing' });
  }
}

export async function requireTargetsEdit(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.actor || !canEditTargets(req.actor)) {
    return reply.code(403).send({ error: 'only the owner or the COO can change the locked targets' });
  }
}

export async function requireCommission(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.actor || !canMarkCommission(req.actor)) {
    return reply.code(403).send({ error: 'commission payouts are recorded by the owner, COO or finance' });
  }
}
