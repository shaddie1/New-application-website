import type { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@prisma/client';

import { prisma } from '../db.js';
import { verifyAccessToken } from './jwt.js';
import { STAFF_ROLES } from './staff.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set when a shareholder who is not an owner calls /admin: the response is stripped of customer contact details. */
    shareholderView?: boolean;
  }
}

/**
 * The only /admin routes a shareholder who is not an owner may call, all GET:
 * dashboard and insights figures, financial summaries, the cap table and their
 * own stake, profit distributions and company documents. None of them returns
 * customer contact details. Default-deny: every other /admin route, every
 * write included, answers 403, so a new route stays closed to shareholders
 * until someone checks it and adds it here.
 */
export const SHAREHOLDER_READABLE_ROUTES: ReadonlySet<string> = new Set([
  '/admin/stats',
  '/admin/finance/overview',
  '/admin/finance/revenue-breakdown',
  '/admin/finance/targets',
  '/admin/finance/distributions',
  '/admin/financials/summary',
  '/admin/financials/trends',
  '/admin/financials/totals',
  '/admin/financials/shareholders',
  '/admin/financials/equity',
  '/admin/financials/my-stake',
  '/admin/documents',
]);

export const SHAREHOLDER_READ_ONLY = 'Shareholders can view the figures and ownership pages, but not change anything.';

const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * Registered on the root instance in server.ts, so it runs before every
 * route's own guards; it acts on /admin routes only. The caller's role comes
 * from the database, not the token, so a role change applies on the next
 * request rather than when the access token expires:
 *  - only staff and owners may call /admin at all;
 *  - a shareholder who is not an owner may only read SHAREHOLDER_READABLE_ROUTES.
 * A missing or invalid token is left to the route's requireAuth, which answers 401.
 */
export async function adminAccess(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const url = req.routeOptions.url;
  if (!url?.startsWith('/admin')) return;
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return;

  let userId: string;
  try {
    userId = (await verifyAccessToken(header.slice('Bearer '.length).trim())).sub;
  } catch {
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isOwner: true } });
  if (!user) return reply.code(401).send({ error: 'unauthorized' });
  if (!user.isOwner && !STAFF_ROLES.has(user.role)) return reply.code(403).send({ error: 'admin access required' });
  if (user.isOwner || user.role !== UserRole.SHAREHOLDER) return;

  // A plugin's '/' route can match with or without the trailing slash.
  const route = url.length > 1 ? url.replace(/\/$/, '') : url;
  if (!READ_METHODS.has(req.method) || !SHAREHOLDER_READABLE_ROUTES.has(route)) {
    return reply.code(403).send({ error: SHAREHOLDER_READ_ONLY });
  }
  req.shareholderView = true;
}

/** Customer contact fields, removed at any depth from every response a shareholder receives. */
const CUSTOMER_CONTACT_KEYS: ReadonlySet<string> = new Set([
  'phone',
  'customerPhone',
  'clientPhone',
  'mpesaPhone',
  'msisdn',
  'address',
  'clientLocation',
  'siteLocation',
  'line1',
  'line2',
  'lat',
  'lng',
  'accessNotes',
]);

export function stripCustomerContact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCustomerContact);
  if (value === null || typeof value !== 'object') return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // Dates and the like
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !CUSTOMER_CONTACT_KEYS.has(key))
      .map(([key, v]) => [key, stripCustomerContact(v)]),
  );
}

/**
 * preSerialization hook beside adminAccess. The readable routes return no
 * customer contact details today; this keeps it that way if one of them later
 * gains such a field.
 */
export async function shareholderRedaction(req: FastifyRequest, _reply: FastifyReply, payload: unknown): Promise<unknown> {
  return req.shareholderView ? stripCustomerContact(payload) : payload;
}
