/**
 * The Dashboard's test cast: one account for each row of the access table,
 * seeded into the in-memory database of financialsDb.ts with the shareholder
 * rows of those that are linked, and one helper that calls a back-office route
 * as any of them, or as nobody. A test file mocks '../db.js' with `db` from
 * financialsDb.ts, as the Financials tests do. Not built: tsconfig.build.json
 * excludes this folder.
 */
import Fastify, { type FastifyPluginAsync } from 'fastify';

import { t } from './financialsDb.js';

interface CastMember {
  fullName: string;
  /** The role on the user's record. */
  role: string;
  isOwner: boolean;
  /** The role the user signed in with, when the record has changed since. */
  tokenRole?: string;
  /** The stake, in basis points, of the current shareholder record linked to the account. */
  stake?: number;
}

/** Each account's id is its key here. The five stakes add up to 100%. */
export const CAST = {
  owner: { fullName: 'Olive Owner', role: 'ADMIN', isOwner: true },
  admin: { fullName: 'Adam Admin', role: 'ADMIN', isOwner: false },
  coo: { fullName: 'Carol Coo', role: 'COO', isOwner: false },
  cooLinked: { fullName: 'Chege Coo', role: 'COO', isOwner: false, stake: 4000 },
  finance: { fullName: 'Faith Finance', role: 'FINANCIAL_MANAGER', isOwner: false },
  shareholderLinked: { fullName: 'Shah Shareholder', role: 'SHAREHOLDER', isOwner: false, stake: 3000 },
  shareholder: { fullName: 'Sheila Shareholder', role: 'SHAREHOLDER', isOwner: false },
  support: { fullName: 'Sue Support', role: 'SUPPORT', isOwner: false },
  supervisor: { fullName: 'Sam Supervisor', role: 'CLEANING_SUPERVISOR', isOwner: false },
  marketing: { fullName: 'Mark Marketing', role: 'MARKETING', isOwner: false },
  supportLinked: { fullName: 'Simon Support', role: 'SUPPORT', isOwner: false, stake: 1000 },
  // Signed in as ADMIN, since made support in the database.
  demoted: { fullName: 'Dan Demoted', role: 'SUPPORT', isOwner: false, tokenRole: 'ADMIN' },
  customer: { fullName: 'Cate Customer', role: 'CUSTOMER', isOwner: false },
  // Removing a staff member resets the role and leaves the shareholder link, so a customer can hold one.
  customerLinked: { fullName: 'Carl Customer', role: 'CUSTOMER', isOwner: false, stake: 1000 },
  crew: { fullName: 'Chris Crew', role: 'CREW', isOwner: false },
  crewLinked: { fullName: 'Cleo Crew', role: 'CREW', isOwner: false, stake: 1000 },
} satisfies Record<string, CastMember>;

export type CastId = keyof typeof CAST;

export const CAST_IDS = Object.keys(CAST) as CastId[];

/** The id of the shareholder record `seedCast` links to an account. */
export const holderIdOf = (id: CastId) => `holder-${id}`;

/**
 * Adds every cast account to the users table, and a current shareholder record
 * for each linked one, in cast order. Call it after `resetDb()`.
 */
export function seedCast() {
  const created = new Date('2026-07-15T00:00:00.000Z');
  for (const id of CAST_IDS) {
    const { fullName, role, isOwner, stake }: CastMember = CAST[id];
    t.users.push({ id, fullName, role, isOwner });
    if (stake === undefined) continue;
    t.shareholders.push({
      id: holderIdOf(id), name: fullName, title: null, kind: 'INDIVIDUAL', basisPoints: stake, notes: null,
      userId: id, sortOrder: t.shareholders.length, removedAt: null, createdAt: created, updatedAt: created,
    });
  }
}

/**
 * The back-office plugins a request can reach, each under the prefix server.ts
 * gives it. A new plugin is one more line. Loaded on first use, so the test
 * file's mock of '../db.js' is in place before any route imports it.
 */
const PLUGINS: Array<{ prefix: string; load: () => Promise<FastifyPluginAsync> }> = [
  { prefix: '/admin', load: async () => (await import('../routes/admin.js')).adminRoutes },
  { prefix: '/admin/dashboard', load: async () => (await import('../routes/dashboard.js')).dashboardRoutes },
  { prefix: '/admin/financials', load: async () => (await import('../routes/financials.js')).financialsRoutes },
  { prefix: '/admin/financials', load: async () => (await import('../routes/financials.js')).financialsDashboardRoutes },
  { prefix: '/admin/finance', load: async () => (await import('../routes/finance.js')).financeRoutes },
  { prefix: '/admin/finance', load: async () => (await import('../routes/finance.js')).financeDashboardRoutes },
];

/**
 * Calls a route as a cast account, or with no sign-in when `who` is null. The
 * token carries the role the account signed in with, which for `demoted` is
 * not the role on its record.
 */
export async function requestAs(
  who: CastId | null,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  const server = Fastify();
  for (const { prefix, load } of PLUGINS) await server.register(await load(), { prefix });

  const headers: Record<string, string> = {};
  if (who) {
    const { signAccessToken } = await import('../auth/jwt.js');
    const { role, tokenRole }: CastMember = CAST[who];
    headers.authorization = `Bearer ${(await signAccessToken(who, tokenRole ?? role)).token}`;
  }
  return server.inject({ method, url, payload, headers });
}
