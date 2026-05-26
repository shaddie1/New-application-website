import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BookingStatus, Prisma } from '@prisma/client';
import type {
  AddressDto,
  BookingDto,
  BookingStatus as BookingStatusDto,
  CleanTypeCode,
  CreateBookingInput,
  QuoteInput,
  ServiceLineCode,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { quoteBooking, type PricingInputs } from '../booking/pricing.js';
import { getAvailability } from '../booking/availability.js';
import { generateBookingReference } from '../booking/reference.js';

// ── Validation ────────────────────────────────────────────────────────────

const ServiceLineCodeSchema = z.enum([
  'residential',
  'office',
  'hospital',
  'post_build',
  'fumigation',
]);

const CleanTypeCodeSchema = z.enum(['standard', 'deep', 'move_out', 'recurring']);

const BookingScopeSchema = z.object({
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(0).max(20),
  livingRooms: z.number().int().min(0).max(20),
  squareMeters: z.number().int().positive().optional(),
  cleanTypeCode: CleanTypeCodeSchema,
  addOnCodes: z.array(z.string()).max(20),
});

const QuoteSchema = z.object({
  serviceLineCode: ServiceLineCodeSchema,
  scope: BookingScopeSchema,
  addressId: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
}) satisfies z.ZodType<QuoteInput>;

const CreateBookingSchema = z.object({
  serviceLineCode: ServiceLineCodeSchema,
  scope: BookingScopeSchema,
  addressId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  notesForCrew: z.string().max(2000).optional(),
}) satisfies z.ZodType<CreateBookingInput>;

const AvailabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

const CancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────

export const bookingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // Compute a price preview without persisting. Used by the confirmation screen.
  app.post('/quote', async (req, reply) => {
    const parsed = QuoteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const resolved = await resolveQuoteContext(req.auth!.sub, parsed.data);
    if ('error' in resolved) return reply.code(resolved.status).send({ error: resolved.error });

    const quote = quoteBooking(resolved.pricing);
    return reply.send({ quote });
  });

  // Day's slot grid. `date` is YYYY-MM-DD in Africa/Nairobi.
  app.get('/availability', async (req, reply) => {
    const parsed = AvailabilityQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const result = await getAvailability(parsed.data.date);
    return reply.send(result);
  });

  // Create a booking. Initial state is PENDING_PAYMENT — the payment flow
  // (STK push callback) is what moves it to CONFIRMED.
  app.post('/', async (req, reply) => {
    const parsed = CreateBookingSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = req.auth!.sub;
    const resolved = await resolveQuoteContext(userId, parsed.data);
    if ('error' in resolved) return reply.code(resolved.status).send({ error: resolved.error });

    const quote = quoteBooking(resolved.pricing);

    const booking = await prisma.$transaction(async (tx) => {
      const reference = await generateBookingReference(tx);
      return tx.booking.create({
        data: {
          reference,
          userId,
          addressId: resolved.address.id,
          serviceLineId: resolved.serviceLine.id,
          cleanTypeId: resolved.cleanType.id,
          bedrooms: parsed.data.scope.bedrooms,
          bathrooms: parsed.data.scope.bathrooms,
          livingRooms: parsed.data.scope.livingRooms,
          squareMeters: parsed.data.scope.squareMeters,
          notesForCrew: parsed.data.notesForCrew,
          scheduledAt: new Date(parsed.data.scheduledAt),
          estimatedDurationMinutes: quote.estimatedDurationMinutes,
          status: BookingStatus.PENDING_PAYMENT,
          basePriceCents: quote.lineItems
            .filter((li) => li.kind === 'BASE')
            .reduce((sum, li) => sum + li.amountCents, 0),
          addOnsTotalCents: quote.lineItems
            .filter((li) => li.kind === 'ADDON')
            .reduce((sum, li) => sum + li.amountCents, 0),
          travelFeeCents: quote.travelFeeCents,
          creditAppliedCents: quote.creditAppliedCents,
          discountCents: quote.discountCents,
          totalCents: quote.totalCents,
          pointsToEarn: quote.pointsToEarn,
          addOns: {
            create: resolved.addOns.map((a) => ({
              addOnId: a.id,
              priceCentsAtBooking: a.priceCents,
            })),
          },
        },
        include: bookingInclude,
      });
    });

    return reply.code(201).send({ booking: toBookingDto(booking) });
  });

  // List the caller's bookings, split into upcoming / past (screen 11).
  app.get('/', async (req, reply) => {
    const userId = req.auth!.sub;
    const now = new Date();

    const rows = await prisma.booking.findMany({
      where: { userId },
      orderBy: { scheduledAt: 'desc' },
      include: bookingInclude,
    });

    const dtos = rows.map(toBookingDto);
    const upcoming = dtos
      .filter((b) => isUpcoming(b, now))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    const past = dtos.filter((b) => !isUpcoming(b, now));

    return reply.send({ upcoming, past });
  });

  // Booking detail.
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: bookingInclude,
    });
    if (!booking || booking.userId !== req.auth!.sub) {
      return reply.code(404).send({ error: 'booking not found' });
    }
    return reply.send({ booking: toBookingDto(booking) });
  });

  // Cancel a booking. Allowed while PENDING_PAYMENT or CONFIRMED.
  app.post<{ Params: { id: string } }>('/:id/cancel', async (req, reply) => {
    const parsed = CancelSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.auth!.sub) {
      return reply.code(404).send({ error: 'booking not found' });
    }
    if (existing.status !== BookingStatus.PENDING_PAYMENT && existing.status !== BookingStatus.CONFIRMED) {
      return reply.code(409).send({ error: `cannot cancel a booking in state ${existing.status}` });
    }

    const updated = await prisma.booking.update({
      where: { id: existing.id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: parsed.data.reason,
      },
      include: bookingInclude,
    });
    return reply.send({ booking: toBookingDto(updated) });
  });
};

