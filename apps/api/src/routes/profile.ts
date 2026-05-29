import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotificationChannel, PointsDirection } from '@prisma/client';
import type {
  LoyaltyTier,
  NotificationChannel as NotificationChannelDto,
  NotificationPreferenceDto,
  ProfileOverview,
  UpdateNotificationInput,
  UpdateProfileInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { toPublicUser } from '../auth/tokens.js';

const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
}) satisfies z.ZodType<UpdateProfileInput>;

const UpdateNotificationSchema = z.object({
  channel: z.enum(['PUSH', 'SMS', 'EMAIL']),
  enabled: z.boolean(),
}) satisfies z.ZodType<UpdateNotificationInput>;

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /profile — header card data for mockup 13.
  app.get('/', async (req, reply) => {
    const userId = req.auth!.sub;

    const [user, balanceRows, bookingsCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.hawkPointsLedger.groupBy({
        by: ['direction'],
        where: { userId },
        _sum: { points: true },
      }),
      prisma.booking.count({ where: { userId } }),
    ]);
    if (!user || user.deletedAt) return reply.code(404).send({ error: 'user not found' });

    let credit = 0;
    let debit = 0;
    for (const row of balanceRows) {
      if (row.direction === PointsDirection.CREDIT) credit = row._sum.points ?? 0;
      if (row.direction === PointsDirection.DEBIT) debit = row._sum.points ?? 0;
    }

    const overview: ProfileOverview = {
      user: toPublicUser(user),
      tier: user.tier as LoyaltyTier,
      pointsBalance: credit - debit,
      lifetimeEarnedPoints: user.lifetimeEarnedPoints,
      bookingsCount,
      memberSince: user.createdAt.toISOString(),
    };
    return reply.send({ profile: overview });
  });

  // PATCH /profile — edit name / email / avatar.
  app.patch('/', async (req, reply) => {
    const parsed = UpdateProfileSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    // Reject an email already taken by another account.
    if (parsed.data.email) {
      const clash = await prisma.user.findFirst({
        where: { email: parsed.data.email, id: { not: req.auth!.sub } },
        select: { id: true },
      });
      if (clash) return reply.code(409).send({ error: 'email already in use' });
    }

    const user = await prisma.user.update({
      where: { id: req.auth!.sub },
      data: {
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        avatarUrl: parsed.data.avatarUrl,
      },
    });
    return reply.send({ user: toPublicUser(user) });
  });

  // GET /profile/notifications — channel preferences.
  app.get('/notifications', async (req, reply) => {
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { channel: 'asc' },
    });
    const dto: NotificationPreferenceDto[] = prefs.map((p) => ({
      channel: p.channel as NotificationChannelDto,
      enabled: p.enabled,
    }));
    return reply.send({ preferences: dto });
  });

  // PATCH /profile/notifications — toggle one channel.
  app.patch('/notifications', async (req, reply) => {
    const parsed = UpdateNotificationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const pref = await prisma.notificationPreference.upsert({
      where: { userId_channel: { userId: req.auth!.sub, channel: parsed.data.channel as NotificationChannel } },
      create: { userId: req.auth!.sub, channel: parsed.data.channel as NotificationChannel, enabled: parsed.data.enabled },
      update: { enabled: parsed.data.enabled },
    });
    return reply.send({ preference: { channel: pref.channel as NotificationChannelDto, enabled: pref.enabled } });
  });
};
