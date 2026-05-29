import type { FastifyPluginAsync } from 'fastify';
import { PointsDirection } from '@prisma/client';
import type { LoyaltyOverview, LoyaltyTier, PointsLedgerEntry, PointsReason } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { pointsToNextTier } from '../loyalty/tiers.js';

const RECENT_LIMIT = 20;

export const loyaltyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /loyalty — tier progress + spendable balance + recent ledger.
  // Drives mockup 14 (Hawk Points) in one round-trip.
  app.get('/', async (req, reply) => {
    const userId = req.auth!.sub;

    const [user, balanceRows, ledger] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { tier: true, lifetimeEarnedPoints: true },
      }),
      prisma.hawkPointsLedger.groupBy({
        by: ['direction'],
        where: { userId },
        _sum: { points: true },
      }),
      prisma.hawkPointsLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
      }),
    ]);

    let credit = 0;
    let debit = 0;
    for (const row of balanceRows) {
      if (row.direction === PointsDirection.CREDIT) credit = row._sum.points ?? 0;
      if (row.direction === PointsDirection.DEBIT) debit = row._sum.points ?? 0;
    }
    const balancePoints = credit - debit;

    const { next, pointsRemaining } = pointsToNextTier(user.lifetimeEarnedPoints);

    const overview: LoyaltyOverview = {
      tier: user.tier as LoyaltyTier,
      lifetimeEarnedPoints: user.lifetimeEarnedPoints,
      balancePoints,
      next: next as LoyaltyTier | null,
      pointsRemaining,
      recentLedger: ledger.map<PointsLedgerEntry>((e) => ({
        id: e.id,
        direction: e.direction,
        points: e.points,
        balanceAfter: e.balanceAfter,
        reason: e.reason as PointsReason,
        description: e.description ?? undefined,
        bookingId: e.bookingId ?? undefined,
        createdAt: e.createdAt.toISOString(),
      })),
    };

    return reply.send({ loyalty: overview });
  });
};
