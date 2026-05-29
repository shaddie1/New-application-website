import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { NotificationDto, MarkNotificationsReadInput } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

const MarkReadSchema = z.object({
  ids: z.array(z.string()).optional(),
}) satisfies z.ZodType<MarkNotificationsReadInput>;

const LIST_LIMIT = 50;

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // Recent notifications + unread count for the bell badge.
  app.get('/', async (req, reply) => {
    const userId = req.auth!.sub;
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    const notifications: NotificationDto[] = rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      data: (n.data as Record<string, unknown> | null) ?? null,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
    return reply.send({ notifications, unreadCount });
  });

  // Mark specific notifications read, or all when `ids` is omitted.
  app.post('/read', async (req, reply) => {
    const parsed = MarkReadSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = req.auth!.sub;
    await prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(parsed.data.ids && parsed.data.ids.length ? { id: { in: parsed.data.ids } } : {}),
      },
      data: { readAt: new Date() },
    });
    const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });
    return reply.send({ ok: true, unreadCount });
  });
};
