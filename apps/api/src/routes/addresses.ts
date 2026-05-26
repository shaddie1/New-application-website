import type { FastifyPluginAsync } from 'fastify';
import type { AddressDto } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

export const addressRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // List the caller's saved addresses, default first.
  app.get('/', async (req, reply) => {
    const rows = await prisma.address.findMany({
      where: { userId: req.auth!.sub, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    const addresses: AddressDto[] = rows.map((a) => ({
      id: a.id,
      label: a.label,
      line1: a.line1,
      line2: a.line2,
      area: a.area,
      city: a.city,
      country: a.country,
      lat: a.lat ? Number(a.lat) : null,
      lng: a.lng ? Number(a.lng) : null,
      accessNotes: a.accessNotes,
      isDefault: a.isDefault,
    }));
    return reply.send({ addresses });
  });
};
