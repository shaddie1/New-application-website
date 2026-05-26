import type { FastifyPluginAsync } from 'fastify';
import type {
  ServiceLineCode,
  ServiceBadge,
  CleanTypeCode,
  ServiceLineDto,
  CleanTypeDto,
  AddOnDto,
} from '@onyxhawk/types';

import { prisma } from '../db.js';

interface ServiceLineWithChildren extends ServiceLineDto {
  cleanTypes: CleanTypeDto[];
  addOns: AddOnDto[];
}

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  // List active service lines (screen 04: service catalog).
  app.get('/service-lines', async (_req, reply) => {
    const rows = await prisma.serviceLine.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({ serviceLines: rows.map(toServiceLineDto) });
  });

  // Detail for one service line including its clean types and add-ons.
  // The mobile booking flow (screen 05) needs scope options + pricing in one shot.
  app.get<{ Params: { code: string } }>('/service-lines/:code', async (req, reply) => {
    const line = await prisma.serviceLine.findUnique({
      where: { code: req.params.code },
      include: {
        cleanTypes: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        addOns: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!line || !line.isActive) return reply.code(404).send({ error: 'service line not found' });

    const dto: ServiceLineWithChildren = {
      ...toServiceLineDto(line),
      cleanTypes: line.cleanTypes.map((c) => ({
        id: c.id,
        code: c.code as CleanTypeCode,
        name: c.name,
        subtitle: c.subtitle,
        basePriceCents: c.basePriceCents,
      })),
      addOns: line.addOns.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        priceCents: a.priceCents,
      })),
    };
    return reply.send({ serviceLine: dto });
  });
};

function toServiceLineDto(row: {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  badge: string;
  imageUrl: string | null;
  colorHex: string | null;
  quoteOnly: boolean;
  fromPriceCents: number | null;
}): ServiceLineDto {
  return {
    id: row.id,
    code: row.code as ServiceLineCode,
    name: row.name,
    tagline: row.tagline,
    badge: row.badge as ServiceBadge,
    imageUrl: row.imageUrl,
    colorHex: row.colorHex,
    quoteOnly: row.quoteOnly,
    fromPriceCents: row.fromPriceCents,
  };
}
