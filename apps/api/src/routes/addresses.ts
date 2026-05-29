import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { AddressDto, CreateAddressInput, UpdateAddressInput } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';

const CreateAddressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  area: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  accessNotes: z.string().trim().max(500).optional(),
  isDefault: z.boolean().optional(),
}) satisfies z.ZodType<CreateAddressInput>;

const UpdateAddressSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  line1: z.string().trim().min(1).max(200).optional(),
  line2: z.string().trim().max(200).nullable().optional(),
  area: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).optional(),
  accessNotes: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
}) satisfies z.ZodType<UpdateAddressInput>;

export const addressRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // List the caller's saved addresses, default first.
  app.get('/', async (req, reply) => {
    const rows = await prisma.address.findMany({
      where: { userId: req.auth!.sub, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return reply.send({ addresses: rows.map(toAddressDto) });
  });

  // Create a new address. If it's the caller's first (or isDefault), it
  // becomes the default and any previous default is cleared.
  app.post('/', async (req, reply) => {
    const parsed = CreateAddressSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = req.auth!.sub;
    const existingCount = await prisma.address.count({ where: { userId, deletedAt: null } });
    const makeDefault = parsed.data.isDefault || existingCount === 0;

    const address = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: {
          userId,
          label: parsed.data.label,
          line1: parsed.data.line1,
          line2: parsed.data.line2,
          area: parsed.data.area,
          city: parsed.data.city ?? 'Nairobi',
          accessNotes: parsed.data.accessNotes,
          lat: parsed.data.lat != null ? new Prisma.Decimal(parsed.data.lat) : undefined,
          lng: parsed.data.lng != null ? new Prisma.Decimal(parsed.data.lng) : undefined,
          isDefault: makeDefault,
        },
      });
    });
    return reply.code(201).send({ address: toAddressDto(address) });
  });

  // Update an address the caller owns.
  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const parsed = UpdateAddressSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = req.auth!.sub;
    const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId || existing.deletedAt) {
      return reply.code(404).send({ error: 'address not found' });
    }

    const address = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: existing.id } },
          data: { isDefault: false },
        });
      }
      return tx.address.update({
        where: { id: existing.id },
        data: {
          label: parsed.data.label,
          line1: parsed.data.line1,
          line2: parsed.data.line2,
          area: parsed.data.area,
          city: parsed.data.city,
          accessNotes: parsed.data.accessNotes,
          // Don't allow un-defaulting via PATCH; clearing happens by setting another default.
          isDefault: parsed.data.isDefault === true ? true : undefined,
        },
      });
    });
    return reply.send({ address: toAddressDto(address) });
  });

  // Soft-delete. If it was the default, promote the next-oldest address.
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const userId = req.auth!.sub;
    const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId || existing.deletedAt) {
      return reply.code(404).send({ error: 'address not found' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isDefault: false },
      });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return reply.send({ ok: true });
  });
};

function toAddressDto(a: {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  area: string | null;
  city: string;
  country: string;
  lat: Prisma.Decimal | null;
  lng: Prisma.Decimal | null;
  accessNotes: string | null;
  isDefault: boolean;
}): AddressDto {
  return {
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
  };
}