// ── Helpers ───────────────────────────────────────────────────────────────

const bookingInclude = {
  address: true,
  serviceLine: true,
  cleanType: true,
  addOns: { include: { addOn: true } },
} satisfies Prisma.BookingInclude;

type BookingWithIncludes = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;
type AddressRow = BookingWithIncludes['address'];

interface QuoteContext {
  serviceLine: { id: string; code: string };
  cleanType: { id: string; code: string; name: string };
  address: AddressRow;
  addOns: Array<{ id: string; code: string; name: string; priceCents: number }>;
  pricing: PricingInputs;
}

/**
 * Resolve and validate every reference in a quote/create input:
 * service line, clean type (must belong to the line), address (must belong
 * to the caller), and add-ons (must belong to the line). Returns either a
 * fully-resolved context ready for `quoteBooking`, or an error payload.
 */
async function resolveQuoteContext(
  userId: string,
  input: z.infer<typeof QuoteSchema> | z.infer<typeof CreateBookingSchema>,
): Promise<QuoteContext | { status: number; error: string }> {
  const serviceLine = await prisma.serviceLine.findUnique({
    where: { code: input.serviceLineCode },
    include: {
      cleanTypes: { where: { code: input.scope.cleanTypeCode } },
      addOns: input.scope.addOnCodes.length ? { where: { code: { in: input.scope.addOnCodes } } } : false,
    },
  });
  if (!serviceLine || !serviceLine.isActive) {
    return { status: 404, error: 'service line not found' };
  }
  const cleanType = serviceLine.cleanTypes[0];
  if (!cleanType) return { status: 400, error: 'clean type does not belong to this service line' };

  const addOns = serviceLine.addOns ?? [];
  if (addOns.length !== input.scope.addOnCodes.length) {
    return { status: 400, error: 'one or more add-on codes are unknown for this service line' };
  }

  let address: AddressRow | null = null;
  if (input.addressId) {
    address = await prisma.address.findUnique({ where: { id: input.addressId } });
    if (!address || address.userId !== userId || address.deletedAt) {
      return { status: 404, error: 'address not found' };
    }
  } else {
    address = await prisma.address.findFirst({
      where: { userId, deletedAt: null, isDefault: true },
    });
    if (!address) return { status: 400, error: 'no address selected and no default address on file' };
  }

  const pricing: PricingInputs = {
    serviceLineCode: input.serviceLineCode,
    scope: input.scope,
    cleanTypeName: cleanType.name,
    addOns: addOns.map((a) => ({ id: a.id, code: a.code, name: a.name, priceCents: a.priceCents })),
    area: address.area,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
  };

  return {
    serviceLine,
    cleanType,
    address,
    addOns: addOns.map((a) => ({ id: a.id, code: a.code, name: a.name, priceCents: a.priceCents })),
    pricing,
  };
}

function toBookingDto(b: BookingWithIncludes): BookingDto {
  return {
    id: b.id,
    reference: b.reference,
    status: b.status as BookingStatusDto,
    serviceLineCode: b.serviceLine.code as ServiceLineCode,
    cleanTypeCode: b.cleanType.code as CleanTypeCode,
    scope: {
      bedrooms: b.bedrooms,
      bathrooms: b.bathrooms,
      livingRooms: b.livingRooms,
      squareMeters: b.squareMeters,
    },
    scheduledAt: b.scheduledAt.toISOString(),
    estimatedDurationMinutes: b.estimatedDurationMinutes,
    basePriceCents: b.basePriceCents,
    addOnsTotalCents: b.addOnsTotalCents,
    travelFeeCents: b.travelFeeCents,
    creditAppliedCents: b.creditAppliedCents,
    discountCents: b.discountCents,
    totalCents: b.totalCents,
    pointsToEarn: b.pointsToEarn,
    notesForCrew: b.notesForCrew,
    address: toAddressDto(b.address),
    addOns: b.addOns.map((ba) => ({
      id: ba.addOn.id,
      code: ba.addOn.code,
      name: ba.addOn.name,
      priceCentsAtBooking: ba.priceCentsAtBooking,
    })),
    createdAt: b.createdAt.toISOString(),
  };
}

function toAddressDto(a: AddressRow): AddressDto {
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

const UPCOMING_STATUSES = new Set<BookingStatusDto>([
  'PENDING_PAYMENT',
  'CONFIRMED',
  'EN_ROUTE',
  'IN_PROGRESS',
]);

function isUpcoming(b: BookingDto, now: Date): boolean {
  if (UPCOMING_STATUSES.has(b.status)) return true;
  if (b.status === 'DRAFT') return new Date(b.scheduledAt) >= now;
  return false;
}
