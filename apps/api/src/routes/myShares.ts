import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { MyShares, MySharesAccess, MySharesResult } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { STAFF_ROLES } from '../auth/staff.js';
import { allocate, isoDate, loadLedger } from '../finance/ledger.js';

/**
 * The shareholder page: one holder's stake, share of profit, money put in and
 * payouts, beside the company's monthly figures. The owner may open any
 * holder; anyone else only the holding linked to their own account. Nothing
 * about any other holder leaves the server.
 */

const QuerySchema = z.object({ shareholderId: z.string().trim().min(1).optional() });

const NOT_LINKED = {
  error: 'Your account is not on the shareholder list.',
  // Lets the page tell "no shareholder page for you" apart from a failure.
  code: 'NOT_SHAREHOLDER',
} as const;

export const mySharesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  /** Whether the menu shows a shareholder page, and whose. */
  app.get('/access', async (req, reply) => {
    const viewer = await loadViewer(req.auth!.sub);
    return reply.send({ shareholderId: viewer.holderId, canViewAll: viewer.isOwner } satisfies MySharesAccess);
  });

  app.get('/', async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const requested = parsed.data.shareholderId;

    const viewer = await loadViewer(req.auth!.sub);
    if (!viewer.isOwner) {
      if (!viewer.holderId) return reply.code(403).send(NOT_LINKED);
      if (requested && requested !== viewer.holderId) {
        return reply.code(403).send({ error: 'You can open only your own shareholder page.' });
      }
    }

    // Every stake, because the split is made over the whole cap table; only
    // the chosen holder's figures are sent.
    const holders = await prisma.shareholder.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, title: true, kind: true, basisPoints: true },
    });
    // The named holder, else the caller's own, else (an unlinked owner) the first on the list.
    const index = holders.findIndex((h) => h.id === (requested ?? viewer.holderId ?? holders[0]?.id));
    if (index === -1) {
      if (requested) return reply.code(404).send({ error: 'shareholder not found' });
      return reply.send({ holder: null } satisfies MySharesResult);
    }
    const holder = holders[index]!;

    const now = new Date();
    const [ledger, investments, payouts] = await Promise.all([
      loadLedger(now),
      prisma.investment.findMany({
        where: { shareholderId: holder.id, kind: { in: ['CAPITAL_INJECTION', 'LOAN'] } },
        select: { kind: true, amountCents: true },
      }),
      prisma.profitDistribution.findMany({
        where: { shareholderId: holder.id, status: { in: ['PAID', 'PENDING'] } },
        orderBy: [{ periodStart: 'desc' }],
        select: { label: true, periodStart: true, periodEnd: true, amountCents: true, status: true, paidAt: true },
      }),
    ]);

    // Past periods use today's stake: the data keeps no stake history.
    const stakes = holders.map((h) => h.basisPoints);
    const withShare = <T extends { netCents: number }>(f: T) => ({ ...f, ownShareCents: allocate(f.netCents, stakes)[index]! });
    const total = (rows: { amountCents: number }[]) => rows.reduce((acc, r) => acc + r.amountCents, 0);

    const body: MyShares = {
      holder: { id: holder.id, name: holder.name, title: holder.title, kind: holder.kind, basisPoints: holder.basisPoints },
      asOf: now.toISOString(),
      currentMonth: ledger.currentMonth,
      months: ledger.months.map(withShare),
      comparisons: ledger.comparisons,
      periods: {
        quarter: withShare(ledger.periods.quarter),
        year: withShare(ledger.periods.year),
        allTime: withShare(ledger.periods.allTime),
      },
      invested: {
        capitalCents: total(investments.filter((i) => i.kind === 'CAPITAL_INJECTION')),
        lentCents: total(investments.filter((i) => i.kind === 'LOAN')),
      },
      payouts: {
        paidCents: total(payouts.filter((p) => p.status === 'PAID')),
        pendingCents: total(payouts.filter((p) => p.status === 'PENDING')),
        rows: payouts.map((p) => ({
          label: p.label,
          periodStart: isoDate(p.periodStart),
          periodEnd: isoDate(p.periodEnd),
          amountCents: p.amountCents,
          status: p.status,
          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        })),
      },
    };
    return reply.send(body satisfies MySharesResult);
  });
};

/**
 * Who is asking. The owner may open every page, anyone else only the holding
 * linked to their account, whatever their staff role. Either way the account
 * must still pass the staff sign-in test (undeleted, and the owner or a staff
 * role), because Team's revoke demotes a person to CUSTOMER but keeps the link.
 */
async function loadViewer(userId: string): Promise<{ isOwner: boolean; holderId: string | null }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isOwner: true, role: true, deletedAt: true, shareholder: { select: { id: true } } },
  });
  if (!user || user.deletedAt || !(user.isOwner || STAFF_ROLES.has(user.role))) {
    return { isOwner: false, holderId: null };
  }
  return { isOwner: user.isOwner, holderId: user.shareholder?.id ?? null };
}
